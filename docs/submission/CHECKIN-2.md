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
3. **The Graph** — one track only *(decide today: the subgraph is the keeper's task
   source, which argues the build/tooling track; the UI also composes our subgraph
   with Uniswap's own v4 subgraph, which argues the composable track. Pick one.)*

## What progress did you make since the last check-in?

Envoyage is a permission layer for Uniswap v4 automation: an LP can hire a keeper bot
without handing it the power to steal. The bot gets a mandate — one function,
`compound(id, minFee)` — and the contract writes the Uniswap instructions itself with
the owner's address fixed in code, plus a fee cap, a cooldown, an expiry, and instant
revocation.

Since check-in #1:

- **Contract live and verified on Sepolia** — `0x8466e82E02edF3F00c0387D5C3E66d407dc7259C`, 38 tests, `forge lint` clean, immutable (no admin, no upgrade path, no `delegatecall` in the deployed bytecode).
- **The whole loop now runs unattended.** A reference keeper and a fee-generating swap loop run under pm2 on a VPS: the bot asks our subgraph which mandates name it, compounds on Uniswap v4, and writes its one permitted ENS record — every ~2 minutes, across two live mandates, with no human involved. Verified by reading `38896.envoyage.eth` back through the ENS resolver.
- **Two subgraphs.** Sepolia (mandates, executions, and a census of every approval ever granted on Uniswap v4's PositionManager) and a **mainnet census** that counts 1,440+ unbounded delegations over real positions — and zero scoped ones, because no bounded alternative exists there yet.
- **ENSv2 with real access control.** Every mandate is a subname whose text records are its terms. Enhanced Access Control gives the keeper write permission to exactly one key, `envoyage:lastRun`; writing any other record reverts `EACUnauthorizedAccountRoles`.
- **The web app went from a guided walkthrough to a working product**: Hire a keeper (get a demo position → set terms → approve, grant, publish), My mandates (live rows, revoke, ENS name actions), Bot, Lookup by ENS name, and Home. 45 tests.
- **A live adversarial demo**, kept as a Proof tab: the same attack calldata is sent to two contracts from the same wallet. Against a deliberately vulnerable comparator it drains the position; against Envoyage it mines a failed transaction, because no function exists to receive it. Two Etherscan links, opposite outcomes.

## Any blockers? Need help?

No hard blockers. One open question we'd take advice on: **which of The Graph's tracks
best fits a subgraph that is a live automation's task source rather than a read-only
analytics layer** — our keeper takes its work queue from the subgraph, so deleting it
stops the bot, and separately the UI composes our subgraph with Uniswap's own v4
subgraph through the Gateway.

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
