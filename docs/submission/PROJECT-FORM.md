# ETHGlobal project form — copy to paste

Project name: **Envoyage**
Category: **Security**
Emoji: 🔐

---

## Short description (max 100 characters)

```
Hire a Uniswap v4 keeper without handing it your position. Scoped permission, not blanket approval.
```

*99 characters.*

---

## Description (min 280 characters)

```
To let a bot compound your Uniswap v4 position today, you call approve(keeper, tokenId).
That says WHICH position the keeper may touch. It says nothing about WHAT it may do.

v4 makes this sharper than it sounds. Liquidity management goes through one entrypoint,
modifyLiquidities(bytes actions), and that bytes payload is an action array — a small
language with 26 opcodes. Restricting a keeper to "may only call modifyLiquidities"
restricts nothing, because that function is itself an interpreter. We traced all 26
opcodes to file and line: four of them (TAKE_PAIR, TAKE, SWEEP, MINT_POSITION) take a
recipient address straight from the caller. So an approved keeper can assemble
DECREASE_LIQUIDITY + TAKE_PAIR(..., its own wallet) and nothing on chain objects. That
is the Code4rena Revert Lend H-04 class, and the shape behind the ~$17M Aperture
Finance drain.

Envoyage inverts who writes the instructions. The keeper never sends calldata — it
calls compound(mandateId, minFee), two integers. Envoyage assembles the v4 action array
itself, with the recipient as a constant in code. Misuse is not rejected by a check;
there is no field in which to express it.

A mandate carries what an approval cannot: a fee cap in basis points of harvested fees
(never of the position), a fee recipient pinned at grant time, a cooldown, an expiry,
and a check that the position has not changed hands. Revocation is immediate.

Each mandate is also published as an ENSv2 subname. 38896.envoyage.eth resolves the
full scope in any ENS client, so it can be read without visiting our app or trusting
our frontend. And the keeper's limits hold there too: it is granted write access to
exactly one text key, so recording its last run succeeds while rewriting its own fee
cap reverts.
```

---

## How it's made (min 280 characters)

