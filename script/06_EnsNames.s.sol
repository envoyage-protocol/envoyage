// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";

import {Base} from "./Base.s.sol";
import {
    IPermissionedRegistry,
    IPermissionedResolver,
    IVerifiableFactory,
    IUserRegistryInit,
    IResolverInit,
    RegistryRoles,
    ResolverRoles
} from "../src/ens/IEnsV2.sol";
import {EnvoyageNames, IEnvoyageMandates} from "../src/ens/EnvoyageNames.sol";

/// @notice Stands up the subname registry for `envoyage.eth` and wires EnvoyageNames
///         into it.
///
///   forge script script/06_EnsNames.s.sol --rpc-url sepolia --broadcast
///
/// @dev Three things happen, in an order that matters:
///        1. deploy a UserRegistry proxy, owned by the deployer
///        2. point `envoyage.eth` at it with setSubregistry
///        3. grant EnvoyageNames the two roles it needs on that registry
///      Reversing 2 and 3 also works, but doing 3 before 1 silently grants roles on
///      a registry nobody resolves through.
contract EnsNames is Base {
    IVerifiableFactory constant FACTORY = IVerifiableFactory(0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef);
    address constant USER_REGISTRY_IMPL = 0x624a25d67B59D587752EbEc8DdeD8827dAe52050;
    IPermissionedRegistry constant ETH_REGISTRY = IPermissionedRegistry(0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2);
    /// @dev The shared implementation. We deploy our OWN proxy of it rather than
    ///      writing into this instance: on the shared one the deployer holds no
    ///      roles for our name, so authorizeTextRoles reverts EACCannotGrantRoles
    ///      with the requested bitmap (16 = ROLE_SET_TEXT) and nothing else.
    address constant RESOLVER_IMPL = 0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e;

    string constant ENS_DEPLOYMENTS = "deployments/ens-sepolia.json";

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        string memory label = vm.envOr("ENS_LABEL", string("envoyage"));

        // The parent must already be ours, or every later step fails in a way that
        // points at the wrong contract.
        uint256 parentId = _findParent(label);
        require(ETH_REGISTRY.ownerOf(parentId) == deployer, "parent name not owned - run 05 first");

        bytes32 parentNode = _namehash(label);
        bytes memory parentDns = _dnsEncode(label);

        vm.startBroadcast(pk);

        // 1. Our own registry. Every role goes to the deployer at root so the name
        //    stays administrable; EnvoyageNames gets only the two it needs.
        address registry = FACTORY.deployProxy(
            USER_REGISTRY_IMPL,
            uint256(keccak256(abi.encodePacked("envoyage:", label))),
            abi.encodeCall(IUserRegistryInit.initialize, (deployer, RegistryRoles.ALL_ROLES))
        );

        // 2. Our own resolver proxy, so we actually hold roles on it.
        bytes[] memory noSetters = new bytes[](0);
        address resolver = FACTORY.deployProxy(
            RESOLVER_IMPL,
            uint256(keccak256(abi.encodePacked("envoyage-resolver:", label))),
            abi.encodeCall(IResolverInit.initialize, (deployer, ResolverRoles.ALL_ROLES, noSetters))
        );

        EnvoyageNames names = new EnvoyageNames(
            IEnvoyageMandates(_readAddr("envoyage")),
            IPermissionedRegistry(registry),
            IPermissionedResolver(resolver),
            parentNode,
            parentDns
        );

        // 3. Resolution: envoyage.eth -> our registry.
        ETH_REGISTRY.setSubregistry(parentId, registry);

        // 4. EnvoyageNames may register and unregister subnames, and nothing else.
        //    Notably NOT ROLE_SET_PARENT or ROLE_UPGRADE: a mirror should not be able
        //    to restructure the namespace it writes into.
        IPermissionedRegistry(registry).grantRootRoles(
            RegistryRoles.ROLE_REGISTRAR | RegistryRoles.ROLE_UNREGISTER, address(names)
        );

        // 5. And write text records on our resolver, including the admin bit so it
        //    can delegate one key onward to each keeper.
        IPermissionedResolver(resolver).grantRootRoles(ResolverRoles.PUBLISHER_ROLES, address(names));

        vm.stopBroadcast();

        string memory o = "ens";
        vm.serializeString(o, "label", label);
        vm.serializeString(o, "parentNode", vm.toString(parentNode));
        vm.serializeString(o, "parentTokenId", vm.toString(parentId));
        vm.serializeString(o, "registry", vm.toString(registry));
        vm.serializeString(o, "resolver", vm.toString(resolver));
        string memory out = vm.serializeString(o, "envoyageNames", vm.toString(address(names)));
        vm.writeJson(out, ENS_DEPLOYMENTS);

        console2.log("parent        ", label);
        console2.log("parent tokenId", parentId);
        console2.log("registry      ", registry);
        console2.log("resolver      ", resolver);
        console2.log("EnvoyageNames ", address(names));
        console2.log("next: forge script script/07_PublishMandate.s.sol --rpc-url sepolia --broadcast");
    }

    /// @dev MUST come from the registry, not from keccak256(label). They differ:
    ///      keccak256("envoyage") is 0x8c8b… while findTokenId returns
    ///      0x16651e…0000 — the registry packs generation/version bits into the low
    ///      end of the id. Computing it locally produces a plausible-looking number
    ///      that addresses nothing, and setSubregistry would then revert or, worse,
    ///      write against an id nobody resolves through.
    function _findParent(string memory label) internal view returns (uint256) {
        return ETH_REGISTRY.findTokenId(label);
    }

    /// @dev namehash(label.eth), per ENSIP-1.
    function _namehash(string memory label) internal pure returns (bytes32) {
        bytes32 ethNode = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")));
        return keccak256(abi.encodePacked(ethNode, keccak256(bytes(label))));
    }

    /// @dev DNS wire format: \x08envoyage\x03eth\x00
    function _dnsEncode(string memory label) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(bytes(label).length), bytes(label), uint8(3), "eth", uint8(0));
    }
}
