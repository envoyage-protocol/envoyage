# Model Ancaman

> Kerangka. Diisi seiring implementasi. Juri teknis akan mencari batas klaim ini —
> menyatakannya sendiri lebih kuat daripada ditemukan mereka.

## Klaim

Envoyage memperkecil permukaan serangan. **Bukan** keamanan absolut — Envoyage
sendiri kontrak yang bisa punya bug. Bedanya: Envoyage tidak menerima instruksi,
jadi seluruh kelas bug "validasi instruksi gagal" tidak berlaku.

## KEPUTUSAN TERKUNCI: IMMUTABLE

Diputuskan 3 Sept 2026, sebelum baris pertama kode. **Tidak dibuka kembali.**

Envoyage tidak punya proxy, tidak punya admin, tidak bisa di-upgrade. Ini bukan
kompromi keamanan demi kecepatan — ia lebih aman **dan** lebih cepat dibangun
(tidak ada storage gap, initializer, atau test upgrade).

Kalau ada bug: deploy alamat baru, pemilik `revoke` + `approve` ulang. Untuk v0
di Sepolia itu biaya yang benar.

## Prasyarat yang WAJIB berlaku

Pemilik meng-`approve` posisi ke Envoyage, jadi Envoyage memegang persis approval
tak terbatas yang jadi akar eksploit Aperture / Revert. Kalimat "tidak menerima
instruksi" adalah pernyataan tentang **bytecode yang berjalan**, bukan tentang alamat.

- [ ] Tanpa proxy, tanpa `owner`/`admin`, tanpa fungsi upgrade
- [ ] Tanpa `delegatecall`, tanpa `selfdestruct`
- [ ] PositionManager / Permit2 / adapter di-set `immutable` di constructor
- [ ] Tidak ada fungsi yang menerima `address target` atau `bytes calldata`
- [ ] Registry adapter tidak bisa ditambah pasca-deploy

Kalau salah satu tidak terpenuhi, klaim inti harus **dicabut**, bukan dilunakkan.

**Test yang membuktikannya** (masuk `test/unit/Immutability.t.sol`):
- assert bytecode tidak memuat `DELEGATECALL` (0xf4) maupun `SELFDESTRUCT` (0xff)
- assert tidak ada fungsi ber-selector yang menerima `bytes` atau `address target`
- assert alamat POSM / Permit2 sama sebelum & sesudah rangkaian panggilan apa pun

## Tabel

| Ancaman | Status |
|---|---|
| Keeper mencuri via aksi v4 | Dilindungi — tidak bisa diekspresikan |
| Keeper mengirim ke alamat lain | Dilindungi — recipient konstan |
| Keeper menyentuh posisi lain | Dilindungi — mandate mengunci satu tokenId |
| Mandate bertahan setelah posisi dijual | Dilindungi — `ownerOf == grantor` |
| Keeper memanggil terlalu sering | Dilindungi — `minInterval` |
| Keeper adalah kontrak (reentrancy) | Dimitigasi — `nonReentrant`, fee dibayar terakhir |
| **Keeper tidak bertindak sama sekali** | **TIDAK** — mandate memberi izin, bukan kewajiban |
| **Griefing selektif via `minFee`** | **TIDAK** — `minFee` adalah saklar abort milik keeper |
| **Bug di Envoyage sendiri** | **TIDAK** — pengurangan permukaan, bukan absolut |
| Pemilik jahat terhadap keeper | Di luar scope v0 |

## Catatan kustodi

Fee mendarat di Envoyage untuk diukur sebelum dibagi. Jadi klaimnya adalah
**non-kustodial antar-transaksi** — saldo hanya ada di dalam satu transaksi,
nol di antaranya. Invariant harus menuntut saldo Envoyage == 0 di akhir tiap tx.
