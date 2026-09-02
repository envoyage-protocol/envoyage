# Feedback — Uniswap Stack

> Wajib untuk track Uniswap. Link file ini ke
> https://developers.uniswap.org/hackathon-feedback saat submission.
> Diisi selama build, bukan di akhir — catatan yang ditulis saat masih bingung
> jauh lebih berguna bagi tim Uniswap daripada ringkasan setelah paham.

## Konteks

Apa yang dibangun, bagian stack mana yang dipakai.

## Yang berjalan baik

## Yang membingungkan

<!-- kandidat awal, verifikasi sendiri saat membangun:
     - Actions.sol memuat SWAP_EXACT_IN_SINGLE dst, tapi PositionManager._handleAction
       tidak men-dispatch-nya (revert UnsupportedAction). Aksi swap ada di V4Router.
       Ini tidak terlihat dari enum-nya saja dan memakan waktu untuk ditemukan.
     - Tidak ada aksi "collect"; panen fee = DECREASE_LIQUIDITY dengan liquidity 0.
     - Jalur pembayaran lewat Permit2 saat kontrak menjadi msgSender() -->

## Yang hilang

## Saran konkret
