// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";

/// @notice A deliberately vulnerable COMPARATOR contract. Test-only.
///
/// This is the pattern that broke Revert V3Utils (Code4rena H-04), V3Vault (H-03)
/// and Aperture Finance (~$17M): the contract accepts instructions from its caller
/// and then tries to validate them.
///
/// Without this comparator our exploit replay suite would be tautological — no
/// exploit can be written against a function Envoyage does not have, so asserting
/// "the selector is absent" proves nothing. With it, the identical attack SUCCEEDS
/// here and CANNOT BE ENCODED there.
contract NaiveUtils {
    IPositionManager public immutable POSM;

    constructor(IPositionManager posm) {
        POSM = posm;
    }

    /// @dev The flaw is here and only here: `actions` comes from the caller. The
    ///      contract assumes that whoever may call it may also decide WHAT happens
    ///      — but an ERC-721 approval only ever answers WHICH POSITION.
    function execute(
        uint256,
        /*tokenId*/
        bytes calldata actions
    )
        external
    {
        POSM.modifyLiquidities(actions, block.timestamp);
    }
}
