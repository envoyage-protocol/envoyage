# ENSv2 — slot sponsor ketiga

**Keputusan 5 Sept:** Ledger dibatalkan (perangkat fisik tidak tersedia, dan dukungan
Sepolia tidak terkonfirmasi). ENS kembali masuk — dan fitnya ternyata **lebih baik**.

Track: **Best Use of ENSv2** — $4.500, juara 1 $1.500, 2nd $1.500, 3rd $1.000, runner-up $500.

---

## Kenapa ini bukan tempelan

Baca teks track-nya, verbatim:

> *"Use **Enhanced Access Control**, the shared, role-based permission system behind
> both registries and resolvers, to **delegate specific rights** — like letting an
> account edit only certain text records on a name."*

> *"...combine it all to build subname setups — **expiring, revocable**,
> non-transferable vs. transferable"*

> *"Bonus points if you bring AI agents into the mix — think **agents as namespaces,
> each with their own identity and permissions**."*

Itu tesis Envoyage yang ditulis ulang untuk nama. Kami sudah punya `expiry` dan
`revoke()` di struct. Keeper sudah merupakan agent yang butuh identitas dan permission.

**ENSv2 EAC dan mandate Envoyage adalah gagasan yang sama di dua substrat berbeda:
delegasi ter-scope menggantikan approval borongan.**

---

## Desain: sebuah mandate ADALAH sebuah subname

```
                grant(Mandate)
                      │
        ┌─────────────┴─────────────┐
        │                           │
  mandates[id]              48213.envoyage.eth
  (state kontrak)           (subname ENSv2)
        │                           │
   gerbang & fee            expiry native
   akuntansi                non-transferable
                            role EAC untuk keeper
                            text record = scope
```

`revoke()` mencabut keduanya sekaligus.

### Yang membuatnya load-bearing, bukan kosmetik

**Klaim §3 PRD:** *"Pengamat adalah aktor yang paling sering dilupakan, dan ia yang
membuat analogi SAFE bekerja: instrumen standar berguna karena bisa dibaca sebelum
dipercaya."*

Tanpa ENS, "bisa dibaca" berarti membuka URL aplikasi kami. Itu retorika.
Dengan ENSv2, **siapa pun me-resolve `48213.envoyage.eth` dengan klien ENS apa pun
dan mendapat scope-nya.** Tidak perlu mengunjungi situs kami, tidak perlu memercayai
frontend kami. Itu yang membuat analogi SAFE selesai.

