// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";

/// @notice Kontrak PEMBANDING yang sengaja dibuat rentan. HANYA untuk test.
///
/// Ini pola yang merusak Revert V3Utils (Code4rena H-04), V3Vault (H-03), dan
/// Aperture Finance (~$17M): kontrak menerima instruksi dari pemanggil, lalu
/// mencoba memvalidasinya.
///
/// Tanpa pembanding ini, exploit replay suite kami akan tautologis — kami tidak
/// bisa menulis eksploit terhadap fungsi yang tidak ada di Envoyage, jadi
/// "assert selector tidak ada" tidak membuktikan apa pun. Dengan pembanding ini,
/// serangan yang sama BERHASIL di sini dan TIDAK BISA DI-ENCODE di sana.
contract NaiveUtils {
    IPositionManager public immutable POSM;

    constructor(IPositionManager posm) {
        POSM = posm;
    }

    /// @dev Cacatnya ada di sini dan hanya di sini: `actions` datang dari pemanggil.
    ///      Kontrak menganggap siapa pun yang bisa memanggilnya berhak menentukan
    ///      APA yang terjadi — padahal approval ERC-721 hanya menjawab POSISI MANA.
    function execute(uint256, /*tokenId*/ bytes calldata actions) external {
        POSM.modifyLiquidities(actions, block.timestamp);
    }
}
