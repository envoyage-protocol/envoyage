# Envoyage subgraph

| | |
|---|---|
| Query endpoint | `https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4` |
| Studio | https://thegraph.com/studio/subgraph/envoyage |
| Network | Sepolia, from block 11644424 |
| Deployment | `QmNsAEPDBLY1TedpzxDUt1Rau4gxKbLjWQknTNWTpHBQHS` |

```bash
npm install
npm run codegen && npm run build
npm test          # 5 matchstick tests over the real handlers
npm run deploy    # needs a Studio deploy key
```

## What it indexes that other keeper tooling cannot

Most automation tooling can only index what a bot **did**, because what it was
**allowed** to do does not exist on chain — an ERC-721 approval carries no scope.
Here both halves sit on the same entity, so one query answers "what may this keeper
do, and what has it actually done?":

```graphql
{
  mandates {
    maxFeeBps            # the scope
    feeRecipient
    minInterval
    expiry
    executionCount       # the behaviour
    totalFee0ToKeeper
    totalLiquidityAdded
  }
}
```

Live answer at the time of writing:

```
maxFeeBps            200          executionCount        2
minInterval          60           totalFee0ToKeeper     2400000000000000
expiry        1791254928           totalLiquidityAdded   1225570246268614335
```

The keeper took capped fees and added liquidity. No query is needed to confirm it
took nothing else, because no action exists that could.

## Two decisions that came from reading the generated types

**The scope is read, not emitted.** `MandateGranted` carries only
`(id, keeper, tokenId)`. The fee cap, expiry, cooldown, `feeRecipient` and `grantor`
live in storage and in no event, so they are read with `try_mandates()` at grant
block. `try_` because a failed `eth_call` halts indexing; on failure the mandate is
still recorded with `compoundAllowed = false`, which under-states permission rather
than over-stating it.

**Revocation must not erase the record.** `handleMandateRevoked` deliberately does
not re-read storage — `revoke()` deletes the struct, so a call at that block returns
zeroes. The scope captured at grant time is the historical truth and has to survive
revocation, or the evidence of what a keeper was permitted to do disappears the
moment it stops being permitted.

## Deploying

The Studio slug must match the argument to `graph deploy`. Deploying against a slug
that does not exist fails with **"Deploy key not found"** — which reads like a
credentials problem and is nothing of the sort. The key is fine; the slug is wrong.
Re-deploying an existing version label fails with "Version label already exists", so
bump `--version-label`.
