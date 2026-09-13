# Envoyage — the complete app

Everything the interface contains, where every number comes from, and how the three
integrations fit. Self-contained: you do not need the repo to read it.

Written 11 Sep 2026. Live figures in this document were read from the chain and the
subgraphs at the time of writing and keep moving — the bot is running.

> **What this supersedes.** The earlier `HOW-IT-FITS.md` (the diagram) and
> `INTEGRATIONS.md` (sponsor verification commands) are folded into this file and no
> longer kept separately. `UI-REVIEW.md` is the design critique and stays separate.
> `ARCHITECTURE.md` is the contract-level design and stays separate.

---

## 1. What Envoyage is

An LP owns a Uniswap v4 position. They want a bot to compound its fees so they do not
have to. Today the only way to allow that is `approve(bot, position)` — which says
**which** position the bot may touch and nothing about **what it may do**. An approved
bot can withdraw the liquidity and send it to itself, and nothing on chain objects.
That is how Aperture Finance lost ~$17M.

Envoyage replaces the approval with a **mandate**. The owner approves the *Envoyage
contract* instead of the bot, then grants the bot a mandate with terms. The bot's only
call is `compound(mandateId, minFee)` — two numbers. Envoyage writes the Uniswap
instructions itself, with the owner's address fixed in code. There is no field in
which "send it elsewhere" can be expressed.

**It is infrastructure**: a security primitive plus a reference keeper. Not a consumer
app, not an SDK. The integration surface is a three-function ABI plus an ENS name.

### The mandate's terms

| Term | Meaning |
|---|---|
| keeper | the one address that may trigger it |
| fee cap | % of **harvested fees** the keeper keeps — never a % of the position. Contract ceiling 10% |
| fee recipient | pinned at grant time, never mutable |
| cooldown | minimum seconds between compounds |
| expiry | after which it stops working |
| revocation | instant, by the owner, no notice period |

Enforced by the contract, not by the bot's good behaviour. The contract is immutable —
no admin, no upgrade path, and no `DELEGATECALL` or `SELFDESTRUCT` in the deployed
bytecode (asserted by a test that scans the artifact, with a negative control so the
scanner cannot pass by being broken).

---

## 2. How the system works

```
                     grants a MANDATE
   ┌──────────┐  approve(position) + grant(terms)   ┌──────────────┐
   │  OWNER   │ ──────────────────────────────────▶ │   ENVOYAGE   │
   │ position │                                     │  (contract)  │
   │  #38896  │ ◀─── revoke() any time ───────────── │              │
   └──────────┘                                     └──────┬───────┘
         │                                                 │
         │ owns                             compound(id) = │ two Uniswap calls,
         ▼                                  the bot's ONLY │ written by ENVOYAGE
   ┌──────────────────┐   harvest fees ───────────────────  │
   │   UNISWAP v4     │ ◀─────────────────────────────────┘
   │ PositionManager  │   reinvest fees
   └────────┬─────────┘
            │ emits Approval / MandateExecuted
            ▼
   ┌──────────────────┐  "which mandates name me,    ┌──────────┐
   │   THE GRAPH      │   which is longest unserved?" │   BOT    │
   │ envoyage subgraph│ ◀──────────────────────────── │ (keeper) │
   │ + mainnet census │ ──── task list ─────────────▶ │          │
   └──────────────────┘                               └────┬─────┘
                                                            │ compound(1, minFee)
                                                            ▼
   ┌───────────────────┐  writes exactly one key:     ┌──────────────┐
   │      ENS v2       │ ◀─ envoyage:lastRun ──────── │   ENVOYAGE   │
   │ 38896.envoyage.eth│   anything else reverts       └──────────────┘
   │  scope as records │   EACUnauthorizedAccountRoles
   └────────┬──────────┘
            │ resolves in any ENS client, no Envoyage software
            ▼
   ANYONE can read what this bot may do — and after revoke, what it once could.
```

**Every arrow is a real transaction or read happening on Sepolia right now.**

---

## 3. The integrations, complete

### Uniswap v4 — the thing being protected

Not a mention; the core loop *is* v4 calls. `compound` does exactly two:

