# How the pieces fit — the one-screen version

For the feedback session and the video. Say it in this order; every arrow below is a
real call that happens on Sepolia today.

```
                        grants a MANDATE                 (2)
   ┌──────────┐  approve(position) + grant(terms)   ┌──────────────┐
   │  OWNER   │ ───────────────────────────────────▶ │   ENVOYAGE   │
   │ position │                                      │  (contract)  │
   │  #38896  │ ◀─── revoke() any time ───────────── │              │
   └──────────┘                                      └──────┬───────┘
         │                                                  │
         │ owns                              compound(id) = │ two Uniswap calls,
         ▼                                   destination    │ written by ENVOYAGE,
   ┌──────────────────┐     harvest fees ─────────────────── │ never by the bot
   │   UNISWAP v4     │ ◀──────────────────────────────────── ┘
   │ PositionManager  │     reinvest fees
   └──────────────────┘
         │ emits Approval / MandateExecuted
         ▼
   ┌──────────────────┐   "which mandates name me,       ┌──────────┐
   │   THE GRAPH      │    which is longest unserved?"    │   BOT    │
   │ envoyage subgraph│ ◀──────────────────────────────── │ (keeper) │
   │ + mainnet census │ ───── task list ────────────────▶ │          │
   └──────────────────┘                                   └────┬─────┘
                                                                │ compound(1, minFee)
                                                                │ — the ONLY call it has
                                                                ▼
   ┌──────────────────┐   writes exactly one key:        ┌──────────────┐
   │      ENS v2      │ ◀─ envoyage:lastRun ──────────── │   ENVOYAGE   │
   │ 38896.envoyage.eth│   anything else reverts          └──────────────┘
   │ scope as records │   EACUnauthorizedAccountRoles
   └────────┬─────────┘
            │ resolves in any ENS client, no app needed
            ▼
      ANYONE can read what this bot may do — and after revoke, what it once could.
```

## The three sentences

**Uniswap** is the thing being protected. Envoyage holds the position's approval and
is the only caller of `PositionManager.modifyLiquidities` — two calls per compound,
`DECREASE_LIQUIDITY + TAKE_PAIR` then `INCREASE_LIQUIDITY + SETTLE_PAIR`, with the
owner's address as a constant. The bot never assembles a v4 action.

**The Graph** is how the bot knows what to do and how anyone knows what it did. The
keeper's task list comes from our subgraph — delete it and the bot idles. The same
subgraph, pointed at mainnet, counts 1,440+ positions whose owners handed a bot
unbounded authority; zero have a scoped alternative.

**ENS** is how the mandate is legible without our software. Every mandate is a
subname whose text records are the scope. ENSv2 access control gives the bot write
rights to one key only — `envoyage:lastRun` — so the bot can report but cannot
rewrite its own limits. After revoke, the records stay: the history of what was
permitted does not vanish with the permission.

## Where each shows in the demo (#/demo)

| Beat | Press | You see |
|---|---|---|
| Old way | *Bot: withdraw everything to itself* | position 39022 drained — **Uniswap** action list, an ordinary approval |
| Mandate | *Bot: compound now* | liquidity rises; **The Graph** panel polls until the new execution is indexed; **ENS** `lastRun` updates |
| Mandate | *Bot: send the same theft to Envoyage* | mined, failed tx — no function to receive it |
| Revoke | *Owner: revoke* → *Bot: try again* | refusal with reason; **ENS** records still resolve |

## What is honestly not in the UI

- **Granting a mandate** is done by script (`03_GrantMandate`, `07_PublishMandate`),
  not by a screen. The demo starts with mandate #1 already granted. Say so if asked.
- **The bot's subgraph query** happens in the keeper process; the UI shows its result,
  not the query. `keeper/src/graph.ts` is the file to point at.
