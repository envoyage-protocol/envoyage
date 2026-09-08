# AGENTS.md — Envoyage

> **Revised 4 Sept 2026, status updated 8 Sept.** Six instructions in the first draft
> contradicted findings verified against the `v4-periphery` source. Changes are marked
> 🔴 with the reason. The markers are kept deliberately: they are the record of how
> this project's AI was directed and where it was corrected.
>
> Read `docs/SETUP-LANDMINES.md` and `docs/BUILD-GUIDE.md` before starting.

## Context

Envoyage is a scoped-permission instrument for Uniswap v4 position keepers. Today,
delegating a position means `approve` or `setApprovalForAll` — both constrain *which
position*, neither constrains *what may be done to it*.

ETHGlobal Online 2026. Solo. Sepolia (11155111). MIT.

**Core architecture — assemble, don't validate.** The keeper never writes v4
instructions. It calls `compound(mandateId, minFee)` — two numbers. Envoyage assembles
the v4 action array itself and pins the recipient to the position owner.

Misuse is not blocked by a check. It cannot be expressed.

🔴 **Headline thesis (revised):**
> **Envoyage removes authority over intent. It does not remove authority over execution.**

The earlier version ("misuse cannot be expressed") broke under a single judge question
about swaps. This version is literally true and remains a real contribution.

---

## HARD RULES — do not break, even when breaking one looks more flexible

1. **Never add a function that accepts `bytes calldata` from the keeper.** Not for
   "extensibility", not for "future actions".
2. **Never make a recipient address a parameter.** The recipient is derived inside the
   contract from the position owner, or read from the mandate struct where it was
   pinned at grant time.
3. **Never decode-then-validate keeper input.** If you start writing a validator for an
   action array, stop — that is precisely the failure class that broke Revert V3Utils
   (Code4rena H-04), V3Vault (H-03), and Aperture (~$17M).
4. **Do not widen the entrypoint surface unasked.** v0 ships `compound` only.
   `rebalance` and `exit` are interface declarations with no implementation.

5. 🔴 **DO NOT emit an event before reverting. It is impossible.**
   *(Replaces the earlier rule "Emit `MandateRejected` BEFORE reverting.")*
   A revert discards **all** state changes, including logs already emitted. The old
   rule contradicted itself. The code would look correct, produce zero events, and
   `vm.expectEmit` + `vm.expectRevert` would **not** catch it.
   **Instead:** `MandateRejected` is absent from the ABI. Provide
   `canCompound(uint256 mandateId) external view returns (bytes4 reason)` — `0x0` means
   allowed. The UI reads that view. Keeper reputation = executions + age + status.
   State in the README that on-chain refusals are not indexed, and why.

6. **Never guess a deployed contract address.** Uniswap warns that addresses are no
   longer identical across chains. 🔴 Done: six Sepolia addresses verified with
   `cast code` in `docs/SEPOLIA.md`. **Use those; do not look them up again.**
7. **Commit small and often, with meaningful messages.** ETHGlobal inspects version
   control; a single large commit can disqualify. Never squash.
8. **Every spec/prompt/planning file must be committed** — judges want to see how the
   AI was directed. This file included.

9. 🔴 **DO NOT add a swap to `compound`.** Two independent reasons:
   - **Impossible:** `_handleAction` dispatches exactly 15 actions, none of them swaps.
     `SWAP_EXACT_IN_SINGLE` (0x06) exists in `Actions.sol` but falls through to
     `revert UnsupportedAction`. Swap actions live in `V4Router`, not PositionManager.
   - **Unsafe:** the keeper is the *designated caller* — it picks the block, so it can
     sandwich its own `compound`. The recipient stays the owner throughout the attack,
     so nothing looks wrong.
10. 🔴 **DO NOT use `INCREASE_LIQUIDITY_FROM_DELTAS` (0x04) or
    `MINT_POSITION_FROM_DELTAS` (0x05).** Uniswap's own comment:
    *"DEPRECATED: Vulnerable to sandwich attacks - do not use."* Always explicit
    `INCREASE_LIQUIDITY` with `amount0Max`/`amount1Max`.
