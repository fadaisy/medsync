/**
 * Frame rate and worker step budget, measured in the real browser.
 *
 *   node scripts/perf.mjs [url]
 *
 * Counts animation frames over a fixed wall-clock window at each acceleration
 * and reads the worker's own reported cost per simulated second off the page.
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

async function measure(speedLabel, seconds = 4) {
  await page.getByRole("button", { name: new RegExp(`^${speedLabel}$`) }).click();
  await page.waitForTimeout(500);
  const result = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - start < ms) requestAnimationFrame(tick);
          else resolve({ frames, elapsed: performance.now() - start });
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
  const fps = (result.frames / result.elapsed) * 1000;
  const readout = await page.locator("text=/us per simulated second/").first().innerText();
  return { fps, readout: readout.replace(/\s+/g, " ").trim() };
}

await page.getByRole("button", { name: /^Play\./ }).click();

const rows = [];
for (const speed of ["1x", "60x", "600x", "1440x"]) {
  const { fps, readout } = await measure(speed);
  rows.push({ speed, fps, readout });
}

await page.getByRole("button", { name: /^Pause\./ }).click();

console.log("acceleration   frames per second   worker readout");
let worst = Infinity;
for (const row of rows) {
  console.log(`  ${row.speed.padEnd(12)} ${row.fps.toFixed(1).padStart(8)}          ${row.readout}`);
  worst = Math.min(worst, row.fps);
}
console.log(`\nlowest frame rate across all accelerations: ${worst.toFixed(1)} fps`);

await browser.close();
if (worst < 55) {
  console.error("Frame rate fell below 55 fps.");
  process.exitCode = 1;
}
