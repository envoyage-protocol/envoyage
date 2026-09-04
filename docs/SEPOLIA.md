# Alamat Sepolia — TERVERIFIKASI ON-CHAIN

Diverifikasi 3 Sept 2026 dengan `cast code`. Sumber alamat:
`developers.uniswap.org/docs/protocols/v4/deployments` (docs.uniswap.org sekarang
redirect ke sana).

Chain: **Ethereum Sepolia, 11155111**

| Kontrak | Alamat | Bytecode |
|---|---|---|
| PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` | ✅ 24009 B |
| PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` | ✅ 23877 B |
| UniversalRouter | `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` | ✅ 19540 B |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | ✅ 9152 B |
| StateView | `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c` | ✅ 3531 B |
| Quoter | `0x61b3f2011a92d183c7dbadbda940a7555ccf9227` | ✅ 5820 B |

PositionDescriptor tidak terdaftar untuk Sepolia.

🎯 **Sinyal bagus:** StateView on-chain **3531 bytes**, persis sama dengan hasil
kompilasi lokal kita. Versi `v4-periphery` yang dipin di `script/setup.sh` cocok
dengan yang ter-deploy di Sepolia.

## RPC

| Endpoint | Status |
|---|---|
| `https://ethereum-sepolia-rpc.publicnode.com` | ✅ jalan, tanpa key |
| `https://rpc.sepolia.org` | ❌ 404 (dipakai foundry.toml v4-periphery — jangan ikut) |
| `https://sepolia.drpc.org` | ❌ butuh paket berbayar |

Untuk broadcast, pakai endpoint ber-key (Alchemy/Infura) — publicnode cukup untuk
baca, belum tentu andal untuk kirim transaksi.

## ⚠️ WALLET — BUTUH PENDANAAN MANUAL

Dua wallet testnet dibuat 4 Sept, tersimpan di `.env` (chmod 600, gitignored).
**Keduanya kosong.** Faucet butuh captcha/login jadi tidak bisa diotomatiskan.

| Peran | Alamat | Butuh |
|---|---|---|
| DEPLOYER | `0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA` | ~0,5 ETH |
| KEEPER | `0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B` | ~0,05 ETH |

Deployer butuh lebih banyak: deploy 2 ERC20 + init pool + mint posisi + deploy
Envoyage + beberapa self-trade untuk membangkitkan fee.

### Faucet (kerjakan lebih awal — banyak yang punya cooldown 24 jam)

| Faucet | Syarat |
|---|---|
| `cloud.google.com/application/web3/faucet/ethereum/sepolia` | akun Google, 0,05/hari |
| `sepolia-faucet.pk910.de` (PoW) | tanpa akun, mining di browser, bisa banyak |
| `faucets.chain.link/sepolia` | login GitHub |
| `www.alchemy.com/faucets/ethereum-sepolia` | akun Alchemy |

PoW faucet pk910 biasanya paling andal untuk jumlah besar tanpa syarat saldo mainnet.

**Verifikasi setelah didanai:**
```bash
source .env
cast balance $DEPLOYER_ADDRESS --rpc-url $SEPOLIA_RPC_URL --ether
```

## Pool demo — belum dibuat

⚠️ **Pakai LP fee statis TINGGI (1–10%, bukan 0,3%).** Fee terlalu kecil →
`getLiquidityForAmounts` mengembalikan 0 → `INCREASE_LIQUIDITY` jadi no-op yang
**sukses**, event tetap terbit, demo terlihat jalan padahal tidak terjadi apa-apa.
Tambahkan juga `revert ZeroLiquidityDelta()`.

| Item | Nilai |
|---|---|
| token0 / token1 | MockERC20 ☐ |
| fee | ☐ (target 10000–100000 = 1–10%) |
| tickSpacing | ☐ |
| poolId | ☐ |
| tokenId posisi demo | ☐ |
