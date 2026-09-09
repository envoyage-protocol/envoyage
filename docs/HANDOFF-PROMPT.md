# Paste this into the new session

Copy everything inside the block.

---

```
Use the `interfaces` skill to redesign the web UI in web/.

Read docs/HANDOFF-UI.md first — it has the full brief, the brand colours sampled
from the logo, and the three data-layer behaviours that must survive the rewrite.

Context in one line: Envoyage lets a Uniswap v4 position owner hire a keeper bot
without handing over unbounded authority. The bot passes two numbers; the contract
writes the Uniswap instructions itself with the destination fixed in code.

The current page fails in two ways, and I want both fixed:

1. It does not explain what the product IS. It opens with the number 416 before the
   reader knows what a mandate is. Someone who has never heard of this should
   understand it within a few seconds of landing.

2. It looks generic — every block is the same rounded card with an uppercase grey
   heading, nothing draws the eye, and the accent is teal while our logo is amber.

Brand: web/public/logo.png — a stylised E in warm white with an amber arc, built for
dark grounds. Colours sampled from its pixels: #F07000 deep orange through #F0C020
gold. Neutrals should carry a warm bias; a pure grey next to amber reads as
unconsidered.

A direction worth considering, not a constraint: a mandate is a limited power of
attorney. Documents like that enumerate what the bearer may do and what they may
not, with a validity period and a seal. That form is already familiar and happens to
be exactly what this product sells. Right now the permitted/withheld split is the
whole idea and it is buried three sections down.

Content order the page needs — roughly the reverse of what it has now:
  1. what this is, one sentence, before any number
  2. the mandate itself: what this keeper may do and what it may not
  3. proof it works: three compounds, capped fees taken, zero liquidity taken
  4. anyone can verify it: 38896.envoyage.eth resolves the scope in any ENS client
  5. why it matters: the census, 416 unbounded delegations against 1 scoped
  6. where the numbers come from: two Graph products, composed

Do not break these — they are load-bearing, and two of them affect prize
qualification:
  - chain reads and Graph reads load independently, so a slow indexer never blanks
    the parts that come straight from Sepolia
  - a failed query surfaces as an error, never as rendered zeroes
  - ENS records are read back through the resolver, not reused from the contract
    values shown elsewhere on the page

Never hard-code error selectors. Derive them with toFunctionSelector — four of six
were wrong when they were written from memory.

All data is live on Sepolia; nothing is a fixture. Run it with:
  cd web && npm install && cp .env.example .env.local   # fill VITE_GRAPH_GATEWAY_KEY
  npm run dev

Take a screenshot when you are done and show me before we go further.

Hard deadline: this must be finished by Friday 11 Sep evening WIB, because the demo
video gets recorded Saturday and the submission is Sunday 13 Sep 23:00 WIB.
```

---

## After the redesign

Two things left, neither depends on the UI:

1. **Demo video** — script already written and verified against live Sepolia at
   `docs/submission/DEMO-SCRIPT.md`. Record Saturday.
2. **Uniswap Developer Feedback Form** — `developers.uniswap.org/hackathon-feedback`,
   linking to
   `https://github.com/envoyage-protocol/envoyage/blob/main/FEEDBACK.md`.
   Qualification requirement, not a judging criterion; without it the Uniswap
   submission does not count.
