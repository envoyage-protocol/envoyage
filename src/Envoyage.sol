// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";

import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {PositionInfo, PositionInfoLibrary} from "v4-periphery/libraries/PositionInfoLibrary.sol";
import {Actions} from "v4-periphery/libraries/Actions.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";

import {IEnvoyage} from "./interfaces/IEnvoyage.sol";

/// @title Envoyage
/// @notice Envoyage menghapus wewenang atas TUJUAN. Ia tidak menghapus wewenang
///         atas EKSEKUSI.
///
/// @dev IMMUTABLE BY CONSTRUCTION — properti keamanan, bukan kelalaian:
///      tanpa proxy, tanpa owner/admin, tanpa fungsi upgrade, tanpa delegatecall,
///      tanpa selfdestruct, dan TIDAK ADA fungsi yang menerima `bytes calldata`
///      atau `address target` dari pemanggil. Kalau salah satu dilanggar, klaim
///      "Envoyage tidak menerima instruksi" menjadi SALAH, bukan sekadar lemah:
///      satu kontrak yang mengagregasi approval banyak pemilik adalah honeypot
///      yang lebih menarik daripada approval yang tersebar.
contract Envoyage is IEnvoyage {
    using StateLibrary for IPoolManager;
    using PositionInfoLibrary for PositionInfo;

    IPositionManager public immutable POSM;
    IPoolManager public immutable POOL_MANAGER;
    IAllowanceTransfer public immutable PERMIT2;

    /// @dev cap keras: keeper tidak boleh mengambil lebih dari 10% fee yang dipanen,
    ///      berapa pun yang diminta pemilik saat grant.
    uint16 public constant MAX_FEE_BPS_CEILING = 1_000;

    mapping(uint256 mandateId => Mandate) public mandates;

    /// @notice Satu tokenId hanya boleh punya SATU mandate hidup.
    /// @dev Tidak bisa ditegakkan dari struct saja — Mandate di-key oleh mandateId,
    ///      jadi revoke-lalu-grant menghasilkan id kedua untuk tokenId yang sama dan
    ///      tidak ada apa pun untuk diperiksa. Mapping ini adalah penegaknya.
    ///      0 berarti tidak ada; karena itu mandateId mulai dari 1.
    mapping(uint256 tokenId => uint256 mandateId) public activeMandate;

    uint256 public nextMandateId = 1;

    uint256 private _locked = 1;

    modifier nonReentrant() {
        require(_locked == 1);
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(IPositionManager posm, IPoolManager poolManager, IAllowanceTransfer permit2) {
        POSM = posm;
        POOL_MANAGER = poolManager;
        PERMIT2 = permit2;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Grant / revoke
    // ─────────────────────────────────────────────────────────────────────────

    function grant(Mandate calldata m) external returns (uint256 mandateId) {
        if (IERC721(address(POSM)).ownerOf(m.tokenId) != msg.sender) revert NotPositionOwner();
        if (activeMandate[m.tokenId] != 0) revert MandateAlreadyActive();
        if (m.maxFeeBps > MAX_FEE_BPS_CEILING) revert FeeCapTooHigh();

        mandateId = nextMandateId++;

        Mandate storage s = mandates[mandateId];
        s.keeper = m.keeper;
        s.grantor = msg.sender; // BUKAN m.grantor — pemberi grant tidak bisa memalsukan ini
        s.tokenId = m.tokenId;
        s.maxFeeBps = m.maxFeeBps;
        s.feeRecipient = m.feeRecipient; // dikunci selamanya di sini
        s.expiry = m.expiry;
        s.minInterval = m.minInterval;
        s.lastCall = 0;
        s.compoundAllowed = m.compoundAllowed;

        activeMandate[m.tokenId] = mandateId;
        emit MandateGranted(mandateId, m.keeper, m.tokenId);
    }

    /// @notice Seketika, tanpa jeda. Keeper yang sedang berjalan akan revert.
    function revoke(uint256 mandateId) external {
        Mandate storage m = mandates[mandateId];
        if (m.grantor != msg.sender) revert NotPositionOwner();

        delete activeMandate[m.tokenId];
        delete mandates[mandateId];
        emit MandateRevoked(mandateId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Compound
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Dua angka. Tidak ada calldata, tidak ada tujuan, tidak ada rute.
    function compound(uint256 mandateId, uint256 minFee) external nonReentrant {
        Mandate storage m = mandates[mandateId];
        _gate(m);

        m.lastCall = uint64(block.timestamp);

        (PoolKey memory key, PositionInfo info) = POSM.getPoolAndPositionInfo(m.tokenId);

        // ── 1. Panen. Tidak ada aksi "collect" di v4 — decrease dengan 0. ────
        uint256 b0 = _balance(key.currency0);
        uint256 b1 = _balance(key.currency1);
        _harvest(m.tokenId, key);
        uint256 fee0 = _balance(key.currency0) - b0;
        uint256 fee1 = _balance(key.currency1) - b1;

        if (fee0 + fee1 < minFee) revert FeeBelowMinimum();

        // ── 2. Fee keeper, dari fee yang dipanen saja, ke recipient terkunci. ─
        uint256 keeperFee0 = (fee0 * m.maxFeeBps) / 10_000;
        uint256 keeperFee1 = (fee1 * m.maxFeeBps) / 10_000;
        if (keeperFee0 > 0) _transfer(key.currency0, m.feeRecipient, keeperFee0);
        if (keeperFee1 > 0) _transfer(key.currency1, m.feeRecipient, keeperFee1);

        uint256 add0 = fee0 - keeperFee0;
        uint256 add1 = fee1 - keeperFee1;

        // ── 3. Hitung delta TANPA swap. Tidak ada harga untuk dimanipulasi. ──
        (uint160 sqrtPriceX96,,,) = POOL_MANAGER.getSlot0(key.toId());
        uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(info.tickLower()),
            TickMath.getSqrtPriceAtTick(info.tickUpper()),
            add0,
            add1
        );
        // Tanpa gerbang ini, INCREASE jadi no-op yang SUKSES: event tetap terbit
        // dan demo terlihat jalan padahal tidak terjadi apa-apa.
        if (liquidityDelta == 0) revert ZeroLiquidityDelta();

        // ── 4. Tanam kembali. ────────────────────────────────────────────────
        _approvePermit2(key.currency0);
        _approvePermit2(key.currency1);
        _increase(m.tokenId, key, liquidityDelta, add0, add1);

        // ── 5. Dust ke PEMILIK. Konstanta, bukan parameter. ──────────────────
        address owner = IERC721(address(POSM)).ownerOf(m.tokenId);
        _sweep(key.currency0, owner);
        _sweep(key.currency1, owner);

        // Non-kustodial ANTAR-transaksi: saldo hanya ada di dalam satu tx.
        if (_balance(key.currency0) != 0 || _balance(key.currency1) != 0) revert ResidualBalance();

        emit MandateExecuted(mandateId, keeperFee0, keeperFee1, liquidityDelta);
    }

    function canCompound(uint256 mandateId) external view returns (bytes4) {
        Mandate storage m = mandates[mandateId];
        if (m.keeper == address(0)) return MandateInactive.selector;
        if (!m.compoundAllowed) return CompoundNotAllowed.selector;
        if (block.timestamp > m.expiry) return MandateExpired.selector;
        if (m.lastCall != 0 && block.timestamp < uint256(m.lastCall) + m.minInterval) return CooldownActive.selector;
        if (IERC721(address(POSM)).ownerOf(m.tokenId) != m.grantor) return OwnerChanged.selector;
        return bytes4(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _gate(Mandate storage m) internal view {
        if (m.keeper == address(0)) revert MandateInactive();
        if (msg.sender != m.keeper) revert NotKeeper();
        if (!m.compoundAllowed) revert CompoundNotAllowed();
        if (block.timestamp > m.expiry) revert MandateExpired();
        // lastCall == 0 berarti belum pernah dipanggil; mandate baru langsung boleh.
        // Tanpa pengecualian ini, `block.timestamp < 0 + minInterval` bernilai benar
        // pada chain ber-timestamp kecil (mis. anvil/Foundry mulai dari 1) dan
        // mandate baru tidak akan pernah bisa dipakai. Di mainnet bug ini tidak
        // terlihat karena timestamp besar — justru itu sebabnya ia berbahaya.
        if (m.lastCall != 0 && block.timestamp < uint256(m.lastCall) + m.minInterval) revert CooldownActive();
        // Tanpa ini, mandate bertahan setelah posisi dijual: penjual mempertahankan
        // hak compound atas posisi pembeli. Itu kelas Code4rena H-04.
        if (IERC721(address(POSM)).ownerOf(m.tokenId) != m.grantor) revert OwnerChanged();
    }

    function _harvest(uint256 tokenId, PoolKey memory key) internal {
        bytes memory actions = abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        // recipient = address(this) SEBAGAI LITERAL, bukan ActionConstants.ADDRESS_THIS
        // (konstanta itu berarti PositionManager, bukan kontrak ini).
        params[1] = abi.encode(key.currency0, key.currency1, address(this));
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    function _increase(uint256 tokenId, PoolKey memory key, uint128 liquidityDelta, uint256 max0, uint256 max1)
        internal
    {
        bytes memory actions = abi.encodePacked(uint8(Actions.INCREASE_LIQUIDITY), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(liquidityDelta), uint128(max0), uint128(max1), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    /// @dev POSM membayar lewat Permit2 ketika payer bukan POSM sendiri, dan di sini
    ///      payer adalah Envoyage. Tanpa dua approval ini: lolos di unit test bermock,
    ///      meledak pertama kali di jaringan sungguhan.
    function _approvePermit2(Currency c) internal {
        address token = Currency.unwrap(c);
        if (token == address(0)) return;
        if (IERC20Minimal(token).allowance(address(this), address(PERMIT2)) == 0) {
            IERC20Minimal(token).approve(address(PERMIT2), type(uint256).max);
        }
        (uint160 amount,,) = PERMIT2.allowance(address(this), token, address(POSM));
        if (amount == 0) {
            PERMIT2.approve(token, address(POSM), type(uint160).max, type(uint48).max);
        }
    }

    function _balance(Currency c) internal view returns (uint256) {
        address token = Currency.unwrap(c);
        return token == address(0) ? address(this).balance : IERC20Minimal(token).balanceOf(address(this));
    }

    function _transfer(Currency c, address to, uint256 amount) internal {
        address token = Currency.unwrap(c);
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok);
        } else {
            IERC20Minimal(token).transfer(to, amount);
        }
    }

    function _sweep(Currency c, address to) internal {
        uint256 bal = _balance(c);
        if (bal > 0) _transfer(c, to, bal);
    }

    receive() external payable {}
}
