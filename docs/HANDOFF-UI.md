# Handoff — UI redesign

Written 9 Sept for a fresh session with a design skill loaded. Everything below the
presentation layer works; this is a redesign, not a repair.

---

## What Envoyage is, in one breath

A position owner on Uniswap v4 wants a bot to compound their fees. Today the only way
is `approve(keeper, tokenId)`, which says *which* position the bot may touch and
nothing about *what it may do* — so an approved bot can withdraw the liquidity and send
it to itself.

Envoyage replaces that with a **mandate**: the bot passes two numbers, and the contract
writes the Uniswap instructions itself with the destination fixed in code. There is no
field in which "send it elsewhere" can be expressed.

**The page has to make that legible to someone who has never heard of it.** The current
one does not, and that is the primary failure — not the styling.

---

## The verdict on the current UI, from the author

> "dari tampilannya aja aku ngga paham" — *I don't understand it from the display alone*
> "UI nya juga AI slop"

Both are correct. Diagnosed:

| Symptom | Cause |
|---|---|
| Doesn't explain what the product is | page opens with the number **416** before the reader knows what a mandate is |
| Everything reads as equally important | every block is a rounded card, same radius, same padding, same border |
| Nothing draws the eye | no element is allowed to be bold; the whole page is "safe" |
| Feels generic | uppercase grey headings + a green/red two-column split could sit on any project |
| Off-brand | the accent is teal; the logo is amber |

**Root cause, honestly:** the previous session loaded a design skill before writing the
architecture artifact (which has a real identity) and skipped it entirely for this app,
writing CSS straight into the component. It is a skipped process step, not a hard
limit — worth knowing so the redesign addresses the right thing.

---

## Design inputs

**Logo:** `web/public/logo.png` (1506×1044, transparent). A stylised **E** in warm white
with an amber arc sweeping through it, plus a four-point sparkle. Designed for dark
grounds.

**Brand colours, sampled from the logo pixels — not guessed:**

| | |
|---|---|
| `#F07000` | deep orange, most common |
| `#F08000` | |
| `#F09010` | |
| `#F0A010` | |
| `#F0C020` | gold, the highlight end |

The current palette (teal `#7dd3fc`, green `#4ade80`) is wrong and should go. Note the
neutrals should carry a slight warm bias to sit with amber — a pure grey next to amber
reads as unconsidered.

**Direction the previous session was about to take, offered as a starting point rather
than a constraint:** stop building a dashboard; make the mandate look like the
*instrument* it is. A mandate is a limited power of attorney — documents like that
enumerate what the bearer **may** do and what they **may not**, with a validity period
and a seal. That form is already familiar to people and happens to be exactly what this
product sells. The "permitted / withheld" split is the whole idea and is currently
buried three sections down.

---

## What must not break

The data layer is live and verified. **Do not touch these files unless the redesign
genuinely requires it:**

| File | What it does |
|---|---|
| `web/src/lib/graph.ts` | composes two Graph products; treats missing `data` as failure, never as an empty result |
| `web/src/lib/envoyage.ts` | chain reads; derives error selectors with `toFunctionSelector` — **never hard-code them**, four of six were wrong when they were written from memory |
| `web/src/lib/config.ts` | verified addresses |

Three behaviours worth preserving through any rewrite:

1. **Chain reads and Graph reads load independently.** A slow indexer must never blank
   the parts that come straight from Sepolia.
2. **A failed query surfaces as an error.** Rendering zeroes because a fetch failed is
   how a dashboard lies.
3. **ENS records are read back through the resolver**, not reused from the contract
   values shown elsewhere on the page. Showing contract state under an ENS heading
   would be a claim about ENS; resolving it is a demonstration. That distinction is
   load-bearing for the ENS prize.

---

## Running it

```bash
cd web
npm install
cp .env.example .env.local     # then fill VITE_GRAPH_GATEWAY_KEY
npm run dev                    # → localhost:5173
```

`.env.local` is gitignored. Without `VITE_GRAPH_GATEWAY_KEY` the page still renders;
only the mainnet scale figure disappears.

**Live data it will show** (all real, nothing is a fixture):

| | |
|---|---|
| Envoyage | `0x8466e82E02edF3F00c0387D5C3E66d407dc7259C` (verified) |
| Mandate | `#1`, 200 bps cap, 60s cooldown, ACTIVE |
| Position | `#38896`, approved to Envoyage — never to the keeper |
| ENS name | `38896.envoyage.eth` |
| Executions | 3, +1.834101957027488685 liquidity |
| Census | 416 unbounded delegations vs 1 scoped |
| Subgraph | `https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4` |

---

## Content the page needs to carry

Ordered by what a first-time reader needs, which is roughly the reverse of the current
order:

1. **What this is.** One sentence, before any number.
2. **The mandate itself** — what this keeper may do, and what it may not. This is the
   product. `maxFeeBps 200`, `minInterval 60s`, expiry, fee recipient pinned at grant,
   dies if the position is sold.
3. **Proof it works** — the keeper compounded three times, took capped fees, took zero
   liquidity.
4. **Anyone can verify it** — `38896.envoyage.eth` resolves the scope in any ENS
   client. The keeper can write `envoyage:lastRun` and gets
   `EACUnauthorizedAccountRoles` on anything else.
5. **Why it matters** — the census. 416 to 1. This lands *after* the reader knows what
   a mandate is, not before.
6. **Where the numbers come from** — two Graph products, composed. Required framing for
   The Graph prize.

---

## Priority warning

**The UI is not what blocks submission. The demo video is.**

All three sponsors require a 2–4 minute video. A decent UI plus a video qualifies; a
beautiful UI with no video does not. The script is written and verified against live
Sepolia at `docs/submission/DEMO-SCRIPT.md`.

If time gets short, record first and polish second.

Also outstanding, and it is the author's to do: the Uniswap Developer Feedback Form at
`developers.uniswap.org/hackathon-feedback`, linking to `FEEDBACK.md`. That is a
qualification requirement, not a judging criterion — without it the Uniswap submission
does not count.

## Deadlines (WIB)

| | |
|---|---|
| Check-in #2 | Fri 11 Sep, 10:59 |
| **Submission** | **Sun 13 Sep, 23:00** |
| Judging Round 2 (live) | Mon 14 / Tue 15 Sep |
