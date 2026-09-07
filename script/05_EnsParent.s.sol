// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";

import {Base} from "./Base.s.sol";
import {IETHRegistrar} from "../src/ens/IEnsV2.sol";

/// @notice Registers the parent `.eth` name on the ENSv2 Sepolia beta.
///
/// Two transactions, at least 60 seconds apart — the ETH Registrar uses commit-reveal
/// to stop anyone front-running the registration by reading your pending name out of
/// the mempool. Run them as separate invocations:
///
///   forge script script/05_EnsParent.s.sol --sig "commit()"   --rpc-url sepolia --broadcast
///   (wait 60 seconds)
///   forge script script/05_EnsParent.s.sol --sig "register()" --rpc-url sepolia --broadcast
///
/// @dev PAID IN AN ERC-20, NOT ETH. The registrar's price oracle accepts test USDC on
///      Sepolia; passing address(0) or an EOA as the payment token reverts with
///      PaymentTokenNotSupported (0x02e2ae9e), which names the token and nothing else,
///      so it is easy to misread as an unrelated failure.
contract EnsParent is Base {
    IETHRegistrar constant REGISTRAR = IETHRegistrar(0xa88553F454b77203B0D036A05c894d555EAAa2Cc);
    address constant ETH_REGISTRY = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;
    address constant RESOLVER = 0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e;

    /// @dev Circle's test USDC on Sepolia, 6 decimals. The only payment token the
    ///      oracle at 0x8914b662…8987 accepts today — confirmed with isPaymentToken.
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function _label() internal view returns (string memory) {
        return vm.envOr("ENS_LABEL", string("envoyage"));
    }

    function _duration() internal view returns (uint64) {
        return uint64(vm.envOr("ENS_DURATION", uint256(365 days)));
    }

    /// @dev Derived from a passphrase rather than randomly generated, because the
    ///      SAME secret must be reproduced by the second transaction minutes later,
    ///      in a different process. A random secret would make the commitment
    ///      unopenable and the fee unrecoverable until it expired.
    function _secret() internal view returns (bytes32) {
        return keccak256(abi.encodePacked("envoyage:", vm.envOr("ENS_SECRET", string("ethonline-2026"))));
    }

    function commit() external {
        string memory label = _label();
        require(REGISTRAR.isAvailable(label), "name is taken");

        address owner = vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        bytes32 c = REGISTRAR.makeCommitment(
            label, owner, _secret(), address(0), RESOLVER, _duration(), bytes32(0)
        );

        (uint256 base, uint256 premium) = REGISTRAR.getRegisterPrice(label, _duration(), USDC);
        console2.log("label      ", label);
        console2.log("price USDC ", (base + premium) / 1e4);
        console2.log("  (hundredths of a USDC; 6 decimals)");
        console2.log("your USDC  ", IERC20Minimal(USDC).balanceOf(owner) / 1e4);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        REGISTRAR.commit(c);
        vm.stopBroadcast();

        console2.log("committed. wait", REGISTRAR.MIN_COMMITMENT_AGE(), "seconds, then run --sig register()");
        console2.log("commitment expires after", REGISTRAR.MAX_COMMITMENT_AGE(), "seconds");
    }

    function register() external {
        string memory label = _label();
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.addr(pk);
        uint64 duration = _duration();

        bytes32 c = REGISTRAR.makeCommitment(label, owner, _secret(), address(0), RESOLVER, duration, bytes32(0));
        uint64 at = REGISTRAR.commitmentAt(c);
        require(at != 0, "no commitment: run --sig commit() first, with the same ENS_LABEL and ENS_SECRET");

        uint256 age = block.timestamp - at;
        require(age >= REGISTRAR.MIN_COMMITMENT_AGE(), "too early - wait for MIN_COMMITMENT_AGE");
        require(age <= REGISTRAR.MAX_COMMITMENT_AGE(), "commitment expired - commit again");

        (uint256 base, uint256 premium) = REGISTRAR.getRegisterPrice(label, duration, USDC);
        uint256 price = base + premium;
        require(IERC20Minimal(USDC).balanceOf(owner) >= price, "not enough test USDC - faucet.circle.com");

        vm.startBroadcast(pk);
        // Approve exactly the price, not type(uint256).max. This registrar is beta
        // software on a testnet; an unbounded approval to it buys nothing.
        IERC20Minimal(USDC).approve(address(REGISTRAR), price);
        uint256 tokenId =
            REGISTRAR.register(label, owner, _secret(), address(0), RESOLVER, duration, USDC, bytes32(0));
        vm.stopBroadcast();

        console2.log("registered", label);
        console2.log("tokenId   ", tokenId);
        console2.log("owner     ", owner);
        console2.log("next: forge script script/06_EnsNames.s.sol --rpc-url sepolia --broadcast");
    }

    /// @notice Read-only preflight. Costs nothing and answers the questions that
    ///         otherwise surface as an opaque revert mid-broadcast.
    function check() external view {
        string memory label = _label();
        address owner = vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        (uint256 base, uint256 premium) = REGISTRAR.getRegisterPrice(label, _duration(), USDC);

        console2.log("label          ", label);
        console2.log("available      ", REGISTRAR.isAvailable(label));
        console2.log("price (6dp)    ", base + premium);
        console2.log("your USDC (6dp)", IERC20Minimal(USDC).balanceOf(owner));
        console2.log("your ETH (wei) ", owner.balance);
        console2.log("min duration   ", REGISTRAR.MIN_REGISTER_DURATION());
    }
}
