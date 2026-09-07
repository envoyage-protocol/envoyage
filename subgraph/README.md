# Envoyage subgraph

Live: https://api.studio.thegraph.com/query/62788/ethonline/v0.0.1
Studio: https://thegraph.com/studio/subgraph/ethonline

```bash
npm install
npm run codegen && npm run build
npm test          # 5 matchstick tests over the real handlers
npm run deploy    # needs a Studio deploy key
```

## What it indexes that other automation tooling cannot

Most keeper tooling can only index what a bot **did**, because what it was
**allowed** to do does not exist on chain — an ERC-721 approval carries no scope.
Here both halves sit on the same entity, so a single query answers "what may this
keeper do, and what has it done?":

```graphql
{
  mandates {
    maxFeeBps          # the scope
    feeRecipient
    minInterval
    expiry
    executionCount     # the behaviour
    totalFee0ToKeeper
    totalLiquidityAdded
  }
}
```

Live answer at the time of writing: a 200 bps cap, two executions, 0.0024 token0
taken in fees, and 1.2255 liquidity added. The keeper took capped fees and added
liquidity; no query is needed to check it took nothing else, because no action
exists that could.

## Two decisions that came from reading the generated types

**The scope is read, not emitted.** `MandateGranted` carries only
`(id, keeper, tokenId)`. The fee cap, expiry, cooldown, `feeRecipient` and
`grantor` live in storage and in no event, so they are read with `try_mandates()`
at grant block. `try_` because a failed `eth_call` halts indexing; on failure the
mandate is still recorded with `compoundAllowed = false`, which under-states
permission rather than over-stating it.

**Revocation must not erase the record.** `handleMandateRevoked` deliberately does
not re-read storage — `revoke()` deletes the struct, so a call at that block
returns zeroes. The scope captured at grant time is the historical truth and has to
survive revocation, or evidence of what a keeper was permitted to do vanishes the
moment it stops being permitted.

## Deploying

The slug is `ethonline`, and that matters: `graph deploy envoyage` with a valid key
fails as **"Deploy key not found"**, which reads like a credentials problem and is
actually a slug mismatch. Deploy against the slug Studio shows you.
