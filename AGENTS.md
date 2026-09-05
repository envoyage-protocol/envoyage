# AGENTS.md — Envoyage

> **Revisi 4 Sept 2026.** Enam instruksi di draf awal bertabrakan dengan temuan yang
> sudah diverifikasi terhadap source `v4-periphery`. Yang berubah ditandai 🔴 beserta
> alasannya. Baca `docs/SETUP-LANDMINES.md` dan `docs/BUILD-GUIDE.md` sebelum mulai.

## Context

Envoyage adalah instrumen izin ter-scope untuk keeper posisi Uniswap v4. Hari ini,
mendelegasikan posisi berarti `approve` atau `setApprovalForAll` — keduanya membatasi
*posisi mana*, tidak ada yang membatasi *aksi apa*.

ETHGlobal Online 2026. Solo. ~38 jam. Sepolia (11155111). MIT.

**Arsitektur inti — menyusun, bukan memvalidasi.** Keeper tidak pernah menulis
instruksi v4. Keeper memanggil `compound(mandateId, minFee)` — dua angka. Envoyage
yang menyusun array aksi v4 dan mengunci recipient ke pemilik posisi.

Penyalahgunaan bukan diblokir pemeriksaan. Ia tidak bisa diekspresikan.

🔴 **Headline tesis (direvisi):**
> **Envoyage menghapus wewenang atas tujuan. Ia tidak menghapus wewenang atas eksekusi.**

Versi lama ("penyalahgunaan tidak bisa diekspresikan") patah oleh satu pertanyaan juri
tentang swap. Versi ini benar secara harfiah dan tetap merupakan kontribusi nyata.

---

## HARD RULES — jangan dilanggar, bahkan bila terasa lebih fleksibel

1. **Jangan pernah menambah fungsi yang menerima `bytes calldata` dari keeper.**
   Bukan untuk "extensibility", bukan untuk "aksi masa depan".
2. **Jangan pernah menjadikan alamat recipient sebagai parameter.** Recipient
   diturunkan di dalam kontrak dari pemilik posisi, atau dibaca dari struct mandate
   di mana ia dikunci saat grant.
3. **Jangan pernah decode-lalu-validasi input keeper.** Kalau kamu mulai menulis
   validator untuk array aksi, berhenti — itu persis kelas kegagalan yang merusak
   Revert V3Utils (Code4rena H-04), V3Vault (H-03), dan Aperture (~$17M).
4. **Jangan melebarkan permukaan entrypoint tanpa diminta.** v0 hanya mengirim
   `compound`. `rebalance` dan `exit` adalah interface tanpa implementasi.

5. 🔴 **JANGAN memancarkan event sebelum revert. Itu mustahil.**
   *(Menggantikan aturan lama "Emit `MandateRejected` BEFORE reverting.")*
   Revert membuang **seluruh** perubahan state, termasuk log yang sudah dipancarkan.
   Aturan lama membantah dirinya sendiri. Kode akan terlihat benar, menghasilkan nol
   event, dan `vm.expectEmit` + `vm.expectRevert` **tidak** menangkapnya.
   **Sebagai gantinya:** `MandateRejected` dihapus dari ABI. Sediakan
   `canCompound(uint256 mandateId) external view returns (bytes4 reason)` — `0x0`
   berarti boleh. UI memakai view ini. Reputasi keeper = eksekusi + umur + status.
   Nyatakan di README bahwa penolakan on-chain tidak terindeks, dan kenapa.

6. **Jangan pernah menebak alamat kontrak ter-deploy.** Uniswap memperingatkan alamat
   tidak lagi sama lintas chain. 🔴 Sudah selesai: enam alamat Sepolia terverifikasi
   dengan `cast code` di `docs/SEPOLIA.md`. **Pakai itu, jangan cari lagi.**
7. **Commit kecil dan sering, pesan bermakna.** ETHGlobal memeriksa version control;
   satu commit besar bisa mendiskualifikasi. Jangan pernah squash.
8. **Semua file spec/prompt/perencanaan wajib di-commit** — juri ingin melihat
   bagaimana AI diarahkan. File ini termasuk.

9. 🔴 **JANGAN menambahkan swap ke `compound`.** Dua alasan independen:
   - **Mustahil:** `_handleAction` men-dispatch tepat 15 aksi, nol di antaranya swap.
     `SWAP_EXACT_IN_SINGLE` (0x06) ada di `Actions.sol` tapi jatuh ke
     `revert UnsupportedAction`. Aksi swap hidup di `V4Router`, bukan PositionManager.
   - **Tidak aman:** keeper adalah *designated caller* — dia memilih blok, jadi dia
     bisa sandwich `compound`-nya sendiri. Recipient tetap pemilik sepanjang serangan.
