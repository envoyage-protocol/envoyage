// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {IERC20} from "openzeppelin-contracts/contracts/interfaces/IERC20.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";

import {Actions} from "v4-periphery/libraries/Actions.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {PosmTestSetup} from "v4-periphery-test/shared/PosmTestSetup.sol";
import {PositionConfig} from "v4-periphery-test/shared/PositionConfig.sol";
import {Planner, Plan} from "v4-periphery-test/shared/Planner.sol";

/// @notice INTEGRATION SPIKE — the Block A gate.
/// Single purpose: prove the `compound` flow is traversable against REAL
/// v4-periphery before writing the Envoyage contract. There is no Envoyage here.
///
/// It establishes the three facts the whole design rests on:
///  1. harvesting fees == DECREASE_LIQUIDITY with liquidity 0 (v4 has no "collect")
///  2. fees can be landed on a third-party address via TAKE_PAIR
///  3. liquidity can be added back WITHOUT a swap, and measurably increases
contract SpikeTest is PosmTestSetup {
    using StateLibrary for *;

    PositionConfig cfg;
    uint256 tokenId;

    /// @dev A 1% fee (not 0.3%) so that a handful of swaps produces visible fees.
    /// Small fees -> getLiquidityForAmounts returns 0 -> INCREASE becomes a
    /// SUCCEEDING no-op, and the demo looks alive while nothing happened.
    uint24 constant DEMO_FEE = 10_000;
    int24 constant DEMO_TICK_SPACING = 200;

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        deployPosmHookSavesDelta();

        key = PoolKey(currency0, currency1, DEMO_FEE, DEMO_TICK_SPACING, IHooks(hook));
        manager.initialize(key, SQRT_PRICE_1_1);

        deployAndApprovePosm(manager);

        cfg = PositionConfig({poolKey: key, tickLower: -DEMO_TICK_SPACING * 10, tickUpper: DEMO_TICK_SPACING * 10});
        tokenId = lpm.nextTokenId();
        mint(cfg, 100e18, address(this), "");
    }

    function test_spike_compoundPathIsTraversable() public {
        // ── generate fees: swap back and forth against our own pool ─────────
        _generateFees();

        uint128 liqBefore = manager.getPositionLiquidity(key.toId(), _positionKey());
        assertGt(liqBefore, 0, "position must hold liquidity");

        // ── STEP 1: harvest. v4 has no "collect" action — decrease(0). ───────
        address harvester = makeAddr("harvester"); // stands in for Envoyage
        uint256 h0Before = IERC20(Currency.unwrap(currency0)).balanceOf(harvester);
        uint256 h1Before = IERC20(Currency.unwrap(currency1)).balanceOf(harvester);

        Plan memory p = Planner.init();
        p.add(Actions.DECREASE_LIQUIDITY, abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes("")));
        bytes memory harvestCalls = p.finalizeModifyLiquidityWithTakePair(key, harvester);
        lpm.modifyLiquidities(harvestCalls, block.timestamp + 60);

        uint256 fee0 = IERC20(Currency.unwrap(currency0)).balanceOf(harvester) - h0Before;
        uint256 fee1 = IERC20(Currency.unwrap(currency1)).balanceOf(harvester) - h1Before;

        assertGt(fee0 + fee1, 0, "fees must land on the third party");
        emit log_named_uint("fee0 harvested", fee0);
        emit log_named_uint("fee1 harvested", fee1);

        // decrease(0) does NOT change liquidity — that is what makes it safe
        assertEq(
            manager.getPositionLiquidity(key.toId(), _positionKey()),
            liqBefore,
            "decrease(0) leaves liquidity untouched"
        );

        // ── STEP 2: size the delta WITHOUT a swap ───────────────────────────
        (uint160 sqrtPriceX96,,,) = manager.getSlot0(key.toId());
        uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(cfg.tickLower),
            TickMath.getSqrtPriceAtTick(cfg.tickUpper),
            fee0,
            fee1
        );

        // The gate that prevents a false success in the demo.
        assertGt(liquidityDelta, 0, "ZeroLiquidityDelta: fees too small, INCREASE would be a SUCCEEDING no-op");
        emit log_named_uint("liquidityDelta", liquidityDelta);

        // ── STEP 3: reinvest. ───────────────────────────────────────────────
        //
        // THE CENTRAL FINDING: INCREASE_LIQUIDITY rejects a caller that is not
        // ERC-721 approved (`NotApproved`). So the approval MUST live somewhere —
        // and that is the architectural justification for Envoyage: the owner
        // approves the position to the Envoyage CONTRACT, not to the keeper. The
        // keeper triggers; Envoyage holds the authority, and that authority cannot
        // be spent on anything but the actions Envoyage assembles itself.
        IERC721(address(lpm)).approve(harvester, tokenId);

        vm.startPrank(harvester);
        approvePosm(); // two hops: token->Permit2, then Permit2->POSM
        Plan memory p2 = Planner.init();
        p2.add(
            Actions.INCREASE_LIQUIDITY,
            // amountMax slippage bounds. A truncating cast can only lower a bound,
            // which makes POSM revert; it can never authorise overspending.
            // forge-lint: disable-next-line(unsafe-typecast)
            abi.encode(tokenId, uint256(liquidityDelta), uint128(fee0), uint128(fee1), bytes(""))
        );
        bytes memory increaseCalls = p2.finalizeModifyLiquidityWithSettlePair(key);
        lpm.modifyLiquidities(increaseCalls, block.timestamp + 60);
        vm.stopPrank();

        uint128 liqAfter = manager.getPositionLiquidity(key.toId(), _positionKey());
        assertGt(liqAfter, liqBefore, "liquidity must INCREASE, with no swap at all");
        emit log_named_uint("liquidity before", liqBefore);
        emit log_named_uint("liquidity after", liqAfter);
    }

    /// @dev Negative proof: the PositionManager rejects any swap action.
    function test_spike_positionManagerRejectsSwapAction() public {
        Plan memory p = Planner.init();
        p.add(Actions.SWAP_EXACT_IN_SINGLE, abi.encode(uint256(0)));
        bytes memory calls = p.encode();
        vm.expectRevert(); // UnsupportedAction(0x06)
        lpm.modifyLiquidities(calls, block.timestamp + 60);
    }

    function _positionKey() internal view returns (bytes32) {
        return keccak256(abi.encodePacked(address(lpm), cfg.tickLower, cfg.tickUpper, bytes32(tokenId)));
    }

    function _generateFees() internal {
        for (uint256 i; i < 6; i++) {
            swap(key, true, -1e18, "");
            swap(key, false, -1e18, "");
        }
    }
}
