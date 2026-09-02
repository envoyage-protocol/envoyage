# Panduan Implementasi — diverifikasi terhadap sumber

> Ditulis 3 Sept 2026, **sebelum** hacking dimulai. Ini dokumentasi hasil membaca
> `lib/v4-periphery` dan `lib/v4-core`, bukan kode proyek.
> Semua klaim di bawah diverifikasi langsung di source, bukan dari ingatan atau dokumentasi.

---

## 1. TEMUAN UTAMA: PositionManager tidak bisa swap

`src/PositionManager.sol` → `_handleAction` men-dispatch **tepat 15 aksi**:

```
INCREASE_LIQUIDITY, INCREASE_LIQUIDITY_FROM_DELTAS, DECREASE_LIQUIDITY,
MINT_POSITION, MINT_POSITION_FROM_DELTAS, BURN_POSITION,
SETTLE_PAIR, TAKE_PAIR, SETTLE, TAKE, CLOSE_CURRENCY,
CLEAR_OR_TAKE, SWEEP, WRAP, UNWRAP
                                    → selain itu: revert UnsupportedAction(action)
```

`Actions.sol` **memuat** `SWAP_EXACT_IN_SINGLE` (0x06) … `SWAP_EXACT_OUT` (0x09),
tapi PositionManager tidak menanganinya sama sekali. Aksi swap hidup di `V4Router`
(Universal Router).

**Konsekuensi:** rencana "panen → swap → tambah likuiditas" tidak bisa jadi satu plan.
Ini yang membuat leg swap dihapus dari v0. Lihat §6b PRD.

## 2. 🎁 HADIAH: Uniswap sendiri mendeprecate jalur delta karena sandwich

`src/libraries/Actions.sol`, komentar Uniswap sendiri, verbatim:

> `/// @notice DEPRECATED: Vulnerable to sandwich attacks - do not use.`
> `/// @dev The delta-based approach lacks minimum liquidity slippage protection,`
> `/// allowing attackers to manipulate the price and reduce the liquidity received.`
> `/// Use INCREASE_LIQUIDITY instead.`

Berlaku untuk `INCREASE_LIQUIDITY_FROM_DELTAS` (0x04) dan `MINT_POSITION_FROM_DELTAS` (0x05).

**Ini corroborasi independen paling kuat untuk keputusan desain kita**, dan datang
dari Uniswap, bukan dari kita. Pakai di pitch dan di README:

> "Uniswap mendeprecate `INCREASE_LIQUIDITY_FROM_DELTAS` karena tanpa batas slippage
> ia bisa di-sandwich. Kami mengambil pelajaran yang sama satu langkah lebih jauh:
> `compound` tidak melakukan swap sama sekali, jadi tidak ada harga yang bisa dimanipulasi."

**Aturan keras: JANGAN pakai varian FROM_DELTAS.** Selalu `INCREASE_LIQUIDITY` eksplisit
dengan `amount0Max`/`amount1Max`.

## 3. Panen fee = DECREASE dengan liquidity 0

Tidak ada aksi "collect" di v4. Pola resminya, dari
`test/shared/LiquidityOperations.sol::getCollectEncoded`:

```solidity
Plan memory planner = Planner.init();
planner.add(Actions.DECREASE_LIQUIDITY, abi.encode(tokenId, 0, amount0Min, amount1Min, hookData));
return planner.finalizeModifyLiquidityWithClose(config.poolKey);
```

## 4. 🔴 Permit2 WAJIB — terverifikasi di source

`_settlePair`:
```solidity
address caller = msgSender();          // = Envoyage, bukan POSM
_settle(currency0, caller, _getFullDebt(currency0));
```

`_pay`:
```solidity
if (payer == address(this)) {          // address(this) = POSM
    currency.transfer(address(poolManager), amount);
} else {
    permit2.transferFrom(payer, address(poolManager), uint160(amount), ...);
}
```

Karena payer = Envoyage ≠ POSM, pembayaran **selalu lewat Permit2**.

Pola dua langkah, dari `PosmTestSetup::approvePosmCurrency`:

