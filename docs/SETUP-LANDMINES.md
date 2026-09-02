# Ranjau setup yang sudah diledakkan (3 Sept, sebelum hacking)

Konfigurasi di repo ini **sudah terbukti hijau**:

```
[PASS] test_harnessMintsRealPosition() (gas: 33391444)
```

Artinya: PoolManager + Permit2 + PositionManager + pool asli + posisi v4 ter-mint,
semuanya dari `v4-periphery` sungguhan. **Jangan utak-atik `foundry.toml` atau
`remappings.txt` kecuali terpaksa** — enam masalah di bawah sudah diselesaikan dan
masing-masing bisa memakan 30–90 menit.

---

### 1. `forge install --no-commit` sudah dihapus di forge 1.7.1
Flag itu error, dan `|| true` di skrip menelannya diam-diam → `lib/` kosong tapi
skrip melapor sukses. `script/setup.sh` sekarang `set -euo pipefail` tanpa `|| true`.

### 2. Remapping solmate/permit2 TIDAK boleh berakhir `/src/`
Import upstream sudah menulis `solmate/src/tokens/WETH.sol` sendiri. Kalau remapping
juga `/src/`, jadinya `lib/solmate/src/src/...`.

### 3. `v4-core` standalone TIDAK cocok dengan `v4-periphery`
`forge install Uniswap/v4-core` memberi versi yang **tidak punya**
`src/types/PoolOperation.sol`, padahal `test/shared` periphery mengimpornya.
**Pakai core yang dibawa periphery:** `lib/v4-periphery/lib/v4-core/`.
Direktori `lib/v4-core` standalone sudah dihapus. Jangan install ulang.

### 4. OpenZeppelin 5.7.0 membuat `TransparentUpgradeableProxy` revert
v4 mengharapkan **5.0.2** (yang di-vendor v4-core). Dengan 5.7.0, konstruktor proxy
revert `0xc28a273c` dan `deployPosm` gagal. Semua remapping OZ & solmate menunjuk ke
`lib/v4-periphery/lib/v4-core/lib/`. Direktori standalone sudah dihapus.

### 5. `compilation_restrictions` wajib — tanpa itu stack-too-deep
v4-periphery memakai setelan compiler **per-path**. Tanpa mencerminkannya:
`Yul exception: Variable memPtr_1 is 1 too deep in the stack`.

Dan: `PositionManager` (500 runs) dengan `PositionDescriptor` (1 run) **tidak boleh
satu unit kompilasi** → `Found incompatible settings restrictions`.

### 6. `vm.getCode` butuh artefak, dan artefak butuh import paksa
`Deploy.sol` memanggil `vm.getCode("PositionManager.sol:PositionManager")`. Artefak
hanya ada kalau kontraknya ikut dikompilasi. Karena itu ada `script/deps/*.sol` —
tiap dep di **file terpisah** (lihat masalah 5).

⚠️ Jalankan `forge build` penuh minimal sekali sebelum `forge test`; kompilasi
selektif `--match-contract` bisa melewatkan artefak ini.

---

## Urutan setUp yang benar (dari test v4-periphery sendiri)

```solidity
deployFreshManagerAndRouters();
deployMintAndApprove2Currencies();   // WAJIB sebelum deployAndApprovePosm,
                                     // kalau tidak: "call to non-contract address 0x0"
deployPosmHookSavesDelta();          // agar modifyLiquidity mengembalikan delta
(key,) = initPool(currency0, currency1, IHooks(hook), 3000, SQRT_PRICE_1_1);
deployAndApprovePosm(manager);
seedBalance(alice); approvePosmFor(alice);
```

Catatan: `IPositionManager` tidak mengekspos `ownerOf`. Cast:
`IERC721(address(lpm)).ownerOf(tokenId)`.

---

## Jangan lupa

`test/_HarnessProbe.t.sol` adalah **smoke test dependensi**, bukan kode Envoyage —
nol logika proyek. Ia dibuat 3 Sept untuk memverifikasi toolchain sebelum hacking
dimulai. Simpan; kalau suatu saat merah, penyebabnya konfigurasi, bukan kodemu.
