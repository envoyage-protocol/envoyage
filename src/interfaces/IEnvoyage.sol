// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IEnvoyage — instrumen izin ter-scope untuk posisi Uniswap v4
/// @notice Keeper tidak pernah menulis instruksi v4. Ia memanggil entrypoint bertipe
///         dengan dua angka; Envoyage yang menyusun array aksi dan mengunci recipient
///         ke pemilik posisi. Penyalahgunaan bukan diblokir pemeriksaan — ia tidak
///         bisa diekspresikan.
interface IEnvoyage {
    struct Mandate {
        address keeper; // satu-satunya alamat yang boleh memicu
        address grantor; // pemilik saat grant; compound cek ownerOf == grantor
        uint256 tokenId; // satu mandate mengunci satu posisi
        uint16 maxFeeBps; // cap fee, dari fee yang DIPANEN saja
        address feeRecipient; // dikunci saat grant, tidak bisa diubah
        uint64 expiry;
        uint64 minInterval; // cooldown; menutup ekstraksi lewat panggilan berulang
        uint64 lastCall;
        bool compoundAllowed;
    }

    event MandateGranted(uint256 indexed id, address indexed keeper, uint256 indexed tokenId);
    event MandateExecuted(uint256 indexed id, uint256 fee0Paid, uint256 fee1Paid, uint128 liquidityAdded);
    event MandateRevoked(uint256 indexed id);

    // Tidak ada MandateRejected: revert membuang log, jadi event sebelum revert
    // mustahil. Pakai canCompound() sebagai gantinya.

    error NotPositionOwner();
    error MandateAlreadyActive();
    error NotKeeper();
    error MandateExpired();
    error MandateInactive();
    error CompoundNotAllowed();
    error OwnerChanged();
    error CooldownActive();
    error FeeBelowMinimum();
    error FeeCapTooHigh();
    error ZeroLiquidityDelta();
    error ResidualBalance();

    function grant(Mandate calldata m) external returns (uint256 mandateId);
    function revoke(uint256 mandateId) external;
    function compound(uint256 mandateId, uint256 minFee) external;

    /// @return reason 0x0 bila boleh; selain itu selector error yang akan revert
    function canCompound(uint256 mandateId) external view returns (bytes4 reason);

    // ── v0 TIDAK mengimplementasi yang di bawah ini. Sengaja. ─────────────────
    // rebalance membiarkan keeper memilih angka yang berpengaruh (tickLower/Upper),
    // dan itu butuh keluarga batasan baru: lebar range minimum, keharusan mencakup
    // harga saat ini, batas deviasi, frekuensi maksimum. Lihat prd.md §6b.
    //
    // function rebalance(uint256 mandateId, int24 tickLower, int24 tickUpper, uint16 maxSlippageBps) external;
    // function exit(uint256 mandateId) external;
}