| Step | Action array |
|---|---|
| harvest | `DECREASE_LIQUIDITY(tokenId, 0, …)` + `TAKE_PAIR(currency0, currency1, address(this))` |
| reinvest | `INCREASE_LIQUIDITY(…)` + `SETTLE_PAIR(currency0, currency1)` |

v4 has no "collect" action — harvesting fees *is* a decrease of zero liquidity. The
recipient in `TAKE_PAIR` is `address(this)` as a **literal**, not
`ActionConstants.ADDRESS_THIS` (that constant means the PositionManager, not us).

**Why this shape:** `PositionManager.modifyLiquidities(bytes actions, uint256 deadline)`
takes an action array — a small language with 26 opcodes. Restricting a keeper to
"may only call modifyLiquidities" restricts nothing, because that function is an
interpreter. We traced all 26 actions to file and line: **four of them take the
recipient straight from the caller** (`TAKE_PAIR` `0x11`, `TAKE` `0x0e`, `SWEEP`
`0x14`, `MINT_POSITION` `0x02`). So an approved keeper assembles
`DECREASE_LIQUIDITY + TAKE_PAIR(…, its own wallet)` and drains you. Envoyage assembles
the array itself; the keeper passes two numbers.

Verify:
```bash
cast call 0x8466e82E02edF3F00c0387D5C3E66d407dc7259C 'POSM()(address)' --rpc-url $SEPOLIA_RPC_URL
# → 0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4 — Uniswap's canonical v4 PositionManager
```

### The Graph — the bot's task source and the public audit trail

**Two distinct uses, both load-bearing.**

1. **The keeper's work queue.** The bot does not scan the chain. It asks the subgraph
   which mandates name it and which has gone longest without service. *Delete the
   subgraph and the bot has nothing to do.*
2. **Composition of three sources in the UI**, none of which answers the question
   alone:

| Source | Knows | Doesn't know |
|---|---|---|
| Envoyage subgraph (Sepolia, Studio) | exactly what each keeper may do, and every execution | nothing about the wider population |
| Envoyage census (Ethereum mainnet, Studio) | how many real wallets hold unbounded delegations | nothing about scope — no scoped alternative exists there |
| Uniswap v4 subgraph (decentralized network, via Gateway) | pools, positions, owners at mainnet scale | has no concept of a permission scope, because an approval does not carry one |

The census schema is the *same handler* deployed against two networks — one query
pattern, two deployments.

Verify:
```bash
curl -s -X POST https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4 \
  -H 'content-type: application/json' \
  -d '{"query":"{ censuses{ activeBlanketApprovals activeUnscopedApprovals activeScopedApprovals } _meta{block{number}} }"}'
```

### ENS v2 — the mandate legible without our software

Every mandate is a subname — `38896.envoyage.eth` — whose **text records are its
terms**. A third party reads the scope in any ENS client without touching our app or
trusting our frontend.

This is ENS**v2** specifically: Enhanced Access Control gives the keeper write
permission to exactly **one** record key. The bot can report; it cannot rewrite its
own limits.

| Record | Who may write |
|---|---|
| `envoyage:keeper`, `envoyage:maxFeeBps`, `envoyage:minInterval`, `envoyage:actions` | the owner (set at publish) |
| `envoyage:lastRun` | **the keeper** — the only key it may touch |
| anything else, as the keeper | reverts `EACUnauthorizedAccountRoles` |

The app reads these back **through the resolver**, never by reusing contract values
shown elsewhere. Showing contract state under an ENS heading would be a *claim* about
ENS; resolving it is a *demonstration*.

After a revoke the records **survive**, deliberately — the historical record of what a
keeper was permitted to do does not vanish the moment it stops being permitted. The
Lookup screen shows the subgraph status beside them so a revoked scope can never read
as live.

Verify:
```bash
NAMES=0x307CF6B0022Ef757820A8C3Cfced97C324eE0d05
RESOLVER=0xAF5b8aCF804e59fb823C05D37e73D523Af2Eca8a
NODE=$(cast call $NAMES 'nodeFor(uint256)(bytes32)' 38896 --rpc-url $SEPOLIA_RPC_URL)
cast call $RESOLVER 'text(bytes32,string)(string)' $NODE 'envoyage:maxFeeBps' --rpc-url $SEPOLIA_RPC_URL
# → "200"  — 2% cap, resolved from ENS, not from Envoyage
```