11. 🔴 **Envoyage is IMMUTABLE.** No proxy, no admin/owner, no upgrade function, no
    `delegatecall`, no `selfdestruct`. POSM/Permit2 addresses `immutable` in the
    constructor. If there is an admin, the core pitch sentence is not weakened — it is
    **false**.
12. 🔴 **Do not touch `foundry.toml` or `remappings.txt`.** Six setup landmines have
    been stepped on already and the harness is proven green. See
    `docs/SETUP-LANDMINES.md`.

If a rule blocks a genuine requirement, **say so and stop**. Do not work around it.

---

## ~~Task 1 — Repo setup~~ ✅ DONE (3 Sept)

🔴 **Do not re-run.** The old instruction "install v4-core and v4-periphery" is
landmine #3: standalone v4-core lacks `src/types/PoolOperation.sol` and is
incompatible. The repo uses the v4-core/permit2/OZ/solmate that v4-periphery
**vendors**.

Proven: fresh clone → `./script/setup.sh` → `forge build` →
`[PASS] test_harnessMintsRealPosition()`.

---

## ~~Task 2 — Sepolia fixture~~ ✅ DONE (6 Sept)

Six addresses in `docs/SEPOLIA.md`, verified with `cast code`, sourced from
`developers.uniswap.org/docs/protocols/v4/deployments`. StateView on-chain is 3531
bytes = our local compile, so the pinned version matches what is deployed.
RPC: `https://ethereum-sepolia-rpc.publicnode.com` (`rpc.sepolia.org` is **404**).

Live: pool with a 1% static LP fee, position `#38896`, Envoyage at
`0x8466e82E02edF3F00c0387D5C3E66d407dc7259C`, all verified on Etherscan.

🔴 The fee had to be HIGH (10000–100000 = 1–10%, **not** 3000/0.3%). The failure mode
is silent: fees too small → `getLiquidityForAmounts` returns 0 →
`INCREASE_LIQUIDITY` becomes a **succeeding** no-op, the event still fires, and the
demo looks alive while nothing happened. `script/02_GenerateFees.s.sol` generates the
fees, because minting alone produces none.

---

## ~~Task 3 — v4 action completeness table~~ ✅ DONE

The highest-value artifact for the Technicality score. See
`docs/V4-ACTION-COMPLETENESS.md` — all 26 actions traced to file and line.

The brief that produced it, kept for the record:

```
Read lib/v4-periphery:
- src/libraries/Actions.sol
- _handleAction in src/PositionManager.sol
- DeltaResolver (_take, _settle, _sweep)
- BaseActionsRouter (_mapRecipient, _mapPayer)

Enumerate EVERY action constant. For each:
- Can this action move tokens out of the position owner's control? (yes/no)
- Where does its recipient come from — a caller parameter, or a derived value?
- Does _handleAction actually dispatch it, or does it fall through to UnsupportedAction?
- File and line number

Markdown table. Quote the original code for every row.
DO NOT infer behaviour from an action's name. If it cannot be traced: "UNVERIFIED".
```

🔴 The third column was an addition, and turned out to be the most valuable: it shows
`Actions.sol` declaring actions that PositionManager rejects — the finding that shaped
the entire design.

