#!/usr/bin/env bash
# Installs open-source dependencies. Generic starter-kit setup, not project code.
#
# EXACTLY TWO DEPENDENCIES. v4-core, permit2, openzeppelin and solmate are
# DELIBERATELY not installed standalone — v4-periphery already vendors compatible
# versions, and the standalone versions are NOT compatible with it.
# See docs/SETUP-LANDMINES.md #3 and #4.
#
# The SHAs are pinned: an entire night of investigation was version-mismatch
# hunting. Do not un-pin without re-running test/_HarnessProbe.t.sol.
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
