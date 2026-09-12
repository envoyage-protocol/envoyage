# Envoyage — demo video script

**Target 3:30, hard ceiling 4:00.** 720p or better, the author's own spoken
narration, no speed-up — all four are submission requirements.

Every figure below was read from Sepolia and the subgraphs on 12 Sep 2026 and
keeps moving, because the bot is running. **Re-read them before recording** and
say what the screen says. Never narrate a number the viewer cannot see.

The spine is **proof first**: the theft, then the mandate that refuses it, then
the machine behind it. Do not open with architecture — open with the attack.

---

## Before you hit record

| | |
|---|---|
| Route | Start on `#/` — that IS the Proof tab now |
| Wallet | Connected as the **keeper** `0xd643…6C5B`. The story is "the bot does this", so the wallet must be the bot |
| Second wallet | Have the owner `0x3111…a4BA` ready to switch to for act 3 and Hire |
| Victim position | `#39022` — check it still has liquidity; each theft press takes 1e18 |
| Mandate No. 2 | Must be **ACTIVE**. Act 3 revokes it, live, once. Do not rehearse the revoke |
| Windows | Browser at 1280 wide. A second tab on Sepolia Etherscan, ready |

One rehearsal of everything **except** the revoke. The revoke only works once.

---

## 0:00–0:20 — The problem, in one sentence

**On screen:** `#/` top of the Proof tab.

> "You own a Uniswap v4 position. You want a bot to compound its fees for you.
> The only way to allow that today is `approve(bot, position)` — and that says
> *which* position the bot may touch. It says nothing about *what it may do*."

Pause. Let them read the headline.

---

## 0:20–1:05 — Act 1: the theft, on a live testnet

**On screen:** Act 1. Position `#39022`, approved to NaiveUtils.

> "Here is a bot with an ordinary approval. First press: it does its job — it
> harvests, and it delivers the value to me, the owner. This is what I approved
> it for, and it is fine."

**Press "Bot: deliver to the owner".** Wait for the outcome. Open the Etherscan
link.

> "Now the same bot sends the same instruction. One field is different: the
> recipient is the bot itself."

**Press "Bot: withdraw everything to itself".** Wait. Open the second link.

> "The position is drained. Nothing on chain objected, because nothing on chain
> could. The approval never had a way to say 'only compound'. This is the shape
> of the attack that took roughly seventeen million dollars from Aperture
> Finance."

**This is the most important 45 seconds of the video.** Do not rush it. Two
Etherscan links, same contract, same caller, opposite outcomes.

---

## 1:05–1:40 — Act 2: the same attack, refused

**On screen:** Act 2. Position `#39152` carries mandate No. 2.

> "Same bot. Same key. This position has a mandate instead of an approval."

**Press "Bot: compound now"** on the left.

> "On the left, it compounds — that is the one call it has."

> ### ⚠ You will probably lose this race, and it is not a bug
>
> The keeper on the VPS polls every 30 seconds and mandate No. 2's cooldown is 60
> seconds, so the real bot almost always compounds before a human can press the
> button. The pre-flight says "the compound would land", you press, and the screen
> answers **"Cooldown active: the mandate's minimum interval since the last call
> has not elapsed."** That happened on every capture run.
>
> Two ways through, both fine:
>
> 1. **Stop the keeper for the take.** On the VPS: `pm2 stop envoyage-keeper`,
>    record, then `pm2 start envoyage-keeper`. The press then lands. Set a
>    reminder to start it again — a stopped keeper means the My mandates screen
>    stops moving, which is the other thing the video needs.
> 2. **Keep it and narrate it.** It is an unplanned demonstration of the rate
>    limit being enforced by the contract against the bot's own operator:
>    *"…and it refuses me, because the mandate says once every sixty seconds and
>    the keeper already ran. I cannot override that from here — nobody can."*
>
> Option 2 is the stronger story if you are comfortable improvising. Option 1 is
> the safer one if you want the compound to visibly succeed on camera.

**Press "Bot: send the same theft to Envoyage"** on the right.

> "On the right I take the calldata from act one — byte for byte, the same
> bytes — and send it to Envoyage. It mines a failed transaction. Not a
> permission check that said no: there is no function on Envoyage that accepts
> an instruction list at all. The bot passes two numbers and Envoyage writes the
> Uniswap calls itself, with my address fixed in the code."

---

## 1:40–2:05 — Act 3: the owner ends it

**Switch to the owner wallet** `0x3111…a4BA`.

> "And I can end it, with no notice and no unwinding."

**Press "Owner: revoke this mandate".** Then, as the bot:

> "The bot's next attempt is refused, and it is told why."

**Press "Bot: try to compound again".**

> "But the ENS name still resolves. The record of what this bot was permitted to
> do does not disappear the moment it stops being permitted."

---

## 2:05–2:35 — What a mandate actually is

**On screen:** `#/how`, the "An approval, and a mandate" comparison.

> "An approval says: this contract may move position 38896. A mandate says: this
> keeper may call compound on 38896, keep at most two percent of what it
> harvests, once per cooldown, until it expires. Same four capabilities on both
> sides — three of them struck out on the right. That is the whole product."

---

## 2:35–3:00 — Three registries, one mechanism

**On screen:** scroll to the three cards and the diagram.

> "Uniswap v4 is what is protected — Envoyage assembles the harvest and reinvest
> actions itself. ENS is where the terms live: every term is a text record, so
> any wallet or rival frontend can read the scope without trusting my page. The
> Graph is where the proof lives — and it is also the bot's work queue. Delete
> the subgraph and the bot has nothing to do."

Point at the "without it:" line on each card. The diagram's edge colours match
the cards.

---

## 3:00–3:20 — Hiring one, and watching it run

**On screen:** `#/hire` → the confirm sheet.

> "Hiring is three transactions, and the sheet names all three before your wallet
> opens once. Approve the position to Envoyage — the contract, never the bot.
> Grant the mandate. Publish the terms to ENS."

**On screen:** `#/mandates`.

> "This mandate I granted earlier today. Nobody touched it since — the keeper on
> my server picked it up from the subgraph and has been compounding it ever
> since."

---

## 3:20–3:40 — Why it matters, and close

**On screen:** `#/how`, the census.

> "One census handler, two networks. On Ethereum mainnet there are **7,897**
> unbounded delegations live right now on Uniswap v4 positions, held by 521
> distinct addresses. Scoped ones: **zero** — because until this, there was no
> scoped alternative to hold."

> "Envoyage is a security primitive and a reference keeper. The contract is
> immutable, verified, and has no admin. Everything you just saw is on Sepolia
> now."

End on the Proof tab or the contract on Etherscan.

---

## Figures to re-read before recording

Run this, then say what it prints:

```bash
curl -s -X POST https://api.studio.thegraph.com/query/62788/envoyage-census-mainnet/v0.0.1 \
  -H 'content-type: application/json' \
  -d '{"query":"{ censuses{ activeBlanketApprovals activeUnscopedApprovals activeScopedApprovals distinctDelegates } }"}'
```

As of 12 Sep 2026: mainnet **1,278** `setApprovalForAll` + **6,619** single =
**7,897** unbounded, **521** delegates, **0** scoped. Sepolia: 422 unbounded,
3 scoped. Mandates No. 1 / 2 / 3 at 127 / 123 / 1 executions.

## Things not to say

- Do not say "audited" — it is not.
- Do not say a number the screen does not show, and do not round one that it does.
- Do not call it a product or a platform. It is infrastructure: a primitive plus
  a reference keeper.
- Do not promise mainnet. It is on Sepolia.
