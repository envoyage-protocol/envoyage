// WCAG 2.x contrast for hex pairs. usage: node contrast.mjs "#fg,#bg,label" ...
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
let bad = 0;
for (const arg of process.argv.slice(2)) {
  const [fg, bg, label, min = "4.5"] = arg.split(",");
  const r = ratio(fg, bg);
  const ok = r >= Number(min);
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"} ${r.toFixed(2)}:1  ${fg} on ${bg}  ${label ?? ""} (min ${min})`);
}
process.exit(bad ? 1 : 0);
