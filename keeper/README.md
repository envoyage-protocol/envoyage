# Envoyage reference keeper

```bash
npm install
KEEPER_PRIVATE_KEY=0x... npm run once    # single pass
KEEPER_PRIVATE_KEY=0x... npm start       # poll forever
```

| Variable | Default |
|---|---|
| `KEEPER_PRIVATE_KEY` | required |
| `ENVOYAGE_ADDRESS` | `0x8466e82E02edF3F00c0387D5C3E66d407dc7259C` |
| `ENVOYAGE_DEPLOY_BLOCK` | `11644424` |
| `MIN_FEE` | `1000000000000` |
| `POLL_MS` | `30000` |

## Read the source — that is the point

This bot holds a private key with a mandate over someone else's position, and the
only state-changing call it can make is `compound(mandateId, minFee)`. Two numbers.
No destination, no action list, no route. There is no code path here that could
redirect funds, because there is no parameter in which to express one.

Contrast a keeper holding `approve(keeper, tokenId)`: it could assemble
`DECREASE_LIQUIDITY` + `TAKE_PAIR(…, its own wallet)` at any moment and nothing on
chain would stop it. Its restraint would be a property of source its users cannot
read, and which an attacker who steals the key does not inherit.

## Verified live

```
mandate 1: compound sent 0xbe01d872dfd9830c7ccd8fea67b11a212ff73d762848ce61285a92772298a518
mandate 1: success in block 11644861, gas 266754 (fee cap 2.00% to 0xd643ee84…)
```

And when there is nothing to do, it says so plainly rather than burning gas:

```
mandate 1: not executed — FeeBelowMinimum
```

## Two bugs found while building this, both worth knowing

**Pass the account object to `simulateContract`, not its address.** A bare address
makes viem tag the request as a `json-rpc` account, so `writeContract` calls
`eth_sendTransaction` — asking a public RPC to sign with a key it does not have. It
fails with `Missing or invalid parameters`, naming neither the cause nor the
contract, and the simulation passes first, so it reads as an RPC outage. With the
account object viem signs locally and sends `eth_sendRawTransaction`.

**Decode revert selectors before logging.** viem's top line is a generic sentence,
so the most common healthy outcome — `FeeBelowMinimum`, meaning fees have not
accrued yet — was indistinguishable from a real failure. Selectors are derived from
signatures with `toFunctionSelector`, never written down: hard-coded ones were wrong
four times out of six elsewhere in this repo.

## Judging-window operations

Two processes must run unattended from Friday until judging ends:

| Process | Does | Without it |
|---|---|---|
| `envoyage-keeper` | compounds whatever the subgraph says needs it | nothing ever compounds |
| `envoyage-swap-loop` | one round-trip swap on the demo pool every 2 min from the deployer key | fresh positions earn nothing; the keeper refuses them forever |

```bash
cd keeper && npm install
pm2 start ecosystem.config.cjs && pm2 save
# after editing .env: pm2 delete envoyage-keeper envoyage-swap-loop && pm2 start ecosystem.config.cjs
# (pm2 restart --update-env does NOT re-read the ecosystem file; the ENS vars were silently missing once)
pm2 logs envoyage-keeper --lines 20
```

Both read `../.env`. Balances to watch: keeper ≥ 0.005 ETH (warned at start), deployer ≥ 0.01 ETH (the loop pauses below it and says so). One round trip was measured to make `compound(1)` eligible immediately.

Time to first compound for a newly granted mandate ≈ swap cadence (2 min) + keeper poll (30 s) + indexer lag.

## Burn rate — read this before leaving it running

`compound` only succeeds when fees have accrued, so **the swap-loop cadence throttles
the whole system**. At a 2-minute cadence against a 60-second mandate cooldown the
keeper compounded roughly 120 times an hour across two mandates and spent 0.09 ETH
overnight (246 executions). Both wallets hit their floors and stopped — correctly, and
without wasting gas on sends that could not pay.

Default is now **30 minutes** (~0.014 ETH/day across two mandates). For recording,
speed it up for that session only:

```bash
pm2 delete envoyage-swap-loop
SWAP_CADENCE_MS=60000 pm2 start ecosystem.config.cjs --only envoyage-swap-loop
```

Mandate cooldowns cannot be edited after grant — that is by design. To change one,
revoke and re-grant.