10. 🔴 **JANGAN pakai `INCREASE_LIQUIDITY_FROM_DELTAS` (0x04) atau
    `MINT_POSITION_FROM_DELTAS` (0x05).** Komentar Uniswap sendiri:
    *"DEPRECATED: Vulnerable to sandwich attacks - do not use."* Selalu
    `INCREASE_LIQUIDITY` eksplisit dengan `amount0Max`/`amount1Max`.
11. 🔴 **Envoyage IMMUTABLE.** Tanpa proxy, tanpa admin/owner, tanpa fungsi upgrade,
    tanpa `delegatecall`, tanpa `selfdestruct`. Alamat POSM/Permit2 `immutable` di
    constructor. Kalau ada admin, kalimat pitch inti bukan lemah — **salah**.
12. 🔴 **Jangan sentuh `foundry.toml` atau `remappings.txt`.** Enam ranjau setup sudah
    diledakkan dan harness terbukti hijau. Lihat `docs/SETUP-LANDMINES.md`.

Kalau sebuah aturan menghalangi kebutuhan, **katakan dan berhenti**. Jangan diakali.

---

## ~~Task 1 — Repo setup~~ ✅ SELESAI (3 Sept)

🔴 **Jangan dijalankan ulang.** Instruksi lama "install v4-core and v4-periphery" adalah
ranjau #3: v4-core standalone tidak punya `src/types/PoolOperation.sol` dan tidak
kompatibel. Repo memakai v4-core/permit2/OZ/solmate yang **dibawa** v4-periphery.

Terbukti: clone segar → `./script/setup.sh` → `forge build` →
`[PASS] test_harnessMintsRealPosition()`.

---

## Task 2 — Fixture Sepolia — SEPARUH SELESAI

### ✅ Langkah 1 selesai
Enam alamat di `docs/SEPOLIA.md`, diverifikasi `cast code`, sumber
`developers.uniswap.org/docs/protocols/v4/deployments`. StateView on-chain 3531 bytes
= hasil kompilasi lokal, jadi versi yang dipin cocok dengan yang ter-deploy.
RPC: `https://ethereum-sepolia-rpc.publicnode.com` (`rpc.sepolia.org` **404**).

### ☐ Langkah 2–3 belum
```
Tulis skrip Foundry yang: deploy dua ERC20 test, initialize pool v4,
mint posisi via PositionManager, cetak tokenId. Jalankan ke Sepolia.
Laporkan tokenId dan tx hash.
```

🔴 **Wajib: LP fee statis TINGGI (10000–100000 = 1–10%, BUKAN 3000/0,3%).**
Mode gagalnya senyap: fee terlalu kecil → `getLiquidityForAmounts` mengembalikan 0 →
`INCREASE_LIQUIDITY` jadi no-op yang **sukses**, event tetap terbit, demo terlihat
jalan padahal tidak terjadi apa-apa.

Fee juga harus **dibangkitkan** — mint saja tidak menghasilkan fee. Butuh self-trade
lewat UniversalRouter (Permit2 lagi).

Kalau ada yang memblokir (faucet, RPC, deploy), **BERHENTI dan lapor**.

---

## Task 3 — Tabel kelengkapan aksi v4

Artefak dengan nilai tertinggi untuk skor Technicality. Output adalah draf — akan
diverifikasi manual baris per baris.

```
Baca lib/v4-periphery:
- src/libraries/Actions.sol
- _handleAction di src/PositionManager.sol
- DeltaResolver (_take, _settle, _sweep)
- BaseActionsRouter (_mapRecipient, _mapPayer)

Enumerasi SETIAP konstanta aksi. Untuk masing-masing:
- Bisakah aksi ini memindahkan token keluar dari kendali pemilik posisi? (ya/tidak)
- Recipient-nya dari mana — parameter dari pemanggil, atau nilai turunan?
- Apakah _handleAction benar-benar men-dispatch-nya, atau jatuh ke UnsupportedAction?
- File dan nomor baris

Tabel markdown. Kutip kode asli untuk setiap baris.
JANGAN menyimpulkan perilaku dari nama aksi. Kalau tidak bisa ditelusuri: "UNVERIFIED".
```

🔴 Kolom ketiga adalah tambahan, dan justru yang paling bernilai: ia menunjukkan
`Actions.sol` mendeklarasikan aksi yang PositionManager tolak — temuan yang membentuk
seluruh desain kita.

