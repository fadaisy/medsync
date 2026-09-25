/**
 * Screenshots and an accessibility pass, driven through the pre-installed
 * Chromium. Not part of the build: it is how the phase gates are evidenced.
 *
 *   node scripts/shoot.mjs <url> <outDir> [--axe] [--zoom N] [--reduced]
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const [url = "http://localhost:5183", outDir = "screenshots", ...flags] = process.argv.slice(2);
const wantAxe = flags.includes("--axe");
const reduced = flags.includes("--reduced");
const zoomFlag = flags.indexOf("--zoom");
const zooms = zoomFlag >= 0 ? [Number(flags[zoomFlag + 1])] : [1, 2, 3, 4];
const settleFlag = flags.indexOf("--settle");
const settleMs = settleFlag >= 0 ? Number(flags[settleFlag + 1]) : 3500;

await mkdir(outDir, { recursive: true });

// This environment ships Chromium at a fixed path, built for a different
// Playwright revision than the one in node_modules, so point at it rather
// than downloading a second copy.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const sizes = [
  { name: "wide", width: 1440, height: 960 },
  { name: "phone", width: 390, height: 844 },
];

const problems = [];

for (const size of sizes) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error at ${size.name}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page error at ${size.name}: ${e.message}`));

  await page.goto(url, { waitUntil: "networkidle" });
  // Let the worker connect, then run the simulation forward so the traces
  // have something in them.
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /^Play\./ }).click();
  await page.getByRole("button", { name: /600x/ }).click();
  await page.waitForTimeout(settleMs);
  await page.getByRole("button", { name: /^Pause\./ }).click();
  await page.waitForTimeout(300);

  for (const zoom of zooms) {
    await page.getByRole("button", { name: String(zoom), exact: true }).click();
    await page.waitForTimeout(500);
    const suffix = reduced ? "-reduced" : "";
    await page.screenshot({
      path: `${outDir}/${size.name}-zoom${zoom}${suffix}.png`,
      fullPage: false,
    });
  }

  // Horizontal overflow is a failure at phone width, not a nuisance.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) problems.push(`horizontal overflow of ${overflow}px at ${size.name}`);

  if (wantAxe && size.name === "wide") {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    console.log(
      `axe-core: ${results.violations.length} violation(s) total, ${serious.length} serious or critical`,
    );
    for (const v of results.violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
      for (const node of v.nodes.slice(0, 3)) console.log(`      ${node.target.join(" ")}`);
    }
    if (serious.length > 0) problems.push(`${serious.length} serious axe violation(s)`);
  }

  await context.close();
}

await browser.close();

if (problems.length > 0) {
  console.error("\nProblems:");
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log("\nNo console errors, no page errors, no horizontal overflow.");
}
