# Envoyage

**Envoyage removes authority over intent. It does not remove authority over execution.**

A scoped-permission instrument for Uniswap v4 positions. A position owner can hire a
keeper without handing over `approve` or `setApprovalForAll`.

> ETHOnline 2026 · Sepolia · net-new (Start Fresh track)
> Project code began after 4 Sept 2026, 12:00 EDT.

---

## The problem

To give a keeper authority over a v4 position, today there are exactly two options:

| Primitive | Which position | Which action |
|---|---|---|
| `setApprovalForAll(keeper, true)` | all of them | **unbounded** |
| `approve(keeper, tokenId)` | one | **unbounded** |
| **Mandate** | one | **enumerated** |

Both constrain *which position*. Neither constrains *what may be done to it*.

v4's architecture sharpens this: `modifyLiquidities` is a single entrypoint that takes
an array of actions — a small language. Restricting a keeper to "may only call
modifyLiquidities" restricts nothing, because that function is itself an interpreter.

## The approach: assemble, don't validate

The keeper never sends calldata. It calls a typed entrypoint with two numbers, and
**Envoyage assembles** the v4 action array itself, with the recipient as a constant.

Misuse is not rejected by a check — there is no channel in which to express it.

## Status

**23 tests passing.** The core contract runs against real `v4-periphery`.

| File | Contents |
|---|---|
| [`src/Envoyage.sol`](src/Envoyage.sol) | mandate registry + v4 action assembler |
| [`src/interfaces/IEnvoyage.sol`](src/interfaces/IEnvoyage.sol) | public ABI, custom errors |
| [`test/unit/Spike.t.sol`](test/unit/Spike.t.sol) | proof the v4 flow is traversable without a swap |
| [`test/unit/Envoyage.t.sol`](test/unit/Envoyage.t.sol) | 16 gating and fee-accounting tests |
| [`test/replay/`](test/replay/) | documented exploits, replayed against a vulnerable comparator |

### What is proven, with numbers

```
fees harvested   : 0.06 e18 per token
liquidity before : 100.000000000000000000 e18
liquidity after  : 100.626876216690826481 e18   <- with no swap
```

The exploit replay is deliberately **paired**: every attack runs once against
`NaiveUtils` (a comparator built to be vulnerable, reproducing the Revert V3Utils
pattern) and once against Envoyage.

```
H-04 vs NaiveUtils -- token0 stolen: 4757902903361556095
keeper received (capped at 2%):      1200000000000000
```

A test that only shows Envoyage lacks the vulnerable function is a tautology. A test
that shows the identical attack draining the contract next to it is not.

- `PositionManager` **rejects** `SWAP_EXACT_IN_SINGLE` — `test_spike_positionManagerRejectsSwapAction`
- Position sold → `compound` reverts — `test_revert_positionSoldToNewOwner` (Code4rena H-04 class)
- Envoyage's balance is zero at the end of every tx — non-custodial between transactions
- `grantor` is taken from `msg.sender`, never from the struct — unforgeable

See [`AGENTS.md`](AGENTS.md) for build rules and [`docs/`](docs/) for findings verified
against the v4 source.

## Layout

```
src/interfaces/   public ABI + custom errors
src/adapters/     per-protocol action assemblers (v0: Uniswap v4)
test/unit/        gating, fee accounting, expiry
test/invariant/   properties + handlers; the keeper is treated as an attacker
test/replay/      documented exploit patterns vs a vulnerable comparator contract
script/           deploy + Sepolia pool seeding
subgraph/         mandate events -> Subgraph Studio
keeper/           reference keeper bot
web/              UI: issue a mandate + public mandate page
```

## Setup

Clone with submodules, then build. Verified green from a fresh clone:

```bash
git clone --recurse-submodules https://github.com/envoyage-protocol/envoyage.git
cd envoyage
forge test          # 23 tests, all green
```

If you already cloned without `--recurse-submodules`:

```bash
./script/setup.sh     # install v4 dependencies at pinned SHAs
cp .env.example .env  # fill in RPC + keys
forge build
forge test
```

Test profiles:
```bash
forge test                                   # default, 1000 fuzz runs
FOUNDRY_PROFILE=quick   forge test           # fast iteration
FOUNDRY_PROFILE=deep    forge test           # 10,000 invariant runs (for DoD)
```

## Threat model

See [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md). In short: the claim is **attack
surface reduction**, not absolute security. What is **not** protected is stated
explicitly there.

## License

MIT