```solidity
// 1. approve Permit2 pada token
IERC20(token).approve(address(permit2), type(uint256).max);
// 2. approve POSM sebagai spender di Permit2
permit2.approve(token, address(posm), type(uint160).max, type(uint48).max);
```

**Kalau terlewat: lolos di unit test bermock, meledak pertama kali di Sepolia.**
Lakukan di constructor Envoyage, dan tulis test yang membuktikan kedua approval ada.

## 5. Konstanta recipient

`BaseActionsRouter::_mapRecipient` menerjemahkan alamat ajaib:

| Nilai | Arti |
|---|---|
| `ActionConstants.MSG_SENDER` = `address(1)` | `msgSender()` — **untuk kita: Envoyage** |
| `ActionConstants.ADDRESS_THIS` = `address(2)` | `address(this)` — **POSM**, bukan Envoyage |
| alamat lain | dipakai apa adanya |

⚠️ **Jebakan:** `ADDRESS_THIS` berarti PositionManager, BUKAN kontrakmu. Untuk
mengirim ke pemilik posisi, **oper alamat pemilik secara literal** — dan itu justru
yang kita inginkan, karena recipient harus konstanta yang keeper tidak bisa sentuh.

Catatan lain: `_clearOrTake` mengirim ke `msgSender()` (Envoyage), bukan ke recipient
pilihan. Jadi dust lewat `CLEAR_OR_TAKE` mendarat di Envoyage dan harus diteruskan.

Juga berguna: `ActionConstants.OPEN_DELTA` = 0 (pakai seluruh delta terbuka),
`CONTRACT_BALANCE` = `1<<255` (pakai seluruh saldo kontrak).

## 6. Arsitektur `compound`: DUA panggilan `modifyLiquidities`, bukan satu

Tidak bisa satu plan, karena `liquidityDelta` untuk INCREASE baru bisa dihitung
**setelah** tahu berapa fee yang dipanen.

```
── Panggilan 1: panen ──────────────────────────────────
   DECREASE_LIQUIDITY(tokenId, 0, min0, min1, "")
   TAKE_PAIR(currency0, currency1, recipient = ENVOYAGE)

── Di dalam Envoyage (bukan aksi v4) ──────────────────
   ukur fee = balanceAfter − balanceBefore   (dua token)
   feeKeeper = fee × maxFeeBps / 10_000      (cap dari mandate)
   transfer feeKeeper → m.feeRecipient       (dikunci saat grant)
   sisa = fee − feeKeeper

   (poolKey, positionInfo) = posm.getPoolAndPositionInfo(tokenId)
   sqrtPriceX96 = StateLibrary.getSlot0(poolManager, poolKey.toId())
   liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
       sqrtPriceX96, tickLower→sqrtA, tickUpper→sqrtB, sisa0, sisa1)

   if (liquidityDelta == 0) revert ZeroLiquidityDelta();   // WAJIB — lihat §8

── Panggilan 2: tanam kembali ─────────────────────────
   INCREASE_LIQUIDITY(tokenId, liquidityDelta, max0, max1, "")
   SETTLE_PAIR(currency0, currency1)        // bayar lewat Permit2 dari Envoyage

── Bersihkan ──────────────────────────────────────────
   transfer sisa saldo Envoyage → PEMILIK POSISI (konstanta)
   assert saldo Envoyage == 0
```

Baris terakhir adalah invariant yang membuat klaim "non-kustodial antar-transaksi"
bisa dibuktikan, bukan sekadar dinyatakan.

## 7. Harness test — jangan tulis sendiri

Warisi dari `lib/v4-periphery/test/shared/`. Ini selisih invariant 8 jam vs 12 jam.

```solidity
contract EnvoyageTest is PosmTestSetup { ... }
```

`PosmTestSetup is Test, Deployers, DeployPermit2, LiquidityOperations` — sudah memberi:

