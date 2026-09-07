// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {
    IPermissionedRegistry,
    IPermissionedResolver,
    RegistryRoles,
    ResolverRoles
} from "./IEnsV2.sol";

/// @notice Read-only view of Envoyage's mandate storage.
///
/// @dev Declared here rather than added to IEnvoyage on purpose. `mandates` is an
///      auto-generated public getter; declaring it on the interface Envoyage
///      implements would require marking the state variable `override`, changing the
///      source of a contract that is already deployed and verified. A mirror must
///      never require edits to the thing it mirrors.
interface IEnvoyageMandates {
    function mandates(uint256 mandateId)
        external
        view
        returns (
            address keeper,
            address grantor,
            uint256 tokenId,
            uint16 maxFeeBps,
            address feeRecipient,
            uint64 expiry,
            uint64 minInterval,
            uint64 lastCall,
            bool compoundAllowed
        );
}

/// @title EnvoyageNames
/// @notice Publishes a mandate as an ENSv2 subname, so its scope can be read by any
///         ENS client without visiting our application.
///
/// @dev THE POINT. Envoyage's claim is that a mandate is an instrument that can be
///      read before it is trusted. Without ENS, "can be read" means "open our URL",
///      which is a claim about our frontend rather than about the instrument. With a
///      subname, anyone resolves `38896.envoyage.eth` in any client and gets the
///      scope. That is what completes the analogy.
///
/// @dev EVERY FUNCTION HERE IS PERMISSIONLESS, and that is deliberate rather than
///      careless: the truth is read out of Envoyage, never taken from the caller.
///      `publish` cannot be made to lie because it never asks the caller what the
///      mandate says. It is the same shape as the contract it mirrors — assemble
///      from trusted state, do not validate caller-supplied claims.
///
/// @dev This contract is SEPARATE from Envoyage on purpose. Envoyage is deployed,
///      verified and immutable; folding ENS into it would have meant redeploying and
///      breaking that. A mirror also cannot affect what it mirrors: nothing here can
///      alter a mandate, move a position, or touch a fee.
contract EnvoyageNames {
    IEnvoyageMandates public immutable ENVOYAGE;
    IPermissionedRegistry public immutable REGISTRY;
    IPermissionedResolver public immutable RESOLVER;

    /// @dev namehash of the parent, e.g. `envoyage.eth`.
    bytes32 public immutable PARENT_NODE;

    /// @dev DNS wire-format encoding of the parent, e.g.
    ///      \x08envoyage\x03eth\x00. Needed because authorizeTextRoles takes a DNS
    ///      name rather than a namehash. Written once in the constructor and never
    ///      again — there is no setter, so it is immutable in fact if not by keyword
    ///      (Solidity has no `immutable bytes`).
    bytes public parentDnsName;

    /// @notice The one text key a keeper may write. Everything else is the owner's.
    string public constant KEEPER_KEY = "envoyage:lastRun";

    /// @dev Roles granted to the subname owner at registration.
    ///      ROLE_CAN_TRANSFER_ADMIN is deliberately EXCLUDED: a mandate is not
    ///      transferable, so neither is the name that represents it. Selling the
    ///      name must not be a way to sell the permission.
    uint256 internal constant OWNER_ROLES = RegistryRoles.ROLE_SET_RESOLVER
        | (RegistryRoles.ROLE_SET_RESOLVER << RegistryRoles.ADMIN_SHIFT) | RegistryRoles.ROLE_SET_SUBREGISTRY
        | (RegistryRoles.ROLE_SET_SUBREGISTRY << RegistryRoles.ADMIN_SHIFT);

    event MandatePublished(uint256 indexed mandateId, uint256 indexed tokenId, string label, bytes32 node);
    event MandateRetired(uint256 indexed mandateId, string label);

    error MandateNotLive();
    error MandateStillLive();
    error LabelTooLong();

    constructor(
        IEnvoyageMandates envoyage,
        IPermissionedRegistry registry,
        IPermissionedResolver resolver,
        bytes32 parentNode,
        bytes memory parentDns
    ) {
        ENVOYAGE = envoyage;
        REGISTRY = registry;
        RESOLVER = resolver;
        PARENT_NODE = parentNode;
        parentDnsName = parentDns;
    }

    /// @notice Publish a live mandate as a subname. Anyone may call this.
    function publish(uint256 mandateId) external returns (uint256 tokenId) {
        (
            address keeper,
            address grantor,
            uint256 positionId,
            uint16 maxFeeBps,
            address feeRecipient,
            uint64 expiry,
            uint64 minInterval,
            ,
            bool compoundAllowed
        ) = ENVOYAGE.mandates(mandateId);

        if (keeper == address(0)) revert MandateNotLive();

        string memory label = _toString(positionId);

        // Owner is the GRANTOR, not the caller. Publishing someone else's mandate
        // hands them the name; it never hands it to whoever paid the gas.
        tokenId = REGISTRY.register(label, grantor, address(0), address(RESOLVER), OWNER_ROLES, expiry);

        bytes32 node = _node(label);

        // The scope, published where anyone can read it.
        RESOLVER.setText(node, "envoyage:keeper", _toHexString(keeper));
        RESOLVER.setText(node, "envoyage:grantor", _toHexString(grantor));
        RESOLVER.setText(node, "envoyage:position", label);
        RESOLVER.setText(node, "envoyage:maxFeeBps", _toString(maxFeeBps));
        RESOLVER.setText(node, "envoyage:feeRecipient", _toHexString(feeRecipient));
        RESOLVER.setText(node, "envoyage:minInterval", _toString(minInterval));
        RESOLVER.setText(node, "envoyage:actions", compoundAllowed ? "compound" : "none");
        RESOLVER.setText(node, "envoyage:contract", _toHexString(address(ENVOYAGE)));

        // The keeper may write ONE key and no other. This is the same division the
        // contract enforces with its gate — the owner sets the scope, the keeper
        // touches only what cannot change it — expressed on a second substrate.
        RESOLVER.authorizeTextRoles(_dnsName(label), KEEPER_KEY, keeper, true);

        emit MandatePublished(mandateId, tokenId, label, node);
    }

    /// @notice Retire a subname whose mandate is gone. Anyone may call this.
    /// @dev Guarded by the chain, not by the caller: this reverts unless the mandate
    ///      really has been revoked, so it cannot be used to take a live name down.
    function retire(uint256 mandateId, uint256 positionId) external {
        (address keeper,,,,,,,,) = ENVOYAGE.mandates(mandateId);
        if (keeper != address(0)) revert MandateStillLive();

        string memory label = _toString(positionId);
        REGISTRY.unregister(uint256(keccak256(bytes(label))));
        emit MandateRetired(mandateId, label);
    }

    /// @notice The name a mandate resolves at, without publishing it.
    function labelFor(uint256 positionId) external pure returns (string memory) {
        return _toString(positionId);
    }

    function nodeFor(uint256 positionId) external view returns (bytes32) {
        return _node(_toString(positionId));
    }

    // ── internal ─────────────────────────────────────────────────────────────

    function _node(string memory label) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(PARENT_NODE, keccak256(bytes(label))));
    }

    /// @dev DNS wire format: one length byte, then the label, then the parent's
    ///      already-encoded bytes (which carry their own terminating zero).
    function _dnsName(string memory label) internal view returns (bytes memory) {
        bytes memory l = bytes(label);
        if (l.length > 63) revert LabelTooLong();
        return abi.encodePacked(uint8(l.length), l, parentDnsName);
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 digits;
        for (uint256 t = v; t != 0; t /= 10) digits++;
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(buf);
    }

    function _toHexString(address a) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 v = uint160(a);
        for (uint256 i = 41; i > 1; i--) {
            out[i] = alphabet[v & 0xf];
            v >>= 4;
        }
        return string(out);
    }
}
