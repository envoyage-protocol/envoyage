// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PositionInfo, PositionInfoLibrary} from "v4-periphery/libraries/PositionInfoLibrary.sol";

import {Base} from "./Base.s.sol";
import {Envoyage} from "../src/Envoyage.sol";

/// @notice Runs `compound` AS THE KEEPER, and prints the liquidity delta.
///
/// @dev Broadcast with the keeper key, not the deployer key. That is the whole
///      demonstration: an address that has never been approved for anything, holding
///      no position, is able to grow someone else's position and able to do nothing
///      else with it.
///
///   MANDATE_ID=1 forge script script/04_Compound.s.sol --rpc-url sepolia --broadcast
contract Compound is Base {
    using StateLibrary for IPoolManager;
    using PositionInfoLibrary for PositionInfo;

    function run() external {
        Envoyage envoyage = Envoyage(payable(_readAddr("envoyage")));
        uint256 mandateId = vm.envUint("MANDATE_ID");
        uint256 tokenId = _readUint("tokenId");

        bytes4 reason = envoyage.canCompound(mandateId);
        if (reason != bytes4(0)) {
            // Read the refusal before spending gas on a transaction that reverts.
            // This is why canCompound exists: a revert discards logs, so an event
            // announcing the rejection is impossible to emit.
            console2.log("refused, selector below; nothing broadcast");
            console2.logBytes4(reason);
            return;
        }

        uint128 before = _liquidity(tokenId);

        vm.startBroadcast(vm.envUint("KEEPER_PRIVATE_KEY"));
        envoyage.compound(mandateId, 0);
        vm.stopBroadcast();

        uint128 nowLiq = _liquidity(tokenId);
        console2.log("liquidity before", before);
        console2.log("liquidity after ", nowLiq);
        console2.log("delta           ", nowLiq - before);
    }

    function _liquidity(uint256 tokenId) internal view returns (uint128) {
        (PoolKey memory key, PositionInfo info) = POSM.getPoolAndPositionInfo(tokenId);
        bytes32 positionKey =
            keccak256(abi.encodePacked(address(POSM), info.tickLower(), info.tickUpper(), bytes32(tokenId)));
        return POOL_MANAGER.getPositionLiquidity(key.toId(), positionKey);
    }
}
