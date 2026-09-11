# Envoyage — interface review, and a brief for redesign

Written 11 Sep for a design session (Claude Desktop or otherwise). Self-contained:
you do not need the repo to read it. Reviewed with the `ui-ux-pro-max` database
(79 styles, 192 palettes, 119 UX guidelines) plus a direct read of the code.

---

## What Envoyage is, in one paragraph

An LP owns a Uniswap v4 position. They want a bot to compound its fees. Today the
only way is `approve(bot, position)` — which says *which* position the bot may touch
and nothing about *what it may do*, so an approved bot can withdraw the liquidity and
send it to itself. Envoyage replaces that with a **mandate**: the bot gets one
function, `compound(id, minFee)`, and the contract writes the Uniswap instructions
itself with the owner's address fixed in code. Fee cap, cooldown, expiry, revocable
any time. The mandate is published as an ENS name so anyone can read its terms, and
indexed by a subgraph so anyone can audit what the bot actually did.

It is **infrastructure** — a security primitive plus a reference keeper — not a
consumer app. Everything below follows from that.

## Where it is

Live on Sepolia, working end to end, unattended. A bot on a VPS takes its task list
from the subgraph, compounds on Uniswap, and writes its one permitted ENS record,
every ~2 minutes, on two live mandates. The web app has six routes — Home, Hire a
keeper, My mandates, Bot, Lookup, Proof — built overnight, 45 tests passing.

Deadline: submission **Sun 13 Sep 23:00 WIB**; video recorded Saturday. So this
review is scoped to what can land in a day.

---

## The verdict

**The app works. The interface has one structural problem and three concrete bugs.**

### The structural problem: the skin and the product disagree

The current design is "a paper legal instrument" — cream sheet, ruled lines, a wax
seal, articles struck through in amber. That direction was chosen when the page was a
**document you read**: one mandate, displayed, explained.

The page is now an **app you operate**: connect a wallet, pick a position, set terms,
sign three transactions, watch a list update, revoke. A legal-document skin on a
control panel is the mismatch you are feeling. It is not the font. The font is
downstream of it.

Two consequences worth naming:

- **The metaphor stops paying rent.** A seal that says IN FORCE is charming on a
  single displayed mandate. On a list of rows it is decoration, and on a form it is
  noise.
- **It fights the thing the product sells.** Envoyage's claim is *precision*: this
  bot may do exactly one thing, capped, timed, revocable. Hand-drawn paper connotes
  the opposite — informality, warmth, imprecision.

