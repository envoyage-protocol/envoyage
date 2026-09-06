// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";
import {Actions} from "v4-periphery/libraries/Actions.sol";

import {Base} from "./Base.s.sol";
import {Envoyage} from "../src/Envoyage.sol";
import {DemoToken} from "./demo/DemoToken.sol";
import {DemoSwapper} from "./demo/DemoSwapper.sol";

/// @notice Deploys Envoyage and stands up a self-contained demo pool on Sepolia.
///
/// Self-contained is the point: no external router, no third-party liquidity, no
/// faucet for the pool tokens. Every one of those is a demo-day failure mode that
/// fails at the worst possible moment and cannot be debugged live.
///
///   forge script script/01_DeployAndSeed.s.sol --rpc-url sepolia --broadcast --verify
contract DeployAndSeed is Base {
    uint256 constant MINT_LIQUIDITY = 100e18;
    uint256 constant TOKEN_SUPPLY = 1_000_000e18;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("deployer", deployer);
        console2.log("balance ", deployer.balance);

        vm.startBroadcast(pk);

        Envoyage envoyage = new Envoyage(POSM, POOL_MANAGER, PERMIT2);

        // Tokens must be sorted by address: v4 requires currency0 < currency1.
        // Deployment order does not determine this, so sort after deploying.
        DemoToken a = new DemoToken("Envoyage Demo A", "EDA");
        DemoToken b = new DemoToken("Envoyage Demo B", "EDB");
        (address t0, address t1) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));

        DemoToken(t0).mint(deployer, TOKEN_SUPPLY);
        DemoToken(t1).mint(deployer, TOKEN_SUPPLY);

        PoolKey memory key =
            PoolKey(Currency.wrap(t0), Currency.wrap(t1), DEMO_FEE, DEMO_TICK_SPACING, IHooks(address(0)));
        POOL_MANAGER.initialize(key, SQRT_PRICE_1_1);

        _approveThroughPermit2(t0);
        _approveThroughPermit2(t1);

        uint256 tokenId = POSM.nextTokenId();
        _mintPosition(key, deployer);

        // The keeper never receives this. Envoyage holds the ERC-721 approval, which
        // is exactly the finding from test_spike_compoundPathIsTraversable:
        // INCREASE_LIQUIDITY rejects a caller that is not ERC-721 approved, so the
        // authority must live somewhere — and it lives in code that cannot be told
        // what to do with it.
        IERC721Minimal(address(POSM)).approve(address(envoyage), tokenId);

        DemoSwapper swapper = new DemoSwapper(POOL_MANAGER);
        IERC20Minimal(t0).approve(address(swapper), type(uint256).max);
        IERC20Minimal(t1).approve(address(swapper), type(uint256).max);

        vm.stopBroadcast();

        _write(address(envoyage), t0, t1, tokenId, address(swapper));

        console2.log("");
        console2.log("Envoyage    ", address(envoyage));
        console2.log("token0      ", t0);
        console2.log("token1      ", t1);
        console2.log("position id ", tokenId);
        console2.log("swapper     ", address(swapper));
        console2.log("");
        console2.log("next: forge script script/02_GenerateFees.s.sol --rpc-url sepolia --broadcast");
    }

    function _approveThroughPermit2(address token) internal {
        // Two hops, and both are required. POSM pulls payment through Permit2
        // whenever the payer is not POSM itself. Miss either one and this passes
        // every mocked test then fails on the first real network call.
        IERC20Minimal(token).approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(token, address(POSM), type(uint160).max, type(uint48).max);
    }

    function _mintPosition(PoolKey memory key, address owner) internal {
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key,
            -DEMO_TICK_SPACING * 10,
            DEMO_TICK_SPACING * 10,
            MINT_LIQUIDITY,
            type(uint128).max,
            type(uint128).max,
            owner,
            bytes("")
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp + 300);
    }

    function _write(address envoyage, address t0, address t1, uint256 tokenId, address swapper) internal {
        string memory o = "d";
        vm.serializeString(o, "envoyage", vm.toString(envoyage));
        vm.serializeString(o, "token0", vm.toString(t0));
        vm.serializeString(o, "token1", vm.toString(t1));
        vm.serializeString(o, "swapper", vm.toString(swapper));
        vm.serializeString(o, "poolManager", vm.toString(address(POOL_MANAGER)));
        vm.serializeString(o, "positionManager", vm.toString(address(POSM)));
        vm.serializeString(o, "fee", vm.toString(uint256(DEMO_FEE)));
        // DEMO_TICK_SPACING is a positive compile-time constant, so widening it is
        // exact. Recorded here rather than muted so the reasoning survives.
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.serializeString(o, "tickSpacing", vm.toString(uint256(uint24(DEMO_TICK_SPACING))));
        string memory out = vm.serializeString(o, "tokenId", vm.toString(tokenId));
        vm.writeJson(out, DEPLOYMENTS);
    }
}

interface IERC721Minimal {
    function approve(address to, uint256 tokenId) external;
}
