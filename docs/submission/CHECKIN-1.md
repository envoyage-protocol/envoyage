# Check-in #1 — draft

Due Mon 7 Sep 23:59 ET = **Tue 8 Sep 10:59 WIB**

Submit in TWO places: the Hacker Dashboard, and the Discord
`#project-check-ins` channel. At least one check-in is mandatory for the stake
to be returned.

---

**Project:** Envoyage — scoped keeper permissions for Uniswap v4
**Repo:** https://github.com/envoyage-protocol/envoyage
**Track:** Start Fresh · Sepolia

## What it does

Today, hiring a keeper to compound a Uniswap v4 position means `approve(keeper, tokenId)`.
That constrains *which* position, never *what may be done to it* — and four of v4's 26
actions (`TAKE_PAIR`, `TAKE`, `SWEEP`, `MINT_POSITION`) take a recipient straight from
the caller. So an approved keeper can assemble `DECREASE_LIQUIDITY` +
`TAKE_PAIR(…, its own wallet)` and nothing on chain objects. That is the Code4rena
Revert Lend H-04 class and the shape behind the ~$17M Aperture Finance drain.

Envoyage inverts it. The keeper never writes v4 instructions — it calls
`compound(mandateId, minFee)`, two integers. Envoyage assembles the action array itself
with the recipient as a constant in code. Misuse isn't rejected by a check; there's no
field to express it in.

## Progress so far

Live and verified on Sepolia:

- **Envoyage** `0x8466e82E02edF3F00c0387D5C3E66d407dc7259C` (verified)
- Position `#38896`, ERC-721 approved to Envoyage — never to the keeper
- Mandate `#1`, capped at 200 bps of harvested fees, 60s cooldown

The reference keeper bot compounded it unattended, block 11644861:

```
liquidity before  100.000000000000000000
liquidity after   100.614338692357009962
```

Verified by independent on-chain reads rather than the script's own output: the emitted
fees match the keeper's balances exactly, and Envoyage holds 0 of both tokens — so
"non-custodial between transactions" is an on-chain fact, not a design intention.

**38 tests, `forge lint` clean.** The exploit replay is deliberately paired: each attack
runs against `NaiveUtils`, a comparator built vulnerable in exactly the way Revert
V3Utils was, *and* against Envoyage. A test showing we merely lack the vulnerable
function is a tautology; showing the same attack drain the contract next to it is not.

```
H-04 vs NaiveUtils -- token0 stolen: 4.757902903361556095
keeper received (capped at 2%):      0.0012
```

Also shipped: 4 deploy scripts (rehearsed on an anvil fork before broadcasting), a
subgraph with 5 matchstick tests, a web UI reading live state with no backend, and
`docs/V4-ACTION-COMPLETENESS.md` tracing all 26 v4 actions to file and line.

## Next

- Deploy the subgraph to Studio (built and tested; blocked on a deploy key)
- ENSv2: a mandate becomes a subname, so its scope resolves in any ENS client rather
  than only in our UI
- Demo video

## Blockers

**The Graph Studio deploy key.** The subgraph builds and its handlers are tested, but
it has nowhere to run yet.

**Sepolia test USDC for ENSv2.** Registration on the ENSv2 Sepolia beta is priced in
USDC (`0x1c7D…7238`), not native ETH — 8.00 USDC for a year, 0.61 for the 28-day
minimum. Our wallet holds ETH but no USDC.
