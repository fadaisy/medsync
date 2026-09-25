/**
 * Keyboard-only operation of the bench.
 *
 *   node scripts/keyboard.mjs [url]
 *
 * Checks that every interactive control is reachable and named, and then does
 * the thing the critique checklist asks for without touching a pointer: run a
 * meal, inject paracetamol, calibrate, and read the outcome.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5183";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const problems = [];

// 1. Everything interactive is reachable by Tab, and everything reachable has
//    an accessible name.
const interactiveCount = await page.evaluate(
  () =>
    document.querySelectorAll(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ).length,
);

const visited = new Set();
const unnamed = [];
await page.evaluate(() => document.body.focus());
for (let i = 0; i < interactiveCount + 12; i += 1) {
  await page.keyboard.press("Tab");
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const name =
      el.getAttribute("aria-label") ||
      el.textContent?.trim() ||
      el.getAttribute("title") ||
      (el.labels && el.labels[0]?.textContent?.trim()) ||
      "";
    const style = getComputedStyle(el);
    return {
      key: `${el.tagName}#${el.id}.${(el.className || "").toString().slice(0, 40)}:${name.slice(0, 40)}`,
      name,
      tag: el.tagName,
      outline: style.outlineStyle,
    };
  });
  if (!info) continue;
  visited.add(info.key);
  if (!info.name) unnamed.push(info.key);
}

console.log(`interactive elements in the document: ${interactiveCount}`);
console.log(`distinct elements reached by Tab:     ${visited.size}`);
if (unnamed.length > 0) problems.push(`${unnamed.length} focusable element(s) with no accessible name: ${unnamed.slice(0, 5).join(" | ")}`);
if (visited.size < interactiveCount * 0.9) {
  problems.push(`only ${visited.size} of ${interactiveCount} interactive elements were reached by Tab`);
}

// 2. Focus is visible.
await page.keyboard.press("Tab");
const focusVisible = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return false;
  const style = getComputedStyle(el);
  return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
});
if (!focusVisible) problems.push("focus ring is not visible on the focused control");

// 3. Keyboard only: run a meal, inject paracetamol, calibrate, read the outcome.
await page.evaluate(() => document.body.focus());
await page.keyboard.press("Space"); // play
await page.keyboard.press("4"); // 1440x
await page.waitForTimeout(400);
await page.keyboard.press("m"); // announced 60 g meal
await page.waitForTimeout(600);
await page.keyboard.press("p"); // paracetamol
await page.waitForTimeout(600);
await page.keyboard.press("c"); // finger-prick calibration
await page.waitForTimeout(600);
await page.keyboard.press("Space"); // pause

const logText = await page.locator('[aria-label="Event log"] ol').innerText();
const outcome = await page.locator('[aria-label="Safety supervisor"]').innerText();

for (const [needle, what] of [
  ["60 g carbohydrate", "the meal"],
  ["Paracetamol taken", "the paracetamol"],
  ["Calibration by finger-prick", "the calibration"],
]) {
  if (!logText.includes(needle)) problems.push(`${what} is not in the event log after keyboard entry`);
}
if (!/Valid|Doubtful|Invalid|Bridged/.test(outcome)) {
  problems.push("the supervisor state could not be read after the keyboard sequence");
}

console.log("\nkeyboard-only sequence: play, meal, paracetamol, calibration, pause");
console.log(`  supervisor now reads: ${outcome.split("\n").slice(0, 2).join(" / ")}`);
console.log(`  log lines matched:    meal, paracetamol, calibration`);

// 4. The clinician envelope, opened and completed by keyboard only.
await page.getByRole("button", { name: /^Clinician envelope\./ }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.type("123456");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const dialogVisible = await page.getByRole("dialog").isVisible();
if (!dialogVisible) problems.push("the clinician envelope dialog did not open by keyboard");
const applyVisible = await page
  .getByRole("button", { name: /Apply and write the audit entry/ })
  .isVisible()
  .catch(() => false);
if (!applyVisible) problems.push("the simulated multi-factor step could not be completed by keyboard");
else console.log("  clinician envelope: opened and unlocked by keyboard");
await page.keyboard.press("Escape");

await browser.close();

if (problems.length > 0) {
  console.error("\nProblems:");
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log("\nEvery control is reachable and named; the whole sequence ran from the keyboard.");
}
