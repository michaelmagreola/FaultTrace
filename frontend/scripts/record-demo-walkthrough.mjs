/**
 * FaultTrace ~4:00 silent walkthrough (timed to demo teleprompter beats).
 * Run:  cd frontend && node scripts/record-demo-walkthrough.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "..", "demo-artifacts");
const APP = process.env.FAULTTRACE_URL || "http://127.0.0.1:5173";
const API = process.env.FAULTTRACE_API || "http://127.0.0.1:8000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let t0 = 0;
const elapsed = () => Date.now() - t0;
const holdUntil = async (targetSec) => {
  const need = targetSec * 1000 - elapsed();
  if (need > 0) await sleep(need);
};

async function waitHealthy(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${API}/health`)).ok) return;
    } catch {
      /* retry */
    }
    await sleep(800);
  }
  throw new Error(`API not healthy at ${API}/health`);
}

async function login(page, roleValue, email, password) {
  await page.locator("#login-role").selectOption(roleValue);
  await page.locator("#login-email").fill(email);
  await sleep(400);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.getByRole("button", { name: /Sign out/i }).waitFor({ timeout: 20000 });
  await sleep(700);
}

async function signOut(page) {
  const btn = page.getByRole("button", { name: /Sign out/i });
  if (await btn.count()) {
    await btn.click();
    await page.locator("#login-form").waitFor({ timeout: 15000 });
    await sleep(500);
  }
}