Fakta yang sudah diverifikasi (pakai sebagai kontrol kebenaran agent):
`_handleAction` menangani INCREASE_LIQUIDITY, INCREASE_LIQUIDITY_FROM_DELTAS,
DECREASE_LIQUIDITY, MINT_POSITION, MINT_POSITION_FROM_DELTAS, BURN_POSITION,
SETTLE_PAIR, TAKE_PAIR, SETTLE, TAKE, CLOSE_CURRENCY, CLEAR_OR_TAKE, SWEEP, WRAP,
UNWRAP — 15 aksi, sisanya `revert UnsupportedAction(action)`.

---

## Task 4 — Kontrak inti

🔴 Struct di bawah **menggantikan** versi draf. Dua field ditambahkan karena review
adversarial menemukan lubang nyata; jangan dihapus.

```solidity
struct Mandate {
    address keeper;
    address grantor;      // 🔴 pemilik saat grant. compound WAJIB cek ownerOf == grantor.
    uint256 tokenId;
    uint16  maxFeeBps;
    address feeRecipient; // dikunci saat grant
    uint64  expiry;
    uint64  minInterval;  // 🔴 cooldown antar compound, dikunci saat grant
    uint64  lastCall;
    bool    compoundAllowed;
}

function grant(Mandate calldata m) external returns (uint256 mandateId);
function revoke(uint256 mandateId) external;
function compound(uint256 mandateId, uint256 minFee) external;
function canCompound(uint256 mandateId) external view returns (bytes4 reason);
```

**Kenapa `grantor`:** tanpanya, mandate bertahan setelah posisi dijual. Penjual
mempertahankan hak `compound` atas posisi pembeli dengan `feeRecipient` menunjuk ke
penjual. Itu persis kelas Code4rena H-04 yang kita klaim cegah.
**Kenapa `minInterval`:** tanpanya keeper memanggil sesering mungkin dan menguras
nilai lewat biaya berulang.

🔴 **Satu tokenId hanya boleh punya SATU mandate hidup.** Ini membuat pencabutan
atomik secara gratis, membuat cap fee benar-benar sebuah cap, dan membuat halaman
mandate = kebenaran lengkap tentang posisi itu.

⚠️ **Aturan ini TIDAK bisa ditegakkan dari struct saja.** `Mandate` di-key oleh
`mandateId`; revoke-lalu-grant menghasilkan `mandateId` kedua untuk `tokenId` yang
sama, dan tidak ada apa pun untuk diperiksa. Wajib ada state terpisah:

```solidity
mapping(uint256 tokenId => uint256 activeMandateId) public activeMandate;
// grant():  require(activeMandate[tokenId] == 0, MandateAlreadyActive());
//           activeMandate[tokenId] = mandateId;
// revoke(): delete activeMandate[tokenId];
```

Tanpa ini, klaim keamanan di §6b tidak punya penegak. Jangan biarkan agent
menyimpulkan pemeriksaan yang tidak punya sasaran.

### Gerbang yang revert
kedaluwarsa · dicabut · pemanggil bukan keeper terdaftar · `compound` tidak diizinkan ·
🔴 `ownerOf(tokenId) != m.grantor` · 🔴 `block.timestamp < lastCall + minInterval` ·
fee melebihi `maxFeeBps` · hasil di bawah `minFee`
🔴 ~~slippage breach~~ — **dihapus**: tanpa swap tidak ada harga.

### Urutan `compound` (terverifikasi terhadap `_handleAction`)

```
── Panggilan 1: panen ──────────────────────────────
   DECREASE_LIQUIDITY(tokenId, 0, min0, min1, "")   // tidak ada aksi "collect" di v4
   TAKE_PAIR(currency0, currency1, recipient = ENVOYAGE)

── Di dalam Envoyage ───────────────────────────────
   fee = balanceAfter − balanceBefore
   feeKeeper = fee × maxFeeBps / 10_000  →  m.feeRecipient
   liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
       StateLibrary.getSlot0(...), tickLower, tickUpper, sisa0, sisa1)
   if (liquidityDelta == 0) revert ZeroLiquidityDelta();   // 🔴 WAJIB

── Panggilan 2: tanam kembali ──────────────────────
   INCREASE_LIQUIDITY(tokenId, liquidityDelta, max0, max1, "")
   SETTLE_PAIR(currency0, currency1)     // bayar lewat Permit2 dari Envoyage

── Bersihkan ───────────────────────────────────────
   sisa saldo → PEMILIK POSISI (konstanta di kontrak)
   assert saldo Envoyage == 0
```

