#!/bin/sh
# No horizontal overflow at 375, on every route.
#
# Usage: sh web/scripts/overflow-check.sh [base-url]   (default http://localhost:4190)
# Exits 1 if any route's page scrolls horizontally.
#
# Why it is written this way. `body { overflow-x: hidden }` HIDES overflow, it does
# not prevent it — so the obvious check (scrollWidth > innerWidth) reports clean on
# a page that is in fact clipping content the user can never scroll to. This probe
# sets overflow-x back to visible before measuring, so the fault can actually be
# seen. It also ignores any element whose ancestor scrolls: a wide table inside its
# own overflow-x:auto wrapper is the CORRECT pattern, not an offender, and counting
# those buries the real ones (the ledger alone contributes ~58).
BASE="${1:-http://localhost:4190}"
PROBE='(() => {
  const b = document.body, prev = b.style.overflowX;
  b.style.overflowX = "visible";
  const vw = document.documentElement.clientWidth;
  const docW = Math.max(document.documentElement.scrollWidth, b.scrollWidth);
  const scrolls = el => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return true; } return false; };
  const bad = [];
  b.querySelectorAll("*").forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.left < -100) return;
    if (r.right > vw + 1 && !scrolls(el)) bad.push(el.tagName.toLowerCase() + "." + (el.className || "").toString().trim().split(/\s+/)[0] + " w=" + Math.round(r.width));
  });
  b.style.overflowX = prev;
  return JSON.stringify({ vw, docW, offenders: [...new Set(bad)].slice(0, 15) });
})()'

agent-browser set viewport 375 900 >/dev/null
fail=0
for R in "" how hire mandates bot lookup demo; do
  NAME=${R:-landing}
  agent-browser open "$BASE/?ov=$(date +%s)#/$R" >/dev/null
  sleep 2
  # agent-browser returns the string JSON-escaped, so unescape before matching —
  # otherwise every clean route reports FAIL and the check is noise.
  OUT=$(agent-browser eval "$PROBE" 2>&1 | tail -1 | sed 's/\\"/"/g')
  case "$OUT" in
    *'"offenders":[]'*) echo "OK   $NAME" ;;
    *) echo "FAIL $NAME  $OUT"; fail=1 ;;
  esac
done
exit $fail
