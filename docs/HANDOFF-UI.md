# Handoff — UI redesign, second pass

Written 9 Sept, late, for a fresh session with the **21st MCP** connected. Two
attempts at this page have now converged on the same result, and the author's verdict
on both is correct: *"jujur UI/UX-nya masih slop."* This document exists so the third
attempt does not start where the first two did.

---

## Read this first: why the last two attempts failed

Both produced **"tasteful AI dark mode"** — warm black, one accent colour, a serif
headline, numbered sections, rounded cards. Competent, and precisely what every model
emits when asked for "premium dark". There is no *idea* in the form. The concept the
project sells (a mandate is a limited power of attorney: it enumerates what the bearer
may and may not do) lives in the **copy**, not in the **layout**. Strip the words and
the page could be any crypto dashboard. That is the definition of slop: nothing a
viewer could recognise as *this* project.

**Root cause, both times:** the session went straight to *building* and skipped
*choosing a direction*. The default direction is the one you get when you do not
choose. So:

> **Do not write a line of CSS until a direction has been picked and shown to the
> author.** Use 21st's "explore design directions" flow — *"show me three directions
> for this page"* — and get one approved. That is the single step that changes the
> outcome.

## What the author is reacting to

They sent **mistral.ai** as a reference. Read it as: *a visual identity*, not a nicer
version of the same page. Light ground, loud, one strong motif (the pixel grid, the
cat), big type, deliberately a little strange. You would know it with the logo
removed. The current page fails exactly that test.

This does **not** mean "copy Mistral". It means: **the page needs a motif that comes
from the product**, so its form is one only Envoyage could have. Two candidates that
are already latent in the content:

1. **The instrument as a document.** A mandate is a limited power of attorney. Real
   ones have ruled lines, a numbered clause structure, a signature block, a *stamp* —
   not a pill that says "IN FORCE". Lean into paper: a light ground, a document that
   sits on it, ink-coloured type, one seal colour (the amber from the logo). The
   permitted/withheld columns become clauses. The parties block becomes signatories.
2. **Permitted / withheld as a ledger.** Two columns ruled like an accounts book, with
   the theft demo as two entries — one that posts, one that bounces.

Either is a *form*, not a palette. Pick one (or find a third) with 21st, show it, then
build.

## Brand inputs

- Logo: `web/public/logo.png` — stylised **E** in warm white with an amber arc, plus a
  four-point sparkle. Built for dark grounds; on a light ground it needs a dark plate
  or a recoloured variant (ink-on-paper). Decide this deliberately.
- Amber sampled from the logo: `#F07000` → `#F08000` → `#F09010` → `#F0A010` →
  `#F0C020`. On a light ground, the deeper end (`#F07000`) carries; the gold end
  disappears. Measure every pair. A contrast script is trivial; write it.
- The current tokens are in `web/src/styles.css` (`--sand-*`, `--amber-*`). They are a
  valid *dark* neutral ramp; if the direction is light, replace them — do not bolt a
  light theme onto them.

## What must not break — this is a skin, not a rewrite

**Do not touch `web/src/lib/`.** Everything in it is verified against live Sepolia and
has been through three real failures today:

| File | Owns |
|---|---|
| `lib/config.ts` | verified addresses; RPC order (keyed Alchemy first, publicnode second — 1rpc was removed, it lies) |
| `lib/envoyage.ts` | chain reads; selectors **derived** with `toFunctionSelector`; `verifyExecutionReceipts` |
| `lib/envoyage.abi.ts` | **generated** from the compiler artifact — never hand-edit |
| `lib/graph.ts` | three Graph sources: ours on Sepolia, ours on **mainnet** (`envoyage-census-mainnet`), Uniswap's via Gateway |
| `lib/actions.ts` | grant / revoke / compound / the theft in both arms |
| `lib/wallet.ts`, `lib/session.tsx` | EIP-1193 connect, account-change subscription, hash router |

Four behaviours are load-bearing. Two affect prize qualification:

1. **Chain reads and Graph reads load independently.** A slow or dead indexer never
   blanks the parts from Sepolia, and vice versa. (Today 1rpc died and the subgraph
   section still rendered. Keep it that way.)
