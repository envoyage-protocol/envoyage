// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

import {Base} from "./Base.s.sol";
import {DemoSwapper} from "./demo/DemoSwapper.sol";

/// @notice Trades back and forth across the demo pool so the position accrues real
///         LP fees for `compound` to harvest.
///
/// @dev Round trips, deliberately. A one-directional swap would move the price and
///      push the position out of range, and an out-of-range position earns nothing —
///      the demo would then show a correct contract harvesting zero.
///
///   forge script script/02_GenerateFees.s.sol --rpc-url sepolia --broadcast
contract GenerateFees is Base {
    int256 constant SWAP_SIZE = 1e18;
    uint256 constant ROUND_TRIPS = 6;

    function run() external {
        DemoSwapper swapper = DemoSwapper(_readAddr("swapper"));
        PoolKey memory key = PoolKey(
            Currency.wrap(_readAddr("token0")),
            Currency.wrap(_readAddr("token1")),
            DEMO_FEE,
            DEMO_TICK_SPACING,
            IHooks(address(0))
        );

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        for (uint256 i; i < ROUND_TRIPS; i++) {
            swapper.swap(key, _params(true));
            swapper.swap(key, _params(false));
        }
        vm.stopBroadcast();

        console2.log("round trips executed", ROUND_TRIPS);
        console2.log("next: forge script script/03_GrantMandate.s.sol --rpc-url sepolia --broadcast");
    }

    function _params(bool zeroForOne) internal pure returns (SwapParams memory) {
        return SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -SWAP_SIZE, // negative == exact input
            sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        });
    }
}
