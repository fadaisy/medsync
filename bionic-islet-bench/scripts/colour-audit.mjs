/**
 * Colour audit.
 *
 *   node scripts/colour-audit.mjs [url]
 *
 * Red is reserved for the insulin path and the invalid or suspended state.
 * This walks every rendered element at every zoom level, in a valid state and
 * again in an invalid one, and lists every red thing it finds with enough
 * context to say whether it is allowed.
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

/**
 * Every intentionally red element declares why it is red, with data-red set
 * to "insulin" or "invalid". Sniffing nearby text would pass anything with
 * the right word next to it; a declaration is a rule the code has to keep.
 */
const DECLARED = ["insulin", "invalid"];

async function scan(label) {
  return page.evaluate(
    (allowedList) => {
      const isRed = (value) => {
        if (!value) return false;
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value);
        if (!m) return false;
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        const a = m[4] === undefined ? 1 : Number(m[4]);
        if (a < 0.05) return false;
        // Red family: red clearly dominant and the colour actually saturated.
        return r > 110 && r > g * 1.7 && r > b * 1.7;
      };
      const found = [];
      for (const el of document.querySelectorAll("*")) {
        const style = getComputedStyle(el);
        const props = [
          ["color", style.color],
          ["fill", style.fill],
          ["stroke", style.stroke],
          ["background", style.backgroundColor],
          ["border-top", style.borderTopColor],
          ["border-left", style.borderLeftColor],
        ];
        for (const [prop, value] of props) {
          if (!isRed(value)) continue;
          // Ignore borders that are fully transparent in practice.
          if (prop.startsWith("border") && style.borderTopWidth === "0px") continue;
          const declaredOn = el.closest("[data-red]");
          const declared = declaredOn?.getAttribute("data-red") ?? null;
          const context =
            (el.getAttribute("aria-label") || "") +
            " " +
            (el.textContent || "").slice(0, 90) +
            " " +
            (el.closest("[aria-label]")?.getAttribute("aria-label") || "");
          found.push({
            prop,
            value,
            tag: el.tagName,
            declared,
            context: context.replace(/\s+/g, " ").trim().slice(0, 90),
            allowed: declared !== null && allowedList.includes(declared),
          });
        }
      }
      return found;
    },
    DECLARED,
  );
}

const results = [];

// A valid, healthy device at each zoom level.
await page.getByRole("button", { name: /^Play\./ }).click();
await page.getByRole("button", { name: /600x/ }).click();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /^Pause\./ }).click();
for (const zoom of [1, 2, 3, 4]) {
  await page.getByRole("button", { name: String(zoom), exact: true }).click();
  await page.waitForTimeout(300);
  results.push([`valid, zoom ${zoom}`, await scan()]);
}

// Now break it, so the invalid state and the suspended pump are on screen.
await page.getByRole("button", { name: /^Lead A fracture\./ }).click();
await page.getByRole("button", { name: /^Lead B fracture\./ }).click();
await page.getByRole("button", { name: /^Play\./ }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /^Pause\./ }).click();
for (const zoom of [1, 2]) {
  await page.getByRole("button", { name: String(zoom), exact: true }).click();
  await page.waitForTimeout(300);
  results.push([`invalid, zoom ${zoom}`, await scan()]);
}

await browser.close();

let disallowed = 0;
const seen = new Map();
for (const [label, found] of results) {
  for (const item of found) {
    const key = `${item.tag}|${item.prop}|${item.declared}|${item.context}`;
    if (!seen.has(key)) seen.set(key, { ...item, where: new Set() });
    seen.get(key).where.add(label);
  }
}

console.log("Every red thing on the bench, and the purpose it declares:\n");
for (const item of seen.values()) {
  const mark = item.allowed ? "  ok " : "  ?? ";
  if (!item.allowed) disallowed += 1;
  console.log(
    `${mark}${item.tag.padEnd(8)} ${item.prop.padEnd(11)} ${(item.declared ?? "UNDECLARED").padEnd(11)} ${item.context || "(no text)"}`,
  );
}
console.log(`\n${seen.size} distinct red usage(s); ${disallowed} without a declared purpose of insulin or invalid.`);
if (disallowed > 0) process.exitCode = 1;