Dan ini **menggantikan** pekerjaan, bukan menambah: §8 Layar 2 ("halaman mandate yang
bisa dibagikan") menjadi resolusi ENS.

### Pemetaan

| Konsep Envoyage | Mekanisme ENSv2 |
|---|---|
| `expiry` mandate | `expiry` native di `register(...)` |
| `revoke()` | cabut/reclaim subname |
| Mandate tidak bisa dijual | subname non-transferable |
| Scope (aksi, cap fee, recipient) | text record di Permissioned Resolver |
| Keeper boleh lapor, tidak boleh mengubah scope | **role EAC**: tulis hanya `envoyage:lastRun` |
| Keeper sebagai agent beridentitas | namespace keeper — *bonus points* track |

Pembagiannya sama persis dengan tesis kami: **pemilik menulis scope, keeper hanya
boleh menyentuh yang tidak berpengaruh.** Di kontrak itu ditegakkan gerbang; di ENS
ditegakkan role bitmap. Dua substrat, satu gagasan.

---

## Alamat ENSv2 Sepolia — TERVERIFIKASI ON-CHAIN

`cast code` terhadap `ethereum-sepolia-rpc.publicnode.com`, 5 Sept:

| Kontrak | Alamat | Bytecode |
|---|---|---|
| ETHRegistry (Permissioned) | `0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2` | ✅ 14730 B |
| RootRegistry | `0x8115186e8f2e0b0281e86ab91f0f48ba90364354` | ✅ 14730 B |
| UserRegistryImpl | `0x624a25d67b59d587752ebec8dded8827dae52050` | ✅ 17159 B |
| ETHRegistrar | `0xa88553f454b77203b0d036a05c894d555eaaa2cc` | ✅ 7497 B |
| PermissionedResolverImpl | `0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e` | ✅ 17597 B |
| VerifiableFactory | `0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef` | ✅ 1411 B |
| UniversalResolverV2 | `0x4a1817d13e9cf196f471725176355c1234b63c70` | ✅ 18495 B |

Sumber: `docs.ens.domains/learn/deployments`. **Diverifikasi, bukan disalin.**

## ⚠️ KOREKSI 7 Sept — signature di bawah SALAH, dibaca dari ABI on-chain

Blok "Signature yang dipakai" berikutnya ditulis dari tutorial dan **tidak cocok
dengan kontrak yang benar-benar ter-deploy**. Dikoreksi dari ABI terverifikasi
Etherscan `0xa88553f4…a2cc`:

```solidity
// YANG SEBENARNYA ADA — 8 parameter, bukan 6
function register(string,address,bytes32,address,address,uint64,address,bytes32)
    returns (uint256);

// dan ada alur commit-reveal yang tidak disebut rencana sama sekali
function makeCommitment(string,address,bytes32,address,address,uint64,bytes32) pure returns (bytes32);
function commit(bytes32);
MIN_COMMITMENT_AGE   = 60s
MAX_COMMITMENT_AGE   = 86400s
MIN_REGISTER_DURATION = 2419200s (28 hari)

function isAvailable(string) view returns (bool);       // bukan available()
function getRegisterPrice(string,uint64,address) view returns (uint256,uint256);
```

**Temuan yang lebih penting: registrasi dibayar dengan ERC-20, bukan ETH native.**
Argumen `address` ketiga adalah payment token. Memberi EOA atau `address(0)`
membalikkan `PaymentTokenNotSupported(address)` = `0x02e2ae9e`.

Token yang diterima oracle (`0x8914b662…8987`):

| Token | Alamat | Diterima |
|---|---|---|
| USDC (6 desimal) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | ✅ |
| native / WETH Sepolia | — | ❌ |

Harga `envoyage`, terbaca on-chain:

| Durasi | Harga |
|---|---|
| 1 tahun | 8.000021 USDC |
| 28 hari (minimum) | 0.613701 USDC |

`isAvailable("envoyage")` = **true**. Saldo USDC deployer = **0** →
**blocker: butuh USDC testnet Sepolia**, bukan ETH. Faucet: `faucet.circle.com`.

Ini persis risiko yang rencana ini sendiri catat: *"Signature role EAC per-record
belum jelas — verifikasi dari ABI on-chain, jangan tebak."* Yang keliru ternyata
bukan hanya bagian EAC, tapi `register` itu sendiri.

---

## Signature yang dipakai — ⚠️ USANG, lihat koreksi di atas

```solidity
// registrar -> registry
function register(
    string  label,
    address owner,
    address subregistry,
    address resolver,
    uint256 roleBitmap,     // ← Enhanced Access Control
    uint64  expiry          // ← native, cocok dengan Mandate.expiry
) returns (uint256 tokenId);

// arahkan nama induk ke registry kita
function setSubregistry(uint256 anyId, address subregistry);
```

---

## Langkah

1. [ ] Daftarkan nama induk di ENSv2 Sepolia lewat `ETHRegistrar`
2. [ ] Deploy proxy UserRegistry lewat `VerifiableFactory`
3. [ ] `setSubregistry` mengarahkan induk ke registry kita
4. [ ] `Envoyage.grant()` memanggil `register(...)` dengan `expiry` mandate
5. [ ] Text record scope ditulis ke Permissioned Resolver
6. [ ] Role EAC: keeper boleh menulis **hanya** `envoyage:lastRun`
7. [ ] `revoke()` mencabut subname
8. [ ] Demo: resolve nama dengan klien ENS pihak ketiga — **bukan** UI kami

Langkah 8 adalah buktinya. Kalau scope hanya terbaca di aplikasi kami, klaim
"instrumen yang bisa dibaca siapa pun" tidak terpenuhi.

## Syarat kualifikasi track

- [x] Dibangun di ENSv2 (Sepolia) — chain kita memang Sepolia
- [ ] Fitur ENSv2 **sentral, bukan tempelan** — mandate ADALAH subname
- [ ] Demo fungsional, bukan nilai hard-coded — record dibaca dari on-chain
- [ ] Video + kode open source — repo sudah publik

## Risiko

| Risiko | Mitigasi |
|---|---|
| ENSv2 beta, dokumentasi tipis | Alamat sudah diverifikasi; signature diambil dari tutorial resmi |
| Signature role EAC per-record belum jelas | Tutorial tidak memuatnya. **Verifikasi dari ABI on-chain**, jangan tebak |
| Registrasi nama induk butuh ETH Sepolia | Sama blocker-nya dengan fixture v4 — danai wallet |
| Waktu | Menggantikan §8 Layar 2, jadi biaya bersihnya lebih kecil dari 4 jam penuh |

---

## 7 Sept — sumber resmi dari halaman prize, dan koreksi besar

Link resource di halaman prize ETHGlobal menjawab tiga hal yang rencana ini tandai
`UNVERIFIED`, dan membalik satu asumsi utama.

### Koreksi terpenting: ADA DUA registrar, bukan satu

Saya sebelumnya menyamakan keduanya. Itu keliru dan membuat biaya terlihat jauh
lebih besar dari sebenarnya.

| | ETHRegistrar (`0xa88553f4…a2cc`) | Registrar subname (kita deploy sendiri) |
|---|---|---|
| Untuk | nama induk `.eth` | subname `<tokenId>.envoyage.eth` |
| `register` | 8 parameter | **`register(string label, address owner, address resolver, uint64 duration)`** |
| commit-reveal | **wajib** (60s–24j) | **tidak ada** — docs: *"For subnames this is typically unnecessary"* |
| pembayaran | USDC testnet | **token yang kita tentukan sendiri — boleh tanpa biaya** |
| berapa kali | **sekali saja** | setiap `grant()` |

Artinya USDC hanya dibutuhkan **satu kali** untuk nama induk. Menerbitkan mandate
tidak pernah butuh token apa pun, karena kita yang menulis registrar-nya.

### `authorizeTextRoles` — persis mekanisme yang rencana ini butuhkan

Rencana ini menulis: *"Keeper boleh lapor, tidak boleh mengubah scope — role EAC:
tulis hanya `envoyage:lastRun`"*, dan menandainya belum terverifikasi. Mekanismenya
ada, dan namanya:

```solidity
authorizeTextRoles(bytes dnsName, string key, address account, bool grant)
```

Docs-nya menyebut kasus pakai yang identik: memberi dApp izin menulis **hanya** key
`avatar` tanpa akses ke record lain. Percobaan menulis key lain revert dengan
`EACUnauthorizedAccountRoles`.

Untuk Envoyage: pemilik menulis scope; keeper diberi izin satu key
(`envoyage:lastRun`) dan tidak bisa menyentuh yang lain. **Pembagian yang sama
persis dengan gerbang di kontrak, ditegakkan substrat berbeda.**

### Konstanta role (terverifikasi)

| Role | Nilai | Scope |
|---|---|---|
| `ROLE_SET_ADDR` | `1 << 0` | root / name / **record** |
| `ROLE_SET_TEXT` | `1 << 4` | root / name / **record** |
| `ROLE_SET_DATA` | `1 << 36` | root / name / record |
| `ROLE_UPGRADE` | `1 << 124` | root |
| `ROLE_REGISTRAR` | `1 << 0` | registry |
| `ROLE_RENEW` | `1 << 16` | registry |

Varian admin tiap role ada di `role << 128`. Bitmap `uint256`: bit 0–127 role
biasa, 128–255 role admin, maksimum 15 pemegang per role per resource.

Bitmap saat registrasi, dari tutorial:

```solidity
uint256 constant REGISTRATION_ROLE_BITMAP =
      RegistryRolesLib.ROLE_SET_SUBREGISTRY
    | RegistryRolesLib.ROLE_SET_SUBREGISTRY_ADMIN
    | RegistryRolesLib.ROLE_SET_RESOLVER
    | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN
    | RegistryRolesLib.ROLE_CAN_TRANSFER_ADMIN;
```

### `ens-cli` — resmi, dan langsung relevan dengan track

```bash
alias ens='npx "https://pkg.pr.new/ensdomains/cli/@ensdomains/cli@main"'

ens register commit        # nama induk, lalu tunggu 60 detik
ens register reveal
ens subregistry deploy     # UserRegistry untuk nama induk
ens subregistry set        # arahkan induk ke registry kita
ens subname create <tokenId>.envoyage.eth --owner 0x… --expiry …
ens set text …             # scope sebagai text record
```

Semua perintah tulis mengeluarkan calldata JSON `{to, data, value}` — tidak
memegang kunci. Cocok untuk dipanggil dari script deploy kita.

Deskripsi resminya: **"Built for autonomous AI agents but works for humans too."**
Digabung dengan `docs.ens.domains/building-with-ai/`, ini menyentuh langsung
kalimat bonus di track: *"Bonus points if you bring AI agents into the mix — think
agents as namespaces, each with their own identity and permissions."* Keeper kita
memang agent dengan namespace dan permission sendiri.

### Referensi

- `docs.ens.domains/ensv2/tutorial-contract-developers`
- `docs.ens.domains/ensv2/permissioned-registry`
- `docs.ens.domains/ensv2/permissioned-resolver`
- `docs.ens.domains/ensv2/enhanced-access-control`
- `docs.ens.domains/ensv2/verifiable-factory`
- `docs.ens.domains/building-with-ai/`
- `github.com/ensdomains/ens-cli`
- ENSIP-25, ENSIP-26

### Syarat track, verbatim

- Dibangun di ENSv2 (Sepolia)
- Fitur ENSv2 **sentral, bukan tempelan kosmetik**
- Demo **fungsional, bukan nilai hard-coded**
- Video/live demo + kode open source di GitHub

Hadiah: 1st $1.500 · 2nd $1.500 · 3rd $1.000 · runner-up $500.
