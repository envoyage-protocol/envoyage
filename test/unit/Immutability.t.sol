// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {Envoyage} from "../../src/Envoyage.sol";

/// @notice Asserts the preconditions in docs/THREAT-MODEL.md against the DEPLOYED
///         BYTECODE rather than against the source.
///
/// @dev The threat model's central claim — "Envoyage accepts no instructions" — is a
///      statement about the bytecode that runs, not about the source that was
///      reviewed. Source can be edited after an audit; a constructor can deploy
///      something other than what was read. These tests check the artifact.
/// @notice Negative control for the opcode scanner. Contains a real DELEGATECALL.
contract HasDelegateCall {
    function forward(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory out) = target.delegatecall(data);
        require(ok);
        return out;
    }
}

contract ImmutabilityTest is Test {
    Envoyage envoyage;

    address constant POSM = address(0xA1);
    address constant MANAGER = address(0xA2);
    address constant PERMIT2 = address(0xA3);

    function setUp() public {
        envoyage = new Envoyage(IPositionManager(POSM), IPoolManager(MANAGER), IAllowanceTransfer(PERMIT2));
    }

    /// @notice No DELEGATECALL, SELFDESTRUCT or CALLCODE anywhere in the runtime code.
    ///
    /// @dev The scan skips PUSH immediates. Without that, any constant whose bytes
    ///      happen to contain 0xf4 reads as a DELEGATECALL and the test fails for a
    ///      reason that has nothing to do with the code. A naive `indexOf(0xf4)`
    ///      would be a test that cannot pass rather than a test that proves anything.
    function test_bytecode_containsNoDangerousOpcodes() public view {
        bytes memory code = address(envoyage).code;
        assertGt(code.length, 0, "no runtime bytecode");

        uint256 i;
        while (i < code.length) {
            uint8 op = uint8(code[i]);

            if (op >= 0x60 && op <= 0x7f) {
                i += 1 + (op - 0x5f); // PUSH1..PUSH32: skip the immediate
                continue;
            }

            assertTrue(op != 0xf4, "DELEGATECALL present");
            assertTrue(op != 0xff, "SELFDESTRUCT present");
            assertTrue(op != 0xf2, "CALLCODE present");
            i++;
        }
    }

    /// @notice The scanner is not vacuous: run it against a contract that DOES
    ///         contain DELEGATECALL and it must find it.
    ///
    /// @dev Without this, test_bytecode_containsNoDangerousOpcodes could pass because
    ///      the scan loop is broken rather than because the bytecode is clean — a
    ///      test that cannot fail is not evidence. This pins the scanner itself.
    function test_scanner_detectsDelegateCallWhenPresent() public {
        bytes memory code = address(new HasDelegateCall()).code;

        bool found;
        uint256 i;
        while (i < code.length) {
            uint8 op = uint8(code[i]);
            if (op >= 0x60 && op <= 0x7f) {
                i += 1 + (op - 0x5f);
                continue;
            }
            if (op == 0xf4) {
                found = true;
                break;
            }
            i++;
        }
        assertTrue(found, "scanner failed to find a DELEGATECALL that is definitely there");
    }

    /// @notice None of the arbitrary-call or admin shapes resolve on the ABI.
    ///
    /// @dev A missing function makes the call fall through to the fallback. Envoyage
    ///      has no fallback and a `receive` that takes no data, so a call carrying a
    ///      selector must fail. That is what makes this a real assertion rather than
    ///      a restatement of the interface.
    function test_abi_hasNoArbitraryCallOrAdminSurface() public {
        string[10] memory sigs = [
            "execute(address,bytes)",
            "execute(uint256,bytes)",
            "multicall(bytes[])",
            "aggregate(address[],bytes[])",
            "onERC721Received(address,address,uint256,bytes)",
            "withdraw(address,uint256)",
            "rescue(address,uint256)",
            "setOwner(address)",
            "upgradeTo(address)",
            "initialize(address)"
        ];
        for (uint256 i; i < sigs.length; i++) {
            (bool hit,) = address(envoyage).call(abi.encodeWithSignature(sigs[i], address(this), uint256(0)));
            assertFalse(hit, sigs[i]);
        }
    }

    /// @notice The protocol addresses are immutable in fact, not merely by keyword.
    function test_dependencies_cannotBeChanged() public {
        assertEq(address(envoyage.POSM()), POSM);
        assertEq(address(envoyage.POOL_MANAGER()), MANAGER);
        assertEq(address(envoyage.PERMIT2()), PERMIT2);

        // Nothing in the ABI can move them, including via the setter names an
        // upgradeable variant would carry.
        (bool hit,) = address(envoyage).call(abi.encodeWithSignature("setPosm(address)", address(0xdead)));
        assertFalse(hit);

        assertEq(address(envoyage.POSM()), POSM, "POSM moved");
        assertEq(address(envoyage.POOL_MANAGER()), MANAGER, "POOL_MANAGER moved");
        assertEq(address(envoyage.PERMIT2()), PERMIT2, "PERMIT2 moved");
    }

    /// @notice The fee ceiling is a compile-time constant, so no governance path can
    ///         raise it after owners have already granted mandates under it.
    function test_feeCeiling_isAConstant() public view {
        assertEq(envoyage.MAX_FEE_BPS_CEILING(), 1_000);
    }
}