Verified facts (use as a correctness control on any agent's output): `_handleAction`
handles INCREASE_LIQUIDITY, INCREASE_LIQUIDITY_FROM_DELTAS, DECREASE_LIQUIDITY,
MINT_POSITION, MINT_POSITION_FROM_DELTAS, BURN_POSITION, SETTLE_PAIR, TAKE_PAIR,
SETTLE, TAKE, CLOSE_CURRENCY, CLEAR_OR_TAKE, SWEEP, WRAP, UNWRAP — 15 actions;
everything else hits `revert UnsupportedAction(action)`.

---

## ~~Task 4 — Core contract~~ ✅ DONE

🔴 The struct below **replaces** the draft version. Two fields were added because
adversarial review found real holes; do not remove them.

```solidity
struct Mandate {
    address keeper;
    address grantor;      // 🔴 owner at grant time. compound MUST check ownerOf == grantor.
    uint256 tokenId;
    uint16  maxFeeBps;
    address feeRecipient; // pinned at grant time
    uint64  expiry;
    uint64  minInterval;  // 🔴 cooldown between compounds, pinned at grant time
    uint64  lastCall;
    bool    compoundAllowed;
}

function grant(Mandate calldata m) external returns (uint256 mandateId);
function revoke(uint256 mandateId) external;
function compound(uint256 mandateId, uint256 minFee) external;
function canCompound(uint256 mandateId) external view returns (bytes4 reason);
```

**Why `grantor`:** without it a mandate survives the sale of the position. The seller
keeps `compound` rights over the buyer's position with `feeRecipient` still pointing at
the seller. That is exactly the Code4rena H-04 class we claim to prevent.

**Why `minInterval`:** without it the keeper calls as often as possible and drains
value through repeated fees.

🔴 **A tokenId may have exactly ONE live mandate.** This makes revocation atomic for
free, makes a fee cap genuinely a cap, and makes the mandate page the complete truth
about that position.

⚠️ **This rule CANNOT be enforced from the struct alone.** `Mandate` is keyed by
`mandateId`; revoke-then-grant produces a second `mandateId` for the same `tokenId`
with nothing to check against. Separate state is required:

```solidity
mapping(uint256 tokenId => uint256 activeMandateId) public activeMandate;
// grant():  require(activeMandate[tokenId] == 0, MandateAlreadyActive());
//           activeMandate[tokenId] = mandateId;
// revoke(): delete activeMandate[tokenId];
```

Without this the security claim has no enforcer. Do not let an agent infer a check
that has nothing to check against.

### Gates that revert

expired · revoked · caller is not the registered keeper · `compound` not permitted ·
🔴 `ownerOf(tokenId) != m.grantor` · 🔴 `block.timestamp < lastCall + minInterval` ·
fee exceeds `maxFeeBps` · proceeds below `minFee`
🔴 ~~slippage breach~~ — **removed**: with no swap there is no price.

### `compound` sequence (verified against `_handleAction`)

```
── Call 1: harvest ─────────────────────────────────
   DECREASE_LIQUIDITY(tokenId, 0, min0, min1, "")   // v4 has no "collect" action
   TAKE_PAIR(currency0, currency1, recipient = ENVOYAGE)

── Inside Envoyage ─────────────────────────────────
   fee = balanceAfter − balanceBefore
   feeKeeper = fee × maxFeeBps / 10_000  →  m.feeRecipient
   liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
       StateLibrary.getSlot0(...), tickLower, tickUpper, rest0, rest1)
   if (liquidityDelta == 0) revert ZeroLiquidityDelta();   // 🔴 MANDATORY

── Call 2: reinvest ────────────────────────────────
   INCREASE_LIQUIDITY(tokenId, liquidityDelta, max0, max1, "")
   SETTLE_PAIR(currency0, currency1)     // paid via Permit2 from Envoyage

── Clean up ────────────────────────────────────────
   remaining balance → POSITION OWNER (a constant in the contract)
   assert Envoyage balance == 0
```

**TWO `modifyLiquidities` calls, not one.** `liquidityDelta` cannot be computed until
the harvested fees are known.

🔴 **Permit2 approvals are mandatory.** `_settlePair` uses `msgSender()` = Envoyage,
and `_pay` branches to Permit2 for any payer other than POSM. Per token:
```solidity
token.approve(PERMIT2, type(uint256).max);
IAllowanceTransfer(PERMIT2).approve(token, POSM, type(uint160).max, type(uint48).max);
```
Miss it and everything passes against mocked unit tests, then fails on the first real
Sepolia call. **Do not** take the `payerIsUser=false` shortcut — dust is left in the
posm and anyone can take it.

🔴 **Custody claim (corrected from the draft).** The draft said "Envoyage must never
custody funds" — too absolute. Fees **must** land in Envoyage to be measured. The
correct claim: **non-custodial between transactions** — a balance exists only inside a
single transaction and is zero between them. Prove it by asserting balance == 0 at the
end of every tx.

Write unit tests alongside. **Do not** write invariant tests — properties are written
by a human.

---

## Order of work

| | | |
|---|---|---|
| 1 | Repo setup | ✅ |
| 2 | Sepolia fixture | ✅ |
| 3 | Action completeness table | ✅ |
| 4 | Core contract + unit tests | ✅ 38 tests |
| 5 | Invariant tests | ✅ |
| 6 | Exploit replay | ✅ |
| 7 | Subgraph | ✅ live |
| 8 | UI: grant screen + shareable mandate page | ✅ (the mandate page became ENS resolution) |
| 9 | README, threat model, demo video | ⬜ video outstanding |

Notes that shaped 5–7, kept because they are the reason those artifacts are worth
anything:

- 🔴 **Item 5:** properties are written by a human; an agent may write handlers and
  setup. There must be a check that calls actually landed, requiring
  `successfulCompounds > 0` — otherwise every property passes vacuously because all
  calls reverted. *In the event this could not live in an `invariant_` function or in
  `afterInvariant()`; see the note in `test/invariant/Envoyage.invariant.t.sol` for
  why, and `HandlerReachability.t.sol` for where it ended up.*
- 🔴 **Item 6:** must include a ~30-line `NaiveUtils.execute(tokenId, bytes)` as a
  vulnerable comparator. Without it the suite is tautological: you cannot write an
  exploit against a function that does not exist. Show the attack **succeeding**
  against NaiveUtils, then un-encodable against Envoyage. Also: transfer the position,
  then `compound` must revert.
- 🔴 **Item 7:** The Graph's Composable track rejects *"simply querying one
  Subgraph"*. *Satisfied two ways in the event: the UI composes our Studio subgraph
  with Uniswap's own v4 subgraph through the Gateway, and the subgraph is load-bearing
  for the keeper's decisions. See `SKILL.md`.*

Do not skip ahead. If blocked, **report it**; do not substitute an easier task.

---

## 🔴 Sponsor slots (final)

| Slot | Track | Takeable |
|---|---|---|
| Uniswap Foundation | Best Uniswap Stack Contribution | $3,000 pool, up to 3 × $1,000 |
| ENS | Best Use of ENSv2 — see `docs/ENS-PLAN.md` | $4,500 pool |
| The Graph | AI Tooling (From Scratch) **or** Composable — both fit; see `SKILL.md` | $5,000 pool each |

Maximum three partner prizes, so exactly one Graph track.

**Uniswap has hard qualification requirements** beyond the build: a public repo, a
`FEEDBACK.md`, a submission to `developers.uniswap.org/hackathon-feedback` linking to
it, and a README that points at the specific contracts and lines.

~~Ledger~~ was dropped on 5 Sept: `wallet-cli send` needs physical hardware (no
documented emulator/Speculos path) and Sepolia support was unconfirmed in any
documentation. Two independent risks for one slot.

ENSv2 fits better anyway: the track text asks for *"delegate specific rights"* through
Enhanced Access Control and subnames that are *"expiring, revocable"* — which is
Envoyage's thesis on another substrate.

## Reference documents

| File | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | System shape, compound sequence, trust boundaries, tech stack |
| `docs/BUILD-GUIDE.md` | Findings verified against the v4 source |
| `docs/SETUP-LANDMINES.md` | Six setup landmines; do not touch the config |
| `docs/SEPOLIA.md` | Verified addresses, live deployment, working RPCs |
| `docs/THREAT-MODEL.md` | What Envoyage does NOT protect against |
| `docs/V4-ACTION-COMPLETENESS.md` | 26 v4 actions traced to line numbers |
| `docs/ENS-PLAN.md` | The ENSv2 slot: a mandate as a subname |
| `docs/GRAPH-PLAN.md` | The Graph path |
| `SKILL.md` | How The Graph is load-bearing rather than decorative |
| `FEEDBACK.md` | Feedback to the Uniswap team (a prize requirement) |
| `AI-USAGE.md` | Required AI disclosure, including what AI got wrong |
