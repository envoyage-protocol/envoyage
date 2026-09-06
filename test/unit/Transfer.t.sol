// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {Envoyage} from "../../src/Envoyage.sol";
import {IEnvoyage} from "../../src/interfaces/IEnvoyage.sol";

/// @notice Signals failure the way some real ERC-20s do: by returning false rather
///         than reverting. A bare `token.transfer(...)` ignores this entirely.
contract FalseReturningToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false; // never moves anything, never reverts
    }
}

/// @notice Returns no data at all, the way USDT does. This one is legitimate and
///         must be ACCEPTED, otherwise the fix over-corrects and bricks real tokens.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }
}

/// @dev Exposes the internal transfer so the real code path is exercised rather
///      than a reimplementation of it.
contract EnvoyageHarness is Envoyage {
    constructor(IPositionManager p, IPoolManager m, IAllowanceTransfer p2) Envoyage(p, m, p2) {}

    function exposedTransfer(Currency c, address to, uint256 amount) external {
        _transfer(c, to, amount);
    }
}

contract TransferTest is Test {
    EnvoyageHarness harness;
    address recipient = makeAddr("recipient");

    function setUp() public {
        harness = new EnvoyageHarness(IPositionManager(address(1)), IPoolManager(address(2)), IAllowanceTransfer(address(3)));
    }

    /// @notice The regression this guards. Before the return-value check, this call
    ///         SUCCEEDED while moving nothing — the keeper fee would have been
    ///         silently skipped and the mandate would report a clean execution.
    function test_transfer_revertsWhenTokenReturnsFalse() public {
        FalseReturningToken token = new FalseReturningToken();
        token.mint(address(harness), 100e18);

        vm.expectRevert(IEnvoyage.TransferFailed.selector);
        harness.exposedTransfer(Currency.wrap(address(token)), recipient, 1e18);
    }

    /// @notice The other half: a token that returns nothing is valid and must work.
    ///         Without this, "check the return value" naively implemented would
    ///         reject USDT and every token shaped like it.
    function test_transfer_acceptsTokenThatReturnsNothing() public {
        NoReturnToken token = new NoReturnToken();
        token.mint(address(harness), 100e18);

        harness.exposedTransfer(Currency.wrap(address(token)), recipient, 1e18);
        assertEq(token.balanceOf(recipient), 1e18, "no-return token must still transfer");
    }

    /// @notice Native ETH leg: a recipient that rejects ETH must revert, not be
    ///         swallowed. Uses a contract with no receive/fallback.
    function test_transfer_revertsWhenNativeRecipientRejects() public {
        vm.deal(address(harness), 1 ether);
        address rejector = address(new NoReturnToken()); // has no receive()

        vm.expectRevert(IEnvoyage.TransferFailed.selector);
        harness.exposedTransfer(Currency.wrap(address(0)), rejector, 1 ether);
    }
}
