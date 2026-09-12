/// The full owner journey, driven through the real UI against real Sepolia:
/// mint a demo position (7 steps), then hire the keeper on it (3 steps).
///
///   node tests/e2e/hire.mjs            # dry: stops at the confirm sheet
///   node tests/e2e/hire.mjs --write    # broadcasts, ~10 real transactions
///
/// It never touches position #39022. That one is approved to NaiveUtils and is
/// the Proof tab's theft demo; granting a mandate on it would re-approve it to
/// Envoyage (ERC-721 getApproved is a single slot) and silently break Act 1.
import {chromium} from "playwright";
import {installWallet} from "./wallet.mjs";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {createPublicClient, http, formatEther} from "viem";
import {sepolia} from "viem/chains";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, "../../../.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const WRITE = process.argv.includes("--write");
const TOKEN = process.argv.includes("--token") ? process.argv[process.argv.indexOf("--token") + 1] : null;
const BASE = "http://localhost:4190";
const SHOTS = resolve(here, "../../../docs/submission/screens");

const log = (...a) => console.log(...a);
const step = (s) => log(`\n══ ${s} ${"═".repeat(Math.max(0, 58 - s.length))}`);
const main = (page) => page.locator("#main").innerText().then((t) => t.replace(/[ \t]+/g, " ").trim());

/// Polls a predicate against the page's text, logging progress, so a stalled
/// step is visible as it happens rather than as a timeout at the end.
async function until(page, re, {timeout = 300000, label = "", every = 5000} = {}) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeout) {
    const t = await main(page);
    if (re.test(t)) return t;
    const tail = t.slice(-260).replace(/\n+/g, " ");
    if (tail !== last) {
      log(`   [${Math.round((Date.now() - t0) / 1000)}s] ${tail}`);
      last = tail;
    }
    await page.waitForTimeout(every);
  }
  throw new Error(`timed out waiting for ${label || re}`);
}

async function run() {
  const pub = createPublicClient({chain: sepolia, transport: http(env.SEPOLIA_RPC_URL)});
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1280, height: 1000}})).newPage();

  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => problems.push(String(e).slice(0, 200)));

  const wallet = await installWallet(page, {privateKey: env.DEPLOYER_PRIVATE_KEY, rpcUrl: env.SEPOLIA_RPC_URL, label: "owner"});
  const before = await pub.getBalance({address: wallet.address});
  log(`balance before: ${formatEther(before)} ETH`);

  step("connect + open Hire");
  await page.goto(`${BASE}/?e2e=${Date.now()}#/hire`, {waitUntil: "networkidle"});
  await page.locator(".wallet .chip").click();
  await until(page, /1 · Position/, {label: "hire screen"});
  log("hire screen up");

  let tokenId = TOKEN;
  if (TOKEN) {
    step(`use existing position #${TOKEN} via the paste field`);
    await page.locator('input[placeholder="38896"]').fill(TOKEN);
    await page.getByRole("button", {name: /^Check$/}).click();
    await until(page, new RegExp(`#${TOKEN}`), {label: "position accepted"});
    log(`position #${TOKEN} accepted by the picker`);
  } else {
    step("Get a demo position — the guided 7-step mint");
    await page.getByRole("button", {name: /No position\? Get a demo position/i}).click();
    await page.waitForTimeout(4000);

    if (!WRITE) {
      log("\n(dry run — not broadcasting. pass --write)");
      await browser.close();
      return;
    }

    await page.getByRole("button", {name: /^Get a demo position$/}).click();
    // NOT the mint panel's own success line: Hire hides that panel on success
    // (setShowMint(false)), so the message is gone within a tick and waiting on
    // it reports a false timeout for a mint that actually worked. Wait for the
    // sign steps to name the new token instead — that outlives the panel.
    const t = await until(page, /Publish \d+\.envoyage\.eth/, {label: "position mint", timeout: 420000});
    tokenId = t.match(/Publish (\d+)\.envoyage\.eth/)?.[1];
    log(`\nMINTED position #${tokenId}`);
  }
  if (!WRITE) {
    log("\n(dry run — not broadcasting. pass --write)");
    await browser.close();
    return;
  }
  await page.screenshot({path: `${SHOTS}/e2e-01-minted.png`, fullPage: true});

  step("the confirm sheet, mounted with real props");
  await until(page, /Review and sign/, {label: "sign button"});
  await page.waitForTimeout(6000);
  await page.getByRole("button", {name: /Review and sign/i}).click();
  await page.waitForSelector(".confirm", {timeout: 15000});
  log(await page.locator(".confirm").innerText());
  await page.screenshot({path: `${SHOTS}/e2e-02-confirm.png`});

  step("BROADCASTING approve → grant → publish");
  await page.getByRole("button", {name: /Sign in wallet/i}).click();
  const done = await until(page, /bot is working for you|is in force/i, {label: "hire completion", timeout: 600000});
  log(`\nHIRE COMPLETE\n${done.slice(0, 800)}`);
  await page.screenshot({path: `${SHOTS}/e2e-03-hired.png`, fullPage: true});

  step("verify in My mandates");
  await page.locator(".tabs button", {hasText: /^My mandates$/}).click();
  await until(page, new RegExp(`position #${tokenId}`), {label: "new row", timeout: 180000});
  await page.waitForTimeout(12000);
  const rows = await main(page);
  log(rows.match(new RegExp(`Mandate No\\. \\d+ · position #${tokenId}[\\s\\S]{0,500}`))?.[0] ?? rows.slice(0, 800));
  await page.screenshot({path: `${SHOTS}/e2e-04-mandates.png`, fullPage: true});

  step("verify through the ENS resolver on Lookup");
  await page.goto(`${BASE}/?e2e=${Date.now()}#/lookup/${tokenId}`, {waitUntil: "networkidle"});
  await page.waitForTimeout(15000);
  log((await main(page)).slice(0, 900));
  await page.screenshot({path: `${SHOTS}/e2e-05-lookup.png`, fullPage: true});

  step("transactions");
  wallet.sent.forEach((s, i) => log(`  ${String(i + 1).padStart(2)}. https://sepolia.etherscan.io/tx/${s.hash}`));
  const after = await pub.getBalance({address: wallet.address});
  log(`\nbalance after: ${formatEther(after)} ETH   (spent ${formatEther(before - after)})`);
  log(`problems: ${problems.length ? [...new Set(problems)].join(" | ") : "none"}`);

  await browser.close();
}

run().catch((e) => {
  console.error("DRIVER FAILED:", e?.message ?? e);
  process.exit(1);
});
