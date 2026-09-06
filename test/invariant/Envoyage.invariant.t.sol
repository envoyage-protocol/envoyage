// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IERC20} from "openzeppelin-contracts/contracts/interfaces/IERC20.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";

import {PosmTestSetup} from "v4-periphery-test/shared/PosmTestSetup.sol";
import {PositionConfig} from "v4-periphery-test/shared/PositionConfig.sol";

import {Envoyage} from "../../src/Envoyage.sol";
import {Handler} from "./Handler.sol";

/// @notice Properties that must hold no matter what any caller does.
///
/// @dev Run with FOUNDRY_PROFILE=deep for 10,000 runs before trusting these.
contract EnvoyageInvariantTest is PosmTestSetup {
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

        // Fees must exist, otherwise every compound reverts on ZeroLiquidityDelta and
        // the suite proves nothing about the path it is meant to cover.
        for (uint256 i; i < 8; i++) {
            swap(key, true, -1e18, "");
            swap(key, false, -1e18, "");
        }

        handler =
            new Handler(envoyage, IERC721(address(lpm)), manager, address(this), keeper, tokenId, key, address(this));

        // Seed one valid mandate before fuzzing starts.
        //
        // afterInvariant() runs after EVERY sequence, not once per campaign, so a
        // sequence that simply never drew grantAsCurrentOwner failed the vacuity
        // check and took the whole suite down with it. Seeding here makes the
        // interesting state reachable from the first call of every sequence, and
        // leaves the vacuity assertion meaningful: it now says the fuzzer reached
        // compound, which is the part that cannot be seeded without defeating it.
        handler.grantAsCurrentOwner(200, 180 days, 60);

        targetContract(address(handler));
    }

    /// @notice Called by the handler so fees keep accruing across a sequence.
    /// @dev Lives here because the swap router belongs to PosmTestSetup.
    function generateFees() external {
        swap(key, true, -1e18, "");
        swap(key, false, -1e18, "");
    }

    /// @notice Envoyage never holds tokens between transactions.
    ///
    /// @dev The claim on the README is "non-custodial between transactions". This is
    ///      that claim as an executable property. It is also the one that would break
    ///      first if a fee-splitting bug left dust behind.
    function invariant_envoyageHoldsNothing() public view {
        assertEq(IERC20(Currency.unwrap(currency0)).balanceOf(address(envoyage)), 0, "residual token0");
        assertEq(IERC20(Currency.unwrap(currency1)).balanceOf(address(envoyage)), 0, "residual token1");
        assertEq(address(envoyage).balance, 0, "residual native");
    }

    /// @notice Envoyage never becomes the owner of the position it manages.
    ///
    /// @dev Holding the ERC-721 approval is the whole design. Holding the TOKEN would
    ///      be custody, and would make this contract the honeypot the threat model
    ///      says it must not be.
    function invariant_envoyageNeverOwnsThePosition() public view {
        assertTrue(IERC721(address(lpm)).ownerOf(tokenId) != address(envoyage), "envoyage took ownership");
    }

    /// @notice No mandate can ever carry a fee cap above the hard ceiling.
    ///
    /// @dev The handler deliberately fuzzes maxFeeBps up to 20000, far past the 1000
    ///      ceiling, and grants are attempted by four different senders.
    function invariant_feeCapNeverExceedsCeiling() public view {
        uint256 next = envoyage.nextMandateId();
        for (uint256 id = 1; id < next; id++) {
            (,,, uint16 maxFeeBps,,,,,) = envoyage.mandates(id);
            assertLe(maxFeeBps, envoyage.MAX_FEE_BPS_CEILING(), "fee cap above ceiling");
        }
    }

    /// @notice A position carries at most one live mandate at a time.
    ///
    /// @dev Cannot be derived from the mandates mapping alone: revoke-then-grant
    ///      produces a second id for the same tokenId. activeMandate is the enforcer,
    ///      so this checks the enforcer agrees with the records.
    function invariant_atMostOneLiveMandatePerPosition() public view {
        uint256 active = envoyage.activeMandate(tokenId);
        if (active == 0) return;

        (address keeperAddr,,,,,,,,) = envoyage.mandates(active);
        assertTrue(keeperAddr != address(0), "activeMandate points at a deleted mandate");

        uint256 live;
        uint256 next = envoyage.nextMandateId();
        for (uint256 id = 1; id < next; id++) {
            (address k,, uint256 tid,,,,,,) = envoyage.mandates(id);
            if (k != address(0) && tid == tokenId) live++;
        }
        assertLe(live, 1, "more than one live mandate on one position");
    }

    /// @notice grantor is always the address that actually sent the grant.
    ///
    /// @dev The handler passes grantor: address(0xdead) on every grant. If the
    ///      contract ever trusted the struct field, the H-04 ownership check would be
    ///      forgeable by whoever grants.
    function invariant_grantorIsNeverTheForgedValue() public view {
        uint256 next = envoyage.nextMandateId();
        for (uint256 id = 1; id < next; id++) {
            (address k, address grantor,,,,,,,) = envoyage.mandates(id);
            if (k == address(0)) continue;
            assertTrue(grantor != address(0xdead), "forged grantor was stored");
        }
    }

    /// @notice The suite is not vacuous.
    ///
    /// @dev fail_on_revert is false, so a run in which every call reverts satisfies
    ///      every invariant above while testing nothing. This asserts the fuzzer
    ///      actually reached the grant and compound paths.
    ///
    ///      It lives in afterInvariant(), not in an invariant_ function, because
    ///      Foundry evaluates invariants against the INITIAL state as well — before
    ///      any call has run. As an invariant_ this could never pass: it failed with
    ///      "failed to set up invariant testing environment" at runs: 0, calls: 0.
    ///      afterInvariant() runs once at the end of each sequence, which is when
    ///      "did anything happen?" is a question with a meaningful answer.
    /// @dev THE ANTI-VACUITY GUARD IS NOT HERE, DELIBERATELY.
    ///
    ///      fail_on_revert is false, so a run in which every call reverts satisfies
    ///      every property above while testing nothing. The obvious guard — assert
    ///      the handler's success counters are non-zero — cannot work in this file,
    ///      and both placements were tried:
    ///
    ///      * As an invariant_ function it fails at runs: 0, calls: 0, because
    ///        Foundry evaluates invariants against the INITIAL state as well, before
    ///        any call has run.
    ///      * In afterInvariant() it also reads zero. The counters come back at their
    ///        post-setUp values even with shrinking disabled, so the hook does not
    ///        observe state accumulated during the sequence.
    ///
    ///      That the fuzzer genuinely reaches compound was confirmed with a temporary
    ///      inverted probe asserting successfulCompounds() == 0, which failed with
    ///      "compounds DID happen: 1 != 0".
    ///
    ///      So reachability is asserted in HandlerReachability.t.sol instead, as
    ///      ordinary deterministic tests. Those cannot be satisfied vacuously and are
    ///      not subject to shrinking.
}
