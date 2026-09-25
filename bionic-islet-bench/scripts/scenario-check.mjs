/**
 * Scenarios, the comparison, and the export, checked in the browser.
 *
 *   node scripts/scenario-check.mjs [url]
 *
 * Runs each of the nine scenarios on the bench, reads back whether the bench
 * says its expectation was met, then demonstrates the scenario 3 against 4
 * divergence and downloads and parses the comma-separated export.
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://localhost:5183";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const problems = [];

const TITLES = [
  "Ordinary day",
  "Unannounced meal",
  "Paracetamol at 14:00",
  "Paracetamol with a fouled tip B",
  "Six months in",
  "Omental wrapping of tip A",
  "Lead B fracture",
  "Phone lost for six hours",
  "Steroid collar removed",
];

async function loadScenario(title) {
  await page.locator(`section[aria-label="Scenarios"] button:has-text("${title}")`).first().click();
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => !document.querySelector("[data-progress]"), null, {
    timeout: 600_000,
  });
  await page.waitForSelector('[aria-label="Scenario result"]', { timeout: 30_000 });
}

console.log("scenario                          verdict on the bench");
for (const title of TITLES) {
  await loadScenario(title);
  const card = await page.locator('[aria-label="Scenario result"]').last().innerText();
  const met = card.includes("expectation met");
  const observed = /observed\s+([^\n]+)/i.exec(card);
  console.log(`  ${title.padEnd(32)} ${met ? "MET " : "NOT MET"}  ${observed ? observed[1].slice(0, 76) : ""}`);
  if (!met) problems.push(`${title}: the bench reports the expectation was not met`);
}

// Scenario 3 against scenario 4, side by side.
await loadScenario("Paracetamol at 14:00");
await page.getByRole("button", { name: /Compare 3 and 4/ }).click();
await page.waitForFunction(() => !document.querySelector("[data-progress]"), null, { timeout: 120_000 });
await page.waitForSelector("text=The same interferent, twice", { timeout: 30_000 });
const comparison = await page.locator('[aria-label="Scenario result"]').last().innerText();
console.log("\nscenario 3 against scenario 4, as the bench shows them:\n");
console.log(
  comparison
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => `  ${line}`)
    .join("\n"),
);
if (!comparison.includes("invalid") || !comparison.includes("doubtful-one")) {
  problems.push("the comparison table does not show the two supervisor states diverging");
}
await page.locator('[aria-label="Scenario result"]').last().screenshot({ path: "screenshots/scenario-3-vs-4.png" });

// The export.
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: /Export comma-separated/ }).click(),
]);
const path = await download.path();
const csv = await readFile(path, "utf8");
const lines = csv.trim().split("\n");
const header = lines[0];
if (header !== "simulated_seconds,simulated_time,stream,code,message") {
  problems.push(`unexpected export header: ${header}`);
}

/** Parse it the way a spreadsheet would. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const parsed = parseCsv(csv.trim());
const badRows = parsed.filter((r) => r.length !== 5);
console.log(`\nexport: ${parsed.length - 1} data row(s), ${parsed[0].length} columns`);
console.log(`  header  ${parsed[0].join(" | ")}`);
if (parsed[1]) console.log(`  first   ${parsed[1].join(" | ").slice(0, 120)}`);
if (badRows.length > 0) problems.push(`${badRows.length} export row(s) do not have 5 fields`);
if (parsed.length < 2) problems.push("the export contained no data rows");
const commaRows = parsed.filter((r) => r[4] && r[4].includes(","));
console.log(`  ${commaRows.length} row(s) contain a comma inside the message and still parse to 5 fields`);

await browser.close();

if (problems.length > 0) {
  console.error("\nProblems:");
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log("\nAll nine scenarios met their expectation on the bench; the export parses cleanly.");
}
