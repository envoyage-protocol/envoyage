/// Runs the demo end to end and captures one screenshot per scene, in the order
/// the video tells it: the theft, the mandate that refuses it, then the machine
/// behind it.
///
///   node tests/e2e/demo.mjs
///
/// Every press sends a real transaction to Sepolia. The wallet plays THE BOT, so
/// it uses the keeper key — both theft presses are gated on the keeper address,
/// which is what makes "the same bot" literally the same address.
///
/// It deliberately does NOT press "Owner: revoke this mandate". That revokes
/// mandate No. 2 permanently, and act 3 of the video needs it intact. Revoke is
/// the one beat the author performs live on camera.
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

const log = (...a) => console.log(...a);
const text = (page) => page.locator("#main").innerText().then((t) => t.replace(/\s+/g, " ").trim());

async function scene(page, n, name, note) {
  await page.screenshot({path: `${SHOTS}/demo-${String(n).padStart(2, "0")}-${name}.png`, fullPage: true});
  log(`  📸 demo-${String(n).padStart(2, "0")}-${name}.png — ${note}`);
}

/// Press a labelled button and wait for its OUTCOME to render, not merely for the
/// page to change. The first version screenshotted while the transaction was
/// still in flight, so every scene showed "THE BOT IS WORKING…" instead of the
/// result — the presses had all succeeded on chain, and the pictures showed none
/// of it. The button owns its own lifecycle and renders an .outcome element when
/// it settles, so that element is the thing to wait for.
async function press(page, label, {timeout = 300000} = {}) {
  const btn = page.getByRole("button", {name: label, exact: true});
  if ((await btn.count()) === 0) return `NOT FOUND: ${label}`;
  if (await btn.first().isDisabled()) return `DISABLED: ${label}`;
  const before = await page.locator(".outcome").count();
  await btn.first().click();
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await page.waitForTimeout(3000);
    if ((await page.locator(".outcome").count()) > before) {
      await page.waitForTimeout(2500); // let the hash/link paint
      const all = await page.locator(".outcome").allInnerTexts();
      return all[all.length - 1].replace(/\s+/g, " ").trim();
    }
  }
  return "(no outcome within timeout)";
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 1280, height: 1000}});
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

  // The bot's own wallet: the keeper of mandate No. 1.
  const w = await installWallet(page, {privateKey: env.KEEPER_PRIVATE_KEY, rpcUrl: env.SEPOLIA_RPC_URL, label: "bot"});

  log("\n════ ACT 1 — the theft ════");
  await page.goto(`${BASE}/?demo=${Date.now()}#/`, {waitUntil: "networkidle"});
  await page.waitForTimeout(3000);
  await scene(page, 1, "proof-landing", "the opening claim, before anything is pressed");

  await page.locator(".wallet .chip").click();
  await page.waitForTimeout(12000);
  await scene(page, 2, "proof-connected", "wallet connected, playing the bot");

  log("  pressing: Bot: deliver to the owner");
  log(`  → ${await press(page, "Bot: deliver to the owner")}`);
  await scene(page, 3, "act1-honest", "the bot does its job: value to the owner");

  log("  pressing: Bot: withdraw everything to itself");
  log(`  → ${await press(page, "Bot: withdraw everything to itself")}`);
  await scene(page, 4, "act1-drained", "SAME bot, SAME instruction, one field changed — position drained");

  log("\n════ ACT 2 — the mandate refuses it ════");
  log("  pressing: Bot: send the same theft to Envoyage");
  log(`  → ${await press(page, "Bot: send the same theft to Envoyage")}`);
  await scene(page, 5, "act2-refused", "byte-identical calldata to Envoyage: a mined, failed transaction");

  log("  pressing: Bot: compound now");
  log(`  → ${await press(page, "Bot: compound now")}`);
  await scene(page, 6, "act2-compounded", "the one call the bot DOES have");
  log("  (not pressing 'Owner: revoke this mandate' — act 3 is performed live on camera)");

  log("\n════ ACT 3 — the machine behind it ════");
  await page.locator(".tabs button", {hasText: /^How it works$/}).click();
  await page.waitForTimeout(15000);
  await scene(page, 7, "how-it-works", "approval vs mandate, the three registries, the diagram");

  await page.locator(".tabs button", {hasText: /^Lookup$/}).click();
  await page.waitForTimeout(3000);
  await page.goto(`${BASE}/?demo=${Date.now()}#/lookup/1`, {waitUntil: "networkidle"});
  await page.waitForTimeout(16000);
  await scene(page, 8, "lookup-audit", "anyone audits it: ENS resolver left, subgraph ledger right");

  await page.goto(`${BASE}/?demo=${Date.now()}#/bot`, {waitUntil: "networkidle"});
  await page.locator(".wallet .chip").click();
  await page.waitForTimeout(20000);
  await scene(page, 9, "bot-tasklist", "the keeper's own view: the task list the real bot reads");
  await browser.close();

  // ── the owner's side ───────────────────────────────────────────────────
  log("\n════ the owner's side ════");
  const b2 = await chromium.launch();
  const p2 = await (await b2.newContext({viewport: {width: 1280, height: 1000}})).newPage();
  p2.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  await installWallet(p2, {privateKey: env.DEPLOYER_PRIVATE_KEY, rpcUrl: env.SEPOLIA_RPC_URL, label: "owner"});

  await p2.goto(`${BASE}/?demo=${Date.now()}#/mandates`, {waitUntil: "networkidle"});
  await p2.locator(".wallet .chip").click();
  await p2.waitForTimeout(24000);
  await scene(p2, 10, "my-mandates-live", "the bot compounding, unattended, right now");
  log(`  rows: ${(await text(p2)).slice(0, 400)}`);

  await p2.locator(".tabs button", {hasText: /^Hire a keeper$/}).click();
  await p2.waitForTimeout(12000);
  await p2.locator('input[placeholder="38896"]').fill("39247");
  await p2.getByRole("button", {name: /^Check$/}).click();
  await p2.waitForTimeout(16000);
  await scene(p2, 11, "hire-terms", "the owner sets the limits; the draft updates as they move");

  // The sheet is only reachable for a position with something left to sign. Every
  // position this wallet holds already carries a mandate, so the button is
  // correctly disabled and forcing the click just times out — the confirm sheet
  // for a real hire is captured by hire.mjs during an actual grant.
  const review = p2.getByRole("button", {name: /Review and sign/i});
  if ((await review.count()) && !(await review.first().isDisabled())) {
    await review.first().click();
    await p2.waitForSelector(".confirm", {timeout: 15000});
    await scene(p2, 12, "hire-confirm-sheet", "every transaction named before the first wallet prompt");
  } else {
    const why = (await text(p2)).match(/Mandate No\. \d+ is already live[^.]*\./)?.[0] ?? "(button disabled)";
    log(`  scene 12 skipped — ${why}`);
  }
  await b2.close();

  log(`\npage errors: ${errs.length ? [...new Set(errs)].join(" | ") : "none"}`);
  log("transactions broadcast by the bot wallet:");
  w.sent.forEach((s, i) => log(`  ${i + 1}. https://sepolia.etherscan.io/tx/${s.hash}`));
}

run().catch((e) => {
  console.error("DEMO FAILED:", e?.message ?? e);
  process.exit(1);
});
