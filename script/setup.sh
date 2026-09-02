#!/usr/bin/env bash
# Install dependency open-source. Starter kit generik, bukan kode proyek.
#
# HANYA DUA DEP. v4-core, permit2, openzeppelin, dan solmate SENGAJA TIDAK
# di-install standalone — v4-periphery sudah membawa versi yang cocok, dan versi
# standalone-nya TIDAK kompatibel. Lihat docs/SETUP-LANDMINES.md #3 dan #4.
#
# SHA dipin: seluruh investigasi semalam adalah perburuan ketidakcocokan versi.
# Jangan un-pin tanpa menjalankan ulang test/_HarnessProbe.t.sol.
set -euo pipefail
cd "$(dirname "$0")/.."

FORGE_STD_SHA=452bdecf8772bf113532f67c5cf3accb71895cd0
V4_PERIPHERY_SHA=dce236d4e2057422d0791d9a973a58765eb46f65

[ -d .git ] || git init -q

[ -d lib/forge-std ]    || forge install "foundry-rs/forge-std@${FORGE_STD_SHA}"
[ -d lib/v4-periphery ] || forge install "Uniswap/v4-periphery@${V4_PERIPHERY_SHA}"

echo
echo "==> forge build (WAJIB penuh sekali: vm.getCode butuh artefak script/deps/*)"
forge build

echo
echo "==> smoke test harness"
forge test --match-contract HarnessProbe
