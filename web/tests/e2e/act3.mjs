/// Act 3, end to end, the way the video performs it: the owner revokes, then the
/// SAME page — after switching accounts in the wallet — watches the bot be
/// refused.
///
///   node tests/e2e/act3.mjs
///
/// This must run in ONE browser session with a real account switch, not two
/// sessions. `KeeperActs` remembers `lastKeeper` from before the revoke zeroed
/// `mandate.keeper`; a page loaded fresh AFTER the revoke has no such memory, so
/// the retry button would be dead. Two sessions would "pass" while proving
/// nothing about the flow the author is going to record.
///
/// It revokes mandate No. 2, which is destructive and one-shot. restore-mandate2
/// re-hires position #39152 afterwards.
import {chromium} from "playwright";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {createWalletClient, createPublicClient, http, publicActions} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {sepolia} from "viem/chains";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, "../../../.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SHOTS = resolve(here, "../../../docs/submission/screens");
const BASE = "http://localhost:4190";
const log = (...a) => console.log(...a);

const key = (k) => (k.startsWith("0x") ? k : `0x${k}`);
const OWNER = privateKeyToAccount(key(env.DEPLOYER_PRIVATE_KEY));
const KEEPER = privateKeyToAccount(key(env.KEEPER_PRIVATE_KEY));

async function run() {
  const transport = http(env.SEPOLIA_RPC_URL);
  const pub = createPublicClient({chain: sepolia, transport});
  const clients = {
    [OWNER.address.toLowerCase()]: createWalletClient({account: OWNER, chain: sepolia, transport}).extend(publicActions),
    [KEEPER.address.toLowerCase()]: createWalletClient({account: KEEPER, chain: sepolia, transport}).extend(publicActions)
  };

  let current = OWNER; // the owner performs the revoke first
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1280, height: 1000}})).newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

  await page.exposeFunction("__act3", async (raw) => {
    const {method, params = []} = JSON.parse(raw);
    try {
      let r;
      if (method === "eth_requestAccounts" || method === "eth_accounts") r = [current.address];
      else if (method === "eth_chainId") r = "0xaa36a7";
      else if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") r = null;
      else if (method === "eth_sendTransaction" || method === "wallet_sendTransaction") {
        const t = params[0];
        const w = clients[current.address.toLowerCase()];
        r = await w.sendTransaction({
          account: current,
          to: t.to ?? undefined,
          data: t.data ?? undefined,
          value: t.value ? BigInt(t.value) : undefined,
          gas: t.gas ? BigInt(t.gas) : undefined
        });
      } else r = await pub.request({method, params});
      return JSON.stringify({ok: true, result: r});
    } catch (e) {
      let d = e;
      while (d?.cause) d = d.cause;
      return JSON.stringify({ok: false, error: {message: d?.message ?? e?.message ?? String(e), code: e?.code ?? -32000, data: e?.data ?? e?.cause?.data}});
    }
  });

  // The real accountsChanged event, so the page relearns the account the way it
  // would if the author switched in MetaMask mid-take.
  await page.exposeFunction("__switchTo", async (which) => {
    current = which === "keeper" ? KEEPER : OWNER;
    return current.address;
  });

  await page.addInitScript(() => {
    const L = {};
    window.ethereum = {
      isMetaMask: true,
      async request(a) {
        const r = JSON.parse(await window.__act3(JSON.stringify({method: a.method, params: a.params ?? []})));
        if (r.ok) return r.result;
        throw Object.assign(new Error(r.error.message), {code: r.error.code, data: r.error.data});
      },
      on(e, cb) {
        (L[e] ||= []).push(cb);
      },
      removeListener(e, cb) {
        L[e] = (L[e] || []).filter((f) => f !== cb);
      }
    };
    window.__emitAccounts = (addr) => (L["accountsChanged"] || []).forEach((cb) => cb([addr]));
  });

  const outcomeAfter = async (n, label, timeout = 300000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      await page.waitForTimeout(3000);
      const all = await page.locator(".outcome").allInnerTexts();
      if (all.length > n) return all.map((s) => s.replace(/\s+/g, " ").trim());
    }
    return [`(no outcome for ${label})`];
  };

  log("── open the Proof tab as the OWNER");
  await page.goto(`${BASE}/?act3=${Date.now()}#/`, {waitUntil: "networkidle"});
  await page.locator(".wallet .chip").click();
  await page.waitForTimeout(18000);

  const revoke = page.getByRole("button", {name: "Owner: revoke this mandate", exact: true});
  log(`  revoke button: count=${await revoke.count()} disabled=${await revoke.first().isDisabled().catch(() => "?")}`);
  await page.screenshot({path: `${SHOTS}/act3-1-before-revoke.png`, fullPage: true});

  const n0 = await page.locator(".outcome").count();
  await revoke.first().click();
  log("  pressed revoke, waiting for it to mine…");
  const afterRevoke = await outcomeAfter(n0, "revoke");
  log(`  → ${afterRevoke[afterRevoke.length - 1]}`);
  await page.screenshot({path: `${SHOTS}/act3-2-revoked.png`, fullPage: true});

  log("\n── switch the wallet to the KEEPER, in the same page");
  await page.evaluate(async () => {
    const a = await window.__switchTo("keeper");
    window.__emitAccounts(a);
  });
  await page.waitForTimeout(16000);
  const chip = await page.locator(".wallet .chip").innerText();
  log(`  wallet chip now: ${chip.trim()}`);

  const retry = page.getByRole("button", {name: "Bot: try to compound again", exact: true});
  log(`  retry button: count=${await retry.count()} disabled=${await retry.first().isDisabled().catch(() => "?")}`);
  const n1 = await page.locator(".outcome").count();
  await retry.first().click();
  log("  pressed retry, waiting…");
  const afterRetry = await outcomeAfter(n1, "retry");
  log(`  → ${afterRetry[afterRetry.length - 1]}`);
  await page.screenshot({path: `${SHOTS}/act3-3-bot-refused.png`, fullPage: true});

  log(`\npage errors: ${errs.length ? [...new Set(errs)].join(" | ") : "none"}`);
  await browser.close();
}

run().catch((e) => {
  console.error("ACT3 FAILED:", e?.message ?? e);
  process.exit(1);
});
