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
One thing, and it's small: I need a Subgraph Studio deploy key. The subgraph is
written and its handlers pass 5 matchstick tests, and the build is on IPFS at
QmNsAEPDBLY1TedpzxDUt1Rau4gxKbLjWQknTNWTpHBQHS, but every key I have is rejected
with "Deploy key not found" — they're Substreams/registry keys, not Studio deploy
keys. If a Graph mentor can point me at the right place to generate one, that
unblocks it in minutes.

Nothing else is blocked. Contracts, ENS and the keeper bot are all live on Sepolia.
```

**How confident do you feel about submitting?**
Very confident — the core is deployed, verified and working end-to-end.

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

Already live on Sepolia: contract 0x8466e82E02edF3F00c0387D5C3E66d407dc7259C
(verified), and a reference keeper bot that compounded a position it doesn't own,
unattended, in block 11644861 — 100.000000 to 100.614338 liquidity, with Envoyage
holding 0 of both tokens afterwards.

Each mandate is also an ENSv2 subname. 38896.envoyage.eth resolves its scope in
any ENS client, so it can be read without trusting my frontend. The keeper holds
authorizeTextRoles on exactly one key: writing envoyage:lastRun succeeds, writing
envoyage:maxFeeBps reverts EACUnauthorizedAccountRoles.
```

**Prizes you're going for:** Uniswap · ENS · The Graph

**Technologies already built on:** Uniswap · ENS · The Graph

**Technologies interested in learning more about:** The Graph (Substreams) · ENS

---

## Where to submit

Both places:
1. Hacker Dashboard
2. Discord `#project-check-ins`

At least one check-in is mandatory for the stake to be returned.
