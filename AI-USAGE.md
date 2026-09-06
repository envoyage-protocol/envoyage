# AI usage

ETHGlobal requires entrants to document how AI was used. This is that document,
written to be checkable rather than reassuring: every claim below can be verified
against `git log`, and the specific things AI got *wrong* are listed alongside what
it got right, because a disclosure that only reports successes is not a disclosure.

## Tools

| Tool | Used for |
|---|---|
| **Claude Code** (Claude Opus 5) | Nearly all code and prose in this repository, driven interactively |
| A stronger reviewer model, via an `advisor` tool | Periodic review of approach and priorities |

There is no other contributor. This is a solo entry.

## Before vs during the event

The event opened **4 Sept 2026, 12:00 EDT** (23:00 WIB, the author's timezone).
Five commits precede that moment:

| Commit | Local time | What it is |
|---|---|---|
| `c75e77f` | 3 Sept 00:24 | Foundry scaffolding, `.gitignore`, licence |
| `9990878` | 3 Sept 00:27 | Dependency SHAs pinned; Sepolia addresses verified |
| `6c6cb45` | 4 Sept 17:18 | `AGENTS.md` |
| `c8320ed` | 4 Sept 17:23 | The Graph plan |
| `f04aac7` | 4 Sept 17:23 | Wallet funding notes |

All five are toolchain setup and planning documents. **No protocol code exists in
any of them.** The first line of Envoyage's own logic is `fb42859`, 5 Sept 11:31,
after the event opened. The project is entered on the Start Fresh track and that
claim survives inspection of the history.

## Language

Commits 1–11 are written in Indonesian; the switch to English is commit `6cbb713`
with its reasoning stated. Earlier commit messages were deliberately **not**
rewritten: a rebase resets committer dates, which would have destroyed exactly the
pre-event/during-event evidence the section above depends on. A tidy log is worth
less than a checkable one.

## What AI did well here

- Tracing all 26 Uniswap v4 actions to file and line (`docs/V4-ACTION-COMPLETENESS.md`)
- Building the paired exploit-replay harness, including the deliberately vulnerable
  comparator contract that keeps it from being a tautology
- Turning `forge lint` findings into two real bug fixes with regression tests
- Wiring the whole Sepolia path and verifying it on a fork before broadcasting

## What AI got wrong, and how it was caught

This section matters more than the one above.

**1. Hard-coded error selectors — 4 of 6 wrong.** `web/src/lib/envoyage.ts` first
listed `canCompound` refusal selectors as hex constants written from memory. Only the
two that had actually been observed on chain were correct. The failure mode is
invisible: a wrong selector renders "unknown reason" while the contract behaves
perfectly. Caught by running `cast sig` on every signature. Fixed by *deriving* them
with `toFunctionSelector` so they cannot drift.

**2. The keeper bot could never have sent a transaction.** `simulateContract` was
given the keeper's address instead of its account object, so viem tagged the request
as a `json-rpc` account and `writeContract` called `eth_sendTransaction` — asking a
public RPC to sign with a key it does not hold. It failed as `Missing or invalid
parameters`, naming neither the cause nor the contract, and the simulation passed
first, so it presented as an RPC outage. Caught only by actually running the bot
against Sepolia.

**3. A deploy script that corrupted its own address book.** `forge script --resume`
re-simulates from the current nonce, so its `CREATE` addresses differ from what was
broadcast; the script wrote those never-deployed addresses over the real ones. It
surfaced two scripts later as `call to non-contract address` naming an address that
appeared in no log. Caught by checking `cast code` on every recorded address. A guard
now refuses to overwrite a live deployment.

**4. Unchecked ERC-20 transfer, in a project whose thesis is attack-surface
reduction.** `forge lint` reported it; the build output had been piped through
`tail -5`, so it was read and skipped. Two bugs sat behind it — a token returning
`false` made the keeper fee a silent no-op, and a token returning nothing (USDT and
everything shaped like it) made the call revert outright.

**5. A stale test count and a wrong claim in the README**, both written by AI and
both caught only by re-reading against reality.

## The rule that caught most of these

Assertions were verified against the source or the chain rather than accepted:
selectors computed with `cast sig`, addresses checked with `cast code`, the deploy
rehearsed against an anvil fork of Sepolia before broadcasting, and every regression
test run against the *broken* version first to confirm it actually fails. A test
never seen failing is not evidence, and neither is a plausible-looking constant.
