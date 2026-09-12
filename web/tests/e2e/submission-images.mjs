/// The screenshots the submission form asks for (minimum 3; this makes 6).
///
///   node tests/e2e/submission-images.mjs
///
/// Cropped to one complete idea each, NOT full-page. A 1280x6000 capture is
/// technically the whole screen and useless in a gallery: the form scales it to a
/// thumbnail and nothing is readable. Each of these is roughly 16:10 and holds a
/// single argument a judge can take in at a glance.
///
/// The theft and the refusal need real outcomes on screen, so this presses those
/// two buttons for real — two transactions from the keeper wallet.
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
const OUT = resolve(here, "../../../docs/submission/images");
const BASE = "http://localhost:4190";

const log = (...a) => console.log(...a);

/// Screenshot a window of the page anchored on an element, so the frame contains
/// the whole idea rather than whatever happened to be at a fixed offset.
async function shotAround(page, selector, name, {pad = 24, height = 800} = {}) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const box = await el.boundingBox();
  const y = Math.max(0, box.y - pad);
  await page.screenshot({path: `${OUT}/${name}.png`, clip: {x: 0, y, width: 1280, height: Math.min(height, 1280 * 2)}});
  log(`  ✓ ${name}.png`);
}

async function press(page, label, timeout = 300000) {
  const btn = page.getByRole("button", {name: label, exact: true});
  if (!(await btn.count()) || (await btn.first().isDisabled())) return `skipped (${label})`;
  const before = await page.locator(".outcome").count();
  await btn.first().click();
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await page.waitForTimeout(3000);
    if ((await page.locator(".outcome").count()) > before) {
      await page.waitForTimeout(2500);
      return "ok";
    }
  }
  return "timeout";
}

async function run() {
  const browser = await chromium.launch();

  // ── the bot's side: the theft and the refusal ──────────────────────────
  {
    const page = await (await browser.newContext({viewport: {width: 1280, height: 1000}, deviceScaleFactor: 2})).newPage();
    await installWallet(page, {privateKey: env.KEEPER_PRIVATE_KEY, rpcUrl: env.SEPOLIA_RPC_URL, label: "bot"});
    await page.goto(`${BASE}/?img=${Date.now()}#/`, {waitUntil: "networkidle"});
    await page.locator(".wallet .chip").click();
    await page.waitForTimeout(20000);

    await shotAround(page, ".proof-lede", "01-the-claim", {pad: 0, height: 760});

    log(`  theft: ${await press(page, "Bot: withdraw everything to itself")}`);
    await shotAround(page, ".calldata", "02-the-theft", {pad: 430, height: 820});

    log(`  refusal: ${await press(page, "Bot: send the same theft to Envoyage")}`);
    await shotAround(page, ".duel-side", "03-refused-on-chain", {pad: 300, height: 860});

    await page.context().close();
  }

  // ── the owner's side ──────────────────────────────────────────────────
  {
    const page = await (await browser.newContext({viewport: {width: 1280, height: 1000}, deviceScaleFactor: 2})).newPage();
    await installWallet(page, {privateKey: env.DEPLOYER_PRIVATE_KEY, rpcUrl: env.SEPOLIA_RPC_URL, label: "owner"});
    await page.goto(`${BASE}/?img=${Date.now()}#/mandates`, {waitUntil: "networkidle"});
    await page.locator(".wallet .chip").click();
    await page.waitForTimeout(26000);
    await shotAround(page, ".page", "04-the-bot-working", {pad: 0, height: 900});

    await page.locator(".tabs button", {hasText: /^How it works$/}).click();
    await page.waitForTimeout(16000);
    await shotAround(page, ".registry-grid", "05-three-registries", {pad: 90, height: 900});

    await page.context().close();
  }

  // ── anyone, no wallet ─────────────────────────────────────────────────
  {
    const page = await (await browser.newContext({viewport: {width: 1280, height: 1000}, deviceScaleFactor: 2})).newPage();
    await page.goto(`${BASE}/?img=${Date.now()}#/lookup/1`, {waitUntil: "networkidle"});
    await page.waitForTimeout(18000);
    await shotAround(page, ".page", "06-anyone-can-audit", {pad: 0, height: 900});
    await page.context().close();
  }

  await browser.close();
}

run().catch((e) => {
  console.error("IMAGES FAILED:", e?.message ?? e);
  process.exit(1);
});