2. **A failed query surfaces as an error, never as zeroes.** And a *pending* state is
   never shown as an empty fact — `execs` starts as `null`, not `[]`, for this reason.
3. **ENS records are read through the resolver** (`readEnsScope`), not reused from
   contract values. Showing contract state under an ENS heading is a claim; resolving
   it is a demonstration. Load-bearing for the ENS prize.
4. **The execution ledger renders from the subgraph**, with each row verified against
   its own transaction receipt. Load-bearing for the Graph prize — the first version
   drew this table from RPC logs and the subgraph was decorative.

The components in `web/src/ui/` (`Overview`, `Theft`, `KeeperActs`, `WalletBar`,
`kit`) carry the data wiring and state machines. Restyle them; you may restructure
their JSX freely; keep their hooks and handlers.

## Content, in the order a first-time reader needs it

This order was right and should survive any direction:

1. **What this is** — one sentence, before any number.
2. **The mandate** — what this keeper may do and may not. The product. Permitted /
   withheld is the whole idea and must be the visual centre.
3. **Proof it works** — 3 compounds, capped fees taken, zero liquidity taken. From the
   subgraph, receipt-verified.
4. **Anyone can verify it** — `38896.envoyage.eth` resolves the scope in any ENS
   client; the keeper may write exactly one key.
5. **Why it matters** — **mainnet** census leads (real money), Sepolia beside it
   (the scoped alternative). Both labelled by network.
6. **Where the numbers come from** — three Graph sources.

Plus the **"Try it live"** route (`#/demo`): the theft duel (same calldata, two
contracts, one drains and one mines a failed tx), then compound and revoke. Every
button sends a real transaction. This is the demo; the overview is the reading.

## Running it

```bash
cd web && npm install
# .env.local already exists and is gitignored. It holds VITE_SEPOLIA_RPC_URL (Alchemy,
# a tier that allows wide getLogs) and VITE_GRAPH_GATEWAY_KEY. Do not commit it.
npm run dev            # → localhost:5173
```

Production check before showing anything: `npm run build && npm run preview`.
Screenshot with a real browser at **1280** and **375**; check
`document.documentElement.scrollWidth > clientWidth` at 375 — it was true once today.

**Beware stale bundles.** `vite preview` on a reused port served an old build twice
today. Kill the port, `rm -rf dist`, rebuild, then load with a cache-busting query.

## Live data the page will show (nothing is a fixture)

| | |
|---|---|
| Envoyage | `0x8466e82E02edF3F00c0387D5C3E66d407dc7259C` (verified) |
| Mandate | #1 · 200 bps cap · 60 s cooldown · expires 2026-10-06 · ACTIVE |
| Position | #38896 · pool `0x1dC7…0985 / 0x7D5D…13DC` · approved to Envoyage, never the keeper |
| Executions | 3, +1.834101957027488685 liquidity, receipt-verified |
| ENS | `38896.envoyage.eth`, 5 records; keeper may write only `envoyage:lastRun` |
| Census, mainnet | 1,440+ unbounded (385 `setApprovalForAll`, 1,055 single), 0 scoped — still syncing, climbs |
| Census, Sepolia | 417 unbounded vs 1 scoped |
| NaiveUtils | `0x0Fc426408a752f46d46b1e182aa018647146Aa56`, victim position #39022 |

## Deadlines (WIB) — and the honest priority

| | |
|---|---|
| Check-in #2 | Fri 11 Sep, 10:59 |
| **Redesign must be done** | **Thu 11 Sep evening** — one focused pass with a chosen direction |
| Demo video recorded | Sat 12 Sep |
| **Submission** | **Sun 13 Sep, 23:00** |

**The UI is not what blocks submission. The Uniswap Developer Feedback Form is** —
`developers.uniswap.org/hackathon-feedback`, linking to `FEEDBACK.md`. Qualification
requirement, author's action, still open. And the web app has **no public URL yet**;
it must be deployed (Cloudflare Pages; domain `robbyn.xyz` is available) before the
form is filled in. Restrict the Alchemy and Gateway keys to that domain first — both
ship in the client bundle.

A distinctive-enough page with a video and a live URL beats a perfect page without
them. Choose a direction, build it once, ship it.
