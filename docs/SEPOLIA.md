# Alamat Sepolia

⚠️ Uniswap memperingatkan alamat v4 **tidak lagi sama** lintas chain.
Ambil dari https://docs.uniswap.org/contracts/v4/deployments — jangan salin dari mana pun.

Kunci sebelum Blok B (10 Sept).

| Kontrak | Alamat | Diverifikasi |
|---|---|---|
| PoolManager | `0x...` | ☐ |
| PositionManager | `0x...` | ☐ |
| UniversalRouter | `0x...` | ☐ |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | ☐ (sama di semua chain) |
| StateView | `0x...` | ☐ |
| Quoter | `0x...` | ☐ |

## Pool demo

Buat sendiri — pool Sepolia kemungkinan kosong.

⚠️ **Pakai LP fee statis TINGGI (1–10%, bukan 0,3%).** Beberapa self-trade langsung
menghasilkan fee yang terlihat di layar saat demo. Fee terlalu kecil →
`getLiquidityForAmounts` menghitung `liquidityDelta == 0` → `INCREASE` jadi no-op
yang **sukses**, event tetap terbit, dan demo terlihat jalan padahal tidak terjadi apa-apa.

| Item | Nilai |
|---|---|
| token0 / token1 | MockERC20 |
| fee | ☐ |
| tickSpacing | ☐ |
| poolId | ☐ |
| tokenId posisi demo | ☐ |
