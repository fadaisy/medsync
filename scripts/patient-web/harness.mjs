#!/usr/bin/env node
/**
 * The patient web's browser harness (GATE A D-PW-13, D-TW-14: no Playwright). It drives the system Chrome over
 * the raw DevTools protocol with Node's own WebSocket, so it adds no dependency.
 *
 *   node scripts/patient-web/harness.mjs --base http://localhost:3217 --routes /pw/gallery,/emergency \
 *     [--widths 1440,834,390] [--themes light,dark] [--out docs/patient-web/shots] [--throttle] [--login pw-test-1@medsync.test]
 *
 * For each route × width × theme it writes a screenshot, and reports: axe serious/critical counts (axe-core from
 * node_modules), whether a named Help control is visible (L6; Help itself excepted), the action inventory
 * (role + accessible name of every interactive element, for the parity crawl, §6), and with --throttle the
 * LCP on a mid-range Android profile (4× CPU, Slow 4G: 150 ms RTT, 1.6 Mbps down). JSON goes to stdout.
 * ponytail: INP needs a scripted interaction per page; it is measured at Step 9 with one tap per route.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) =>
        a.startsWith("--")
          ? [
              ...acc,
              [
                a.slice(2),
                all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "1" : all[i + 1],
              ],
            ]
          : acc,
      [],
    ),
);
const BASE = args.base ?? "http://localhost:3217";
const ROUTES = (args.routes ?? "/pw/gallery").split(",");
const WIDTHS = (args.widths ?? "1440,834,390").split(",").map(Number);
const THEMES = (args.themes ?? "light,dark").split(",");
const OUT = args.out ? resolve(args.out) : null;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const AXE = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
if (OUT) mkdirSync(OUT, { recursive: true });

const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "pw-harness-"))}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { ok, no } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? no(new Error(m.error.message)) : ok(m.result);
  } else if (m.method) waiters.filter((w) => w.method === m.method).forEach((w) => w.ok(m.params));
});
const send = (method, params = {}) =>
  new Promise((ok, no) => {
    const id = ++seq;
    pending.set(id, { ok, no });
    ws.send(JSON.stringify({ id, method, params }));
  });
const once = (method) => new Promise((ok) => waiters.push({ method, ok }));
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result
    .value;

await send("Page.enable");
await send("Network.enable");
if (args.throttle) {
  await send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}
// LCP, recorded from the start of every document.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__lcp=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:"largest-contentful-paint",buffered:true});`,
});

// --login <email>: sign in through the real form as a seeded test patient (password from PW_TEST_PASSWORD).
if (args.login) {
  await send("Page.navigate", { url: `${BASE}/sign-in` });
  await once("Page.loadEventFired");
  await new Promise((r) => setTimeout(r, 1500));
  await evaluate(`(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(document.querySelector('input[name="email"]'), ${JSON.stringify(args.login)});
    set(document.querySelector('input[name="password"]'), ${JSON.stringify(process.env.PW_TEST_PASSWORD ?? "")});
    document.querySelector('button[type="submit"]').click(); return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 5000));
}

const report = [];
for (const route of ROUTES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const height = width <= 760 ? 844 : 1000;
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width <= 760,
      });
      await send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: theme }],
      });
      await send("Page.navigate", { url: BASE + route });
      await once("Page.loadEventFired");
      // next-themes follows the system unless the viewer chose; set the choice to match.
      await evaluate(
        `try{localStorage.setItem("theme","${theme}")}catch{};document.documentElement.classList.toggle("dark","${theme}"==="dark");1`,
      );
      await new Promise((r) => setTimeout(r, args.throttle ? 3000 : 800));
      const row = await evaluate(`(async () => {
        ${AXE}
        const r = await axe.run(document, { resultTypes: ["violations"] });
        const bad = r.violations.filter(v => v.impact === "serious" || v.impact === "critical");
        const help = [...document.querySelectorAll('a[href="/emergency"]')].find(a => a.offsetParent && /help|emergency/i.test(a.getAttribute("aria-label") || a.textContent));
        const name = el => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim().replace(/\\s+/g, " ");
        const actions = [...document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=radio], [role=tab]')]
          .filter(el => el.offsetParent).map(el => ({ role: el.getAttribute("role") || el.tagName.toLowerCase(), name: name(el), href: el.getAttribute("href") || undefined }));
        const inScroller = el => { for (let p = el.parentElement; p; p = p.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true; } return false; };
        const scrollX = [...document.querySelectorAll("main *")].some(el => el.getBoundingClientRect().right > innerWidth + 1 && !inScroller(el));
        return { axe: bad.map(v => v.id + " (" + v.nodes.length + ")"), help: Boolean(help), scrollX, lcp: Math.round(window.__lcp), actions, path: location.pathname };
      })()`);
      const shot = `${route.replace(/\W+/g, "_").replace(/^_|_$/g, "") || "root"}-${width}-${theme}.png`;
      if (OUT)
        writeFileSync(
          join(OUT, shot),
          Buffer.from(
            (await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }))
              .data,
            "base64",
          ),
        );
      report.push({ route, width, theme, ...row, shot: OUT ? shot : undefined });
    }
  }
}
ws.close();
chrome.kill();
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