```
Solidity 0.8.26 on Sepolia, Foundry throughout. The contract is immutable by
construction: no proxy, no admin, no upgrade path, no delegatecall, and no function
that accepts bytes or an address target. That is a security property, not an omission —
a contract aggregating many owners' approvals is a more attractive honeypot than those
approvals left scattered, so we assert it against the DEPLOYED BYTECODE rather than the
source: the runtime contains no DELEGATECALL, SELFDESTRUCT or CALLCODE, and no
arbitrary-call selector resolves. The opcode scanner skips PUSH immediates so a
constant containing 0xf4 isn't misread, and it carries a negative control that runs the
same scan over a contract which does contain DELEGATECALL — a scanner that finds
nothing proves nothing until you know it can find something.

We started with an integration spike against real v4-periphery before writing any
protocol code, which is how we learned INCREASE_LIQUIDITY rejects a caller without
ERC-721 approval. That failure is the architecture: the authority has to live
somewhere, so the question is never whether someone holds it but who. Envoyage holds
it, and Envoyage cannot be told what to do with it.

There is deliberately no swap leg, for two independent reasons: PositionManager does not
dispatch swap actions at all, and without a swap compound has no price, so no value can
leak through one. Uniswap reached a related conclusion itself, deprecating the
FROM_DELTAS variants as "vulnerable to sandwich attacks".

Testing is 38 tests. The exploit replay is paired: every attack runs against NaiveUtils,
a comparator built vulnerable exactly as Revert V3Utils was, AND against Envoyage —
because a test showing we merely lack the vulnerable function is a tautology. The same
H-04 back-run steals 4.757902903361556095 token0 from the comparator and cannot be
encoded against us. The invariant suite fuzzes the keeper as an adversary over 12,800
calls; its anti-vacuity guard sits in a deterministic test rather than in
afterInvariant(), because Foundry evaluates invariants against the initial state and
afterInvariant reads handler counters at their post-setUp values — both placements
would have passed while proving nothing.

ENSv2 (Sepolia beta) is where a mandate becomes publicly readable. We registered
envoyage.eth through the ETH Registrar's commit-reveal flow, deployed our own
UserRegistry via VerifiableFactory, and pointed the parent at it. A separate
EnvoyageNames contract mirrors mandates into subnames — separate on purpose, since
Envoyage is already deployed and immutable, and a mirror must never require edits to
what it mirrors. Every function on it is permissionless because it reads the truth out
of Envoyage rather than taking it from the caller, which is the same shape as the
contract it mirrors. The keeper is granted authorizeTextRoles on exactly one text key,
envoyage:lastRun; writing any other key reverts EACUnauthorizedAccountRoles. That is
the same division the contract's gate enforces — the owner sets the scope, the keeper
touches only what cannot change it — expressed on a second substrate.

Everything ENSv2 was transcribed from verified Etherscan ABIs, not from tutorials, and
that mattered: findTokenId is NOT keccak256(label) — the registry masks the low 32 bits
for versioning, so a locally computed id addresses a name nobody resolves through, and
it fails silently rather than reverting.

The subgraph indexes the granted scope alongside actual behaviour on the same entity,
which most keeper tooling cannot do: what a bot was ALLOWED to do does not exist on
chain, because an ERC-721 approval carries no scope. One query returns maxFeeBps 200,
minInterval 60 and expiry beside executionCount 2 and totalLiquidityAdded
1225570246268614335. Two mapping decisions came from reading the generated types
rather than assuming: the scope is read with try_mandates() at grant block since no
event carries it, and handleMandateRevoked deliberately does not re-read storage,
because revoke() deletes the struct and the record of what a keeper was permitted to
do must survive the moment it stops being permitted.

Also shipped: a reference keeper bot verified compounding unattended on Sepolia, and a
web UI reading live state over two independent RPC operators with no backend or
indexer — two operators rather than several keys from one provider, because keys from
a single provider share a failure domain and the fallback never actually fails over.

Things that only surfaced by driving the real contracts rather than the tutorials:
ENS findTokenId is not keccak256(label) — the registry masks the low 32 bits for
versioning, so a locally computed id addresses a name nobody resolves through and
setSubregistry against it fails silently rather than reverting. type(uint256).max is
not a valid EAC role bitmap, because roles are packed into nybbles and only every
fourth bit names one. grantRoles(0, ...) reverts EACRootResourceNotAllowed since id 0
is the root resource. And the shared resolver cannot be written to at all — you must
deploy your own proxy, which the error EACCannotGrantRoles(..., 16, ...) does not say.
```

---

## Demonstration link

Until the video is recorded, use the live contract:

```
https://sepolia.etherscan.io/address/0x8466e82E02edF3F00c0387D5C3E66d407dc7259C#code
```

Replace with the demo video URL before final submission.

## Live links to cite

| | |
|---|---|
| Envoyage (verified) | `https://sepolia.etherscan.io/address/0x8466e82E02edF3F00c0387D5C3E66d407dc7259C#code` |
| Subgraph | `https://api.studio.thegraph.com/query/62788/envoyage/v0.0.2` |
| ENS parent | `envoyage.eth` (ENSv2 Sepolia beta) |
| ENS mandate name | `38896.envoyage.eth` |
| EnvoyageNames | `0x307CF6B0022Ef757820A8C3Cfced97C324eE0d05` |
| ENS registry | `0x6CD593BE2B0fF155120b49042Cf57089625189F6` |
| ENS resolver | `0xAF5b8aCF804e59fb823C05D37e73D523Af2Eca8a` |

---

## Prizes to select (max 3 partner prizes)

1. **Uniswap** — Best use of v4 ($1,000, net-new)
2. **ENS** — Best Use of ENSv2 ($4,500 pool)
3. **The Graph** — one of the three $5,000 tracks
