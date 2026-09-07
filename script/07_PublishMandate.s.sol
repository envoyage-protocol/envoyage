// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {Base} from "./Base.s.sol";
import {EnvoyageNames} from "../src/ens/EnvoyageNames.sol";
import {IPermissionedResolver} from "../src/ens/IEnsV2.sol";

/// @notice Publishes a mandate as an ENSv2 subname, then reads it back.
///
///   MANDATE_ID=1 forge script script/07_PublishMandate.s.sol --rpc-url sepolia --broadcast
///
/// @dev The read-back matters more than the write. A publish that reverts is obvious;
///      a publish that succeeds while resolving to nothing is not, and it is exactly
///      the "functional demo, not hard-coded values" bar the ENS track sets.
contract PublishMandate is Base {
    string constant ENS_DEPLOYMENTS = "deployments/ens-sepolia.json";

    function _ens(string memory key) internal view returns (address) {
        return vm.parseAddress(vm.parseJsonString(vm.readFile(ENS_DEPLOYMENTS), string.concat(".", key)));
    }

    function run() external {
        EnvoyageNames names = EnvoyageNames(_ens("envoyageNames"));
        IPermissionedResolver resolver = IPermissionedResolver(_ens("resolver"));
        uint256 mandateId = vm.envOr("MANDATE_ID", uint256(1));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        uint256 tokenId = names.publish(mandateId);
        vm.stopBroadcast();

        uint256 positionId = _readUint("tokenId");
        bytes32 node = names.nodeFor(positionId);
        string memory label = names.labelFor(positionId);

        console2.log("subname   ", string.concat(label, ".envoyage.eth"));
        console2.log("tokenId   ", tokenId);
        console2.log("");
        console2.log("resolved from chain, not from our database:");
        console2.log("  keeper       ", resolver.text(node, "envoyage:keeper"));
        console2.log("  grantor      ", resolver.text(node, "envoyage:grantor"));
        console2.log("  maxFeeBps    ", resolver.text(node, "envoyage:maxFeeBps"));
        console2.log("  feeRecipient ", resolver.text(node, "envoyage:feeRecipient"));
        console2.log("  minInterval  ", resolver.text(node, "envoyage:minInterval"));
        console2.log("  actions      ", resolver.text(node, "envoyage:actions"));
        console2.log("  contract     ", resolver.text(node, "envoyage:contract"));
    }
}
