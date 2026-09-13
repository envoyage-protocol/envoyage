/// EIP-6963 multi-wallet discovery, driven against the real app.
///
///   node tests/e2e/providers.mjs
///
/// The discriminating design: `window.ethereum` is a THIRD wallet with its own
/// address. So "the app used the legacy slot" and "the app used the wallet the
/// user picked" produce different accounts on screen, and the test cannot pass by
/// accident. Against the old build — which read window.ethereum directly — case 1
/// connects 0xCCCC… and the assertion fails.
import {chromium} from "playwright";

const A = "0xAAAa000000000000000000000000000000000001";
const B = "0xbBbB000000000000000000000000000000000002";
const C = "0xCcCC000000000000000000000000000000000003";
const BASE = "http://localhost:4190";

let bad = 0;
const ck = (ok, label, detail = "") => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) bad++;
};

/// `announce` lists the wallets that answer eip6963:requestProvider. `legacy` is
/// what sits in window.ethereum. Either may be empty.
async function page(browser, {announce = [], legacy = null}) {
  const p = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
  p.on("pageerror", (e) => {
    console.log("   pageerror:", String(e).slice(0, 110));
    bad++;
  });
  await p.addInitScript(
    ({announce, legacy}) => {
      // Not previously authorised: eth_accounts answers empty, the way a wallet
      // does for an origin it has never been connected to. Without this the app
      // silently restores a session and the connect gate — the thing under test —
      // is never rendered at all.
      const make = (addr) => {
        let granted = false;
        return {
          request: async ({method}) => {
            if (method === "eth_accounts") return granted ? [addr] : [];
            if (method === "eth_requestAccounts") {
              granted = true;
              return [addr];
            }
            if (method === "eth_chainId") return "0xaa36a7";
            if (method === "wallet_switchEthereumChain") return null;
            return null;
          },
          on() {},
          removeListener() {}
        };
      };
      if (legacy) window.ethereum = make(legacy);
      const details = announce.map(([name, rdns, addr]) => ({
        info: {uuid: rdns, name, rdns, icon: ""},
        provider: make(addr)
      }));
      const fire = () => details.forEach((d) => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {detail: d})));
      window.addEventListener("eip6963:requestProvider", fire);
      fire();
    },
    {announce, legacy}
  );
  return p;
}

const chip = (p) => p.locator(".wallet .chip");

async function run() {
  const browser = await chromium.launch();

  console.log("\n1. two wallets announce: the page offers a choice, and honours it");
  {
    const p = await page(browser, {
      announce: [["Wallet Alpha", "io.alpha", A], ["Wallet Beta", "io.beta", B]],
      legacy: C // the trap: if the app reads the slot, it connects this instead
    });
    await p.goto(`${BASE}/?p=${Date.now()}#/`, {waitUntil: "networkidle"});
    await p.waitForTimeout(2500);
    ck((await chip(p).innerText()).includes("choose a wallet"), "the chip asks for a choice", await chip(p).innerText());
    ck((await p.locator(".wallet-swap").count()) === 0, "no second control in the masthead");
    await chip(p).click();
    await p.waitForTimeout(400);
    const names = await p.locator(".wallet-pick button").allInnerTexts();
    ck(names.length === 2, "both wallets are listed", names.join(" / "));
    await p.locator(".wallet-pick button", {hasText: "Wallet Beta"}).click();
    await p.waitForTimeout(2500);
    const t = await chip(p).innerText();
    ck(/0xbBbB|0xbbbb/i.test(t), "connected as the wallet that was PICKED, not the legacy slot", t);
    ck(!/0xCcCC|0xcccc/i.test(t), "the window.ethereum wallet was not used");

    // and the switch is reachable from the chip itself, mid-session
    await chip(p).click();
    await p.waitForTimeout(400);
    ck((await p.locator(".wallet-pick button").count()) === 2, "the chip reopens the list while connected");
    await p.locator(".wallet-pick button", {hasText: "Wallet Alpha"}).click();
    await p.waitForTimeout(2500);
    ck(/0xAAAa|0xaaaa/i.test(await chip(p).innerText()), "switched to the other wallet from the chip", await chip(p).innerText());
    await p.context().close();
  }

  console.log("\n2. one wallet announces: no picker, it just connects");
  {
    const p = await page(browser, {announce: [["Only Wallet", "io.only", A]], legacy: null});
    await p.goto(`${BASE}/?p=${Date.now()}#/`, {waitUntil: "networkidle"});
    await p.waitForTimeout(2500);
    ck((await chip(p).innerText()).includes("connect wallet"), "no choice is asked for", await chip(p).innerText());
    await chip(p).click();
    await p.waitForTimeout(2500);
    ck(/0xAAAa|0xaaaa/i.test(await chip(p).innerText()), "connected to the only wallet");
    ck((await p.locator(".wallet .chip").evaluate((e) => e.tagName)) === "SPAN", "a single wallet leaves a label, not a control");
    await p.context().close();
  }

  console.log("\n3. nothing announces: the legacy window.ethereum path is unchanged");
  {
    const p = await page(browser, {announce: [], legacy: C});
    await p.goto(`${BASE}/?p=${Date.now()}#/`, {waitUntil: "networkidle"});
    await p.waitForTimeout(2500);
    ck((await chip(p).innerText()).includes("connect wallet"), "same chip as before this change");
    await chip(p).click();
    await p.waitForTimeout(2500);
    ck(/0xCcCC|0xcccc/i.test(await chip(p).innerText()), "connected via window.ethereum", await chip(p).innerText());
    await p.context().close();
  }

  console.log("\n4. no wallet at all: the gate still points somewhere useful");
  {
    const p = await page(browser, {announce: [], legacy: null});
    await p.goto(`${BASE}/?p=${Date.now()}#/`, {waitUntil: "networkidle"});
    await p.waitForTimeout(2500);
    ck((await chip(p).innerText()).includes("get a wallet"), "offers to install one", await chip(p).innerText());
    await p.context().close();
  }

  await browser.close();
  console.log(bad ? `\n${bad} CHECK(S) FAILED` : "\nall checks passed");
  process.exit(bad ? 1 : 0);
}

run().catch((e) => {
  console.error("PROVIDER TEST FAILED:", e?.message ?? e);
  process.exit(1);
});
