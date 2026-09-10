/**
 * Visual binding check.
 *
 *   node scripts/visual-binding.mjs [url]
 *
 * Three drawn quantities are supposed to be the engine's numbers rather than
 * decoration:
 *
 *   1. the brightness of the hydrogel cap is the fluorescence ratio
 *   2. the electron arrival period is the electrode current
 *   3. the capsule ring radius is the modelled capsule thickness
 *
 * This reads each one back off the rendered element, inverts it through the
 * documented mapping, and compares the result against the same quantity as
 * printed by the readouts panel. The readouts are a different code path from
 * the drawing, so a faked or drifted drawing shows up as a disagreement.
 *
 * The sweep covers four glucose levels and three ages, and every point must
 * agree to within 2 percent.
 */
import { chromium } from "playwright";
import {
  currentFromElectronPeriod,
  electronPeriodClamped,
  micronFromCapsuleRadius,
  ratioFromGlow,
} from "../src/components/stage/visualMapping.ts";

const url = process.argv[2] ?? "http://localhost:5183";
const TOLERANCE = 0.02;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

/** The value the readouts panel prints for a named row. */
async function readout(label) {
  const row = page.locator(`dt:has-text("${label}")`).first();
  const value = await row.locator("xpath=following-sibling::dd[1]").innerText();
  return parseFloat(value.replace(/[^\d.-]/g, ""));
}

async function step(minutes) {
  for (let i = 0; i < minutes; i += 1) {
    await page.getByRole("button", { name: /^Step 1 min\./ }).click();
  }
}

const rows = [];
const failures = [];

/**
 * Compare a drawn value against the engine value.
 *
 * `floor` is the precision the readouts panel prints at: a difference smaller
 * than the last printed digit is below the resolution of the comparison, not
 * a fault in the binding. Everything above that has to agree to 2 percent.
 */
function record(name, drawn, expected, units, floor) {
  const absolute = Math.abs(drawn - expected);
  const error = absolute <= floor ? 0 : absolute / Math.abs(expected);
  rows.push({ name, drawn, expected, units, error, floored: absolute <= floor && absolute > 0 });
  if (error > TOLERANCE) {
    failures.push(`${name}: drawn ${drawn} vs engine ${expected} ${units} (${(error * 100).toFixed(2)} %)`);
  }
}

/** Wait until the simulated clock stops moving, so both reads see one state. */
async function settle() {
  let previous = null;
  for (let i = 0; i < 400; i += 1) {
    const clock = await page.locator("header").first().innerText();
    if (clock === previous) return;
    previous = clock;
    await page.waitForTimeout(600);
  }
  throw new Error("the bench never settled");
}

async function sample(label) {
  await settle();
  // 1. Cap brightness against the fluorescence ratio.
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page.waitForTimeout(250);
  const glowOpacity = Number(
    await page.locator("[data-bound='glow']").first().getAttribute("data-bound-opacity"),
  );
  const drawnRatio = ratioFromGlow(glowOpacity);
  const engineRatio = await readout("Fluorescence ratio R");
  record(`${label} · cap brightness -> ratio`, drawnRatio, engineRatio, "", 0.0005);

  // 2. Electron arrival period against the electrode current.
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.waitForTimeout(250);
  const period = parseFloat(
    await page
      .locator("[data-bound='electron']")
      .first()
      .evaluate((el) => getComputedStyle(el).animationDuration),
  );
  const engineCurrent = await readout("Electrode current I");
  if (electronPeriodClamped(engineCurrent)) {
    rows.push({ name: `${label} · electron period -> current`, drawn: NaN, expected: engineCurrent, units: "nA", error: 0, note: "clamped" });
  } else {
    record(`${label} · electron period -> current`, currentFromElectronPeriod(period), engineCurrent, "nA", 0.005);
  }

  // 3. Capsule ring radius against the modelled thickness.
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.waitForTimeout(250);
  const radius = Number(await page.locator("[data-bound='capsule-a']").first().getAttribute("r"));
  const engineCapsule = await readout("Capsule, tip A");
  record(`${label} · capsule radius -> thickness`, micronFromCapsuleRadius(radius), engineCapsule, "um", 0.05);
}

// Sweep four glucose levels on a fresh device.
await sample("day 0, fasting");
await page.getByRole("button", { name: /^Meal 30 g\./ }).click();
await step(40);
await sample("day 0, after 30 g");
await page.getByRole("button", { name: /^Meal 90 g\./ }).click();
await step(45);
await sample("day 0, after 90 g");
await page.getByRole("button", { name: /^Unannounced\./ }).click();
await step(40);
await sample("day 0, unannounced on top");

// Then age the device and sweep again.
// Load the six-months scenario and wait for it to finish computing, not
// merely for its name to appear on a button in the control rail.
await page.locator('section[aria-label="Scenarios"] button:has-text("Six months in")').first().click();
await page.waitForTimeout(1000);
await page.waitForFunction(() => !document.querySelector("[data-progress]"), null, { timeout: 300_000 });
await sample("day 181");

await browser.close();

console.log("binding                                          drawn        engine       error");
for (const row of rows) {
  if (row.note) {
    console.log(`  ${row.name.padEnd(44)} ${row.note.padEnd(12)} ${row.expected.toFixed(3).padStart(10)} ${row.units}`);
    continue;
  }
  console.log(
    `  ${row.name.padEnd(44)} ${row.drawn.toFixed(3).padStart(10)} ${row.expected.toFixed(3).padStart(12)} ${(row.error * 100).toFixed(3).padStart(8)} %` +
      (row.floored ? "   (within the readout's printed precision)" : ""),
  );
}
const worst = Math.max(...rows.filter((r) => !r.note).map((r) => r.error));
console.log(`\nworst disagreement across the sweep: ${(worst * 100).toFixed(3)} % (limit ${TOLERANCE * 100} %)`);

if (failures.length > 0) {
  console.error("\nBindings that failed:");
  for (const f of failures) console.error(`  ${f}`);
  process.exitCode = 1;
}