**Recommendation:** keep the instrument metaphor in exactly one place — the mandate
card / preview, where a document genuinely is the subject — and let the rest of the
app be a clean, dense, high-contrast control surface. The database's match for this
product type is *Minimalism & Swiss Style* ("enterprise apps, dashboards,
professional tools"), which is the right family.

### The font: your instinct is correct

**Averia Serif Libre is the wrong typeface for this product.** It is a deliberately
irregular, hand-drawn-feeling serif — its whole concept is averaging other fonts to
produce something soft and imperfect. For an instrument whose pitch is bounded,
enforced, auditable authority, that is a semantic contradiction. It also has no
tabular figures, and this interface is full of numbers that must line up
(liquidity, fee caps, block numbers, cooldowns).

The database's typography match for web3/DeFi/trustless products:

> **Space Grotesk / Inter** — *"web3, defi, digital gold, fintech, trustless,
> precision"*, with **JetBrains Mono** for figures.

That is a sans display + sans text + mono numeric stack. If you want to keep a serif
voice somewhere, put it on the mandate card only (where the document metaphor lives),
and never on numbers.

### Three concrete bugs

**1. Diagram labels overlap.** `FitDiagram.tsx` places every label at hand-authored
absolute coordinates in a 900×470 viewBox with no collision handling. Four labels in
the middle-right region sit on top of each other and on the arrows. Hand-placing
labels in a diagram with eight crossing edges cannot be tuned into correctness — the
fix is structural: fewer crossings (reorder the boxes so related nodes are adjacent),
labels in filled pills that occlude the line beneath them, or a real layout engine.
The diagram is also the single most valuable artifact for explaining the three
integrations, so it is worth rebuilding properly rather than nudging.

**2. Header chips are misaligned because they are different things.** The Sepolia chip
is a `<p>` with body font and a mono link inside; the wallet chip is an all-mono
`<span>` with a border. Two different constructs sitting side by side will never look
aligned. Make them one component with one shape, or separate them deliberately
(network status belongs near the nav; the connected account belongs at the far right,
visually distinct as the only interactive element there).

**3. Nav is six boxed buttons in a row.** Every item has equal weight and a box, so
nothing reads as primary and the row competes with the logo. Standard pattern: text
links with the active item marked by weight or a rule, not by a box on every item.

### What is genuinely good — keep these

- **The content order is right.** What it is → the mandate → proof it works → anyone
  can verify → why it matters → where the numbers come from. That was hard-won; do
  not let a restyle reorder it.
- **The permitted / withheld split** is the product's whole idea expressed as layout.
  Keep it as the visual centre of the mandate card.
- **Honest states.** Every failed read shows an error rather than a zero; pending is
  visibly pending; every contract revert is decoded into a sentence
  ("This wallet is not the mandate keeper — switch accounts") instead of "reverted".
  This is better than most production DeFi UIs and is worth showing off, not hiding.
- **The Proof tab.** Same attack calldata sent to two contracts: one drains a naive
  contract, the other mines a failed transaction. Two Etherscan links, opposite
  outcomes. No styling can improve on that; do not touch it.
- **Light and dark both work** and all 23 contrast pairs pass in both.

### The unsolved problem worth designing for

**The three integrations are legible as labels, not as a system.** Right now Uniswap,
The Graph and ENS appear as small tagged badges next to the thing they touch. A judge
scanning the page sees three logos, not a mechanism. The information exists; the
design does not yet carry it.

This is the highest-value design problem in the project. A first-time viewer should
be able to answer, without narration: *what does each of these three actually do
here, and what breaks if you remove it?*

| Sponsor | What it actually does | Currently shown as |
|---|---|---|
| **Uniswap v4** | the asset being protected; Envoyage makes two `modifyLiquidities` calls per compound with the owner's address as a constant | a badge on the mandate card |
| **The Graph** | the bot's task list ("which mandates name me, which is longest unserved") **and** the public audit trail of what it did | a badge above an execution count |
| **ENS v2** | the mandate's terms published as text records, readable in any ENS client with no Envoyage software; per-record access control means the bot can write exactly one key | a badge above a record table |

---

## Constraints any redesign must respect

**Do not touch `web/src/lib/`.** The data layer is verified against live Sepolia and
has survived three real RPC failures. Four behaviours are load-bearing, two of them
for prize qualification:

1. Chain reads and subgraph reads load independently — a dead indexer never blanks
   the parts that come from the chain, and vice versa.
2. A failed query surfaces as an error, never as rendered zeroes; a pending state is
   never rendered as an empty fact.
3. **ENS records are read back through the resolver**, not reused from contract state.
   Showing contract state under an ENS heading would be a claim about ENS; resolving
   it is a demonstration. Load-bearing for the ENS prize.
4. **The execution ledger renders from the subgraph**, with each row verified against
   its own transaction receipt. Load-bearing for The Graph prize.

Other constraints: English only; no horizontal overflow at 375px; light and dark by
`prefers-color-scheme` with no toggle; every text pair's contrast measured, not
assumed; `prefers-reduced-motion` honoured.

## Current tokens (for reference, not for preservation)

```
light                         dark
--desk       #f9fafb          #171717      page ground
--paper      #ffffff          #262626      card / sheet
--ink        #262626          #e5e5e5      body text
--ink-muted  #6b7280          #a3a3a3      secondary text
--rule       #e5e7eb          #404040      borders
--amber      #92400e          #fbbf24      accent TEXT (fill fails as text)
--amber-fill #f59e0b          #f59e0b      accent FILL only
```

The amber comes from the logo (a stylised **E** in warm white with an amber arc,
built for dark grounds) and should survive any redesign. `--amber-fill` (#f59e0b)
fails contrast as text on white — it is a fill only. That constraint is real and was
measured.

## The brief, if you want one sentence

> Redesign Envoyage's six screens as a precise, high-contrast control surface for a
> security primitive — keeping the document metaphor only on the mandate card,
> replacing the hand-drawn serif with a precision sans + mono numeric stack, fixing
> the diagram so it explains the three-way integration at a glance, and making
> Uniswap / The Graph / ENS read as parts of a working system rather than as badges.

Screens to cover: **Home** (what it is, the diagram, a live worked example, the
census), **Hire a keeper** (position → terms → three signatures with per-step state),
**My mandates** (live rows, waiting-for-the-bot, revoke), **Bot** (keeper-gated task
list), **Lookup** (ENS name → terms, beside subgraph status), **Proof** (the theft
demo — do not restyle).