| Helper | Guna |
|---|---|
| `deployFreshManagerAndRouters()` (Deployers) | PoolManager |
| `deployAndApprovePosm(manager)` | POSM + seluruh approval Permit2 |
| `deployPermit2()` | Permit2 di alamat kanonik |
| `seedBalance(addr)` / `seedToken(tok, addr)` | danai aktor |
| `approvePosmFor(addr)` | pola dua-approval untuk satu alamat |
| `Planner` (`init`/`add`/`finalize*`) | encoding aksi |
| `getCollectEncoded` / `getIncreaseEncoded` | plan siap pakai sebagai referensi |
| `PositionConfig` | poolKey + tickLower + tickUpper |

Finalizer yang tersedia: `finalizeModifyLiquidityWithClose`,
`...WithTake(poolKey, recipient)`, `...WithTakePair(poolKey, recipient)`,
`...WithSettlePair`.

## 8. Mode gagal SENYAP di demo

Fee terlalu kecil → `getLiquidityForAmounts` mengembalikan **0** → `INCREASE_LIQUIDITY`
jadi no-op yang **sukses** → `MandateExecuted` tetap terbit → demo terlihat jalan
padahal tidak terjadi apa-apa.

Dua remedi, keduanya wajib:
1. `revert ZeroLiquidityDelta()` kalau delta terhitung nol — gagal keras, terlihat.
2. Pool demo dengan **LP fee statis tinggi (1–10%, bukan 0,3%)**. Beberapa self-trade
   langsung menghasilkan fee yang terlihat di layar.

## 9. Urutan hari Jumat (spike integrasi, 4 jam)

Target satu-satunya: **satu test lokal hijau yang menjalankan `compound` penuh
terhadap `v4-periphery` asli.** Bukan kontrak final — bukti bahwa jalurnya bisa dilalui.

1. `test/unit/Spike.t.sol is PosmTestSetup` — deploy manager + posm + permit2
2. Mint satu posisi, bangkitkan fee dengan swap lewat router bawaan Deployers
3. Panggilan 1 (panen) langsung dari test, tanpa Envoyage — buktikan fee mendarat
4. Hitung `liquidityDelta`, panggilan 2 (increase) — buktikan likuiditas naik
5. **Baru** bungkus jadi kontrak

Kalau langkah 3–4 belum hijau Jumat malam, itu sinyal potong scope hari Sabtu pagi,
bukan hari Minggu.

## 10. Import yang akan dipakai

```solidity
import {PosmTestSetup}      from "v4-periphery/../test/shared/PosmTestSetup.sol";
import {Planner, Plan}      from "v4-periphery/../test/shared/Planner.sol";
import {PositionConfig}     from "v4-periphery/../test/shared/PositionConfig.sol";
import {Actions}            from "v4-periphery/libraries/Actions.sol";
import {ActionConstants}    from "v4-periphery/libraries/ActionConstants.sol";
import {LiquidityAmounts}   from "v4-periphery/libraries/LiquidityAmounts.sol";
import {IPositionManager}   from "v4-periphery/interfaces/IPositionManager.sol";
import {StateLibrary}       from "v4-core/libraries/StateLibrary.sol";
import {TickMath}           from "v4-core/libraries/TickMath.sol";
import {PoolKey}            from "v4-core/types/PoolKey.sol";
import {Currency}           from "v4-core/types/Currency.sol";
import {IAllowanceTransfer} from "permit2/interfaces/IAllowanceTransfer.sol";
```

⚠️ Path `test/shared` ada di luar `src/`, jadi remapping `v4-periphery/=lib/v4-periphery/src/`
tidak menjangkaunya. Tambahkan remapping terpisah saat mulai:
`v4-periphery-test/=lib/v4-periphery/test/`

## 11. Status verifikasi

- [x] ✅ **`PosmTestSetup` compile DAN jalan** dengan konfigurasi repo ini —
      `[PASS] test_harnessMintsRealPosition()`. Enam ranjau setup sudah diledakkan;
      lihat `docs/SETUP-LANDMINES.md`. **Jangan utak-atik foundry.toml/remappings.**
- [ ] Alamat v4 Sepolia (`docs/SEPOLIA.md`) — ambil dari docs.uniswap.org
- [ ] Subgraph MCP: apakah bisa membaca dua subgraph sekaligus dalam satu server
