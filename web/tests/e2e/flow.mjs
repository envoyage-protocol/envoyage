/// Drives the real frontend against real Sepolia with a real key.
///
///   node tests/e2e/flow.mjs [--write] [--as keeper] [--base http://localhost:4190]
///
/// Without --write nothing is broadcast: it connects, walks the gated screens and
/// reports what they rendered. With --write it runs the hire sequence, which
/// signs and broadcasts for real. It will never revoke mandate No. 1 — that is
/// the permanent worked example on Home.
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

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const AS = args.includes("--as") ? args[args.indexOf("--as") + 1] : "owner";
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:4190";
const KEY = AS === "keeper" ? env.KEEPER_PRIVATE_KEY : env.DEPLOYER_PRIVATE_KEY;

const log = (...a) => console.log(...a);
const step = (s) => log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);

/// Text of the main region, whitespace-collapsed, for asserting on what rendered.
const mainText = (page) => page.locator("#main").innerText().then((t) => t.replace(/\s+/g, " ").trim());

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
  const page = await ctx.newPage();

  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));

  const wallet = await installWallet(page, {privateKey: KEY, rpcUrl: env.SEPOLIA_RPC_URL, label: AS});

  step("connect");
  await page.goto(`${BASE}/?e2e=${Date.now()}#/mandates`, {waitUntil: "networkidle"});
  await page.locator(".wallet .chip").click(); // the masthead chip; the panel has a second one
  await page.waitForFunction(() => !document.body.innerText.includes("Connect the wallet"), null, {timeout: 20000});
  const chip = await page.locator(".wallet .chip").innerText();
  log(`connected, wallet chip reads: ${chip.trim()}`);

  step("My mandates — rows from the subgraph, chain state read independently");
  await page.waitForFunction(() => /Mandate No\.|no mandates|could not/i.test(document.body.innerText), null, {timeout: 30000});
  await page.waitForTimeout(12000); // ENS resolve + pre-flight are separate async reads
  const mandates = await mainText(page);
  log(mandates.slice(0, 1200));

  step("Bot — keeper task list and decoded pre-flight");
  // In-app nav, NOT page.goto: a reload drops the session because the app never
  // restores an already-authorised wallet on mount.
  await page.locator(".tabs button", {hasText: /^Bot$/}).click();
  await page.waitForTimeout(9000);
  log((await mainText(page)).slice(0, 1000));

  step("Hire — position picker reads ownerOf and pool key from chain");
  await page.locator(".tabs button", {hasText: /^Hire a keeper$/}).click();
  await page.waitForTimeout(12000);
  log((await mainText(page)).slice(0, 1400));

  // Pick the first selectable position row, if there is one.
  const rows = page.locator(".ledger tbody tr");
  const n = await rows.count();
  log(`\nposition rows rendered: ${n}`);
  let picked = false;
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    const t = (await r.innerText()).replace(/\s+/g, " ");
    const disabled = await r.locator("button,input").first().isDisabled().catch(() => false);
    log(`  row ${i}: ${t.slice(0, 110)}${disabled ? "   [not selectable]" : ""}`);
    if (!picked && !disabled) {
      await r.click();
      picked = true;
      log(`  -> selected row ${i}`);
    }
  }

  if (picked) {
    step("Hire — the confirm sheet, mounted with real props");
    await page.waitForTimeout(6000);
    const review = page.getByRole("button", {name: /review and sign/i});
    if (await review.isEnabled().catch(() => false)) {
      await review.click();
      await page.waitForSelector(".confirm", {timeout: 10000});
      log((await page.locator(".confirm").innerText()).replace(/\n{2,}/g, "\n"));
      await page.screenshot({path: resolve(here, "../../../docs/submission/screens/e2e-confirm-live.png")});

      if (WRITE) {
        step("BROADCASTING — approve, grant, publish");
        await page.getByRole("button", {name: /sign in wallet/i}).click();
        for (let i = 0; i < 90; i++) {
          await page.waitForTimeout(4000);
          const t = await mainText(page);
          if (/is in force|bot is working/i.test(t)) {
            log("\nHIRE COMPLETE\n" + t.slice(0, 900));
            break;
          }
          if (i % 4 === 0) log(`  …${(await page.locator(".steps, .step-runner, #main").innerText()).replace(/\s+/g, " ").slice(0, 260)}`);
        }
        log("\ntransactions broadcast by the injected wallet:");
        wallet.sent.forEach((s, i) => log(`  ${i + 1}. https://sepolia.etherscan.io/tx/${s.hash}`));
      } else {
        log("\n(read-only: --write not passed, nothing broadcast)");
        await page.getByRole("button", {name: /^cancel$/i}).click();
      }
    } else {
      log("Review and sign is disabled — reporting why:");
      log((await mainText(page)).slice(-700));
    }
  }

  step("problems");
  log(problems.length ? [...new Set(problems)].join("\n") : "none");

  await browser.close();
}

run().catch((e) => {
  console.error("DRIVER FAILED:", e);
  process.exit(1);
});
