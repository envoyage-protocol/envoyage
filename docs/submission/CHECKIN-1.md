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
Confident — it's deployed and working on Sepolia. What's left is the UI and the video.

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
that decides what the bot works on.
```

**Is there anything blocking you?**
```
Nothing external — it's all deployed and working.

The honest gap is my web UI: it reads the chain directly and shows neither the
subgraph nor the ENS name, so two of my three integrations are invisible on screen.
That's my next block of work.

One question for a Graph mentor: my subgraph is load-bearing for automation — it
decides which mandates the bot serves and in what order — but it's a single product,
so I don't think it counts as "composable". Which track should I be aiming at?
```

**Anything else you think we should know?**
```
Five commits predate the 4 Sep opening — all toolchain setup and planning docs, no
protocol code. Entering on Start Fresh. AI usage is documented in AI-USAGE.md,
including the things AI got wrong and how they were caught.
```
