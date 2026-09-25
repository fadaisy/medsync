/**
 * The tip views at four glucose levels and at three ages.
 *
 *   node scripts/tip-gallery.mjs [url] [outDir]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] ?? "http://localhost:5183";
const outDir = process.argv[3] ?? "screenshots/tips";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const stage = page.locator('[aria-label="Device stage"]');

async function settle() {
  let previous = null;
  for (let i = 0; i < 500; i += 1) {
    const clock = await page.locator("header").first().innerText();
    if (clock === previous) return;
    previous = clock;
    await page.waitForTimeout(600);
  }
}

async function step(minutes) {
  for (let i = 0; i < minutes; i += 1) {
    await page.getByRole("button", { name: /^Step 1 min\./ }).click();
  }
}

async function capture(name) {
  await settle();
  for (const zoom of [3, 4]) {
    await page.getByRole("button", { name: String(zoom), exact: true }).click();
    await page.waitForTimeout(400);
    await stage.screenshot({ path: `${outDir}/${name}-zoom${zoom}.png` });
  }
  const glucose = await page.locator('[aria-label="Safety supervisor"]').innerText();
  const level = /Plasma glucose \(the truth\)\s*([\d.]+)/.exec(glucose.replace(/\n/g, " "));
  console.log(`  ${name.padEnd(22)} plasma ${level ? level[1] : "?"} mmol/L`);
}

/** Current plasma glucose, as the state card prints it. */
async function plasma() {
  const text = await page.locator('[aria-label="Safety supervisor"]').innerText();
  const m = /Plasma glucose \(the truth\)\s*([\d.]+)/.exec(text.replace(/\n/g, " "));
  return m ? Number(m[1]) : NaN;
}

/** Step until plasma glucose passes a level in the given direction. */
async function stepUntil(level, direction, limitMinutes = 400) {
  for (let i = 0; i < limitMinutes / 5; i += 1) {
    const value = await plasma();
    if (direction === "up" && value >= level) return value;
    if (direction === "down" && value <= level) return value;
    await step(5);
  }
  return plasma();
}

console.log("four glucose levels, on one unannounced excursion:");
await capture("glucose-1-fasting");
await page.getByRole("button", { name: /^Unannounced\./ }).click();
await page.getByRole("button", { name: /^Meal 90 g\./ }).click();
await stepUntil(9, "up");
await capture("glucose-2-rising");
await stepUntil(12.5, "up");
await capture("glucose-3-peak");
await stepUntil(7, "down");
await capture("glucose-4-falling");

console.log("\nthree ages:");

/** Load a scenario and wait for it to finish computing. */
async function loadScenario(title) {
  await page.locator(`section[aria-label="Scenarios"] button:has-text("${title}")`).first().click();
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => !document.querySelector("[data-progress]"), null, {
    timeout: 600_000,
  });
}

// The three ages come from scenarios rather than from wall-clock waits: the
// scenarios are deterministic, they are the same runs the tests assert on,
// and they do not depend on how fast this machine happens to be.
await loadScenario("Ordinary day");
await capture("age-day-1");

await loadScenario("Six months in");
await capture("age-day-181");

await loadScenario("Steroid collar removed");
await capture("age-day-365");

await browser.close();
console.log(`\nwritten to ${outDir}`);
