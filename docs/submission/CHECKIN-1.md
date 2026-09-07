# Check-in #1 — field by field

Due Mon 7 Sep 23:59 ET = **Tue 8 Sep 10:59 WIB**

---

**Project name:** `Envoyage`
**Category:** `Security`
**Emoji:** 🔐

**GitHub repository** (replace the placeholder):
```
https://github.com/envoyage-protocol/envoyage
```

**Short description** — 99 chars:
```
Hire a Uniswap v4 keeper without handing it your position. Scoped permission, not blanket approval.
```

---

## Your Plan

**Solo or team:** Hacking Solo

**Skills:** Smart contracts / Solidity · Backend · Frontend · Security

**Is there anything blocking you?**
```
Not blocked on anything external — contract, ENS names, subgraph and keeper bot are
all live on Sepolia. The real gap is that they are three integrations that don't yet
talk to each other, and I'd rather name that than claim everything is fine:

- the web UI reads the chain directly and never queries my own subgraph
- it doesn't display the ENS name either, so the ENS work currently only shows up in
  script output
- the keeper doesn't write its envoyage:lastRun record after compounding; I set that
  key by hand to prove the permission works

Each piece is real, but "functional demo, not hard-coded values" is a fair thing to
hold me to, and right now one of those records genuinely was set by hand. Wiring
them together is my next block of work, ahead of any new features.

One question I'd value a Graph mentor's read on: which track my subgraph best fits.
It indexes the granted permission scope alongside the keeper's actual behaviour on
the same entity, which feels closer to the standardized-schema angle than to
"querying one subgraph" — but I'd rather be told than guess, since a wrong pick
wastes one of three prize slots.

A note in case it saves someone time: deploying against a Studio slug that doesn't
exist yet fails with "Deploy key not found", which reads like a credentials problem
and isn't one.
```

**How confident do you feel about submitting?**
Confident — the core is deployed, verified and working end-to-end. The remaining
work is wiring the three integrations to each other, which is well understood
rather than risky.

**Anything else you think we should know?**
```
Two things, both for transparency.

Five commits predate the 4 Sep opening. All five are toolchain scaffolding and
planning docs — no protocol code. The first line of Envoyage logic is commit
fb42859 on 5 Sep, after the event opened. Entering on Start Fresh.

AI usage is documented in AI-USAGE.md, including five things AI got wrong in this
repo and how each was caught — e.g. the keeper bot could never have sent a
transaction because viem was handed an address instead of an account object, which
surfaced only by running it against Sepolia.
```

---

## Your Idea

**Have you decided on an idea:** Yes

**What are you thinking of building?**
```
To let a bot compound your Uniswap v4 position today you call approve(keeper,
tokenId). That says WHICH position it may touch, never WHAT it may do.

v4 sharpens this: liquidity management goes through one entrypoint,
modifyLiquidities(bytes actions), and that payload is an action array — a small
language of 26 opcodes. "May only call modifyLiquidities" restricts nothing,
because that function is itself an interpreter. I traced all 26 to file and line:
four (TAKE_PAIR, TAKE, SWEEP, MINT_POSITION) take a recipient straight from the
caller. So an approved keeper can assemble DECREASE_LIQUIDITY + TAKE_PAIR(...,
its own wallet) and nothing on chain objects — the Code4rena Revert Lend H-04
class, and the shape behind the ~$17M Aperture Finance drain.

Envoyage inverts who writes the instructions. The keeper calls compound(mandateId,
minFee) — two integers. Envoyage assembles the v4 action array itself with the
recipient as a constant in code. Misuse isn't rejected by a check; there's no
field to express it in.

All five pieces are live on Sepolia, not planned:

- Contract 0x8466e82E02edF3F00c0387D5C3E66d407dc7259C, verified on Etherscan
- A reference keeper bot that compounded a position it does not own, unattended,
  in block 11644861 — and again in 11644474. Envoyage held 0 of both tokens after
  each, so "non-custodial between transactions" is an on-chain fact rather than an
  intention.
- ENSv2: 38896.envoyage.eth resolves the mandate's full scope in any ENS client, so
  it can be read without trusting my frontend. The keeper holds authorizeTextRoles
  on exactly one key — writing envoyage:lastRun succeeds, writing
  envoyage:maxFeeBps reverts EACUnauthorizedAccountRoles. Same division the
  contract's gate enforces, on a different substrate.
- Subgraph live at api.studio.thegraph.com/query/62788/envoyage/v0.0.2, indexing
  the granted scope beside actual behaviour on one entity.
- A web UI reading live state directly over two independent RPC operators.

38 Solidity tests plus 5 subgraph tests, forge lint clean. The exploit replay is
paired: each attack runs against a comparator built vulnerable exactly as Revert
V3Utils was, AND against Envoyage — because showing we merely lack the vulnerable
function is a tautology. The same H-04 back-run steals 4.757902903361556095 token0
from the comparator and cannot be encoded against us.
```

**Prizes you're going for:** Uniswap · ENS · The Graph

**Technologies already built on:** Uniswap · ENS · The Graph

All three are integrated and live, not planned — see the links above.

**Technologies interested in learning more about:** The Graph (Substreams) · ENS

---

## Where to submit

Both places:
1. Hacker Dashboard
2. Discord `#project-check-ins`

At least one check-in is mandatory for the stake to be returned.
