# Rencana The Graph — direvisi setelah verifikasi MCP (4 Sept)

## Pertanyaan yang menggantung sejak PRD §7

> "Apakah Subgraph MCP bisa menunjuk ke subgraph di Studio, atau hanya ke subgraph
> yang sudah dipublikasikan ke jaringan?"

**Terjawab. Dua bagian, satu bagus satu buruk.**

### ✅ Bagus: MCP memang lintas-subgraph

`graphops/subgraph-mcp` mengekspos tiga tool eksekusi yang masing-masing menerima
**identifier sebagai argumen**:

| Tool | Identifier |
|---|---|
| `execute_query_by_deployment_id` | `0x...` |
| `execute_query_by_subgraph_id` | `5zvR82...` |
| `execute_query_by_ipfs_hash` | `Qm...` |

Plus `get_schema`, `search_subgraphs`, `get_subgraph_info`, `get_query_volume`.
Satu server, 15.000+ subgraph. Analisis lintas-protokol jelas didukung — itu yang
diminta track Composable.

### ❌ Buruk: butuh **Gateway API key**, bukan Studio key

README-nya menyebut berulang: *"A Gateway API key for The Graph Network."*
**Tidak ada dukungan untuk endpoint dev Subgraph Studio.**

Artinya subgraph Envoyage kita — Sepolia, di Studio — **tidak bisa dibaca** oleh
Subgraph MCP resmi kecuali dipublikasikan ke jaringan terdesentralisasi. Publikasi
butuh GRT dan waktu, dan subgraph testnet umumnya tidak bisa dipublikasikan sama
sekali. Jalur itu **mati untuk v0**.

Rencana PRD §7 versi lama ("MCP membaca subgraph Envoyage + Uniswap v4") tidak bisa
dijalankan apa adanya.

---

## Rencana pengganti — dan ini lebih kuat, bukan sekadar penyelamat

**Bangun MCP server kita sendiri** yang menyusun dua sumber:

```
        Envoyage MCP Server  (kita tulis)
                 │
     ┌───────────┴────────────┐
     │                        │
Subgraph Envoyage      Subgraph MCP resmi
(Sepolia, Studio,      (Gateway key) →
 GraphQL langsung)      Uniswap v4 MAINNET
     │                        │
 mandate aktif,          posisi mana yang masih pegang
 scope, riwayat          approval telanjang ke kontrak
 eksekusi                automation
```

**Kenapa ini lebih baik, bukan kompromi:**

1. **Track AI (From Scratch, $5.000) secara eksplisit menghadiahi**
   *"new or extended MCP servers"*. Menulis server sendiri adalah artefak yang jauh
   lebih kuat daripada sekadar mengonfigurasi milik orang lain.
2. **Track Composable ($5.000) tetap terpenuhi** — dua produk Graph dikomposisikan:
   subgraph Studio + Subgraph MCP resmi. Bukan *"simply querying one Subgraph."*
3. **Angka census jadi lebih mengesankan.** Sumbernya subgraph Uniswap v4 **mainnet**
   (ada di jaringan, terjangkau Gateway), bukan Sepolia. Eksposur nyata, bukan mainan.
4. **Menghapus blocker publikasi sepenuhnya.** Tidak perlu GRT, tidak perlu menunggu.

## Yang dibutuhkan

- [ ] **Gateway API key** dari `thegraph.com/studio` → tab API Keys. Gratis, ada kuota
      free. **Ambil sebelum Blok C.**
- [ ] Deploy key Studio untuk subgraph Envoyage
- [ ] Cari subgraph ID Uniswap v4 mainnet lewat `search_subgraphs`

## Pertanyaan census yang dijawab

Satu pertanyaan yang **tidak bisa** dijawab salah satu sumber sendirian:

> "Posisi v4 mana milik alamat ini, mana yang punya mandate ter-scope, dan mana yang
> masih memegang approval telanjang ke kontrak automation?"

Itulah komposisinya. Dan ia sekaligus menghasilkan angka slide pertama.

## Risiko tersisa

Subgraph Uniswap v4 mainnet harus benar-benar ada di jaringan dan mengindeks
`PositionManager`. **Verifikasi dengan `search_subgraphs` segera setelah punya Gateway
key** — kalau tidak ada, census harus dibaca langsung dari RPC dan itu jauh lebih lambat.
