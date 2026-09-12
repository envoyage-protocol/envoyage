/// The reload behaviour, driven against the real app.
///
///   node tests/e2e/reconnect.mjs
///
/// Three things have to hold at once, and only the first is the feature:
///
///   1. after a real page reload, an already-authorised wallet comes back
///      without the user pressing anything;
///   2. a wallet that has NEVER authorised this origin is not connected, and —
///      the part that matters — `eth_requestAccounts` is never called on load,
///      because that is the call that opens a popup nobody asked for;
///   3. a locked wallet (authorised, but exposing no account) leaves the gate up
///      rather than half-restoring.
///
/// The provider here counts methods, so 2 is checked by what was CALLED rather
/// than by what happened to render.
import {chromium} from "playwright";
import {readFileSync} from "node:fs";
import {createPublicClient, http} from "viem";
import {sepolia} from "viem/chains";

const env = Object.fromEntries(
  readFileSync("../.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const pub = createPublicClient({chain: sepolia, transport: http(env.SEPOLIA_RPC_URL)});
const ADDR = "0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA";
const BASE = "http://localhost:4190";

/// authorised: has this origin been granted accounts already?
/// locked: wallet present and authorised but exposing nothing right now.
async function session(browser, {authorised, locked = false}) {
  const page = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
  const calls = [];
  let granted = authorised;
  await page.exposeFunction("__rc", async (raw) => {
    const {method, params = []} = JSON.parse(raw);
    calls.push(method);
    try {
      if (method === "eth_accounts") return JSON.stringify({ok: true, result: granted && !locked ? [ADDR] : []});
      if (method === "eth_requestAccounts") {
        granted = true; // a real prompt would have appeared here
        return JSON.stringify({ok: true, result: [ADDR]});
      }
      if (method === "eth_chainId") return JSON.stringify({ok: true, result: "0xaa36a7"});
      if (method === "wallet_switchEthereumChain") return JSON.stringify({ok: true, result: null});
      return JSON.stringify({ok: true, result: await pub.request({method, params})});
    } catch (e) {
      return JSON.stringify({ok: false, error: {message: e?.message ?? String(e), code: -32000}});
    }
  });
  await page.addInitScript(() => {
    const L = {};
    window.ethereum = {
      isMetaMask: true,
      async request(a) {
        const r = JSON.parse(await window.__rc(JSON.stringify({method: a.method, params: a.params ?? []})));
        if (r.ok) return r.result;
        throw Object.assign(new Error(r.error.message), {code: r.error.code});
      },
      on(e, cb) {
        (L[e] ||= []).push(cb);
      },
      removeListener(e, cb) {
        L[e] = (L[e] || []).filter((f) => f !== cb);
      }
    };
  });
  return {page, calls};
}

const connected = (page) => page.locator(".wallet .chip").innerText().then((t) => /0x3111/.test(t));

async function run() {
  const browser = await chromium.launch();
  let bad = 0;
  const check = (ok, label, detail = "") => {
    console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${detail ? `  — ${detail}` : ""}`);
    if (!ok) bad++;
  };

  console.log("\n1. an authorised wallet survives a real reload");
  {
    const {page, calls} = await session(browser, {authorised: true});
    await page.goto(`${BASE}/?rc=${Date.now()}#/mandates`, {waitUntil: "networkidle"});
    await page.waitForTimeout(9000);
    check(await connected(page), "connected on first load without pressing anything");
    calls.length = 0;
    await page.reload({waitUntil: "networkidle"});
    await page.waitForTimeout(9000);
    check(await connected(page), "still connected after reload");
    check(!calls.includes("eth_requestAccounts"), "reload did not call eth_requestAccounts", `calls: ${[...new Set(calls)].join(", ")}`);
    await page.context().close();
  }

  console.log("\n2. a wallet that never authorised this origin is NOT auto-connected");
  {
    const {page, calls} = await session(browser, {authorised: false});
    await page.goto(`${BASE}/?rc=${Date.now()}#/mandates`, {waitUntil: "networkidle"});
    await page.waitForTimeout(9000);
    check(!(await connected(page)), "gate stays up");
    check(calls.includes("eth_accounts"), "eth_accounts WAS called (the silent probe)");
    check(!calls.includes("eth_requestAccounts"), "eth_requestAccounts was NOT called — no unprompted popup");
    // and a manual press still works
    await page.locator(".wallet .chip").click();
    await page.waitForTimeout(9000);
    check(await connected(page), "manual connect still works after the silent probe");
    await page.context().close();
  }

  console.log("\n3. a locked wallet leaves the gate up");
  {
    const {page} = await session(browser, {authorised: true, locked: true});
    await page.goto(`${BASE}/?rc=${Date.now()}#/mandates`, {waitUntil: "networkidle"});
    await page.waitForTimeout(9000);
    check(!(await connected(page)), "no half-restored session");
    await page.context().close();
  }

  await browser.close();
  console.log(bad ? `\n${bad} CHECK(S) FAILED` : "\nall checks passed");
  process.exit(bad ? 1 : 0);
}

run().catch((e) => {
  console.error("RECONNECT TEST FAILED:", e?.message ?? e);
  process.exit(1);
});
