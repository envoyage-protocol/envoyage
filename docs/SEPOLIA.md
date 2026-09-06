# Sepolia — LIVE addresses, verified on-chain

Chain: **Ethereum Sepolia, 11155111**

Every address below was checked with `cast code` after deployment. None is copied
from a log or a simulation — see the warning at the bottom for why that distinction
cost us an hour.

## Envoyage deployment

| Contract | Address | Bytecode |
|---|---|---|
| **Envoyage** | `0x8466e82E02edF3F00c0387D5C3E66d407dc7259C` | 10128 B |
| DemoToken (token0) | `0x1dC7e196Ff124C79191154C635df75a315e00985` | 3488 B |
| DemoToken (token1) | `0x7D5Dc05acea592601e6888ccB04D625CDc6c13DC` | 3488 B |
| DemoSwapper | `0x8A61cad8909BacC9a764f1b21451Afb3c6501D7A` | 3206 B |

## Uniswap v4 (pre-existing)

Source: `developers.uniswap.org/docs/protocols/v4/deployments`.

| Contract | Address | Bytecode |
|---|---|---|
| PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` | 24009 B |
| PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` | 23877 B |
| UniversalRouter | `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` | 19540 B |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | 9152 B |
| StateView | `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c` | 3531 B |
| Quoter | `0x61b3f2011a92d183c7dbadbda940a7555ccf9227` | 5820 B |

PositionDescriptor is not listed for Sepolia.

StateView is **3531 bytes** on chain, byte-for-byte identical to our local compile.
That is how we know the `v4-periphery` SHA pinned in `script/setup.sh` matches what
Sepolia actually runs, rather than merely assuming it.

## Demo pool

A high static LP fee is deliberate. Fees that are too small make
`getLiquidityForAmounts` return 0, which turns `INCREASE_LIQUIDITY` into a
**succeeding** no-op: the event still fires and the demo looks alive while nothing
happened. `revert ZeroLiquidityDelta()` closes that hole.

| Item | Value |
|---|---|
| fee | `10000` (1%) |
| tickSpacing | `200` |
| tick range | `-2000 .. 2000` |
| position tokenId | **38896** |
| position owner | `0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA` |
| ERC-721 approved to | Envoyage — never the keeper |
| mandate id | **1** |
| keeper | `0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B` |
| fee cap | 200 bps of harvested fees |

## Live result

`compound`, broadcast by the KEEPER key, on Sepolia:

```
liquidity before  100.000000000000000000
liquidity after   100.614338692357009962
delta               0.614338692357009962
```

`MandateExecuted` at block **11644474**, decoded:

| Field | Raw | Value |
|---|---|---|
| `fee0Paid` | `0x44364c5bb0000` | 1200000000000000 |
| `fee1Paid` | `0x44364c5baffff` | 1199999999999999 |
| `liquidityAdded` | `0x088691c929b7b22a` | 614338692357009962 |

Corroborated by independent reads rather than the script's own output: the keeper's
token balances equal the two fee figures exactly, and **Envoyage holds 0 of both
tokens**, so the non-custodial-between-transactions claim holds on a public chain.

## Wallets

| Role | Address | Balance at deploy |
|---|---|---|
| DEPLOYER | `0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA` | 0.1 ETH |
| KEEPER | `0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B` | 0.1 ETH |

Full deploy plus seeding cost roughly **0.008 ETH**.

## RPC

| Endpoint | Status |
|---|---|
| `https://ethereum-sepolia-rpc.publicnode.com` | works, no key, but slow to confirm |
| `https://1rpc.io/sepolia` | works, no key |
| `https://rpc.sepolia.org` | 404 (referenced by v4-periphery's foundry.toml — do not copy it) |
| `https://sepolia.drpc.org` | dead |

## ⚠️ Do not trust `deployments/sepolia.json` blindly

`forge script --resume` re-simulates from the **current** nonce, so every CREATE
address it computes differs from what was already broadcast. An unguarded write
replaces live addresses with addresses that were never deployed, and the file still
looks well-formed. It happened here: the clobbered `token1` was in fact the
*swapper's* real address, off by one in the nonce sequence.

`Base.s.sol::_guardDeployments` now refuses to overwrite a file whose recorded
`envoyage` already has bytecode. Set `FORCE_REDEPLOY=1` to deploy a new instance on
purpose. Verify with `cast code` regardless.

## Still to do

- [ ] Etherscan verification — no `ETHERSCAN_API_KEY` in `.env` yet.
      Once set: `forge verify-contract 0x8466e82E02edF3F00c0387D5C3E66d407dc7259C src/Envoyage.sol:Envoyage --chain sepolia --watch`
