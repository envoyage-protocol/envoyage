# Tabel kelengkapan aksi Uniswap v4

Ditelusuri langsung terhadap source, bukan dari nama aksi atau dokumentasi.
Setiap baris mengutip file dan nomor baris. Yang tidak bisa ditelusuri ditandai
`UNVERIFIED` — tidak ditebak.

**Sumber:** `lib/v4-periphery` @ `dce236d`
`src/libraries/Actions.sol` · `src/PositionManager.sol` · `src/base/DeltaResolver.sol` · `src/base/BaseActionsRouter.sol`

---

## Kenapa tabel ini ada

Klaim Envoyage adalah bahwa penyalahgunaan **tidak bisa diekspresikan**. Klaim itu
hanya bermakna kalau kami bisa menunjukkan telah memeriksa **seluruh** bahasa aksi,
bukan yang kami ingat saja.

Tabel ini menjawab satu pertanyaan per aksi: **dari mana alamat penerima berasal?**
Kalau ia parameter dari pemanggil, aksi itu bisa memindahkan token ke mana pun.
Kalau ia nilai turunan, tidak bisa.

---

## Temuan 1 — `Actions.sol` mendeklarasikan 26 aksi. PositionManager hanya menjalankan 15.

`_handleAction` (`PositionManager.sol:196–286`) adalah rantai if/else. Yang tidak
cocok jatuh ke `revert UnsupportedAction(action)` di **baris 285**.

**Sebelas aksi yang dideklarasikan tapi TIDAK bisa dijalankan lewat PositionManager:**

| Opcode | Aksi | Ada di sini |
|---|---|---|
| `0x06` | `SWAP_EXACT_IN_SINGLE` | `V4Router` (Universal Router) |
| `0x07` | `SWAP_EXACT_IN` | `V4Router` |
| `0x08` | `SWAP_EXACT_OUT_SINGLE` | `V4Router` |
| `0x09` | `SWAP_EXACT_OUT` | `V4Router` |
| `0x0a` | `DONATE` | tidak di-dispatch |
| `0x0c` | `SETTLE_ALL` | `V4Router` |
| `0x0f` | `TAKE_ALL` | `V4Router` |
| `0x10` | `TAKE_PORTION` | `V4Router` |
| `0x19` | `UNWIND_WITH_FALLBACK` | tidak di-dispatch |
| `0x1a` | `SUBSCRIBE` | fungsi tersendiri, bukan aksi |
| `0x1b` | `UNSUBSCRIBE` | fungsi tersendiri, bukan aksi |

Catatan: `0x17` dan `0x18` tidak dialokasikan sama sekali di `Actions.sol`.

**Konsekuensi untuk Envoyage.** Rencana awal kami adalah "panen fee → **swap ke rasio
benar** → tambah likuiditas" dalam satu plan. Itu tidak bisa dibangun: swap tidak
di-dispatch. Menyelesaikannya butuh dua `unlock` berurutan lewat UniversalRouter.

Kami menghapus leg swap sepenuhnya. Bukan karena kehabisan waktu — karena tanpa swap
`compound` **tidak punya harga**, jadi tidak ada nilai yang bisa keluar lewat harga.
Terverifikasi sebagai test: `test_spike_positionManagerRejectsSwapAction`.

---

## Temuan 2 — empat aksi menerima recipient dari pemanggil

Inilah permukaan sesungguhnya. `_mapRecipient` (`BaseActionsRouter.sol`) menerjemahkan
dua alamat ajaib dan meneruskan sisanya apa adanya:

```solidity
if (recipient == ActionConstants.MSG_SENDER)  return msgSender();   // address(1)
else if (recipient == ActionConstants.ADDRESS_THIS) return address(this); // address(2)
else return recipient;                                              // ← apa pun
```

⚠️ **Jebakan:** `ADDRESS_THIS` berarti **PositionManager**, bukan kontrakmu. Untuk
mendaratkan token di kontrak sendiri, oper alamatnya secara literal.

| Opcode | Aksi | Recipient dari | Baris | Bisa keluar dari kendali pemilik? |
|---|---|---|---|---|
| `0x11` | `TAKE_PAIR` | **parameter pemanggil** | `PositionManager.sol:253` | **YA** |
| `0x0e` | `TAKE` | **parameter pemanggil** | `:261` | **YA** |
| `0x14` | `SWEEP` | **parameter pemanggil** | `:273` | **YA** |
| `0x02` | `MINT_POSITION` | **parameter pemanggil** (`owner`) | `:224` | **YA** — posisi baru bisa di-mint atas nama siapa pun |
| `0x05` | `MINT_POSITION_FROM_DELTAS` | **parameter pemanggil** (`owner`) | `:237` | **YA** |

Empat aksi pertama itulah yang membuat `approve(keeper, tokenId)` setara dengan
menyerahkan posisi: keeper cukup menyusun `DECREASE_LIQUIDITY` + `TAKE_PAIR(…, dompetnya)`.

---

## Temuan 3 — sisanya memakai nilai turunan, bukan parameter