**DUA panggilan `modifyLiquidities`, bukan satu.** `liquidityDelta` baru bisa dihitung
setelah tahu berapa fee yang dipanen.

🔴 **Permit2 wajib di constructor.** `_settlePair` memakai `msgSender()` = Envoyage,
dan `_pay` bercabang ke Permit2 untuk payer selain POSM. Per token:
```solidity
token.approve(PERMIT2, type(uint256).max);
IAllowanceTransfer(PERMIT2).approve(token, POSM, type(uint160).max, type(uint48).max);
```
Kalau terlewat: lolos di unit test bermock, meledak pertama kali di Sepolia.
**Jangan** pakai jalan pintas `payerIsUser=false` — dust tertinggal di posm dan bisa
diambil siapa pun.

🔴 **Klaim kustodi (dikoreksi dari draf).** Draf menulis "Envoyage must never custody
funds" — terlalu absolut. Fee **harus** mendarat di Envoyage untuk diukur. Klaim yang
benar: **non-kustodial antar-transaksi** — saldo hanya ada di dalam satu transaksi,
nol di antaranya. Buktikan dengan assert saldo == 0 di akhir tiap tx.

Tulis unit test bersamaan. **Jangan** tulis invariant test — properti ditulis manusia.

---

## Urutan

1. ~~Repo setup~~ ✅
2. **Fixture Sepolia** — memblokir semuanya
3. Tabel kelengkapan
4. Kontrak inti + unit test
5. Invariant test — 🔴 properti ditulis manusia; agent boleh handler/setup.
   Wajib ada `invariant_callsActuallyLanded()` yang menuntut `successfulCompounds > 0`,
   kalau tidak properti lolos secara hampa karena semua panggilan revert.
6. Exploit replay — 🔴 **wajib menyertakan `NaiveUtils.execute(tokenId, bytes)` ~30 baris
   sebagai pembanding rentan.** Tanpa itu suite-nya tautologis: kamu tidak bisa menulis
   eksploit terhadap fungsi yang tidak ada. Tunjukkan serangan **berhasil** melawan
   NaiveUtils, lalu tidak bisa di-encode melawan Envoyage.
   Tambahkan juga: transfer posisi lalu `compound` harus revert.
7. Subgraph → Subgraph MCP — 🔴 MCP harus membaca **dua** subgraph (Envoyage + Uniswap v4).
   Track menolak *"simply querying one Subgraph"*.
8. UI: layar grant + halaman mandate yang bisa dibagikan
9. README, model ancaman, video demo

Jangan melompat. Kalau terblokir, **lapor**, jangan ganti tugas yang lebih mudah.

---

## 🔴 Slot sponsor (final, 5 Sept)

| Slot | Track | Takeable |
|---|---|---|
| The Graph | Composable — jalur **skema terstandardisasi** (bukan MCP/Substreams) | $2.500 |
| Uniswap Foundation | Best Uniswap Stack Contribution | $1.000 |
| **ENS** | Best Use of ENSv2 — lihat `docs/ENS-PLAN.md` | $1.500 |

~~Ledger~~ dibatalkan 5 Sept: `wallet-cli send` butuh perangkat fisik (tidak ada
emulator/Speculos yang didokumentasikan), dan dukungan Sepolia tidak terkonfirmasi
di dokumentasi mana pun. Dua risiko independen untuk satu slot.

ENSv2 justru fit lebih baik: teks track meminta *"delegate specific rights"* lewat
Enhanced Access Control dan subname yang *"expiring, revocable"* — itu tesis Envoyage
di substrat lain. Alamat ENSv2 Sepolia sudah diverifikasi on-chain.

## Dokumen rujukan

| File | Isi |
|---|---|
| `../../prd.md` | PRD lengkap: jadwal, alokasi jam, model ancaman, checklist bounty |
| `docs/BUILD-GUIDE.md` | Temuan terverifikasi terhadap source v4 |
| `docs/SETUP-LANDMINES.md` | Enam ranjau setup; jangan utak-atik konfigurasi |
| `docs/SEPOLIA.md` | Alamat terverifikasi + RPC yang jalan |
| `docs/THREAT-MODEL.md` | Apa yang Envoyage TIDAK lindungi |
| `docs/V4-ACTION-COMPLETENESS.md` | 26 aksi v4 ditelusuri ke nomor baris |
| `docs/ENS-PLAN.md` | Slot ENSv2: mandate sebagai subname |
| `docs/GRAPH-PLAN.md` | Jalur The Graph |
