/**
 * Panels must not sit on top of one another.
 *
 *   npm run check:layout            (against a running preview on 5183)
 *   node scripts/layout-check.mjs http://localhost:5183
 *
 * This exists because they did. The middle column was laid out with
 * `grid-rows-[minmax(0,1.05fr)_minmax(0,1fr)]` and the two children carried
 * their own `min-h`. A zero row minimum lets a track shrink below what its
 * item needs, and the item then keeps its height and paints over the next row:
 * at 1440 by 700 the device stage overlapped the traces by thirty pixels and
 * the body drawing sat on the chart. Nothing had overflowed anything, so no
 * overflow check would have caught it, and the two viewport sizes the
 * screenshot script uses both happened to be tall enough to hide it.
 *
 * So this measures rectangles at several heights, not only the two pretty
 * ones, and fails if any two named panels intersect.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5183";

const SIZES = [
  { name: "1440x960", width: 1440, height: 960 },
  { name: "1440x800", width: 1440, height: 800 },
  { name: "1440x700", width: 1440, height: 700 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "390x844", width: 390, height: 844 },
];

/**
 * Panels that share a column and could therefore collide.
 *
 * Every one of these must exist. A selector that matches nothing is reported
 * rather than skipped, which is the only reason this list is worth keeping by
 * hand: it goes stale the moment somebody renames a panel, and then it says so.
 */
const PANELS = [
  'section[aria-label="Device stage"]',
  'section[aria-label="Traces"]',
  'section[aria-label="Safety supervisor"]',
  'section[aria-label="Scoreboard"]',
  'section[aria-label="Live readouts"]',
  'section[aria-label="Event log"]',
  'section[aria-label="Time"]',
  'section[aria-label="Physiology"]',
  'section[aria-label="Faults"]',
  'section[aria-label="Clinical"]',
  'section[aria-label="Scenarios"]',
];

/** Panels the Probe Lab deliberately replaces, so their absence is expected. */
const LAB_HIDES = [
  'section[aria-label="Traces"]',
  'section[aria-label="Safety supervisor"]',
  'section[aria-label="Scoreboard"]',
  'section[aria-label="Live readouts"]',
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const problems = [];

for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);

  for (const mode of ["device", "lab"]) {
    if (mode === "lab") {
      await page.getByRole("button", { name: "Probe Lab" }).click();
      await page.waitForTimeout(1200);
    }

    const found = await page.evaluate((selectors) => {
      /**
       * The rectangle a reader can actually see.
       *
       * `getBoundingClientRect` reports where an element is laid out, which
       * for something scrolled out of an `overflow-y: auto` container is a
       * position it is clipped away from. Comparing those raw rectangles
       * reports overlaps nobody can see, and a check that cries wolf gets
       * turned off. So each rectangle is intersected with every clipping
       * ancestor before anything is compared.
       */
      const visibleRect = (element) => {
        let r = element.getBoundingClientRect();
        let box = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
        let parent = element.parentElement;
        while (parent && parent !== document.documentElement) {
          const style = getComputedStyle(parent);
          const clips =
            style.overflowX !== "visible" ||
            style.overflowY !== "visible" ||
            style.clipPath !== "none";
          if (clips) {
            const p = parent.getBoundingClientRect();
            box = {
              top: Math.max(box.top, p.top),
              left: Math.max(box.left, p.left),
              right: Math.min(box.right, p.right),
              bottom: Math.min(box.bottom, p.bottom),
            };
          }
          parent = parent.parentElement;
        }
        return box;
      };

      const boxes = [];
      const missing = [];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          missing.push(selector);
          continue;
        }
        const r = element.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const box = visibleRect(element);
        // Entirely clipped away, so there is nothing to collide with.
        if (box.right - box.left <= 1 || box.bottom - box.top <= 1) continue;
        boxes.push({ selector, ...box });
      }
      const overlaps = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          // A pixel of rounding is not an overlap. Two is.
          if (x > 1 && y > 1) {
            overlaps.push({ a: a.selector, b: b.selector, x: Math.round(x), y: Math.round(y) });
          }
        }
      }
      return {
        overlaps,
        missing,
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, PANELS);

    for (const overlap of found.overlaps) {
      problems.push(
        `${size.name} ${mode}: ${overlap.a} overlaps ${overlap.b} by ${overlap.x} by ${overlap.y} px`,
      );
    }
    if (found.horizontal > 1) {
      problems.push(`${size.name} ${mode}: ${found.horizontal} px of horizontal overflow`);
    }
    // A selector that matches nothing is not a pass. This check spent its
    // first run reporting a clean bill of health while silently skipping the
    // one pair of panels that were actually on top of each other, because the
    // traces were a bare div and the list asked for a section.
    for (const selector of found.missing) {
      if (mode === "lab" && LAB_HIDES.includes(selector)) continue;
      problems.push(`${size.name} ${mode}: no element matches ${selector}`);
    }
    console.log(
      `  ${size.name.padEnd(9)} ${mode.padEnd(7)} ${found.overlaps.length} overlaps, ${found.horizontal} px horizontal overflow`,
    );
  }

  await context.close();
}

await browser.close();

if (problems.length > 0) {
  console.error("\nlayout problems:");
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
console.log("\nno panel overlaps and no horizontal overflow at any of the sizes checked.");
