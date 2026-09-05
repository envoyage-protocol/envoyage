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

## Signature yang dipakai

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
