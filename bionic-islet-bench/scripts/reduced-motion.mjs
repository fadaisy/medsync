/**
 * Reduced motion.
 *
 *   node scripts/reduced-motion.mjs [url]
 *
 * The rule is: freeze animation, keep the simulation and the numbers. So this
 * runs the bench with prefers-reduced-motion set and checks that simulated
 * time still advances, the readouts still change, and no CSS transition or
 * animation is left running.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5183";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  reducedMotion: "reduce",
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const problems = [];

const readClock = () =>
  page.locator("header").first().locator("text=/Day \\d+, \\d\\d:\\d\\d/").first().innerText();

await page.getByRole("button", { name: /^Play\./ }).click();
await page.getByRole("button", { name: /600x/ }).click();
const before = await readClock();
const glucoseBefore = await page.locator('[aria-label="Safety supervisor"]').innerText();
await page.waitForTimeout(2500);
const after = await readClock();
const glucoseAfter = await page.locator('[aria-label="Safety supervisor"]').innerText();
await page.getByRole("button", { name: /^Pause\./ }).click();

if (before === after) problems.push(`simulated time did not advance: still ${after}`);
if (glucoseBefore === glucoseAfter) problems.push("the readouts did not change while running");

// Nothing should be left animating or transitioning at a perceptible duration.
const moving = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    const durations = [
      ...style.transitionDuration.split(","),
      ...style.animationDuration.split(","),
    ].map((d) => parseFloat(d) || 0);
    const longest = Math.max(0, ...durations);
    if (longest > 0.01) {
      out.push(`${el.tagName}.${(el.className || "").toString().slice(0, 50)} = ${longest}s`);
    }
  }
  return out;
});
if (moving.length > 0) {
  problems.push(`${moving.length} element(s) still animating: ${moving.slice(0, 3).join(" | ")}`);
}

console.log(`simulated clock:  ${before}  ->  ${after}`);
console.log(`readouts changed: ${glucoseBefore !== glucoseAfter ? "yes" : "no"}`);
console.log(`elements with a perceptible transition or animation: ${moving.length}`);

await page.screenshot({ path: "screenshots/wide-zoom1-reduced.png" });
await browser.close();

if (problems.length > 0) {
  console.error("\nProblems:");
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log("\nAnimation is frozen; the simulation and the numbers keep running.");
}
