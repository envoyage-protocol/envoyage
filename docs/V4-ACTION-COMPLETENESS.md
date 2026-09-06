# Uniswap v4 action completeness table

Traced directly against the source, not against action names or documentation.
Every row cites a file and a line number. Anything that could not be traced is
marked `UNVERIFIED` rather than guessed.

**Source:** `lib/v4-periphery` @ `dce236d`
`src/libraries/Actions.sol` · `src/PositionManager.sol` · `src/base/DeltaResolver.sol` · `src/base/BaseActionsRouter.sol`

---

## Why this table exists

Envoyage's claim is that misuse **cannot be expressed**. That claim only means
something if we can show we checked the **whole** action language, not the parts we
happened to remember.

The table answers one question per action: **where does the recipient address come
from?** If it is a parameter supplied by the caller, that action can move tokens
anywhere. If it is a derived value, it cannot.

---

## Finding 1 — `Actions.sol` declares 26 actions. PositionManager dispatches only 15.

`_handleAction` (`PositionManager.sol:196–286`) is an if/else chain. Anything that
does not match falls through to `revert UnsupportedAction(action)` at **line 285**.

**Eleven actions that are declared but CANNOT be executed through PositionManager:**

| Opcode | Action | Lives where |
|---|---|---|
| `0x06` | `SWAP_EXACT_IN_SINGLE` | `V4Router` (Universal Router) |
| `0x07` | `SWAP_EXACT_IN` | `V4Router` |
| `0x08` | `SWAP_EXACT_OUT_SINGLE` | `V4Router` |
| `0x09` | `SWAP_EXACT_OUT` | `V4Router` |
| `0x0a` | `DONATE` | not dispatched |
| `0x0c` | `SETTLE_ALL` | `V4Router` |
| `0x0f` | `TAKE_ALL` | `V4Router` |
| `0x10` | `TAKE_PORTION` | `V4Router` |
| `0x19` | `UNWIND_WITH_FALLBACK` | not dispatched |
| `0x1a` | `SUBSCRIBE` | a standalone function, not an action |
| `0x1b` | `UNSUBSCRIBE` | a standalone function, not an action |

Note: `0x17` and `0x18` are not allocated at all in `Actions.sol`.

**Consequence for Envoyage.** Our original plan was "harvest fees → **swap to the
correct ratio** → add liquidity" inside a single plan. That cannot be built: the swap
is not dispatched. Doing it would require two sequential `unlock` calls through the
UniversalRouter.

We removed the swap leg entirely. Not because we ran out of time — because without a
swap, `compound` **has no price**, so there is no value that can leak out through
one. Verified as a test: `test_spike_positionManagerRejectsSwapAction`.

---

## Finding 2 — four actions take the recipient from the caller

This is the real surface. `_mapRecipient` (`BaseActionsRouter.sol`) translates two
magic addresses and passes everything else through untouched:

```solidity
if (recipient == ActionConstants.MSG_SENDER)  return msgSender();        // address(1)
else if (recipient == ActionConstants.ADDRESS_THIS) return address(this); // address(2)
else return recipient;                                                    // <- anything
```

⚠️ **Trap:** `ADDRESS_THIS` means **the PositionManager**, not your contract. To land
tokens in your own contract, pass its address literally.

| Opcode | Action | Recipient from | Line | Can leave the owner's control? |
|---|---|---|---|---|
| `0x11` | `TAKE_PAIR` | **caller parameter** | `PositionManager.sol:253` | **YES** |
| `0x0e` | `TAKE` | **caller parameter** | `:261` | **YES** |
| `0x14` | `SWEEP` | **caller parameter** | `:273` | **YES** |
| `0x02` | `MINT_POSITION` | **caller parameter** (`owner`) | `:224` | **YES** — a new position can be minted in anyone's name |
| `0x05` | `MINT_POSITION_FROM_DELTAS` | **caller parameter** (`owner`) | `:237` | **YES** |

Those first four are what make `approve(keeper, tokenId)` equivalent to handing over
the position: the keeper simply assembles `DECREASE_LIQUIDITY` +
`TAKE_PAIR(…, their own wallet)`.

---

## Finding 3 — everything else uses derived values, not parameters