async function main() {
  await waitHealthy();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // ===== 0:00–0:20 Open =====
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.locator("#login-form").waitFor();
  t0 = Date.now();
  await holdUntil(20);

  // ===== 0:20–0:55 Login =====
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await sleep(1000);
  await page.locator("#login-role").selectOption("technician");
  await page.locator("#login-email").fill("admin@cardinal.local");
  await page.locator("#login-password").fill("ADMIN");
  await sleep(2000);
  await page.locator("#login-email").fill("tech@cardinal.local");
  await page.locator("#login-password").fill("WRONGPASS");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await sleep(2000);
  await page.locator("#login-password").fill("ADMIN");
  await page.locator("#login-role").focus();
  await sleep(400);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    await sleep(450);
  }
  await page.getByRole("button", { name: /^Sign in$/i }).focus();
  await sleep(500);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Sign out/i }).waitFor();
  await holdUntil(55);

  // ===== 0:55–1:45 Search =====
  await page.getByRole("tab", { name: /^Search$/i }).click();
  const query = page.locator("#search-query");
  await query.fill("spndl drift");
  await sleep(600);
  await query.press("Enter");
  await sleep(3500);
  await query.fill("axis wander");
  await query.press("Enter");
  await sleep(3500);
  await query.fill("x");
  await page.getByRole("button", { name: /Search history/i }).click();
  await sleep(2000);
  await query.fill("zzzzqwerty999");
  await query.press("Enter");
  await sleep(3500);
  await query.fill("spndl drift");
  await query.press("Enter");
  await sleep(3000);
  const useful = page.getByRole("button", { name: /Mark .* useful|Mark useful/i }).first();
  if (await useful.isVisible().catch(() => false)) {
    await useful.click();
    await sleep(2000);
  }
  const safety = page.locator("aside.safety a").first();
  if (await safety.count()) {
    const popupPromise = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
    await safety.click();
    const popup = await popupPromise;
    await sleep(2000);
    if (popup) await popup.close();
  }
  await holdUntil(105);

  // ===== 1:45–2:15 Close-out =====
  await page.getByRole("tab", { name: /Close-out/i }).click();
  await sleep(800);
  await page.getByRole("button", { name: /Save close-out/i }).click();
  await sleep(1500);
  const mins = page.getByLabel(/Minutes down/i);
  await mins.fill("-1");
  await page.getByRole("button", { name: /Save close-out/i }).click();
  await sleep(1200);
  await mins.fill("999999");
  await page.getByRole("button", { name: /Save close-out/i }).click();
  await sleep(1400);
  await page.locator("form select").first().selectOption({ index: 1 });
  await page.getByLabel(/Fault code/i).fill("SPIN-DRFT");
  await page.getByLabel(/Symptom/i).fill("spndl drift after demo close-out warm-up");
  await page.getByLabel(/Cause/i).fill("loose coupling from demo recording");
  await page.getByLabel(/^Fix$/i).fill("tightened coupling bolts and re-indicated");
  await page.getByLabel(/Parts used/i).fill("M8 bolts");
  await mins.fill("45");
  await page.getByRole("button", { name: /Save close-out/i }).click();
  await sleep(2500);
  await page.getByRole("tab", { name: /^Search$/i }).click();
  await query.fill("spndl drift after demo close-out");
  await query.press("Enter");
  await sleep(3000);
  await holdUntil(135);

  // ===== 2:15–2:35 History =====
  await page.getByRole("tab", { name: /Asset history/i }).click();
  await sleep(2000);
  await page.getByRole("button", { name: /^Search$/i }).click();
  await sleep(1500);
  const histQ = page.getByLabel(/Search this asset/i);
  await histQ.fill("spindle drift");
  await histQ.press("Enter");
  await sleep(2800);
  const clear = page.getByRole("button", { name: /Clear/i });
  if (await clear.count()) await clear.click();
  await holdUntil(155);

  // ===== 2:35–3:10 Supervisor =====
  await signOut(page);
  await login(page, "planner", "planner@cardinal.local", "ADMIN");
  await page.getByRole("tab", { name: /Supervisor/i }).click();
  await sleep(2500);
  const daily = page.getByRole("tab", { name: /^Daily$/i });
  if (await daily.count()) {
    await daily.focus();
    await sleep(500);
    await page.keyboard.press("ArrowRight");
    await sleep(1200);
    await page.keyboard.press("ArrowRight");
    await sleep(1200);
    await page.keyboard.press("Home");
    await sleep(1000);
  }
  const copy = page.getByRole("button", { name: /Copy meeting brief/i });
  if (await copy.count()) {
    await copy.click();
    await sleep(1500);
  }
  await page.mouse.wheel(0, 700);
  await sleep(1800);
  await page.mouse.wheel(0, 700);
  await sleep(1500);
  await holdUntil(190);

  // ===== 3:10–3:40 Admin =====
  await signOut(page);
  await login(page, "admin", "admin@cardinal.local", "ADMIN");
  await page.getByRole("tab", { name: /^Admin$/i }).click();
  await sleep(2500);
  await page.mouse.wheel(0, 500);
  await sleep(2000);
  const empName = page.getByLabel(/Full name|Name/i).first();
  if (await empName.count()) {
    await empName.fill("Demo Tech");
    const emails = page.getByLabel(/^Email$/i);
    const emailField = (await emails.count()) > 1 ? emails.nth(1) : emails.first();
    await emailField.fill("tech@cardinal.local");
    await page.getByRole("button", { name: /Add employee/i }).click();
    await sleep(1800);
    await emailField.fill(`demo.tech.${Date.now()}@cardinal.local`);
    await page.getByRole("button", { name: /Add employee/i }).click();
    await sleep(2000);
  }
  const reembed = page.getByRole("button", { name: /Re-embed/i });
  if (await reembed.count()) {
    await reembed.click();
    await sleep(3000);
  }
  await holdUntil(220);

  // ===== 3:40–3:55 Error handling =====
  await page.getByRole("tab", { name: /^Search$/i }).click();
  await sleep(800);
  await page.route("**/api/search", (route) => route.abort("failed"));
  await query.fill("spndl drift");
  await query.press("Enter");
  await sleep(3500);
  await page.unroute("**/api/search");
  await query.press("Enter");
  await sleep(3000);
  await holdUntil(235);

  // ===== 3:55–4:00 Close hold =====
  await holdUntil(242);

  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  const finalName = path.join(OUT_DIR, "FaultTrace_Demo_Walkthrough_Silent.webm");
  await sleep(800);
  if (videoPath && fs.existsSync(videoPath)) {
    fs.copyFileSync(videoPath, finalName);
    try {
      fs.unlinkSync(videoPath);
    } catch {
      /* ignore */
    }
  }
  const downloads = path.join(
    process.env.USERPROFILE || "",
    "Downloads",
    "FaultTrace_Demo_Walkthrough_Silent.webm",
  );
  if (fs.existsSync(finalName)) fs.copyFileSync(finalName, downloads);

  const stats = fs.statSync(finalName);
  console.log("Recorded:", finalName);
  console.log("Copy:", downloads);
  console.log("Size MB:", (stats.size / (1024 * 1024)).toFixed(2));
  console.log("Elapsed script s:", Math.round(elapsed() / 1000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