| Opcode | Aksi | Sumber alamat | Baris |
|---|---|---|---|
| `0x0d` | `SETTLE_PAIR` | `msgSender()` sebagai payer | `:458` |
| `0x12` | `CLOSE_CURRENCY` | `msgSender()`, kedua arah | `:474`, `:477`, `:479` |
| `0x13` | `CLEAR_OR_TAKE` | `msgSender()` | `:494` |
| `0x0b` | `SETTLE` | `_mapPayer(payerIsUser)` — boolean, bukan alamat | `:257` |
| `0x00` | `INCREASE_LIQUIDITY` | tidak ada; delta diselesaikan aksi lain | `:197` |
| `0x01` | `DECREASE_LIQUIDITY` | tidak ada; kredit diambil aksi lain | `:208` |
| `0x03` | `BURN_POSITION` | tidak ada; sama | `:239` |
| `0x04` | `INCREASE_LIQUIDITY_FROM_DELTAS` | tidak ada | `:202` |
| `0x15` | `WRAP` | tidak ada | `:275` |
| `0x16` | `UNWRAP` | tidak ada | `:279` |

`_mapPayer` hanya memilih antara `msgSender()` dan `address(this)` — pemanggil tidak
bisa menyisipkan alamat pihak ketiga.

---

## Temuan 4 — Uniswap sendiri mendeprecate dua aksi karena sandwich

`Actions.sol:14–24`, komentar Uniswap sendiri, verbatim:

> `/// @notice DEPRECATED: Vulnerable to sandwich attacks - do not use.`
> `/// @dev The delta-based approach lacks minimum liquidity slippage protection,`
> `/// allowing attackers to manipulate the price and reduce the liquidity received.`
> `/// Use INCREASE_LIQUIDITY instead.`

Berlaku untuk `INCREASE_LIQUIDITY_FROM_DELTAS` (`0x04`) dan `MINT_POSITION_FROM_DELTAS` (`0x05`).

Ini corroborasi independen untuk keputusan desain kami, dan datang dari Uniswap, bukan
dari kami: jalur yang tidak punya batas slippage bisa di-sandwich. Kami mengambil
pelajaran yang sama satu langkah lebih jauh — `compound` tidak melakukan swap sama
sekali. **Envoyage tidak pernah memakai varian FROM_DELTAS.**

---

## Temuan 5 — approval ERC-721 dicek, tapi hanya untuk KEPEMILIKAN posisi

`onlyIfApproved(msgSender(), tokenId)` menjaga `INCREASE_LIQUIDITY`,
`DECREASE_LIQUIDITY`, dan `BURN_POSITION` (`:295`, `:311`, `:343`, `:420`).

Pemeriksaan itu menjawab *"bolehkah kamu menyentuh posisi ini?"* — **bukan**
*"bolehkah kamu melakukan hal ini pada posisi ini?"*. Sekali lolos, aksi mana pun
di tabel Temuan 2 bisa dirangkai di plan yang sama.

**Inilah celah yang diisi Envoyage.** Kami menemukannya secara empiris: percobaan
pertama spike gagal dengan `NotApproved`, yang membuktikan approval harus ada di
suatu tempat. Pertanyaannya bukan *apakah* seseorang memegangnya, tapi **siapa**.

---

## Bagaimana Envoyage memakai tabel ini

`compound` menyusun tepat empat aksi. Tidak ada yang menerima recipient dari keeper:

| Langkah | Aksi | Recipient |
|---|---|---|
| 1 | `DECREASE_LIQUIDITY(tokenId, 0, …)` | — (panen fee; tidak ada aksi "collect" di v4) |
| 2 | `TAKE_PAIR` | `address(this)` **literal** — bukan `ADDRESS_THIS` |
| 3 | `INCREASE_LIQUIDITY` | — |
| 4 | `SETTLE_PAIR` | `msgSender()` = Envoyage; bayar lewat Permit2 |

Lalu, di luar aksi v4: fee ter-cap ke `feeRecipient` yang dikunci saat grant, dust ke
`ownerOf(tokenId)`, dan assert saldo Envoyage nol.

Keeper tidak punya parameter untuk menyentuh satu pun dari ini. Bukan karena ditolak
pemeriksaan — **tidak ada fungsi yang menerimanya**.

---

## Batas ketelitian

- Ditelusuri untuk `PositionManager`. `V4Router` (yang menjalankan aksi swap dan
  `TAKE_PORTION`) **tidak** ditelusuri baris-per-baris — di luar scope karena Envoyage
  tidak memanggilnya.
- `UNWIND_WITH_FALLBACK` (`0x19`) dan `DONATE` (`0x0a`): dikonfirmasi tidak di-dispatch
  oleh `PositionManager`; ke mana lagi mereka dijalankan `UNVERIFIED`.
- `SUBSCRIBE`/`UNSUBSCRIBE` ada sebagai fungsi tersendiri di PositionManager, bukan
  lewat `_handleAction`. Perilaku subscriber `UNVERIFIED`.
