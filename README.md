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

🚧 Belum dimulai. Lihat [`../../prd.md`](../../prd.md) untuk desain lengkap,
model ancaman, dan alokasi waktu.

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
