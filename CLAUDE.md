# Envoyage — agent instructions

See `AGENTS.md` for the full engineering contract. This file carries the rules that
override defaults.

## Language: English, everywhere in this repo

Every artifact that lands in the repository or is read by anyone other than the
author is written in **English**:

- Solidity comments and NatSpec
- Identifiers: contracts, functions, variables, errors, events
- Test names and `console2.log` output
- Commit messages and PR descriptions
- `README.md`, everything under `docs/`, `AGENTS.md`
- All UI copy, including error strings and button labels

This is not a style preference. Envoyage is an ETHGlobal ETHOnline submission read
by an international judging panel; the source is part of the submission.

Conversation with the author may be in any language. The repository may not.

## Deployment records

A deployments file records what was **broadcast**, never what a simulation
predicted. `forge script --resume` re-simulates from the current nonce, so every
CREATE address it computes differs from what is already on chain; an unguarded
write silently replaces live addresses with addresses that were never deployed.

`Base.s.sol::_guardDeployments` refuses to overwrite a file whose recorded
`envoyage` already has bytecode. Set `FORCE_REDEPLOY=1` to deploy a new instance
deliberately. Always re-verify addresses with `cast code` before trusting the file.
