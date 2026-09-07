# Check-in #1

Due Mon 7 Sep 23:59 ET = **Tue 8 Sep 10:59 WIB**
Submit in the Hacker Dashboard **and** Discord `#project-check-ins`.

---

**Project name:** `Envoyage`
**Category:** `Security`
**Emoji:** 🔐

**GitHub:**
```
https://github.com/envoyage-protocol/envoyage
```

**Short description** (99 chars):
```
Hire a Uniswap v4 keeper without handing it your position. Scoped permission, not blanket approval.
```

---

**Solo or team:** Hacking Solo

**Skills:** Smart contracts / Solidity · Backend · Frontend · Security

**Have you decided on an idea:** Yes

**Prizes:** Uniswap · ENS · The Graph
**Technologies already built on:** Uniswap · ENS · The Graph

**How confident do you feel about submitting?**
Confident — deployed, working, and the UI is wired up. What's left is the video.

---

**What are you thinking of building?**
```
To let a bot compound your Uniswap v4 position today, you approve it — which says
which position it may touch, but nothing about what it may do. An approved keeper
can withdraw the liquidity and send it to itself, and nothing on chain objects.

Envoyage replaces that with a mandate: the keeper passes two numbers, and the
contract builds the Uniswap instructions itself with the destination fixed in code.
There's no field in which "send it elsewhere" can be expressed. The mandate also
carries a fee cap, a cooldown, an expiry, and dies if the position is sold.

Live on Sepolia: the contract, a keeper bot that compounds unattended, an ENSv2
subname per mandate so anyone can read its scope in any ENS client, and a subgraph
that both decides what the bot works on and counts the problem — it indexes every
approval ever granted on Uniswap v4's PositionManager, so "unbounded approvals are
the norm" stops being a claim and becomes a number.
```

**Is there anything blocking you?**
```
Nothing is blocking the build — everything is deployed and working on Sepolia, and
the UI now reads my subgraph and the ENS records rather than only the chain. Three
things I'd genuinely value help with:

1. Which Graph track should I aim at? My subgraph is load-bearing for automation —
   it decides which mandates the keeper serves and in what order — which sounds like
   the AI track. But the UI also composes it with Uniswap's own v4 subgraph through
   the Gateway, because neither answers the question alone: Uniswap's knows how many
   positions exist and has no notion of a permission scope, mine knows exactly what
   each keeper may do. That sounds like Composable. I'd rather be told which is the
   stronger fit than split the difference and be weak at both.

2. Is the Uniswap prize worth one of my three partner slots? I'm net-new, so I read
   the Continuity track as closed to me, which leaves the smaller one. ENS and The
   Graph are clearly worth a slot each; I'm unsure the third is best spent there.

3. Judging Round 2 is live, and I'm solo in Indonesia (UTC+7). Depending on the hour
   it lands somewhere between 8pm and 1am for me. If there's any flexibility on slot
   times, I'd appreciate knowing early so I can plan around it rather than discover
   it on the day.
```

**Anything else you think we should know?**
```
Five commits predate the 4 Sep opening — all toolchain setup and planning docs, no
protocol code. Entering on Start Fresh. AI usage is documented in AI-USAGE.md,
including the things AI got wrong and how they were caught.
```
