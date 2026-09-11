# Check-in #2 — due Fri 11 Sep, 10:59 WIB

Field-by-field, matching the actual form. Copy each block into its box.

---

## Will you be joining us for Live Judging to qualify for Top 10 Finalist?

**Yes** — Judging Round 2 is Mon 14 Sep, 23:00 WIB.

## Are you on track for submitting a project?

**Yes**

## Are there any prizes in particular you're going for?

Select (max 3 partner prizes):

1. **Uniswap** — Best Uniswap Stack Contribution
2. **ENS** — Best Use of ENSv2
3. **The Graph** — *Best Use of Composable or Standardized Graph Products*

## What progress did you make since the last check-in?

Envoyage is a permission layer for Uniswap v4 automation: an LP can hire a keeper bot
without handing it the power to steal. The bot gets a mandate — one function,
`compound(id, minFee)` — and the contract writes the Uniswap instructions itself with
the owner's address fixed in code, plus a fee cap, a cooldown, an expiry, and instant
revocation.

Since check-in #1:

- **Contract live and verified on Sepolia** — `0x8466e82E02edF3F00c0387D5C3E66d407dc7259C`, 38 tests, `forge lint` clean, immutable (no admin, no upgrade path, no `delegatecall` in the deployed bytecode).
- **The whole loop now runs unattended.** A reference keeper and a fee-generating swap loop run under pm2 on a VPS: the bot asks our subgraph which mandates name it, compounds on Uniswap v4, and writes its one permitted ENS record — every ~2 minutes, across two live mandates, with no human involved. Verified by reading `38896.envoyage.eth` back through the ENS resolver.
- **Three Graph sources composed.** Our Sepolia subgraph (mandates, executions, and a census of every approval ever granted on Uniswap v4's PositionManager), the *same census schema redeployed against mainnet* (1,440+ unbounded delegations over real positions, and zero scoped ones — no bounded alternative exists there yet), and Uniswap's own v4 subgraph on the decentralized network via the Gateway. No single one of them answers the question the page asks: ours knows exactly what each keeper may do but nothing about the wider population; Uniswap's knows the population but has no concept of a permission scope, because an approval does not carry one.
- **ENSv2 with real access control.** Every mandate is a subname whose text records are its terms. Enhanced Access Control gives the keeper write permission to exactly one key, `envoyage:lastRun`; writing any other record reverts `EACUnauthorizedAccountRoles`.
- **The web app went from a guided walkthrough to a working product**: Hire a keeper (get a demo position → set terms → approve, grant, publish), My mandates (live rows, revoke, ENS name actions), Bot, Lookup by ENS name, and Home. 45 tests.
- **A live adversarial demo**, kept as a Proof tab: the same attack calldata is sent to two contracts from the same wallet. Against a deliberately vulnerable comparator it drains the position; against Envoyage it mines a failed transaction, because no function exists to receive it. Two Etherscan links, opposite outcomes.

## Any blockers? Need help?

No hard blockers.

One thing we would take advice on: our subgraph is **load-bearing infrastructure, not
an analytics layer** — the keeper's work queue comes from it, so deleting the subgraph
stops the bot entirely. We have entered the Composable track because we compose three
Graph sources, but if that "the automation runs on The Graph" angle is better served
by a different track, we would rather be told now than after submission.

## Is there anything else you think we should know?

Today's focus is a design pass, and it is our biggest challenge: the three
integrations are *working* but not yet *legible in the interface*. The bot genuinely
takes its task list from The Graph, compounds on Uniswap, and writes its one
permitted ENS record — but on screen those read as labels beside buttons rather than
as one system a first-time viewer can follow without narration. Same for the app
itself, which went from a walkthrough to a product overnight and now needs its flow
tightened.

Everything is live on Sepolia and nothing in the demo is a fixture — the numbers on
screen are read from the chain, the subgraph, and the ENS resolver at page load.
Demo video is recorded Saturday.
