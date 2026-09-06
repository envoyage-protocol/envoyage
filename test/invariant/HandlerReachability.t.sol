// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";
import {PosmTestSetup} from "v4-periphery-test/shared/PosmTestSetup.sol";
import {PositionConfig} from "v4-periphery-test/shared/PositionConfig.sol";

import {Envoyage} from "../../src/Envoyage.sol";
import {Handler} from "./Handler.sol";

/// @notice The anti-vacuity guard for the invariant suite. Not an invariant itself.
///
/// @dev An invariant suite whose handler cannot reach the interesting state is worse
///      than no suite: it reports green while proving nothing. With
///      fail_on_revert = false, a run in which every call reverts satisfies every
///      property.
///
///      The guard lives here rather than in the invariant file because neither
///      placement there works: an invariant_ function is evaluated against the
///      initial state (runs: 0, calls: 0), and afterInvariant() reads the handler
///      counters at their post-setUp values even with shrinking disabled. See the
///      note in Envoyage.invariant.t.sol.
///
///      These are ordinary deterministic tests. If a change ever makes compound
///      unreachable, these fail loudly instead of the invariants passing quietly.
contract HandlerReachabilityTest is PosmTestSetup {
    Envoyage envoyage;
    Handler handler;
    PositionConfig cfg;
    uint256 tokenId;
    address keeper = makeAddr("keeper");

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        deployPosmHookSavesDelta();
        key = PoolKey(currency0, currency1, 10_000, 200, IHooks(hook));
        manager.initialize(key, SQRT_PRICE_1_1);
        deployAndApprovePosm(manager);

        cfg = PositionConfig({poolKey: key, tickLower: -2000, tickUpper: 2000});
        tokenId = lpm.nextTokenId();
        mint(cfg, 100e18, address(this), "");

        envoyage = new Envoyage(lpm, manager, permit2);
        IERC721(address(lpm)).approve(address(envoyage), tokenId);

        for (uint256 i; i < 8; i++) {
            swap(key, true, -1e18, "");
            swap(key, false, -1e18, "");
        }

        handler =
            new Handler(envoyage, IERC721(address(lpm)), manager, address(this), keeper, tokenId, key, address(this));
    }

    function generateFees() external {
        swap(key, true, -1e18, "");
        swap(key, false, -1e18, "");
    }

    /// @notice Mimics a fuzzer sequence: grant, then repeated warp/fees/compound.
    function test_handlerSequenceReachesRepeatedCompounds() public {
        handler.grantAsCurrentOwner(200, 180 days, 60);

        for (uint256 i; i < 6; i++) {
            handler.warp(3600);
            handler.generateFees();
            handler.compoundAsKeeper(0);
        }

        emit log_named_uint("successfulGrants   ", handler.successfulGrants());
        emit log_named_uint("successfulCompounds", handler.successfulCompounds());
        emit log_named_uint("rejectedCalls      ", handler.rejectedCalls());
        assertGt(handler.successfulCompounds(), 0, "sequence never compounded");
    }

    function test_handlerValidPathIsReachable() public {
        handler.grantAsCurrentOwner(200, 30 days, 60);
        assertEq(handler.successfulGrants(), 1, "grantAsCurrentOwner did not land");

        uint256 id = envoyage.activeMandate(tokenId);
        assertGt(id, 0, "no active mandate recorded");

        // Surface the refusal instead of inferring it from a swallowed revert.
        bytes4 reason = envoyage.canCompound(id);
        emit log_named_bytes32("canCompound", bytes32(reason));

        handler.compoundAsKeeper(0);
        emit log_named_uint("successfulCompounds", handler.successfulCompounds());
        emit log_named_uint("rejectedCalls", handler.rejectedCalls());

        // If it was rejected, call unguarded so the revert data is visible.
        if (handler.successfulCompounds() == 0) {
            vm.prank(keeper);
            envoyage.compound(id, 0);
        }
    }
}
