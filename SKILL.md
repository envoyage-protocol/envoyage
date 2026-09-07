# How The Graph is load-bearing in Envoyage

> For The Graph — *Best AI Tooling or AI Use Case (From Scratch)*.
> Live endpoint: `https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4`
> All figures below are live reads, not fixtures.

**The test:** delete the subgraph and the keeper bot has no work list, no ordering,
and no way to tell a revoked mandate from a live one. It does not degrade — it stops.

---

## 1. The Graph decides what the bot does

The keeper holds a private key with authority over other people's Uniswap v4
positions. Before it acts, it has to answer three questions: *which positions may I
touch, what am I permitted to do to each, and which needs me most?*

None of that is answerable from the chain cheaply. The scope of a mandate lives in
contract storage, its history lives in events, and neither is queryable by "mandates
naming me, still active, ordered by neglect". So the bot asks the subgraph:

```graphql
mandates(
  where: { keeper: $keeper, status: ACTIVE, compoundAllowed: true, expiry_gt: $now }
  orderBy: lastExecutedAt
  orderDirection: asc
) { mandateId maxFeeBps minInterval expiry lastExecutedAt position { id } }
```

[`keeper/src/graph.ts`](keeper/src/graph.ts)

The indexer does the filtering and the ordering. **Ordering by `lastExecutedAt`
ascending is the decision** — the longest-neglected position is served first — and a
log scan cannot express it at all, because logs record that a grant happened and
never what became of it.

## 2. It replaced something that was quietly broken

The bot used to find its work with `eth_getLogs` over a block range. Over a wide
range a public RPC returned an **empty array rather than an error**, so the keeper
logged `no mandates granted` while a live mandate naming it sat on chain. An empty
answer and no answer were indistinguishable.

An indexer answers once, at the head, with no range to get wrong. `graph.ts` also
treats a missing `data` field as a failure rather than an empty work list, for the
same reason: silence must never read as "nothing to do".

## 3. The subgraph indexes what no other source can

An ERC-721 approval delegates authority **without bounding it** — there is no scope
to read, because there is none. So most keeper tooling can only index what a bot
*did*. Ours indexes what it was *allowed* to do beside what it did, on one entity:

```
maxFeeBps 200 · minInterval 60 · expiry 1791254928     ← what is permitted
executionCount 3 · totalLiquidityAdded 1834101957027488685   ← what happened
```

Two mapping decisions came from reading the generated types rather than assuming:

- **The scope is read, not emitted.** `MandateGranted` carries only
  `(id, keeper, tokenId)`. Everything that defines the permission is in storage and
  in no event, so it is read with `try_mandates()` at grant block. `try_` because a
  failed `eth_call` halts indexing; on failure the mandate is still recorded with
  `compoundAllowed = false`, which under-states permission rather than over-stating it.
- **Revocation must not erase the record.** `handleMandateRevoked` deliberately does
  not re-read storage — `revoke()` deletes the struct, so a call at that block returns
  zeroes. What a keeper was permitted to do has to survive the moment it stops being
  permitted.

## 4. It measures the problem, from Uniswap's own contract

A second data source indexes every `Approval` and `ApprovalForAll` ever emitted by
Uniswap v4's `PositionManager` on Sepolia, from its creation block. Live:

| | |
|---|---|
| `setApprovalForAll` grants live | **133** |
| single-position approvals with no scope | **283** |
| approvals that carry a scope | **1** |
| distinct delegate addresses | **270** |
| approval events processed | **722** |

That 722 matches an independent Etherscan log count exactly — 177 `ApprovalForAll`
plus 545 `Approval` — so the census is complete rather than merely plausible.

This turns the project's central claim from rhetoric into arithmetic. **416 live
unbounded delegations against 1 scoped one** is not an argument about what *could*
go wrong; it is a count of what people are doing right now.

## 5. Composition, where one source genuinely cannot answer

The web UI reads our subgraph on Subgraph Studio and Uniswap's own v4 subgraph on
the decentralized network through the Gateway.

- Uniswap's knows how many positions exist and who holds them — 131,298 pools,
  37.7M transactions — and has **no concept of a permission scope**, because an
  approval carries none.
- Ours knows exactly what each keeper may do, over a small number of positions.

Neither answers *"how large is the population exposed to this, and what does a
bounded alternative look like against it?"* Only both together do.

[`web/src/lib/graph.ts`](web/src/lib/graph.ts)

---

## Reproduce it

```bash
# the census
curl -s -X POST https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4 \
  -H 'content-type: application/json' \
  -d '{"query":"{ censuses { activeBlanketApprovals activeUnscopedApprovals activeScopedApprovals distinctDelegates totalApprovalEvents } }"}'

# scope beside behaviour
curl -s -X POST https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4 \
  -H 'content-type: application/json' \
  -d '{"query":"{ mandates { maxFeeBps minInterval expiry executionCount totalLiquidityAdded } }"}'

# the bot, taking its orders from the subgraph
cd keeper && KEEPER_PRIVATE_KEY=0x… npm run once
```

The handlers are covered by 5 matchstick tests (`cd subgraph && npm test`), including
one asserting that a failed storage read defaults to *less* permission rather than
more, and one asserting that revocation preserves the scope granted historically.
