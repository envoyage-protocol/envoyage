# Setup landmines, already stepped on

Everything below cost 30–90 minutes each. The configuration in this repo is proven
green:

```
[PASS] test_harnessMintsRealPosition() (gas: 33391444)
```

That means PoolManager + Permit2 + PositionManager + a real pool + a minted v4
position, all from real `v4-periphery`. **Don't touch `foundry.toml` or
`remappings.txt` unless you have to.**

If you are integrating v4 into your own Foundry project, this page is the shortcut we
did not have. It is also the substance of what we sent the Uniswap team in
[`FEEDBACK.md`](../FEEDBACK.md).

---

### 1. `forge install --no-commit` was removed in forge 1.7.1

The flag errors out — and a `|| true` in our script swallowed it silently, so `lib/`
stayed empty while the script reported success. `script/setup.sh` now uses
`set -euo pipefail` with no suppression anywhere.

The lesson generalises: a setup script that cannot fail loudly will eventually lie
to you.

### 2. solmate/permit2 remappings must NOT end in `/src/`

Upstream imports already write `solmate/src/tokens/WETH.sol` themselves. If the
remapping also ends in `/src/`, you get `lib/solmate/src/src/...` and a file-not-found
that names a path you never typed.

### 3. Standalone `v4-core` is incompatible with `v4-periphery`

`forge install Uniswap/v4-core` gives a version **missing**
`src/types/PoolOperation.sol`, which periphery's own `test/shared` imports.

Use the core that periphery vendors: `lib/v4-periphery/lib/v4-core/`. The standalone
`lib/v4-core` directory has been deleted from this repo — do not reinstall it.

### 4. OpenZeppelin 5.7.0 makes `TransparentUpgradeableProxy` revert

v4 expects **5.0.2**, the version v4-core vendors. With 5.7.0 the proxy constructor
reverts with `0xc28a273c` and `deployPosm` fails. Every OZ and solmate remapping
points at `lib/v4-periphery/lib/v4-core/lib/`.

**The rule behind 3 and 4:** this project has exactly TWO submodules, `forge-std` and
`v4-periphery`. Everything else is remapped to what periphery already vendors. Any
dependency you install alongside it is a version you now have to keep in agreement
with theirs, and you will lose.

### 5. `compilation_restrictions` is mandatory, or you get stack-too-deep

v4-periphery uses **per-path** compiler settings. Without mirroring them:

```
Yul exception: Variable memPtr_1 is 1 too deep in the stack
```

And `PositionManager` (500 runs) cannot share a compilation unit with
`PositionDescriptor` (1 run) — that produces
`Found incompatible settings restrictions`.

### 6. `vm.getCode` needs artifacts, and artifacts need forcing imports

`Deploy.sol` calls `vm.getCode("PositionManager.sol:PositionManager")`. The artifact
only exists if the contract was compiled. Hence `script/deps/*.sol` — one dependency
per **separate file**, because of landmine 5.

⚠️ Run a full `forge build` at least once before `forge test`. A selective
`--match-contract` compile can skip these artifacts, and the failure appears as
`vm.getCode: no matching artifact found`, which sounds like a path problem and is not.

---

## The correct setUp order

Taken from v4-periphery's own tests, not guessed:

```solidity
deployFreshManagerAndRouters();
deployMintAndApprove2Currencies();   // REQUIRED before deployAndApprovePosm,
                                     // otherwise: "call to non-contract address 0x0"
deployPosmHookSavesDelta();          // so modifyLiquidity returns deltas
(key,) = initPool(currency0, currency1, IHooks(hook), 3000, SQRT_PRICE_1_1);
deployAndApprovePosm(manager);
seedBalance(alice); approvePosmFor(alice);
```

Note: `IPositionManager` does not expose `ownerOf`. Cast it:
`IERC721(address(lpm)).ownerOf(tokenId)`.

---

## One more, found later

`v4-periphery`'s own `foundry.toml` lists `https://rpc.sepolia.org` as its Sepolia
endpoint. That host returns **404**. Anyone copying the config inherits a dead RPC and
an error that points at their own network setup.

Working alternatives, verified: `https://ethereum-sepolia-rpc.publicnode.com` and
`https://1rpc.io/sepolia`.

---

## Don't delete the probe

`test/_HarnessProbe.t.sol` is a **dependency smoke test**, not Envoyage code — zero
project logic. It exists to verify the toolchain independently of anything we wrote.

Keep it. If it ever goes red, the cause is configuration, not your code, and knowing
that immediately is worth the one test it costs to run.