| Opcode | Action | Address source | Line |
|---|---|---|---|
| `0x0d` | `SETTLE_PAIR` | `msgSender()` as payer | `:458` |
| `0x12` | `CLOSE_CURRENCY` | `msgSender()`, both directions | `:474`, `:477`, `:479` |
| `0x13` | `CLEAR_OR_TAKE` | `msgSender()` | `:494` |
| `0x0b` | `SETTLE` | `_mapPayer(payerIsUser)` — a boolean, not an address | `:257` |
| `0x00` | `INCREASE_LIQUIDITY` | none; the delta is settled by another action | `:197` |
| `0x01` | `DECREASE_LIQUIDITY` | none; the credit is taken by another action | `:208` |
| `0x03` | `BURN_POSITION` | none; same | `:239` |
| `0x04` | `INCREASE_LIQUIDITY_FROM_DELTAS` | none | `:202` |
| `0x15` | `WRAP` | none | `:275` |
| `0x16` | `UNWRAP` | none | `:279` |

`_mapPayer` only ever chooses between `msgSender()` and `address(this)` — the caller
cannot inject a third-party address.

---

## Finding 4 — Uniswap deprecated two of its own actions over sandwiching

`Actions.sol:14–24`, Uniswap's own comment, verbatim:

> `/// @notice DEPRECATED: Vulnerable to sandwich attacks - do not use.`
> `/// @dev The delta-based approach lacks minimum liquidity slippage protection,`
> `/// allowing attackers to manipulate the price and reduce the liquidity received.`
> `/// Use INCREASE_LIQUIDITY instead.`

This applies to `INCREASE_LIQUIDITY_FROM_DELTAS` (`0x04`) and
`MINT_POSITION_FROM_DELTAS` (`0x05`).

It is independent corroboration of our design decision, and it comes from Uniswap
rather than from us: a path with no slippage bound can be sandwiched. We took the
same lesson one step further — `compound` performs no swap at all. **Envoyage never
uses a FROM_DELTAS variant.**

---

## Finding 5 — the ERC-721 approval is checked, but only for POSSESSION of the position

`onlyIfApproved(msgSender(), tokenId)` guards `INCREASE_LIQUIDITY`,
`DECREASE_LIQUIDITY` and `BURN_POSITION` (`:295`, `:311`, `:343`, `:420`).

That check answers *"may you touch this position?"* — **not** *"may you do this
particular thing to this position?"*. Once it passes, any action from the Finding 2
table can be chained into the same plan.

**This is the gap Envoyage fills.** We found it empirically: the first spike attempt
failed with `NotApproved`, which proved the approval has to live somewhere. The
question is not *whether* someone holds it, but **who**.

---

## How Envoyage uses this table

`compound` assembles exactly four actions. Not one of them takes a recipient from the
keeper:

| Step | Action | Recipient |
|---|---|---|
| 1 | `DECREASE_LIQUIDITY(tokenId, 0, …)` | — (harvests fees; v4 has no "collect" action) |
| 2 | `TAKE_PAIR` | `address(this)` **literal** — not `ADDRESS_THIS` |
| 3 | `INCREASE_LIQUIDITY` | — |
| 4 | `SETTLE_PAIR` | `msgSender()` = Envoyage; pays via Permit2 |

Then, outside the v4 actions: the capped fee goes to the `feeRecipient` pinned at
grant time, dust goes to `ownerOf(tokenId)`, and Envoyage's balance is asserted to be
zero.

The keeper has no parameter with which to touch any of this. Not because a check
rejects it — **no function accepts it**.

---

## Limits of this trace

- Traced for `PositionManager`. `V4Router` (which dispatches the swap actions and
  `TAKE_PORTION`) was **not** traced line by line — out of scope, because Envoyage
  never calls it.
- `UNWIND_WITH_FALLBACK` (`0x19`) and `DONATE` (`0x0a`): confirmed not dispatched by
  `PositionManager`; where else they may be executed is `UNVERIFIED`.
- `SUBSCRIBE`/`UNSUBSCRIBE` exist as standalone functions on PositionManager rather
  than through `_handleAction`. Subscriber behaviour is `UNVERIFIED`.
