# Paste this into the new session

Start a fresh session in the repo root (`ETHGlobalOnline/envoyage`) so the
`claude_design` and `21st` MCP servers load — they are registered and authorized, but
MCP tools bind at session start, which is why the previous session could not use them.

Copy everything inside the block.

---

```
Use the claude_design MCP to import this project and implement both files:

https://claude.ai/design/p/21756f15-30b5-4d31-99f3-9985b970cdcf

  - Envoyage app v2.dc.html
  - Envoyage - How it fits, variants.dc.html
  - support.js (imported by both)

BEFORE writing any code, read these two, in this order:

  docs/submission/APP-SPEC.md   every screen, every value on it, and where that
                                value comes from; the three integrations in full;
                                what is live right now
  docs/submission/UI-REVIEW.md  the critique this redesign is answering

Decisions already made in the design session — implement these, do not relitigate:
  - Demo spine is PROOF FIRST: the theft, then the mandate that stops it, then hire one.
  - "What a mandate is" lands as a SIDE-BY-SIDE: an approval says which position,
    a mandate says what the bot may do. The may/may-not list is the content of the
    mandate column, not a competing element.
  - The Hire flow gets a WALLET-STYLE CONFIRM SHEET before the first signature,
    enumerating all three transactions and the estimated cost. Do NOT collapse
    approve + grant into one action — they are two transactions and the wallet will
    prompt twice regardless; hiding that makes it worse.
  - Scope: Home and Hire deep, the others tidied.

HARD CONSTRAINTS

  - Do NOT touch web/src/lib/. It is verified against live Sepolia and has survived
    three real RPC failures. Extend it only if a screen genuinely needs a new read,
    and never change an existing function's behaviour or signature.
  - Do NOT restyle the Proof tab (#/demo). It already works and it is the strongest
    artifact in the project. Leave it alone.
  - Four behaviours are load-bearing; two of them affect prize qualification:
      1. chain reads and subgraph reads load independently — a dead indexer never
         blanks what comes from the chain, and vice versa
      2. a failed query surfaces as an error, never as rendered zeroes; a pending
         state is never rendered as an empty fact
      3. ENS records are read back THROUGH THE RESOLVER, never reused from contract
         state shown elsewhere  (ENS prize)
      4. the execution ledger renders FROM THE SUBGRAPH, each row verified against
         its own transaction receipt  (The Graph prize)
  - Never hard-code error selectors. Derive them with toFunctionSelector — four of
    six were wrong when they were written from memory.
  - English only, everywhere in the repo.
  - No horizontal overflow at 375px. Measure every contrast pair with
    web/scripts/contrast-pairs.sh in both light and dark; do not assume.

WORKING RULES

  - Branch ui/instrument. Commit per screen with a message that says what changed and
    why. Do not push to main.
  - After each screen: rm -rf dist && npm run build, kill the preview port first, then
    npm run preview -- --port 4190, and screenshot at 1280 and 375 with agent-browser
    into docs/submission/screens/. A stale bundle was served twice this week — always
    rebuild from clean and load with a cache-busting query.
  - Run npx vitest run (45 tests today) and npx tsc -b before each commit.

CONTEXT YOU SHOULD KNOW

  - Submission is Sun 13 Sep 23:00 WIB. The demo video is mandatory, 2-4 minutes,
    720p, with the author's own spoken narration and no speed-up. A live URL is
    optional, so deployment comes after the redesign, not before.
  - main is stale at 67a2f3e; 23 commits of work are on ui/instrument. That merge
    happens after this work lands.
  - The reference keeper and swap loop run on a VPS but BOTH WALLETS ARE CURRENTLY
    OUT OF GAS, so the "watch the bot compound" beat will not fire until the author
    refunds them. Build the waiting and pre-flight states correctly anyway — they are
    what the screen shows when the bot has nothing to do, which is most of the time.

When both files are implemented: screenshot every route at 1280 and 375, report what
you could not verify without a wallet, and list every commit hash.
```
