/// Captures one screenshot per stage of every wallet-gated flow, against real
/// Sepolia with a real wallet. Read-only: it broadcasts nothing.
///
///   node tests/e2e/capture.mjs
///
/// The hire sequence's own stages (mint, confirm sheet, completion) are captured
/// by hire.mjs during a live run, because they only exist while it is running.
/// This covers everything reachable without broadcasting: both wallet identities,
/// the gate states, and the screens as they look with live data in them.
import {chromium} from "playwright";
import {installWallet} from "./wallet.mjs";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, "../../../.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SHOTS = resolve(here, "../../../docs/submission/screens");
const BASE = "http://localhost:4190";
const TOKEN = "39247";

async function shot(page, name, note) {
  await page.screenshot({path: `${SHOTS}/${name}.png`, fullPage: true});
  const t = (await page.locator("#main").innerText()).replace(/\s+/g, " ");
  console.log(`  ✓ ${name}.png — ${note}\n      ${t.slice(0, 150)}…`);
}

async function session(role, key) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1280, height: 1000}})).newPage();
  await installWallet(page, {privateKey: key, rpcUrl: env.SEPOLIA_RPC_URL, label: role});
  return {browser, page};
}

const go = async (page, route, wait = 14000) => {
  await page.locator(".tabs button", {hasText: route}).click();
  await page.waitForTimeout(wait);
};

async function run() {
  // ── owner ────────────────────────────────────────────────────────────────
  console.log("\n── as the OWNER (grantor of every mandate) ──");
  {
    const {browser, page} = await session("owner", env.DEPLOYER_PRIVATE_KEY);

    // The gate itself, before connecting: this is what a judge sees first.
    await page.goto(`${BASE}/?c=${Date.now()}#/mandates`, {waitUntil: "networkidle"});
    await page.waitForTimeout(2500);
    await shot(page, "e2e-10-gate-before-connect", "wallet gate, no account yet");

    await page.locator(".wallet .chip").click();
    await page.waitForTimeout(20000);
    await shot(page, "e2e-11-mandates-owner", "live rows: subgraph executions + chain state + ENS");

    await go(page, /^Hire a keeper$/);
    await shot(page, "e2e-12-hire-empty", "position picker before a position is chosen");

    // Select the position the live hire run created, to show the picked state.
    await page.locator('input[placeholder="38896"]').fill(TOKEN);
    await page.getByRole("button", {name: /^Check$/}).click();
    await page.waitForTimeout(16000);
    await shot(page, "e2e-13-hire-position-picked", `position #${TOKEN} read from chain, terms + draft mandate`);

    await go(page, /^Bot$/);
    await shot(page, "e2e-14-bot-not-keeper", "owner wallet is not a keeper: explanatory panel, no actions");

    await browser.close();
  }

  // ── keeper ───────────────────────────────────────────────────────────────
  console.log("\n── as the KEEPER (the reference bot's own wallet) ──");
  {
    const {browser, page} = await session("keeper", env.KEEPER_PRIVATE_KEY);
    await page.goto(`${BASE}/?c=${Date.now()}#/bot`, {waitUntil: "networkidle"});
    await page.locator(".wallet .chip").click();
    await page.waitForTimeout(22000);
    await shot(page, "e2e-15-bot-keeper-tasklist", "the task list the real bot reads: canCompound() + simulated compound");

    await go(page, /^My mandates$/);
    await shot(page, "e2e-16-mandates-keeper-empty", "keeper granted nothing: empty state, not an error");

    await browser.close();
  }

  // ── no wallet ────────────────────────────────────────────────────────────
  console.log("\n── with NO wallet (what an auditor sees) ──");
  {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({viewport: {width: 1280, height: 1000}})).newPage();
    for (const [q, name, note] of [
      ["1", "e2e-17-lookup-mandate1", "mandate No. 1 — ENS resolver left, subgraph right, loaded independently"],
      [`${TOKEN}.envoyage.eth`, "e2e-18-lookup-by-ens-name", "same card reached by ENS name instead of mandate number"]
    ]) {
      await page.goto(`${BASE}/?c=${Date.now()}#/lookup/${encodeURIComponent(q)}`, {waitUntil: "networkidle"});
      await page.waitForTimeout(16000);
      await shot(page, name, note);
    }
    await browser.close();
  }
}

run().catch((e) => {
  console.error("CAPTURE FAILED:", e?.message ?? e);
  process.exit(1);
});
