// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";

/// @notice Minimal swap router used only to generate trading fees on the demo pool,
///         so `compound` has something real to harvest.
///
/// @dev Deliberately NOT part of the protocol. Envoyage never swaps — see
///      test_spike_positionManagerRejectsSwapAction. This contract exists purely so
///      the Sepolia demo does not depend on external routers or third-party
///      liquidity, both of which are demo-day failure modes.
contract DemoSwapper is IUnlockCallback {
    IPoolManager public immutable MANAGER;

    error OnlyPoolManager();
    error SettleFailed();

    struct CallbackData {
        PoolKey key;
        SwapParams params;
        address sender;
    }

    constructor(IPoolManager manager) {
        MANAGER = manager;
    }

    function swap(PoolKey memory key, SwapParams memory params) external returns (BalanceDelta delta) {
        delta = abi.decode(MANAGER.unlock(abi.encode(CallbackData(key, params, msg.sender))), (BalanceDelta));
    }

    function unlockCallback(bytes calldata raw) external returns (bytes memory) {
        if (msg.sender != address(MANAGER)) revert OnlyPoolManager();
        CallbackData memory d = abi.decode(raw, (CallbackData));

        BalanceDelta delta = MANAGER.swap(d.key, d.params, "");

        _resolve(d.key.currency0, delta.amount0(), d.sender);
        _resolve(d.key.currency1, delta.amount1(), d.sender);

        return abi.encode(delta);
    }

    /// @dev Settled inline rather than via v4-core's CurrencySettler, which lives
    ///      under test/ — a script that runs against a live network should not
    ///      import from a test tree.
    function _resolve(Currency currency, int128 amount, address who) internal {
        if (amount < 0) {
            // Negation of type(int128).min would overflow; Solidity >=0.8 reverts on
            // it, so the cast below can only ever see a representable magnitude.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 owed = uint256(uint128(-amount));

            MANAGER.sync(currency);
            // Checked, for the same reason as Envoyage._transfer: a token that
            // returns false rather than reverting would leave the pool unsettled and
            // the failure would surface later as an unrelated revert inside unlock.
            (bool ok, bytes memory data) = Currency.unwrap(currency)
                .call(abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, who, address(MANAGER), owed));
            if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert SettleFailed();
            MANAGER.settle();
        } else if (amount > 0) {
            // forge-lint: disable-next-line(unsafe-typecast)
            MANAGER.take(currency, who, uint256(uint128(amount)));
        }
    }
}
