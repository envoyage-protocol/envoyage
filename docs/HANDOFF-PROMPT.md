# Paste this into the new session

The `21st` MCP server is registered for this project (`claude mcp list` should show it
connected). Start a fresh session in the repo root and paste everything inside the
block.

---

```
Read docs/HANDOFF-UI.md before doing anything else. It explains why two previous
redesigns of web/ both failed the same way and what must not break.

Then, BEFORE writing any code: use the 21st MCP to explore design directions for the
page in web/. Show me three meaningfully different directions, grounded in this
project, and wait for me to pick one. Do not build until I have.

The brief in one line: Envoyage lets a Uniswap v4 position owner hire a keeper bot
without handing over unbounded authority. A mandate is a limited power of attorney —
it enumerates what the bearer may do and may not — and the page should have a FORM
only that product could have, not a palette. Two motifs are already in the content:
the mandate as a paper document with clauses, signatories and a seal; or
permitted/withheld as a ruled ledger. Find a third if you can.

Reference for the level of identity I want, not for copying: mistral.ai.

Hard constraints: do not touch web/src/lib/. Keep the four load-bearing behaviours
in the handoff (independent loading, errors never rendered as zeroes, ENS read
through the resolver, ledger rendered from the subgraph and receipt-verified).
Measure every text contrast pair; derive nothing from memory.

When the chosen direction is built: npm run build && npm run preview, screenshot at
1280 and 375 with a real browser, check for horizontal overflow at 375, and show me
before anything else.

Deadline for this: Thursday 11 Sep evening WIB. One focused pass, not two days.
```
