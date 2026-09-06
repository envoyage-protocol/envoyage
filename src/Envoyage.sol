// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";

import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {PositionInfo, PositionInfoLibrary} from "v4-periphery/libraries/PositionInfoLibrary.sol";
import {Actions} from "v4-periphery/libraries/Actions.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";

import {IEnvoyage} from "./interfaces/IEnvoyage.sol";

/// @title Envoyage
/// @notice Envoyage removes authority over INTENT. It does not remove authority
///         over EXECUTION.
///
/// @dev IMMUTABLE BY CONSTRUCTION — a security property, not an oversight:
///      no proxy, no owner/admin, no upgrade function, no delegatecall, no
///      selfdestruct, and NO function that accepts `bytes calldata` or an
///      `address target` from the caller. Violate any one of those and the claim
///      "Envoyage takes no instructions" becomes FALSE rather than merely weak:
///      a single contract aggregating many owners' approvals is a far more
///      attractive honeypot than those approvals left scattered.
contract Envoyage is IEnvoyage {
    using StateLibrary for IPoolManager;
    using PositionInfoLibrary for PositionInfo;

    IPositionManager public immutable POSM;
    IPoolManager public immutable POOL_MANAGER;
    IAllowanceTransfer public immutable PERMIT2;

    /// @dev Hard ceiling: a keeper may never take more than 10% of harvested fees,
    ///      no matter what the owner asks for at grant time.
    uint16 public constant MAX_FEE_BPS_CEILING = 1_000;

    mapping(uint256 mandateId => Mandate) public mandates;

    /// @notice A tokenId may have exactly ONE live mandate.
    /// @dev This cannot be enforced from the struct alone — Mandate is keyed by
    ///      mandateId, so revoke-then-grant produces a second id for the same
    ///      tokenId with nothing to check against. This mapping is the enforcer.
    ///      0 means absent, which is why mandateId starts at 1.
    mapping(uint256 tokenId => uint256 mandateId) public activeMandate;

    uint256 public nextMandateId = 1;

    uint256 private _locked = 1;

    modifier nonReentrant() {
        require(_locked == 1);
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(IPositionManager posm, IPoolManager poolManager, IAllowanceTransfer permit2) {
        POSM = posm;
        POOL_MANAGER = poolManager;
        PERMIT2 = permit2;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Grant / revoke
    // ─────────────────────────────────────────────────────────────────────────

    function grant(Mandate calldata m) external returns (uint256 mandateId) {
        if (IERC721(address(POSM)).ownerOf(m.tokenId) != msg.sender) revert NotPositionOwner();
        if (activeMandate[m.tokenId] != 0) revert MandateAlreadyActive();
        if (m.maxFeeBps > MAX_FEE_BPS_CEILING) revert FeeCapTooHigh();

        mandateId = nextMandateId++;

        Mandate storage s = mandates[mandateId];
        s.keeper = m.keeper;
        s.grantor = msg.sender; // NOT m.grantor — the grantor cannot forge this
        s.tokenId = m.tokenId;
        s.maxFeeBps = m.maxFeeBps;
        s.feeRecipient = m.feeRecipient; // pinned here, forever
        s.expiry = m.expiry;
        s.minInterval = m.minInterval;
        s.lastCall = 0;
        s.compoundAllowed = m.compoundAllowed;

        activeMandate[m.tokenId] = mandateId;
        emit MandateGranted(mandateId, m.keeper, m.tokenId);
    }

    /// @notice Immediate, with no delay. An in-flight keeper call reverts.
    function revoke(uint256 mandateId) external {
        Mandate storage m = mandates[mandateId];
        if (m.grantor != msg.sender) revert NotPositionOwner();

        delete activeMandate[m.tokenId];
        delete mandates[mandateId];
        emit MandateRevoked(mandateId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Compound
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Two numbers. No calldata, no destination, no route.
    function compound(uint256 mandateId, uint256 minFee) external nonReentrant {
        Mandate storage m = mandates[mandateId];
        _gate(m);

        m.lastCall = uint64(block.timestamp);

        (PoolKey memory key, PositionInfo info) = POSM.getPoolAndPositionInfo(m.tokenId);

        // ── 1. Harvest. v4 has no "collect" action — decrease by 0. ──────────
        uint256 b0 = _balance(key.currency0);
        uint256 b1 = _balance(key.currency1);
        _harvest(m.tokenId, key);
        uint256 fee0 = _balance(key.currency0) - b0;
        uint256 fee1 = _balance(key.currency1) - b1;

        if (fee0 + fee1 < minFee) revert FeeBelowMinimum();

        // ── 2. Keeper fee, on harvested fees only, to the pinned recipient. ──
        uint256 keeperFee0 = (fee0 * m.maxFeeBps) / 10_000;
        uint256 keeperFee1 = (fee1 * m.maxFeeBps) / 10_000;
        if (keeperFee0 > 0) _transfer(key.currency0, m.feeRecipient, keeperFee0);
        if (keeperFee1 > 0) _transfer(key.currency1, m.feeRecipient, keeperFee1);

        uint256 add0 = fee0 - keeperFee0;
        uint256 add1 = fee1 - keeperFee1;

        // ── 3. Size the delta WITHOUT a swap. No price to manipulate. ────────
        (uint160 sqrtPriceX96,,,) = POOL_MANAGER.getSlot0(key.toId());
        uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(info.tickLower()),
            TickMath.getSqrtPriceAtTick(info.tickUpper()),
            add0,
            add1
        );
        // Without this gate, INCREASE becomes a SUCCEEDING no-op: the event still
        // fires and the demo looks alive while nothing at all happened.
        if (liquidityDelta == 0) revert ZeroLiquidityDelta();

        // ── 4. Reinvest. ─────────────────────────────────────────────────────
        _approvePermit2(key.currency0);
        _approvePermit2(key.currency1);
        _increase(m.tokenId, key, liquidityDelta, add0, add1);

        // ── 5. Dust goes to the OWNER. A constant, never a parameter. ────────
        address owner = IERC721(address(POSM)).ownerOf(m.tokenId);
        _sweep(key.currency0, owner);
        _sweep(key.currency1, owner);

        // Non-custodial BETWEEN transactions: a balance exists only within one tx.
        if (_balance(key.currency0) != 0 || _balance(key.currency1) != 0) revert ResidualBalance();

        emit MandateExecuted(mandateId, keeperFee0, keeperFee1, liquidityDelta);
    }

    function canCompound(uint256 mandateId) external view returns (bytes4) {
        Mandate storage m = mandates[mandateId];
        if (m.keeper == address(0)) return MandateInactive.selector;
        if (!m.compoundAllowed) return CompoundNotAllowed.selector;
        if (block.timestamp > m.expiry) return MandateExpired.selector;
        if (m.lastCall != 0 && block.timestamp < uint256(m.lastCall) + m.minInterval) return CooldownActive.selector;
        if (IERC721(address(POSM)).ownerOf(m.tokenId) != m.grantor) return OwnerChanged.selector;
        return bytes4(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _gate(Mandate storage m) internal view {
        if (m.keeper == address(0)) revert MandateInactive();
        if (msg.sender != m.keeper) revert NotKeeper();
        if (!m.compoundAllowed) revert CompoundNotAllowed();
        if (block.timestamp > m.expiry) revert MandateExpired();
        // lastCall == 0 means never called; a fresh mandate is immediately usable.
        // Without this exemption, `block.timestamp < 0 + minInterval` is true on a
        // chain with small timestamps (anvil/Foundry starts at 1) and a new mandate
        // could never be used at all. On mainnet the bug is invisible because
        // timestamps are large — which is precisely what makes it dangerous.
        if (m.lastCall != 0 && block.timestamp < uint256(m.lastCall) + m.minInterval) revert CooldownActive();
        // Without this, a mandate survives the sale of the position: the seller
        // keeps compound rights over the buyer's position. That is the Code4rena
        // H-04 class.
        if (IERC721(address(POSM)).ownerOf(m.tokenId) != m.grantor) revert OwnerChanged();
    }

    function _harvest(uint256 tokenId, PoolKey memory key) internal {
        bytes memory actions = abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        // recipient = address(this) AS A LITERAL, not ActionConstants.ADDRESS_THIS
        // (that constant means the PositionManager, not this contract).
        params[1] = abi.encode(key.currency0, key.currency1, address(this));
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    function _increase(uint256 tokenId, PoolKey memory key, uint128 liquidityDelta, uint256 max0, uint256 max1)
        internal
    {
        bytes memory actions = abi.encodePacked(uint8(Actions.INCREASE_LIQUIDITY), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(liquidityDelta), uint128(max0), uint128(max1), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    /// @dev POSM pays through Permit2 whenever the payer is not POSM itself, and
    ///      here the payer is Envoyage. Without both approvals: green against
    ///      mocked unit tests, and a failure on the very first real network call.
    function _approvePermit2(Currency c) internal {
        address token = Currency.unwrap(c);
        if (token == address(0)) return;
        if (IERC20Minimal(token).allowance(address(this), address(PERMIT2)) == 0) {
            IERC20Minimal(token).approve(address(PERMIT2), type(uint256).max);
        }
        (uint160 amount,,) = PERMIT2.allowance(address(this), token, address(POSM));
        if (amount == 0) {
            PERMIT2.approve(token, address(POSM), type(uint160).max, type(uint48).max);
        }
    }

    function _balance(Currency c) internal view returns (uint256) {
        address token = Currency.unwrap(c);
        return token == address(0) ? address(this).balance : IERC20Minimal(token).balanceOf(address(this));
    }

    function _transfer(Currency c, address to, uint256 amount) internal {
        address token = Currency.unwrap(c);
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok);
        } else {
            IERC20Minimal(token).transfer(to, amount);
        }
    }

    function _sweep(Currency c, address to) internal {
        uint256 bal = _balance(c);
        if (bal > 0) _transfer(c, to, bal);
    }

    receive() external payable {}
}
