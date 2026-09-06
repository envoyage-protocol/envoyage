// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {Base} from "./Base.s.sol";
import {Envoyage} from "../src/Envoyage.sol";
import {IEnvoyage} from "../src/interfaces/IEnvoyage.sol";

/// @notice The owner grants a keeper a scoped mandate over one position.
///
/// Every field here is a bound the keeper cannot widen. Note what is absent: there
/// is no field for a destination, a route, or an action list, because there is no
/// code path that would read one.
///
///   forge script script/03_GrantMandate.s.sol --rpc-url sepolia --broadcast
contract GrantMandate is Base {
    uint16 constant FEE_BPS = 200; // 2% of harvested fees, never of the position
    uint64 constant MIN_INTERVAL = 1 minutes; // short, so the demo is watchable
    uint64 constant DURATION = 30 days;

    function run() external {
        Envoyage envoyage = Envoyage(payable(_readAddr("envoyage")));
        uint256 tokenId = _readUint("tokenId");
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        uint256 mandateId = envoyage.grant(
            IEnvoyage.Mandate({
                keeper: keeper,
                // Ignored on purpose. Envoyage overwrites this with msg.sender so a
                // grantor cannot claim to be someone else. Left visible rather than
                // removed, because the fact that it is ignored is the point.
                grantor: address(0),
                tokenId: tokenId,
                maxFeeBps: FEE_BPS,
                feeRecipient: keeper,
                expiry: uint64(block.timestamp) + DURATION,
                minInterval: MIN_INTERVAL,
                lastCall: 0,
                compoundAllowed: true
            })
        );
        vm.stopBroadcast();

        console2.log("mandate id", mandateId);
        console2.log("keeper    ", keeper);
        console2.log("fee cap   ", FEE_BPS, "bps of harvested fees");
        console2.log("");
        console2.log("next: MANDATE_ID=%s forge script script/04_Compound.s.sol --rpc-url sepolia --broadcast", mandateId);
    }
}
