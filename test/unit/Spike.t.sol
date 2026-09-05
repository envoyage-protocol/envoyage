// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {IERC20} from "openzeppelin-contracts/contracts/interfaces/IERC20.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";

import {Actions} from "v4-periphery/libraries/Actions.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {PosmTestSetup} from "v4-periphery-test/shared/PosmTestSetup.sol";
import {PositionConfig} from "v4-periphery-test/shared/PositionConfig.sol";
import {Planner, Plan} from "v4-periphery-test/shared/Planner.sol";

/// @notice SPIKE INTEGRASI — gerbang Blok A.
/// Tujuan tunggal: membuktikan alur `compound` bisa dilalui terhadap v4-periphery
/// ASLI, sebelum menulis kontrak Envoyage. Belum ada Envoyage di sini.
///
/// Membuktikan tiga hal yang seluruh desain bergantung padanya:
///  1. panen fee = DECREASE_LIQUIDITY dengan liquidity 0 (tidak ada aksi "collect")
///  2. fee bisa didaratkan ke alamat pihak ketiga lewat TAKE_PAIR
///  3. likuiditas bisa ditambah kembali TANPA swap, dan naik secara terukur
contract SpikeTest is PosmTestSetup {
    using StateLibrary for *;

    PositionConfig cfg;
    uint256 tokenId;

    /// @dev fee 1% (bukan 0,3%) supaya fee terlihat dari sedikit swap.
    /// Fee kecil -> getLiquidityForAmounts mengembalikan 0 -> INCREASE jadi no-op
    /// yang SUKSES dan demo terlihat jalan padahal tidak terjadi apa-apa.
    uint24 constant DEMO_FEE = 10_000;
    int24 constant DEMO_TICK_SPACING = 200;

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        deployPosmHookSavesDelta();

        key = PoolKey(currency0, currency1, DEMO_FEE, DEMO_TICK_SPACING, IHooks(hook));
        manager.initialize(key, SQRT_PRICE_1_1);

        deployAndApprovePosm(manager);

        cfg = PositionConfig({poolKey: key, tickLower: -DEMO_TICK_SPACING * 10, tickUpper: DEMO_TICK_SPACING * 10});
        tokenId = lpm.nextTokenId();
        mint(cfg, 100e18, address(this), "");
    }

    function test_spike_compoundPathIsTraversable() public {
        // ── bangkitkan fee: swap bolak-balik terhadap pool sendiri ──────────
        _generateFees();

        uint128 liqBefore = manager.getPositionLiquidity(key.toId(), _positionKey());
        assertGt(liqBefore, 0, "posisi harus punya likuiditas");

        // ── LANGKAH 1: panen. Tidak ada aksi "collect" di v4 — decrease(0). ──
        address harvester = makeAddr("harvester"); // berdiri sebagai Envoyage
        uint256 h0Before = IERC20(Currency.unwrap(currency0)).balanceOf(harvester);
        uint256 h1Before = IERC20(Currency.unwrap(currency1)).balanceOf(harvester);

        Plan memory p = Planner.init();
        p.add(Actions.DECREASE_LIQUIDITY, abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes("")));
        bytes memory harvestCalls = p.finalizeModifyLiquidityWithTakePair(key, harvester);
        lpm.modifyLiquidities(harvestCalls, block.timestamp + 60);

        uint256 fee0 = IERC20(Currency.unwrap(currency0)).balanceOf(harvester) - h0Before;
        uint256 fee1 = IERC20(Currency.unwrap(currency1)).balanceOf(harvester) - h1Before;

        assertGt(fee0 + fee1, 0, "fee harus mendarat di pihak ketiga");
        emit log_named_uint("fee0 dipanen", fee0);
        emit log_named_uint("fee1 dipanen", fee1);

        // likuiditas TIDAK berubah oleh decrease(0) — ini yang membuatnya aman
        assertEq(manager.getPositionLiquidity(key.toId(), _positionKey()), liqBefore, "decrease(0) tidak mengubah likuiditas");

        // ── LANGKAH 2: hitung delta TANPA swap ──────────────────────────────
        (uint160 sqrtPriceX96,,,) = manager.getSlot0(key.toId());
        uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(cfg.tickLower),
            TickMath.getSqrtPriceAtTick(cfg.tickUpper),
            fee0,
            fee1
        );

        // Gerbang yang mencegah "sukses palsu" di demo.
        assertGt(liquidityDelta, 0, "ZeroLiquidityDelta: fee terlalu kecil, INCREASE akan jadi no-op yang SUKSES");
        emit log_named_uint("liquidityDelta", liquidityDelta);

        // ── LANGKAH 3: tanam kembali. ───────────────────────────────────────
        //
        // TEMUAN INTI: INCREASE_LIQUIDITY menolak pemanggil yang tidak ter-approve
        // pada ERC-721 (`NotApproved`). Jadi approval HARUS ada di suatu tempat —
        // dan inilah justifikasi arsitektur Envoyage: pemilik meng-approve posisi
        // ke KONTRAK Envoyage, bukan ke keeper. Keeper memicu; Envoyage yang punya
        // wewenang, dan wewenang itu tidak bisa dipakai untuk apa pun selain aksi
        // yang disusun Envoyage sendiri.
        IERC721(address(lpm)).approve(harvester, tokenId);

        vm.startPrank(harvester);
        approvePosm(); // dua langkah: token->Permit2, lalu Permit2->POSM
        Plan memory p2 = Planner.init();
        p2.add(
            Actions.INCREASE_LIQUIDITY,
            abi.encode(tokenId, uint256(liquidityDelta), uint128(fee0), uint128(fee1), bytes(""))
        );
        bytes memory increaseCalls = p2.finalizeModifyLiquidityWithSettlePair(key);
        lpm.modifyLiquidities(increaseCalls, block.timestamp + 60);
        vm.stopPrank();

        uint128 liqAfter = manager.getPositionLiquidity(key.toId(), _positionKey());
        assertGt(liqAfter, liqBefore, "likuiditas harus NAIK, tanpa swap sama sekali");
        emit log_named_uint("likuiditas sebelum", liqBefore);
        emit log_named_uint("likuiditas sesudah", liqAfter);
    }

    /// @dev bukti negatif: PositionManager menolak aksi swap.
    function test_spike_positionManagerRejectsSwapAction() public {
        Plan memory p = Planner.init();
        p.add(Actions.SWAP_EXACT_IN_SINGLE, abi.encode(uint256(0)));
        bytes memory calls = p.encode();
        vm.expectRevert(); // UnsupportedAction(0x06)
        lpm.modifyLiquidities(calls, block.timestamp + 60);
    }

    function _positionKey() internal view returns (bytes32) {
        return keccak256(abi.encodePacked(address(lpm), cfg.tickLower, cfg.tickUpper, bytes32(tokenId)));
    }

    function _generateFees() internal {
        for (uint256 i; i < 6; i++) {
            swap(key, true, -1e18, "");
            swap(key, false, -1e18, "");
        }
    }
}
