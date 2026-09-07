# Demo video — shot list

**Target 3:00, hard ceiling 4:00.** Required by all three sponsors.

Two windows only: a terminal (large font, dark) and a browser. No slides, no
face-cam, no music. Every number on screen is read live — nothing is a fixture, and
that is the point.

**Record the terminal beats first.** They are the ones that can fail on the day.

---

## Before recording

```bash
cd envoyage
forge test                                   # confirm 38 green
cd web && npm run dev                        # leave running on :5173
```

Have open: the app, and [`sepolia.etherscan.io/address/0x8466e82E02edF3F00c0387D5C3E66d407dc7259C#code`](https://sepolia.etherscan.io/address/0x8466e82E02edF3F00c0387D5C3E66d407dc7259C#code).

---

## 0:00 – 0:30 · The number

**Screen:** the app, census panel filling the frame.

> "Four hundred and sixteen wallets on Uniswap v4 have handed some contract
> unbounded authority over their positions. One has handed it bounded authority.
> That one is mine."

Let `133 · 283 · 1` sit on screen for a beat.

> "These aren't estimates. My subgraph indexed every approval Uniswap's
> PositionManager has ever emitted — 722 events, which matches Etherscan's own count
> exactly."

**Why this opening:** it is a fact about other people, not a claim about my project.

---

## 0:30 – 1:00 · Why the number looks like that

**Screen:** scroll to the comparison panel.

> "To let a bot compound your position you call `approve`. That says *which* position
> it may touch. It says nothing about *what* it may do."

**Screen:** `docs/V4-ACTION-COMPLETENESS.md`, the Finding 2 table.

> "I traced all 26 Uniswap v4 actions to file and line. Four of them take the
> recipient address straight from whoever writes the instructions. So an approved
> keeper can withdraw your liquidity and send it to itself, and nothing on chain
> objects."

---

## 1:00 – 1:40 · The keeper does its job

**Screen:** terminal.

```bash
cd keeper && npm run once
```

> "This bot has a mandate over a position it doesn't own. Notice where it gets its
> work: it asks The Graph which mandates name it and which has gone longest without
> service. Delete the subgraph and it has nothing to do."

**Point at:** `subgraph: 1 actionable mandate(s)` → `success in block …`

**Screen:** back to the app, liquidity figure.

> "Liquidity went up. The keeper took its capped fee — two percent of the fees it
> harvested, never of the position — and reinvested the rest."

---

## 1:40 – 2:20 · The keeper tries to steal

**Screen:** terminal.

```bash
forge test --match-path 'test/replay/*' -vv
```

> "Now the same attack that drained Aperture Finance. I built a deliberately
> vulnerable contract next to mine, because showing that I simply lack the
> vulnerable function proves nothing."

**Point at, on screen:**
```
H-04 vs NaiveUtils -- token0 stolen: 4757902903361556095
keeper received (capped at 2%):      1200000000000000
```

> "Identical attack. Four point seven tokens out of the naive contract. Against
> Envoyage it can't even be encoded — there's no field to put a destination in."

---

## 2:20 – 2:50 · Anyone can read the terms

**Screen:** terminal.

```bash
cast call $RESOLVER 'text(bytes32,string)(string)' $NODE 'envoyage:maxFeeBps' --rpc-url $SEPOLIA_RPC_URL
```

> "Every mandate is also an ENS name. `38896.envoyage.eth`. Anyone resolves it in any
> ENS client and reads the exact scope — without visiting my app or trusting my
> frontend."

**Then, the sharp beat — run both:**

```bash
# the one key the keeper may write
cast send $RESOLVER 'setText(bytes32,string,string)' $NODE 'envoyage:lastRun' '11655313' --private-key $KEEPER_PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL

# the keeper raising its own fee cap
cast send $RESOLVER 'setText(bytes32,string,string)' $NODE 'envoyage:maxFeeBps' '10000' --private-key $KEEPER_PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL
```

**On screen:** first succeeds. Second: `EACUnauthorizedAccountRoles`.

> "The keeper can report what it did. It cannot rewrite what it's allowed to do.
> Same division the contract enforces, on a completely different substrate."

---

## 2:50 – 3:10 · Revoke

**Screen:** terminal.

```bash
cast send $ENVOYAGE 'revoke(uint256)' 1 --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL
cd keeper && npm run once
```

> "The owner revokes. Immediately, no notice period."

**On screen:** `subgraph reports no actionable mandates`

> "The keeper has nothing to do, because the indexer already knows the mandate is
> gone."

**⚠️ Re-grant afterwards** so the live demo keeps working:
```bash
forge script script/03_GrantMandate.s.sol --rpc-url sepolia --broadcast
MANDATE_ID=2 forge script script/07_PublishMandate.s.sol --rpc-url sepolia --broadcast
```

---

## 3:10 – 3:30 · Close

**Screen:** the census panel again.

> "Four hundred and sixteen to one. Envoyage doesn't ask keepers to behave — it
> removes the field where misbehaviour would be written. Everything here is live on
> Sepolia, verified, and the code is open."

---

## Line to avoid

Don't say "secure" or "trustless". The threat model is explicit that this is attack
**surface reduction**, not absolute security, and a judge who checks will find that
page. Claiming more than the repo claims is the fastest way to lose credibility with
exactly the audience that matters.

## Checklist

- [ ] Terminal font ≥ 18pt; window ≥ 1280 wide
- [ ] `.env` never visible on screen — check before recording, private keys are in it
- [ ] Under 4:00
- [ ] Uploaded and linked in the ETHGlobal submission
- [ ] Mandate re-granted after the revoke beat
