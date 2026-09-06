// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {IERC20} from "openzeppelin-contracts/contracts/interfaces/IERC20.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";

import {PosmTestSetup} from "v4-periphery-test/shared/PosmTestSetup.sol";
import {PositionConfig} from "v4-periphery-test/shared/PositionConfig.sol";

import {Envoyage} from "../../src/Envoyage.sol";
import {IEnvoyage} from "../../src/interfaces/IEnvoyage.sol";

contract EnvoyageTest is PosmTestSetup {
    using StateLibrary for *;

    Envoyage envoyage;
    PositionConfig cfg;
    uint256 tokenId;
    uint256 mandateId;

    address keeper = makeAddr("keeper");
    address feeRecipient = makeAddr("feeRecipient");
    address attacker = makeAddr("attacker");
    address buyer = makeAddr("buyer");

    uint24 constant DEMO_FEE = 10_000; // 1% — fee kecil bikin liquidityDelta 0
    int24 constant TS = 200;
    uint16 constant FEE_BPS = 200; // 2%

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        deployPosmHookSavesDelta();
        key = PoolKey(currency0, currency1, DEMO_FEE, TS, IHooks(hook));
        manager.initialize(key, SQRT_PRICE_1_1);
        deployAndApprovePosm(manager);

        cfg = PositionConfig({poolKey: key, tickLower: -TS * 10, tickUpper: TS * 10});
        tokenId = lpm.nextTokenId();
        mint(cfg, 100e18, address(this), "");

        envoyage = new Envoyage(lpm, manager, permit2);
        IERC721(address(lpm)).approve(address(envoyage), tokenId);
        mandateId = envoyage.grant(_mandate());
        _generateFees();
    }

    function _mandate() internal view returns (IEnvoyage.Mandate memory) {
        return IEnvoyage.Mandate({
            keeper: keeper,
            grantor: address(0), // diabaikan — kontrak memakai msg.sender
            tokenId: tokenId,
            maxFeeBps: FEE_BPS,
            feeRecipient: feeRecipient,
            expiry: uint64(block.timestamp + 30 days),
            minInterval: 6 hours,
            lastCall: 0,
            compoundAllowed: true
        });
    }

    // ── jalur bahagia ────────────────────────────────────────────────────────

    function test_compound_increasesLiquidityWithoutSwap() public {
        uint128 before = manager.getPositionLiquidity(key.toId(), _pk());
        vm.prank(keeper);
        envoyage.compound(mandateId, 0);
        assertGt(manager.getPositionLiquidity(key.toId(), _pk()), before, "liquidity increased");
    }

    function test_compound_paysCappedFeeToLockedRecipient() public {
        vm.prank(keeper);
        envoyage.compound(mandateId, 0);
        uint256 got = IERC20(Currency.unwrap(currency0)).balanceOf(feeRecipient);
        assertGt(got, 0, "fee dibayar");
        // 2% of harvested fees — not 2% of the position
        assertLt(got, 1e18, "fee is far below the value of the position");
    }

    function test_compound_leavesNoResidualBalance() public {
        vm.prank(keeper);
        envoyage.compound(mandateId, 0);
        assertEq(IERC20(Currency.unwrap(currency0)).balanceOf(address(envoyage)), 0, "non-kustodial antar-tx");
        assertEq(IERC20(Currency.unwrap(currency1)).balanceOf(address(envoyage)), 0, "non-kustodial antar-tx");
    }

    function test_compound_dustGoesToOwnerNotKeeper() public {
        vm.prank(keeper);
        envoyage.compound(mandateId, 0);
        assertEq(IERC20(Currency.unwrap(currency0)).balanceOf(keeper), 0, "keeper receives no dust");
        assertEq(IERC20(Currency.unwrap(currency1)).balanceOf(keeper), 0, "keeper receives no dust");
    }

    // ── gerbang ──────────────────────────────────────────────────────────────

    function test_revert_notKeeper() public {
        vm.prank(attacker);
        vm.expectRevert(IEnvoyage.NotKeeper.selector);
        envoyage.compound(mandateId, 0);
    }

    function test_revert_expired() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(keeper);
        vm.expectRevert(IEnvoyage.MandateExpired.selector);
        envoyage.compound(mandateId, 0);
    }

    function test_revert_cooldown() public {
        vm.prank(keeper);
        envoyage.compound(mandateId, 0);
        _generateFees();
        vm.prank(keeper);
        vm.expectRevert(IEnvoyage.CooldownActive.selector);
        envoyage.compound(mandateId, 0);
    }

    function test_revert_afterRevoke() public {
        envoyage.revoke(mandateId);
        vm.prank(keeper);
        vm.expectRevert(IEnvoyage.MandateInactive.selector);
        envoyage.compound(mandateId, 0);
    }

    function test_revert_feeBelowMinimum() public {
        vm.prank(keeper);
        vm.expectRevert(IEnvoyage.FeeBelowMinimum.selector);
        envoyage.compound(mandateId, 1_000_000e18);
    }

    /// @notice The Code4rena H-04 class: a right that attaches to the position
    ///         rather than to the current owner's consent. Without `grantor`, a
    ///         seller keeps compound rights over the buyer's position, with fees
    ///         still routed to the seller's address.
    function test_revert_positionSoldToNewOwner() public {
        IERC721(address(lpm)).transferFrom(address(this), buyer, tokenId);
        vm.prank(keeper);
        vm.expectRevert(IEnvoyage.OwnerChanged.selector);
        envoyage.compound(mandateId, 0);
    }

    // ── grant ────────────────────────────────────────────────────────────────

    function test_revert_secondMandateOnSameToken() public {
        vm.expectRevert(IEnvoyage.MandateAlreadyActive.selector);
        envoyage.grant(_mandate());
    }

    function test_revoke_thenGrantAgainWorks() public {
        envoyage.revoke(mandateId);
        uint256 id2 = envoyage.grant(_mandate());
        assertGt(id2, mandateId);
        assertEq(envoyage.activeMandate(tokenId), id2);
    }

    function test_revert_grantByNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(IEnvoyage.NotPositionOwner.selector);
        envoyage.grant(_mandate());
    }

    function test_revert_feeCapAboveCeiling() public {
        envoyage.revoke(mandateId);
        IEnvoyage.Mandate memory m = _mandate();
        m.maxFeeBps = 5_000; // 50%
        vm.expectRevert(IEnvoyage.FeeCapTooHigh.selector);
        envoyage.grant(m);
    }

    function test_grantorIsMsgSenderNotStructField() public {
        envoyage.revoke(mandateId);
        IEnvoyage.Mandate memory m = _mandate();
        m.grantor = attacker; // percobaan pemalsuan
        uint256 id = envoyage.grant(m);
        (, address grantor,,,,,,,) = envoyage.mandates(id);
        assertEq(grantor, address(this), "grantor comes from msg.sender, never from the struct");
    }

    // ── canCompound ──────────────────────────────────────────────────────────

    function test_canCompound_reportsReasons() public {
        assertEq(envoyage.canCompound(mandateId), bytes4(0), "boleh");
        vm.warp(block.timestamp + 31 days);
        assertEq(envoyage.canCompound(mandateId), IEnvoyage.MandateExpired.selector);
        envoyage.revoke(mandateId);
        assertEq(envoyage.canCompound(mandateId), IEnvoyage.MandateInactive.selector);
    }

    // ── helper ───────────────────────────────────────────────────────────────

    function _pk() internal view returns (bytes32) {
        return keccak256(abi.encodePacked(address(lpm), cfg.tickLower, cfg.tickUpper, bytes32(tokenId)));
    }

    function _generateFees() internal {
        for (uint256 i; i < 6; i++) {
            swap(key, true, -1e18, "");
            swap(key, false, -1e18, "");
        }
    }
}
