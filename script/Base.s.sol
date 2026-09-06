// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

/// @notice Shared Sepolia addresses and deployment-file plumbing.
///
/// @dev Every address below was verified on-chain with `cast code` before use; see
///      docs/SEPOLIA.md. They are NOT copied from a blog post. StateView's on-chain
///      size matches our local compile byte-for-byte, which is how we know the
///      pinned v4-periphery SHA matches what Sepolia actually runs.
abstract contract Base is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0xE03A1074c86CFeDd5C142C4F04F1a1536e203543);
    IPositionManager constant POSM = IPositionManager(0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4);
    IAllowanceTransfer constant PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    /// @dev 1% LP fee, not 0.3%. Small fees make getLiquidityForAmounts return 0,
    ///      which turns INCREASE_LIQUIDITY into a SUCCEEDING no-op: the event fires,
    ///      the demo looks alive, and nothing happened. See docs/SEPOLIA.md.
    uint24 constant DEMO_FEE = 10_000;
    int24 constant DEMO_TICK_SPACING = 200;
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    string constant DEPLOYMENTS = "deployments/sepolia.json";

    function _read(string memory key) internal view returns (string memory) {
        return vm.parseJsonString(vm.readFile(DEPLOYMENTS), string.concat(".", key));
    }

    function _readAddr(string memory key) internal view returns (address) {
        return vm.parseAddress(_read(key));
    }

    function _readUint(string memory key) internal view returns (uint256) {
        return vm.parseUint(_read(key));
    }
}
