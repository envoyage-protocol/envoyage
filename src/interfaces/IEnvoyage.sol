// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IEnvoyage — a scoped-permission instrument for Uniswap v4 positions
/// @notice A keeper never writes v4 instructions. It calls a typed entrypoint with two
///         numbers; Envoyage builds the action array itself and pins the recipient to
///         the position owner. Misuse is not blocked by a check — it cannot be
///         expressed.
interface IEnvoyage {
    struct Mandate {
        address keeper; // the only address allowed to trigger this mandate
        address grantor; // owner at grant time; compound asserts ownerOf == grantor
        uint256 tokenId; // one mandate locks to exactly one position
        uint16 maxFeeBps; // fee cap, charged on HARVESTED fees only
        address feeRecipient; // pinned at grant time, never mutable
        uint64 expiry;
        uint64 minInterval; // cooldown; closes extraction by repeated calls
        uint64 lastCall;
        bool compoundAllowed;
    }

    event MandateGranted(uint256 indexed id, address indexed keeper, uint256 indexed tokenId);
    event MandateExecuted(uint256 indexed id, uint256 fee0Paid, uint256 fee1Paid, uint128 liquidityAdded);
    event MandateRevoked(uint256 indexed id);

    // There is deliberately no MandateRejected event: a revert discards logs, so
    // emitting before reverting is impossible. Use canCompound() instead.

    error NotPositionOwner();
    error MandateAlreadyActive();
    error NotKeeper();
    error MandateExpired();
    error MandateInactive();
    error CompoundNotAllowed();
    error OwnerChanged();
    error CooldownActive();
    error FeeBelowMinimum();
    error FeeCapTooHigh();
    error ZeroLiquidityDelta();
    error ResidualBalance();

    function grant(Mandate calldata m) external returns (uint256 mandateId);
    function revoke(uint256 mandateId) external;
    function compound(uint256 mandateId, uint256 minFee) external;

    /// @return reason 0x0 when the call would succeed; otherwise the error selector
    ///         that the call would revert with
    function canCompound(uint256 mandateId) external view returns (bytes4 reason);

    // ── v0 deliberately does NOT implement the following. ─────────────────────
    // rebalance would let a keeper choose numbers that move value (tickLower/Upper),
    // and that needs a whole new family of constraints: minimum range width, a
    // requirement to straddle the current price, a deviation bound, a maximum
    // frequency. See prd.md §6b.
    //
    // function rebalance(uint256 mandateId, int24 tickLower, int24 tickUpper, uint16 maxSlippageBps) external;
    // function exit(uint256 mandateId) external;
}
