/**
 * FaultTrace demo walkthrough recorder (~4 minutes silent B-roll).
 * Run from frontend/:  node scripts/record-demo-walkthrough.mjs
 * Requires API :8000 and Vite :5173.
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

async function login(page, roleLabel, email, password) {
  await page.getByLabel("Role", { exact: true }).selectOption({ label: roleLabel });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await sleep(500);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.getByRole("button", { name: /Sign out/i }).waitFor({ timeout: 20000 });
  await sleep(900);
}

async function signOut(page) {
  const btn = page.getByRole("button", { name: /Sign out/i });
  if (await btn.count()) {
    await btn.click();
    await page.getByRole("heading", { name: /^Sign in$/i }).waitFor({ timeout: 15000 });
    await sleep(600);
  }
}

async function main() {
  await waitHealthy();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // 0:00 Open
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "FaultTrace" }).waitFor();
  await sleep(2500);

  // Invalid: empty submit
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await sleep(1200);

  // Wrong role/email combo
  await page.getByLabel("Role", { exact: true }).selectOption({ label: "Technician" });
  await page.getByLabel("Email", { exact: true }).fill("admin@cardinal.local");
  await page.getByLabel("Password", { exact: true }).fill("ADMIN");
  await sleep(1600);

  // Wrong password
  await page.getByLabel("Email", { exact: true }).fill("tech@cardinal.local");
  await page.getByLabel("Password", { exact: true }).fill("WRONGPASS");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await sleep(1600);

  // Focus rings / keyboard path then Enter on Sign in
  await page.getByLabel("Password", { exact: true }).fill("ADMIN");
  await page.getByLabel("Role", { exact: true }).focus();
  await sleep(350);
  await page.keyboard.press("Tab");
  await sleep(350);
  await page.keyboard.press("Tab");
  await sleep(350);
  await page.keyboard.press("Tab");
  await sleep(350);
  await page.getByRole("button", { name: /^Sign in$/i }).focus();
  await sleep(400);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Sign out/i }).waitFor({ timeout: 20000 });
  await sleep(2000);

  // Search
  await page.getByRole("tab", { name: /^Search$/i }).click();
  const query = page.locator("#search-query");
  await query.fill("spndl drift");
  await sleep(500);
  await query.press("Enter");
  await sleep(2600);

  await query.fill("axis wander");
  await query.press("Enter");
  await sleep(2600);

  await query.fill("x");
  await page.getByRole("button", { name: /Search history/i }).click();
  await sleep(1400);

  await query.fill("zzzzqwerty999");
  await query.press("Enter");
  await sleep(2600);

  await query.fill("spndl drift");
  await query.press("Enter");
  await sleep(2400);
  const useful = page.getByRole("button", { name: /Mark .* useful|Mark useful/i }).first();
  if (await useful.isVisible().catch(() => false)) {
    await useful.click();
    await sleep(1600);
  }

  const safety = page.locator("aside.safety a").first();
  if (await safety.count()) {
    const popupPromise = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
    await safety.click();
    const popup = await popupPromise;
    await sleep(1400);
    if (popup) await popup.close();
    await sleep(500);
  }

  // Close-out
  await page.getByRole("tab", { name: /Close-out/i }).click();
  await sleep(800);
  await page.getByRole("button", { name: /Save close-out/i }).click();
  await sleep(1200);

  const mins = page.getByLabel(/Minutes down/i);
  await mins.fill("-1");
  await page.getByRole("button", { name: /Save close-out/i }).click();
  await sleep(1000);
  await mins.fill("999999");
  await page.getByRole("button", { name: /Save close-out/i }).click();
  await sleep(1200);

  const assetSelect = page.locator("form select").first();
  await assetSelect.selectOption({ index: 1 });
  await page.getByLabel(/Fault code/i).fill("SPIN-DRFT");
  await page.getByLabel(/Symptom/i).fill("spndl drift after demo close-out warm-up");
  await page.getByLabel(/Cause/i).fill("loose coupling from demo recording");
  await page.getByLabel(/^Fix$/i).fill("tightened coupling bolts and re-indicated");
  await page.getByLabel(/Parts used/i).fill("M8 bolts");
  await mins.fill("45");
  await page.getByRole("button", { name: /Save close-out/i }).click();
  await sleep(2400);

  await page.getByRole("tab", { name: /^Search$/i }).click();
  await query.fill("spndl drift after demo close-out");
  await query.press("Enter");
  await sleep(2600);

  // History
  await page.getByRole("tab", { name: /Asset history/i }).click();
  await sleep(1600);
  await page.getByRole("button", { name: /^Search$/i }).click();
  await sleep(1200);
  const histQ = page.getByLabel(/Search this asset/i);
  await histQ.fill("spindle drift");
  await histQ.press("Enter");
  await sleep(2300);
  const clear = page.getByRole("button", { name: /Clear/i });
  if (await clear.count()) {
    await clear.click();
    await sleep(700);
  }

  // Supervisor
  await signOut(page);
  await login(page, "Supervisor", "planner@cardinal.local", "ADMIN");
  await page.getByRole("tab", { name: /Supervisor/i }).click();
  await sleep(2600);

  const daily = page.getByRole("tab", { name: /^Daily$/i });
  if (await daily.count()) {
    await daily.focus();
    await sleep(400);
    await page.keyboard.press("ArrowRight");
    await sleep(1000);
    await page.keyboard.press("ArrowRight");
    await sleep(1000);
    await page.keyboard.press("Home");
    await sleep(900);
  }

  const copy = page.getByRole("button", { name: /Copy meeting brief/i });
  if (await copy.count()) {
    await copy.click();
    await sleep(1200);
  }
  await page.mouse.wheel(0, 700);
  await sleep(1400);
  await page.mouse.wheel(0, 700);
  await sleep(1200);

  // Admin
  await signOut(page);
  await login(page, "Admin", "admin@cardinal.local", "ADMIN");
  await page.getByRole("tab", { name: /^Admin$/i }).click();
  await sleep(2400);
  await page.mouse.wheel(0, 550);
  await sleep(1200);

  const empName = page.getByLabel(/Full name|Name/i).first();
  const empEmail = page.locator("form").filter({ hasText: /Add employee|employee/i }).getByLabel(/^Email$/i).first();
  if (await empName.count()) {
    await empName.fill("Demo Tech");
    // fall back to second email field on admin page
    const emails = page.getByLabel(/^Email$/i);
    const emailField = (await emails.count()) > 1 ? emails.nth(1) : emails.first();
    await emailField.fill("tech@cardinal.local");
    await page.getByRole("button", { name: /Add employee/i }).click();
    await sleep(1500);
    await emailField.fill(`demo.tech.${Date.now()}@cardinal.local`);
    await page.getByRole("button", { name: /Add employee/i }).click();
    await sleep(1800);
  }

  const reembed = page.getByRole("button", { name: /Re-embed/i });
  if (await reembed.count()) {
    await reembed.click();
    await sleep(2800);
  }

  // Offline search simulation + recover
  await page.getByRole("tab", { name: /^Search$/i }).click();
  await sleep(700);
  await page.route("**/api/search", (route) => route.abort("failed"));
  await query.fill("spndl drift");
  await query.press("Enter");
  await sleep(2600);
  await page.unroute("**/api/search");
  await query.press("Enter");
  await sleep(2800);

  await sleep(2000);

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
      /* keep temp if locked */
    }
  }

  const downloads = path.join(
    process.env.USERPROFILE || "",
    "Downloads",
    "FaultTrace_Demo_Walkthrough_Silent.webm",
  );
  if (fs.existsSync(finalName)) fs.copyFileSync(finalName, downloads);

  const stats = fs.existsSync(finalName) ? fs.statSync(finalName) : null;
  console.log("Recorded:", finalName);
  console.log("Copy:", downloads);
  console.log("Size MB:", stats ? (stats.size / (1024 * 1024)).toFixed(2) : "n/a");
  console.log("Narrate with: demo-artifacts/FaultTrace_Demo_Teleprompter.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