---

## 4. Every screen

Six routes, hash-based (`#/`, `#/hire`, `#/mandates`, `#/bot`, `#/lookup`, `#/demo`).
Persistent header: logo, nav, network chip, wallet chip.

### `#/` — Home

**Job:** a stranger understands what this is, and can see the three integrations as one
system, before any number.

| Element | Content | Source |
|---|---|---|
| Headline | "A permission layer for Uniswap v4 automation." | static |
| Lede | what a mandate is, in four sentences, with Uniswap / The Graph / ENS tags | static |
| Actions | *Hire a keeper* · *Look up mandate No. 1* | — |
| **System diagram** | the six boxes and every arrow from §2 | static SVG |
| Worked example | mandate #1: scope, executions, ENS name | subgraph + chain + resolver |
| **Census** | mainnet unbounded count vs Sepolia scoped count, each labelled by network | both census subgraphs |

### `#/hire` — Hire a keeper *(owner, wallet-gated)*

**Job:** an owner grants a mandate end to end, in one screen.

1. **Get a demo position** — offered when the wallet holds no position in the demo
   pool. A guided 7-step sequence (mint token A, mint token B, approve each to
   Permit2, approve each to the PositionManager, mint the position), each step with
   pending / signed / failed state and its own Retry. The position is minted around
   the pool's **current tick** so it actually earns fees.
2. **Position picker** — rows validated on chain (`ownerOf`, pool key); a position
   that already has an active mandate is badged and unselectable.
3. **Terms** — keeper (pre-filled with the reference bot, read-only in v0), fee cap
   (default 2%, ceiling 10%), cooldown (default 5 min), expiry (default 30 days).
4. **Live mandate preview** — the instrument, updating as the terms change: what the
   bot **may** do and what it **may not**.
5. **Sign** — `approve` → `grant` → `publish`, each step visible, resuming from the
   first incomplete step on retry or reload. A `retire` step is inserted first when
   the position carries a name from an earlier, revoked mandate.
6. **Completion** — mandate number and `<tokenId>.envoyage.eth`.

### `#/mandates` — My mandates *(owner, wallet-gated)*

**Job:** see what your bot may do and what it actually did; end it.

- Rows from the subgraph filtered by `grantor`, each also reading chain state
  independently so a stalled indexer never blanks the row.
- **Waiting state:** a mandate with zero executions says *"waiting for the bot — first
  compound expected within ~N min"* with the decoded pre-flight reason (no fees yet /
  cooldown remaining). It polls and flips to *"compounded — indexed at block N"* on its
  own. **This is the beat that shows the automation is real.**
- **Revoke** behind an inline confirm; then the row shows REVOKED and offers
  *Retire name*.
- A mandate with no published name offers *Publish name*.

### `#/bot` — Bot *(keeper, wallet-gated)*

**Job:** the keeper's side — what this wallet may do, right now.

- Non-keeper wallets see one explanatory panel, no actions.
- Otherwise, the mandates naming this wallet, each with a decoded pre-flight reason
  computed from **`canCompound()` plus a simulated `compound()`** — because
  `canCompound` checks the gates (keeper, expiry, cooldown, ownership) but cannot see
  fee availability. The simulation is what turns `FeeBelowMinimum` into "no fees yet".
- A **Compound** button per mandate.

### `#/lookup` — Lookup *(no wallet)*

**Job:** anyone audits a mandate without trusting our frontend.

- One field: a mandate number or an ENS name.
- The scope comes back **from the ENS resolver**; the status and executions come from
  the subgraph; each loads independently.
