# Feedback — Uniswap stack

Submitted to https://developers.uniswap.org/hackathon-feedback

**What we built.** [Envoyage](https://github.com/envoyage-protocol/envoyage) — a
scoped-permission instrument for Uniswap v4 positions. A keeper never writes v4
instructions; it calls a typed entrypoint with two numbers and the contract assembles
the action array itself. Contract:
[`src/Envoyage.sol`](src/Envoyage.sol), live at
[`0x8466e82E02edF3F00c0387D5C3E66d407dc7259C`](https://sepolia.etherscan.io/address/0x8466e82E02edF3F00c0387D5C3E66d407dc7259C#code).

**Parts of the stack used.** `PositionManager`, `PoolManager`, Permit2, `StateLibrary`,
`LiquidityAmounts`, `TickMath`, `PositionInfoLibrary`, `Actions`, and the
`v4-periphery` Foundry test harness (`PosmTestSetup`, `Planner`, `PositionConfig`).

These notes were written while we were still confused, not tidied up afterwards. The
confusions are the useful part.

---

## What worked well

**The action-array design is genuinely composable.** Being able to assemble
`DECREASE_LIQUIDITY` + `TAKE_PAIR` and have the periphery settle deltas for us is
what made this project possible at all. We wrote a contract that manages someone
else's position without ever holding it, and the v4 primitives did not fight us.

**`StateLibrary` + `LiquidityAmounts` is a clean pairing.** Reading `slot0` and sizing
a liquidity delta from two token amounts was three lines and worked first time —
notable, because it was the only part of the flow that did.

**The test harness is excellent and under-advertised.** `PosmTestSetup` gave us a real
PoolManager, a real PositionManager, Permit2 and a funded pool in one call. We ran an
integration spike against real periphery *before* writing any protocol code, and it
paid for itself immediately (see the `NotApproved` finding below). We would not have
found that against mocks.

---

## What confused us

### 1. `Actions.sol` declares 26 actions; `PositionManager` dispatches 15

We planned "harvest fees → swap to the correct ratio → add liquidity" as a single
plan, because the swap opcodes are right there in the enum. They are not dispatched
by `PositionManager._handleAction`; everything unmatched falls through to
`revert UnsupportedAction`. Swap actions live in `V4Router`.

Nothing in `Actions.sol` indicates which router dispatches which opcode. We only
established it by reading the whole if/else chain and diffing against the enum. We
wrote that trace up as
[`docs/V4-ACTION-COMPLETENESS.md`](docs/V4-ACTION-COMPLETENESS.md) — 26 actions to
file and line — because we could not find it anywhere in the docs.

**Suggestion:** a comment on each constant naming its dispatcher, or a table in the
docs. Two lines of NatSpec per opcode would have saved us most of a day.

### 2. `ActionConstants.ADDRESS_THIS` means the PositionManager, not your contract

This is the single sharpest footgun we hit. We wanted harvested fees to land in *our*
contract, `ADDRESS_THIS` read exactly like the way to say that, and it would have sent
every harvested fee to the periphery instead. The fix is to pass `address(this)` as a
literal.

It is not that the behaviour is wrong — it is that the name reads as "this contract"
from the perspective of the caller writing the plan, while it means "this contract"
from the perspective of the code executing it.

**Suggestion:** rename to `ADDRESS_ROUTER` / `ADDRESS_POSITION_MANAGER`, or at minimum
a NatSpec warning on the constant. We think most integrators will read it the way we
did.

### 3. There is no `collect` action

Harvesting fees is `DECREASE_LIQUIDITY` with `liquidity = 0`. This is elegant once you
know it and completely non-obvious beforehand — we went looking for `COLLECT` in the
enum, did not find it, and assumed fee collection was not supported through the
PositionManager at all.

**Suggestion:** one line in the `DECREASE_LIQUIDITY` NatSpec: "pass 0 to collect fees
without modifying liquidity."

### 4. `INCREASE_LIQUIDITY` requires ERC-721 approval, and the revert does not say so

Our spike failed with `NotApproved(0x9A63...)` and it took a while to work out that
`onlyIfApproved` guards the liquidity actions, i.e. that a contract acting on a
position needs an ERC-721 approval even though it is not moving the token.

This turned out to be the most important thing we learned — it is *why* Envoyage
exists, since it means the authority has to live somewhere and the only question is
who holds it. But we learned it from a revert, not from documentation.

### 5. Permit2 is required when the payer is a contract, and this only fails on a real network

`_pay` routes through `permit2.transferFrom` whenever `payer != address(this)`. If
your contract is the payer, you need **two** approvals: token → Permit2, then Permit2
→ PositionManager. Miss either and everything passes against mocks and fails on the
first real call. See [`src/Envoyage.sol`](src/Envoyage.sol) `_approvePermit2`.

**Suggestion:** a "contract integrators" section in the docs stating the two-hop
requirement explicitly. The existing Permit2 docs are written for EOAs signing
permits, which is a different problem.

### 6. `getLiquidityForAmounts` returning 0 makes `INCREASE_LIQUIDITY` a *succeeding* no-op

With small fee amounts the computed delta rounds to zero, `INCREASE_LIQUIDITY`
succeeds, the event fires, and nothing happens. We nearly shipped a demo that looked
alive and did nothing. We now `revert ZeroLiquidityDelta()` explicitly.

**Suggestion:** this is the kind of silent success that costs people real money in
production. Either revert on a zero delta or document the case loudly.

---

## What was missing

**`compilation_restrictions` is load-bearing and undocumented.** Building against
`v4-periphery` fails with Yul `stack-too-deep` (`Variable memPtr_1 is 1 too deep`)
unless you mirror the repository's own per-path compiler settings. We found this by
reading `v4-periphery/foundry.toml`, not from any guide. And once you do mirror it,
forcing artifacts for `vm.getCode` needs the forcing imports split into separate
files, because `PositionManager` (500 runs) and `PositionDescriptor` (1 run) cannot
share a compilation unit — otherwise you get
`Found incompatible settings restrictions`. Ours is in
[`foundry.toml`](foundry.toml) and [`script/deps/`](script/deps/).

**Standalone `v4-core` is not usable alongside `v4-periphery`.** Installing both
produces a `v4-core` missing `src/types/PoolOperation.sol`, which
`v4-periphery/test/shared` imports. The working setup is *two* dependencies only —
`forge-std` and `v4-periphery` — with everything else remapped to the vendored copies.
Similarly, OpenZeppelin 5.7.0 makes `TransparentUpgradeableProxy` revert with
`0xc28a273c` where v4 expects the vendored 5.0.2. We wrote this up as
[`docs/SETUP-LANDMINES.md`](docs/SETUP-LANDMINES.md).

**Suggestion:** a canonical "integrating with v4 in your own Foundry project"
template. Every one of the above is a one-time cost, but it is a genuinely large one,
and it lands entirely on new integrators.

**`rpc.sepolia.org` in `v4-periphery/foundry.toml` returns 404.** Anyone copying that
config inherits a dead endpoint.

---

## One thing we ended up agreeing with

`Actions.sol:14–24` deprecates `INCREASE_LIQUIDITY_FROM_DELTAS` and
`MINT_POSITION_FROM_DELTAS` as *"Vulnerable to sandwich attacks — do not use"*, on the
grounds that a delta-based path has no minimum-liquidity slippage bound.

We hit the same conclusion from the other direction and took it further: `compound`
performs no swap at all, so it has no price for anyone to manipulate. Finding that
comment after making the decision was the most reassuring moment of the build — it is
rare to find a protocol documenting the sharp edge on its own primitive. More of that,
please.

---

## Where to look in our repo

| | |
|---|---|
| Action assembly | [`src/Envoyage.sol`](src/Envoyage.sol) — `_harvest`, `_increase`, `_approvePermit2` |
| Full 26-action trace | [`docs/V4-ACTION-COMPLETENESS.md`](docs/V4-ACTION-COMPLETENESS.md) |
| Integration spike | [`test/unit/Spike.t.sol`](test/unit/Spike.t.sol) |
| Setup landmines | [`docs/SETUP-LANDMINES.md`](docs/SETUP-LANDMINES.md) |
| Foundry config | [`foundry.toml`](foundry.toml), [`script/deps/`](script/deps/) |
