# Envoyage

**Envoyage menghapus wewenang atas tujuan. Ia tidak menghapus wewenang atas eksekusi.**

Instrumen izin ter-scope untuk posisi Uniswap v4. Pemilik posisi bisa menyewa keeper
tanpa menyerahkan `approve` atau `setApprovalForAll`.

> ETHOnline 2026 · Sepolia · net-new (Start Fresh track)
> Kode proyek dimulai setelah 4 Sept 2026 12:00 EDT.

---

## Masalah

Untuk memberi keeper wewenang atas posisi v4, hari ini hanya ada dua pilihan:

| Primitif | Posisi mana | Aksi mana |
|---|---|---|
| `setApprovalForAll(keeper, true)` | semuanya | **tanpa batas** |
| `approve(keeper, tokenId)` | satu | **tanpa batas** |
| **Mandate** | satu | **terdaftar** |

Keduanya membatasi *posisi mana*, tidak ada yang membatasi *aksi apa*.

Diperburuk arsitektur v4: `modifyLiquidities` adalah satu entrypoint yang menerima
array aksi — sebuah bahasa kecil. Membatasi keeper "hanya boleh memanggil
modifyLiquidities" tidak membatasi apa pun, karena fungsi itu sendiri adalah interpreter.

## Pendekatan: menyusun, bukan memvalidasi

Keeper tidak pernah mengirim calldata. Ia memanggil entrypoint bertipe dengan dua angka,
dan **Envoyage yang menyusun** array aksi v4 dengan recipient sebagai konstanta.

Penyalahgunaan bukan ditolak oleh pemeriksaan — tidak ada saluran untuk mengekspresikannya.

## Status

**19 test hijau.** Kontrak inti berjalan terhadap `v4-periphery` asli.

| Berkas | Isi |
|---|---|
| [`src/Envoyage.sol`](src/Envoyage.sol) | registry mandate + penyusun aksi v4 |
| [`src/interfaces/IEnvoyage.sol`](src/interfaces/IEnvoyage.sol) | ABI publik, custom error |
| [`test/unit/Spike.t.sol`](test/unit/Spike.t.sol) | bukti alur v4 bisa dilalui tanpa swap |
| [`test/unit/Envoyage.t.sol`](test/unit/Envoyage.t.sol) | 16 test gerbang & akuntansi fee |

### Yang sudah terbukti, dengan angka

```
fee dipanen         : 0.06 e18 tiap token
likuiditas sebelum  : 100.000000000000000000 e18
likuiditas sesudah  : 100.626876216690826481 e18   ← tanpa swap
```

- `PositionManager` **menolak** `SWAP_EXACT_IN_SINGLE` — `test_spike_positionManagerRejectsSwapAction`
- Posisi dijual → `compound` revert — `test_revert_positionSoldToNewOwner` (kelas Code4rena H-04)
- Saldo Envoyage nol di akhir tiap tx — non-kustodial antar-transaksi
- `grantor` diambil dari `msg.sender`, bukan dari struct — anti pemalsuan

Lihat [`AGENTS.md`](AGENTS.md) untuk aturan build dan [`docs/`](docs/) untuk
temuan terverifikasi terhadap source v4.

## Struktur

```
src/interfaces/   ABI publik + custom error
src/adapters/     penyusun aksi per protokol (v0: Uniswap v4)
test/unit/        gerbang, akuntansi fee, expiry
test/invariant/   properti + handler; keeper diperlakukan sebagai penyerang
test/replay/      pola eksploit terdokumentasi vs kontrak rentan pembanding
script/           deploy + seed pool Sepolia
subgraph/         event mandate → Subgraph Studio
keeper/           reference keeper bot
web/              UI: terbitkan mandate + halaman mandate publik
```

## Setup

Clone dengan submodule, lalu build. Terbukti hijau dari clone segar:

```bash
git clone --recurse-submodules https://github.com/envoyage-protocol/envoyage.git
cd envoyage
forge test          # 19 test, semua hijau
```

Kalau sudah terlanjur clone tanpa `--recurse-submodules`:

```bash
./script/setup.sh     # install dependency v4
cp .env.example .env  # isi RPC + key
forge build
forge test
```

Profil test:
```bash
forge test                                   # default, 1000 fuzz run
FOUNDRY_PROFILE=quick   forge test           # iterasi cepat
FOUNDRY_PROFILE=deep    forge test           # 10.000 invariant run (untuk DoD)
```

## Model ancaman

Lihat [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md). Ringkasnya: klaimnya adalah
**pengurangan permukaan serangan**, bukan keamanan absolut. Yang **tidak** dilindungi
dinyatakan eksplisit di sana.

## Lisensi

MIT
