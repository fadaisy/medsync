import lighthouse from "lighthouse";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=9222"],
});
const result = await lighthouse("http://localhost:5183", { port: 9222, output: "json", logLevel: "error" });
const c = result.lhr.categories;
const a = result.lhr.audits;
console.log(`performance ${Math.round(c.performance.score*100)}  accessibility ${Math.round(c.accessibility.score*100)}  best-practices ${Math.round(c["best-practices"].score*100)}  seo ${Math.round(c.seo.score*100)}`);
console.log(`fcp ${a["first-contentful-paint"].displayValue}  lcp ${a["largest-contentful-paint"].displayValue}  tbt ${a["total-blocking-time"].displayValue}  cls ${a["cumulative-layout-shift"].displayValue}`);
const failing = Object.values(a).filter((x) => x.score !== null && x.score < 1 && x.scoreDisplayMode === "binary");
console.log(`failing binary audits: ${failing.length}${failing.length ? " -> " + failing.map((x) => x.id).join(", ") : ""}`);
await browser.close();
