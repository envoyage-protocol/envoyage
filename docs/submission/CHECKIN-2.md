# Check-in #2 — due Fri 11 Sep, 10:59 WIB

Paste-ready. Keep it short; the form is a status update, not a pitch.

---

**What's shipped since check-in #1**

- Envoyage live on Sepolia and verified (`0x8466e82E02edF3F00c0387D5C3E66d407dc7259C`), 38 tests, `forge lint` clean.
- Reference keeper and a fee-supply loop running unattended on a VPS under pm2: the bot takes its task list from our subgraph, compounds on Uniswap v4, and writes its one permitted ENS record — every ~2 min, on two live mandates, no human involved. Verified by reading `38896.envoyage.eth` back from the resolver.
- Two subgraphs: Sepolia (mandates + a census of every approval on the v4 PositionManager) and a **mainnet census** (1,440+ unbounded delegations over real positions, zero scoped).
- ENSv2 names per mandate with per-record access control: the bot can write `envoyage:lastRun`; writing anything else reverts `EACUnauthorizedAccountRoles`.
- Web app moved from a guided walkthrough to a product: Hire a keeper (guided demo position → terms → approve/grant/publish), My mandates (live rows, revoke, name actions), Bot, Lookup by ENS name, Home. The walkthrough with the live theft demo (same calldata drains a naive contract, mines a failed tx against Envoyage) stays as the Proof tab.

**What's landing today (Fri)**

- App finishing pass and public URL; author walkthrough with real wallets.

**What's blocked / needs a decision**

- Uniswap Developer Feedback Form (qualification requirement) — author submitting today.
- Which Graph track to enter (build vs composable) — one pick, deciding today.

**Demo plan**

- 3-minute video, Saturday. App + Proof tab, all live data on Sepolia.