- Four distinct states: full card · name resolves but not yet indexed · name not
  found · revoked (resolver card carries *"mandate revoked at block N — this record is
  historical"*).

### `#/demo` — Proof *(no wallet to read; wallet to act)*

**Job:** prove the security claim by letting the viewer attempt the theft.

Three numbered steps in the owner's voice:

1. **The old way.** Position #39022 is approved to `NaiveUtils`, a deliberately
   vulnerable contract that forwards whatever instruction it is handed — exactly what
   automation contracts ask for today. *First press:* the bot does its job and
   delivers value to the owner. *Second press:* **the same bot, the same instruction,
   one field changed** — the recipient is now the bot. The position drains.
2. **The mandate.** The same bot with a mandate instead. On the left it compounds. On
   the right, the **byte-identical calldata** from step 1 is sent to Envoyage and
   **mines a failed transaction**, because no function exists to receive it.
3. **Revoke.** The owner ends it; the bot's next attempt is refused with a reason.

Two Etherscan links, same input, opposite outcomes. **This is the strongest artifact
in the project — do not restyle it.**

---

## 5. What is live right now

| | |
|---|---|
| **Envoyage** | [`0x8466e82E02edF3F00c0387D5C3E66d407dc7259C`](https://sepolia.etherscan.io/address/0x8466e82E02edF3F00c0387D5C3E66d407dc7259C#code) — verified |
| Uniswap v4 PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` |
| NaiveUtils (the comparator) | `0x0Fc426408a752f46d46b1e182aa018647146Aa56` |
| EnvoyageNames / ENS resolver | `0x307CF6B0022Ef757820A8C3Cfced97C324eE0d05` / `0xAF5b8aCF804e59fb823C05D37e73D523Af2Eca8a` |
| Demo pool | EDB/EDA, fee 10000 (1%), tickSpacing 200 |
| Mandate #1 | position 38896 · 2% cap · ACTIVE · `38896.envoyage.eth` — **never revoked by any screen** |
| Mandate #2 | position 39152 · the sacrificial one the Proof tab revokes |
| Subgraph (Sepolia) | `api.studio.thegraph.com/query/62788/envoyage/v0.0.4` |
| Subgraph (mainnet census) | `api.studio.thegraph.com/query/62788/envoyage-census-mainnet/v0.0.1` |

**Live numbers at time of writing:**

- **246 compounds** across the two mandates, all by the bot, unattended
- **Mainnet census: 7,886 unbounded delegations** — 1,277 `setApprovalForAll` (every
  position the owner holds, now and in future) and 6,609 single-position approvals,
  held by 518 distinct delegates, indexed to block 25,951,492. **Zero are scoped.**
- Sepolia census: 417 unbounded vs 2 scoped
- Tests: 38 Solidity · 45 web · 5 subgraph · `forge lint` clean

The keeper and a fee-generating swap loop run under pm2 on a VPS. Time to first
compound for a newly granted mandate ≈ swap cadence (2 min) + keeper poll (30 s) +
indexer lag.

---

## 6. Rules the interface must keep

Four behaviours are load-bearing; two affect prize qualification.

1. **Chain reads and subgraph reads load independently.** A dead indexer never blanks
   what comes from the chain, and vice versa.
2. **A failed query surfaces as an error, never as rendered zeroes**; a pending state
   is never rendered as an empty fact. *(An earlier build showed "1 execution" against
   3 on chain because one RPC answered with zero logs and HTTP 200.)*
3. **ENS records are read through the resolver** — load-bearing for the ENS prize.
4. **The execution ledger renders from the subgraph**, each row verified against its
   own transaction receipt — load-bearing for The Graph prize.

Plus: every contract revert is decoded into a sentence, never "reverted"; selectors are
**derived at runtime**, never written down (four of six were wrong when hand-written);
English only; no horizontal overflow at 375px; light and dark by `prefers-color-scheme`;
contrast measured, not assumed.

---

## 7. The interface, before and after

Written 11 Sep, this section listed what was wrong with the interface: the visual
direction ("a paper legal instrument") was chosen when this was a document to read
and fought an app you operate; the typeface was a hand-drawn serif on a product
that sells precision; the diagram's labels collided because they were hand-placed
at absolute coordinates; the two header chips were built as different components
so they could never align; and the three integrations read as badges rather than
as the system §2 describes.

**All of that has since been addressed** — see `UI-REVIEW.md` for the critique
those changes answer, and the `redesign:` commits for what each one did. The type
is now IBM Plex Sans and Mono with tabular figures, the diagram was rebuilt so no
two edges cross and every label sits on a straight run of its own edge, the chips
are one component, and the three registries are a section of their own, colour-
keyed to the diagram's edges.

Two behaviours found later and also fixed, both by driving the live app rather
than by reading the diff: declining the network switch left a user with no account
and no instruction, and the Proof tab's theft was gated on the keeper's key, so
nobody but us could run the demonstration the whole project rests on.
