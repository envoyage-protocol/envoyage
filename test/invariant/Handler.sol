// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";

import {Envoyage} from "../../src/Envoyage.sol";
import {IEnvoyage} from "../../src/interfaces/IEnvoyage.sol";

/// @dev Implemented by the invariant test, which owns the swap router from
///      PosmTestSetup. Without a way to make new fees, at most one compound could
///      ever succeed in a sequence: the first drains what setUp accrued and nothing
///      replaces it.
interface IFeeSource {
    function generateFees() external;
}

/// @notice Drives Envoyage the way an adversary would, not the way a happy path does.
///
/// @dev The keeper here is treated as hostile. It is given every call the ABI exposes,
///      with fuzzed arguments and fuzzed senders, and it is allowed to try calls it
///      should not be permitted to make. The invariants then assert that none of it
///      moved value anywhere it should not go.
///
///      Ghost counters exist because `fail_on_revert = false` means a suite where
///      every single call reverts still passes every invariant vacuously. The
///      counters make that failure visible: see invariant_callsActuallyLanded.
contract Handler is CommonBase, StdCheats, StdUtils {
    Envoyage public immutable ENVOYAGE;
    IERC721 public immutable POSM_721;
    IPoolManager public immutable MANAGER;

    address public immutable FEE_SOURCE;
    address public immutable OWNER;
    address public immutable KEEPER;
    uint256 public immutable TOKEN_ID;
    PoolKey internal key;

    address[] public actors;

    // ── ghosts ───────────────────────────────────────────────────────────────
    uint256 public successfulCompounds;
    uint256 public successfulGrants;
    uint256 public successfulRevokes;
    uint256 public rejectedCalls;
    uint256 public totalFee0ToKeeper;
    uint256 public totalFee1ToKeeper;
    uint256 public maxObservedFeeBps;

    constructor(
        Envoyage envoyage,
        IERC721 posm721,
        IPoolManager manager,
        address owner,
        address keeper,
        uint256 tokenId,
        PoolKey memory k,
        address feeSource
    ) {
        FEE_SOURCE = feeSource;
        ENVOYAGE = envoyage;
        POSM_721 = posm721;
        MANAGER = manager;
        OWNER = owner;
        KEEPER = keeper;
        TOKEN_ID = tokenId;
        key = k;

        actors.push(keeper);
        actors.push(owner);
        actors.push(makeAddr("stranger"));
        actors.push(makeAddr("attacker"));
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    /// @notice Anyone may attempt to compound anything, with any minFee.
    function compound(uint256 actorSeed, uint256 mandateId, uint256 minFee) external {
        mandateId = bound(mandateId, 0, 3);
        minFee = bound(minFee, 0, 1e18);

        vm.prank(_actor(actorSeed));
        try ENVOYAGE.compound(mandateId, minFee) {
            successfulCompounds++;
        } catch {
            rejectedCalls++;
        }
    }

    /// @notice Anyone may attempt to grant a mandate over a position, including one
    ///         they do not own and with a fee cap above the hard ceiling.
    function grant(uint256 actorSeed, uint16 feeBps, uint64 duration, uint64 interval, bool allowed) external {
        feeBps = uint16(bound(feeBps, 0, 20_000)); // deliberately spans past the 1000 ceiling
        duration = uint64(bound(duration, 0, 365 days));
        interval = uint64(bound(interval, 0, 30 days));

        address who = _actor(actorSeed);
        vm.prank(who);
        try ENVOYAGE.grant(
            IEnvoyage.Mandate({
                keeper: KEEPER,
                // Fuzzed to a lie on purpose: the contract must overwrite it with
                // msg.sender. If it ever trusted this field, the H-04 ownership
                // check would be forgeable by the grantor.
                grantor: address(0xdead),
                tokenId: TOKEN_ID,
                maxFeeBps: feeBps,
                feeRecipient: who,
                expiry: uint64(block.timestamp) + duration,
                minInterval: interval,
                lastCall: 0,
                compoundAllowed: allowed
            })
        ) {
            successfulGrants++;
        } catch {
            rejectedCalls++;
        }
    }

    /// @notice The valid path, always taken by whoever currently owns the position
    ///         and always within the fee ceiling.
    ///
    /// @dev Needed because the adversarial grant() above succeeds far too rarely to
    ///      reach the interesting states: the actor is the owner 1 time in 4 and the
    ///      fuzzed cap is within the ceiling about 1 time in 20, so roughly 1.25% of
    ///      calls land. Across a sequence that is under one expected success, and the
    ///      first run of this suite indeed produced zero — every invariant passed
    ///      while nothing had happened. The adversarial version is kept; this one
    ///      guarantees the state space is actually entered.
    function grantAsCurrentOwner(uint16 feeBps, uint64 duration, uint64 interval) external {
        feeBps = uint16(bound(feeBps, 0, 1_000));
        // Long-lived on purpose. Bounded from 1 hour, most mandates expired on the
        // very next warp and every later compound reverted with MandateExpired —
        // which reads as "the property holds" while nothing was ever exercised.
        duration = uint64(bound(duration, 90 days, 365 days));
        interval = uint64(bound(interval, 0, 1 hours));

        address owner = POSM_721.ownerOf(TOKEN_ID);
        vm.startPrank(owner);
        // transferFrom clears the ERC-721 approval, so it must be re-established or
        // every compound after the first transfer reverts for the rest of the run.
        POSM_721.approve(address(ENVOYAGE), TOKEN_ID);
        try ENVOYAGE.grant(
            IEnvoyage.Mandate({
                keeper: KEEPER,
                grantor: address(0xdead),
                tokenId: TOKEN_ID,
                maxFeeBps: feeBps,
                feeRecipient: KEEPER,
                expiry: uint64(block.timestamp) + duration,
                minInterval: interval,
                lastCall: 0,
                compoundAllowed: true
            })
        ) {
            successfulGrants++;
        } catch {
            rejectedCalls++;
        }
        vm.stopPrank();
    }

    /// @notice Revokes using the mandate's actual grantor.
    ///
    /// @dev Without this the sequence deadlocks. After transferPosition() the live
    ///      mandate fails OwnerChanged on every compound, while grantAsCurrentOwner
    ///      fails MandateAlreadyActive because activeMandate still points at it — so
    ///      nothing can execute for the rest of the run, and at depth 100 a transfer
    ///      happens early almost every time. Mirrors reality: the grantor can always
    ///      revoke, and that is the escape hatch the design promises.
    function revokeAsGrantor() external {
        uint256 id = ENVOYAGE.activeMandate(TOKEN_ID);
        if (id == 0) return;

        (, address grantor,,,,,,,) = ENVOYAGE.mandates(id);
        if (grantor == address(0)) return;

        vm.prank(grantor);
        try ENVOYAGE.revoke(id) {
            successfulRevokes++;
        } catch {
            rejectedCalls++;
        }
    }

    /// @notice Returns the position to the address that seeded the run.
    /// @dev Pairs with transferPosition so ownership can come back; otherwise the
    ///      fuzzer can only ever walk away from the reachable state.
    function returnPosition() external {
        address current = POSM_721.ownerOf(TOKEN_ID);
        if (current == OWNER) return;
        vm.prank(current);
        try POSM_721.transferFrom(current, OWNER, TOKEN_ID) {}
        catch {
            rejectedCalls++;
        }
    }

    /// @notice Restores the approval an ERC-721 transfer silently cleared.
    function approveEnvoyage() external {
        address owner = POSM_721.ownerOf(TOKEN_ID);
        vm.prank(owner);
        POSM_721.approve(address(ENVOYAGE), TOKEN_ID);
    }

    function revoke(uint256 actorSeed, uint256 mandateId) external {
        mandateId = bound(mandateId, 0, 3);
        vm.prank(_actor(actorSeed));
        try ENVOYAGE.revoke(mandateId) {
            successfulRevokes++;
        } catch {
            rejectedCalls++;
        }
    }

    /// @notice The valid compound path: always the keeper, always the live mandate,
    ///         always a minFee it can plausibly meet.
    ///
    /// @dev Same reachability problem as grant(). The adversarial compound() needs the
    ///      keeper to be picked (1 in 4), the fuzzed id to match a real mandate, the
    ///      fuzzed minFee to sit under the fees actually accrued (~1 in 8) and the
    ///      cooldown to have elapsed — together under 1%, and zero landed across a
    ///      whole run. Both versions are kept.
    function compoundAsKeeper(uint256 minFeeSeed) external {
        uint256 id = ENVOYAGE.activeMandate(TOKEN_ID);
        if (id == 0) return;

        vm.prank(KEEPER);
        try ENVOYAGE.compound(id, bound(minFeeSeed, 0, 1e12)) {
            successfulCompounds++;
        } catch {
            rejectedCalls++;
        }
    }

    /// @notice Trades the pool so new fees accrue for the next compound.
    function generateFees() external {
        IFeeSource(FEE_SOURCE).generateFees();
    }

    /// @notice Moves time forward so cooldowns and expiries are actually reachable.
    /// @dev Without this the sequence explores only t0 and every compound after the
    ///      first reverts on CooldownActive, which would make the suite look busy
    ///      while testing one branch.
    function warp(uint256 secondsAhead) external {
        // Hours, not days. Large jumps outrun every expiry the handler can grant, so
        // the sequence spends its whole depth in the expired state.
        vm.warp(block.timestamp + bound(secondsAhead, 1 minutes, 12 hours));
    }

    /// @notice The owner may sell the position at any moment. This is the H-04 class.
    function transferPosition(uint256 actorSeed) external {
        address to = _actor(actorSeed);
        address current = POSM_721.ownerOf(TOKEN_ID);
        if (to == current) return;

        vm.prank(current);
        try POSM_721.transferFrom(current, to, TOKEN_ID) {}
        catch {
            rejectedCalls++;
        }
    }

    function poolKey() external view returns (PoolKey memory) {
        return key;
    }

    function recordFees(uint256 fee0, uint256 fee1, uint16 capBps) external {
        totalFee0ToKeeper += fee0;
        totalFee1ToKeeper += fee1;
        if (capBps > maxObservedFeeBps) maxObservedFeeBps = capBps;
    }
}
