# Threat Model

> Technical judges will look for the limits of these claims. Stating them ourselves
> is stronger than having them found.

## The claim

Envoyage reduces attack surface. It is **not** absolute security — Envoyage is itself
a contract and can carry bugs. The difference is that Envoyage accepts no
instructions, so the entire class of "instruction validation was insufficient" bugs
does not apply to it.

## LOCKED DECISION: IMMUTABLE

Decided 3 Sept 2026, before the first line of code. **Not reopened.**

Envoyage has no proxy, no admin, and cannot be upgraded. This is not a security
compromise made for speed — it is both safer **and** faster to build (no storage
gaps, no initializer, no upgrade tests).

If a bug is found: deploy a new address, and owners `revoke` and re-`approve`. For a
v0 on Sepolia that is the correct cost.

## Preconditions that MUST hold

The owner approves the position to Envoyage, so Envoyage holds precisely the kind of
unbounded approval that was the root of the Aperture and Revert exploits. "Accepts no
instructions" is a statement about **the bytecode that runs**, not about the address.

- [x] No proxy, no `owner`/`admin`, no upgrade function
- [x] No `delegatecall`, no `selfdestruct`
- [x] PositionManager / Permit2 / adapter set `immutable` in the constructor
- [x] No function accepts an `address target` or `bytes calldata`
- [ ] Adapter registry cannot be extended post-deploy

If any of these fails to hold, the core claim must be **withdrawn**, not softened.

**The tests that prove it** (to land in `test/unit/Immutability.t.sol`):
- assert the deployed bytecode contains neither `DELEGATECALL` (0xf4) nor `SELFDESTRUCT` (0xff)
- assert no function selector accepts `bytes` or an `address target`
- assert the POSM / Permit2 addresses are identical before and after any call sequence

Partially covered today by `test/replay/ExploitReplay.t.sol`, which probes the four
arbitrary-call shapes used in the real incidents (`execute(address,bytes)`,
`multicall(bytes[])`, `aggregate(address[],bytes[])`, `onERC721Received`) and asserts
every one of them misses.

## Table

| Threat | Status |
|---|---|
| Keeper steals via a v4 action | Protected — cannot be expressed |
| Keeper redirects funds to another address | Protected — recipient is a constant |
| Keeper touches a different position | Protected — a mandate locks one tokenId |
| Mandate survives the sale of the position | Protected — `ownerOf == grantor` |
| Keeper calls too frequently | Protected — `minInterval` |
| Keeper is a contract (reentrancy) | Mitigated — `nonReentrant`, fee paid last |
| Token returns false instead of reverting | Protected — checked in `_transfer` |
| **Keeper simply does nothing** | **NO** — a mandate grants permission, not obligation |
| **Selective griefing via `minFee`** | **NO** — `minFee` is the keeper's own abort switch |
| **A bug in Envoyage itself** | **NO** — surface reduction, not absolute |
| Owner acting maliciously toward the keeper | Out of scope for v0 |

## Custody note

Fees land in Envoyage so they can be measured before being split. The claim is
therefore **non-custodial between transactions** — a balance exists only inside a
single transaction and is zero between them. Enforced today by the `ResidualBalance`
check at the end of `compound()`; the invariant suite must additionally assert that
Envoyage's balance is 0 at the end of every transaction.
