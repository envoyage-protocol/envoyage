# How each sponsor is used — and how to verify it yourself

Every claim here is checkable against Sepolia or the code. Nothing is "we imported
the SDK". For each sponsor: what it does in the product, the line that does it, and a
command a judge can run.

---

## Uniswap v4 — the thing being secured

**What it is:** Envoyage is a permission layer *for* Uniswap v4 positions. The whole
contract exists to let a keeper call one v4 action sequence and nothing else.

**Not a mention — the core loop is v4 calls.** `src/Envoyage.sol`:

| Line | v4 call |
|---|---|
| `Envoyage.sol:116` | `POSM.getPoolAndPositionInfo(tokenId)` |
| `Envoyage.sol:137` | `POOL_MANAGER.getSlot0(poolId)` |
| `Envoyage.sol:214` | `POSM.modifyLiquidities(DECREASE_LIQUIDITY + TAKE_PAIR)` — harvest fees |
| `Envoyage.sol:228` | `POSM.modifyLiquidities(INCREASE_LIQUIDITY + SETTLE_PAIR)` — reinvest |

The security argument is itself a v4 finding: `docs/V4-ACTION-COMPLETENESS.md` traces
all 26 v4 actions to file and line and shows that 4 of them take the recipient from
the caller — which is why a bare `approve` is unsafe.

**Verify it:**
```bash
# Envoyage's immutable PositionManager IS Uniswap's canonical v4 deployment on Sepolia
cast call 0x8466e82E02edF3F00c0387D5C3E66d407dc7259C 'POSM()(address)' --rpc-url $SEPOLIA_RPC_URL
# → 0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4  (Uniswap v4 PositionManager, Sepolia)
```
Then open any `compound` tx on Etherscan and watch it call into that PositionManager.

**Qualification requirement (author's action, not code):** a submission to
`developers.uniswap.org/hackathon-feedback` linking to `FEEDBACK.md`. Without it the
Uniswap entry does not count, regardless of the code.

---

## The Graph — where the numbers come from, and how the keeper finds work

**What it is:** two distinct uses, both load-bearing.

1. **The keeper's task source.** The reference bot does not scan the chain. It asks
   the subgraph which mandates name it and which has gone longest without service.
   Delete the subgraph and the keeper has nothing to do. — `keeper/src/graph.ts`
2. **Composition of two Graph products in the UI.** Our own subgraph (mandate scope +
   a census of every approval on the v4 PositionManager) is composed with Uniswap's
   own v4 subgraph on the decentralized network, through the Gateway. Neither answers
   the census question alone. — `web/src/lib/graph.ts`

**Verify it:**
```bash
curl -s -X POST https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4 \
  -H 'content-type: application/json' \
  -d '{"query":"{ censuses{ activeBlanketApprovals activeUnscopedApprovals activeScopedApprovals totalApprovalEvents } _meta{block{number}} }"}'
# → 133 blanket, 284 unscoped, 1 scoped, 723 approval events, indexed to a live block
```
The subgraph source, schema, and 5 matchstick handler tests are in `subgraph/`.

---

## ENSv2 — the mandate as a name anyone can read

**What it is:** every mandate is also an ENSv2 subname — `38896.envoyage.eth` — whose
text records publish the exact scope. A third party reads the terms in any ENS client
without touching our app or trusting our frontend. This is ENSv2 specifically:
Enhanced Access Control gives the keeper write permission to exactly one record key,
and any other write reverts `EACUnauthorizedAccountRoles`.

**Not decorative — the resolver is read live.** The web app reads these back *through
the resolver* (`web/src/lib/envoyage.ts:readEnsScope`), not by reusing contract values
shown elsewhere. Showing contract state under an ENS heading would be a claim about
ENS; resolving it is a demonstration.

**Verify it:**
```bash
NAMES=0x307CF6B0022Ef757820A8C3Cfced97C324eE0d05
RESOLVER=0xAF5b8aCF804e59fb823C05D37e73D523Af2Eca8a
NODE=$(cast call $NAMES 'nodeFor(uint256)(bytes32)' 38896 --rpc-url $SEPOLIA_RPC_URL)
cast call $RESOLVER 'text(bytes32,string)(string)' $NODE 'envoyage:maxFeeBps' --rpc-url $SEPOLIA_RPC_URL
# → "200"   (2% cap, resolved from ENS, not from Envoyage)
```
The EAC boundary (the sharp beat): as the keeper, writing `envoyage:lastRun` succeeds;
writing `envoyage:maxFeeBps` reverts `EACUnauthorizedAccountRoles`. Verified live and
scripted in `docs/submission/DEMO-SCRIPT.md`.

---

## The three prizes (max 3 partner prizes allowed)

| Prize | Pool | Why Envoyage fits | Status |
|---|---|---|---|
| **Uniswap** — Best Uniswap Stack Contribution | $3,000 (≤3×$1,000) | net-new permission layer built entirely on v4 periphery; the compound loop is nothing but v4 calls | code done; **feedback form is the open qualification item** |
| **ENS** — Best Use of ENSv2 | $4,500 | uses ENSv2 EAC specifically — per-record role permissions, not just a name | done, live on Sepolia |
| **The Graph** | one $5,000 track | subgraph is the keeper's task source AND composes two Graph products in the UI | subgraph live; Gateway composition depends on Uniswap's mainnet subgraph being up |

**Which Graph track.** There is a genuine choice, and it is the author's:

- The subgraph as the automation's task source, plus a **new** subgraph with a custom
  census schema, argues for the build/tooling track.
- The UI composing our subgraph with Uniswap's v4 subgraph argues for the composable /
  cross-subgraph track.

Envoyage supports either honestly; pick the one whose exact wording this year matches
"a subgraph that does real work" over "simply querying one subgraph". Do **not** claim
both — max 3 partner prizes total, and Uniswap + ENS + one Graph track already fills it.

**Risk to flag on the day:** the Gateway composition reads Uniswap's v4 subgraph on the
decentralized network. On 9 Sept that subgraph returned "bad indexers … too far
behind". If it is still down at record time, the census section stands on its own (it
is served entirely by our own subgraph); only the "two products composed" second half
goes quiet. Re-check before recording.
