// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal ENSv2 interfaces, transcribed from the VERIFIED Etherscan ABIs of
///         the deployed Sepolia beta contracts — not from the tutorial prose.
///
/// @dev This distinction cost real time. The ETH Registrar and a user registry both
///      expose a function called `register`, and they are not the same function:
///
///        ETHRegistrar.register(string,address,bytes32,address,address,uint64,address,bytes32)
///        UserRegistry.register(string,address,address,address,uint256,uint64)
///
///      The first registers a `.eth` name, is priced in an ERC-20 and is guarded by
///      commit-reveal. The second issues a subname, costs nothing, and has no
///      commit-reveal — the docs note it is "typically unnecessary" for subnames.
///      Reading a signature off the wrong one produces calldata that reverts with no
///      useful message.

/// @dev Registers `.eth` names. Used exactly once, for the parent name.
interface IETHRegistrar {
    function MIN_COMMITMENT_AGE() external view returns (uint64);
    function MAX_COMMITMENT_AGE() external view returns (uint64);
    function MIN_REGISTER_DURATION() external view returns (uint64);

    function isAvailable(string calldata label) external view returns (bool);

    /// @return base and premium, both denominated in `paymentToken`
    function getRegisterPrice(string calldata label, uint64 duration, address paymentToken)
        external
        view
        returns (uint256, uint256);

    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);

    function commit(bytes32 commitment) external;
    function commitmentAt(bytes32 commitment) external view returns (uint64);

    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        address paymentToken,
        bytes32 referrer
    ) external returns (uint256 tokenId);
}

/// @dev Both the canonical ETHRegistry and the UserRegistry we deploy expose this.
interface IPermissionedRegistry {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);

    function unregister(uint256 anyId) external;
    function setSubregistry(uint256 anyId, address registry) external;
    function setResolver(uint256 anyId, address resolver) external;
    function grantRoles(uint256 anyId, uint256 roleBitmap, address account) external returns (bool);

    /// @notice Grants roles across the whole registry rather than one name.
    /// @dev Required here: grantRoles(0, ...) reverts EACRootResourceNotAllowed,
    ///      because id 0 IS the root resource and that function refuses to address
    ///      it. A registrar must hold its role registry-wide, since the names it
    ///      will create do not exist yet to be granted against.
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);

    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice The registry's own id for a label.
    /// @dev Not keccak256(label). The registry packs extra bits into the id, so a
    ///      locally computed hash addresses a different name than the one you meant.
    function findTokenId(string calldata label) external view returns (uint256);
}

interface IPermissionedResolver {
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);
    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);

    function setText(bytes32 node, string calldata key, string calldata value) external;
    function text(bytes32 node, string calldata key) external view returns (string memory);

    /// @notice Restricts ROLE_SET_TEXT to ONE key for ONE account.
    /// @dev The primitive the whole ENS integration rests on. Writing any other key
    ///      reverts with EACUnauthorizedAccountRoles.
    function authorizeTextRoles(bytes calldata toName, string calldata key, address account, bool grant)
        external
        returns (bool);
}

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data)
        external
        returns (address proxy);
}

interface IUserRegistryInit {
    function initialize(address rootAccount, uint256 roleBitmap) external;
}

interface IResolverInit {
    function initialize(address admin, uint256 roleBitmap, bytes[] calldata setters) external;
}

/// @notice Enhanced Access Control role constants, from the ENSv2 documentation.
/// @dev Every role has an admin variant at `role << 128`, except ROLE_CAN_TRANSFER_ADMIN
///      which exists only as an admin role. Bits 0-127 are roles, 128-255 admin.
library RegistryRoles {
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_REGISTER_RESERVED = 1 << 4;
    uint256 internal constant ROLE_SET_PARENT = 1 << 8;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant ROLE_SET_URI = 1 << 36;
    uint256 internal constant ROLE_UPGRADE = 1 << 124;

    uint256 internal constant ADMIN_SHIFT = 128;

    /// @notice Every registry role, plus each one's admin variant.
    ///
    /// @dev NOT `type(uint256).max`. EAC packs roles into nybbles — four bits each,
    ///      holding a holder count of up to 15 — so only every fourth bit is
    ///      meaningful and an all-ones word sets bits that name no role. Passing
    ///      type(uint256).max to initialize() reverts with
    ///      EACInvalidRoleBitmap(115792089237316195423570985008687907853269984665640564039457584007913129639935),
    ///      which prints the value back at you and names nothing else.
    uint256 internal constant ALL_ROLES = ROLE_REGISTRAR | ROLE_REGISTER_RESERVED | ROLE_SET_PARENT
        | ROLE_UNREGISTER | ROLE_RENEW | ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER | ROLE_SET_URI | ROLE_UPGRADE
        | (ROLE_REGISTRAR << ADMIN_SHIFT) | (ROLE_REGISTER_RESERVED << ADMIN_SHIFT)
        | (ROLE_SET_PARENT << ADMIN_SHIFT) | (ROLE_UNREGISTER << ADMIN_SHIFT) | (ROLE_RENEW << ADMIN_SHIFT)
        | (ROLE_SET_SUBREGISTRY << ADMIN_SHIFT) | (ROLE_SET_RESOLVER << ADMIN_SHIFT)
        | (ROLE_SET_URI << ADMIN_SHIFT) | ROLE_CAN_TRANSFER_ADMIN;
}

library ResolverRoles {
    uint256 internal constant ROLE_SET_ADDR = 1 << 0;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_SET_CONTENTHASH = 1 << 8;
    uint256 internal constant ROLE_SET_PUBKEY = 1 << 12;
    uint256 internal constant ROLE_SET_ABI = 1 << 16;
    uint256 internal constant ROLE_SET_INTERFACE = 1 << 20;
    uint256 internal constant ROLE_SET_NAME = 1 << 24;
    uint256 internal constant ROLE_CLEAR = 1 << 32;
    uint256 internal constant ROLE_SET_DATA = 1 << 36;
    uint256 internal constant ROLE_UPGRADE = 1 << 124;

    uint256 internal constant ADMIN_SHIFT = 128;

    /// @dev Roles EnvoyageNames needs on our resolver: write text records, and the
    ///      ADMIN variant so it can delegate a single key onward to the keeper via
    ///      authorizeTextRoles. Without the admin bit it can write records but not
    ///      hand the keeper its one key, which is the part that makes the scope
    ///      enforceable rather than merely published.
    uint256 internal constant PUBLISHER_ROLES = ROLE_SET_TEXT | (ROLE_SET_TEXT << ADMIN_SHIFT);

    uint256 internal constant ALL_ROLES = ROLE_SET_ADDR | ROLE_SET_TEXT | ROLE_SET_CONTENTHASH | ROLE_SET_PUBKEY
        | ROLE_SET_ABI | ROLE_SET_INTERFACE | ROLE_SET_NAME | ROLE_CLEAR | ROLE_SET_DATA | ROLE_UPGRADE
        | (ROLE_SET_ADDR << ADMIN_SHIFT) | (ROLE_SET_TEXT << ADMIN_SHIFT) | (ROLE_SET_CONTENTHASH << ADMIN_SHIFT)
        | (ROLE_SET_PUBKEY << ADMIN_SHIFT) | (ROLE_SET_ABI << ADMIN_SHIFT) | (ROLE_SET_INTERFACE << ADMIN_SHIFT)
        | (ROLE_SET_NAME << ADMIN_SHIFT) | (ROLE_CLEAR << ADMIN_SHIFT) | (ROLE_SET_DATA << ADMIN_SHIFT);
}
