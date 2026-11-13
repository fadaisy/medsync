#!/usr/bin/env node
/**
 * The Tether landing page's browser checks (STOP 0 ruling 5: no Playwright). It drives a Chrome started with
 * --remote-debugging-port over the raw DevTools protocol with Node's own WebSocket, so it adds no dependency.
 *
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
 *     --user-data-dir=<tmp> about:blank &
 *   node scripts/landing/scenarios.mjs <base> <outDir> <step...>
 *
 * Steps: s1 s2 s3 s4 shots axe bytes. `base` serves the page at `/` (LANDING_TETHER=1). JSON lines to stdout.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [BASE, OUT, ...STEPS] = process.argv.slice(2);
const PORT = Number(process.env.CDP_PORT ?? 9333);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = (o) => console.log(JSON.stringify(o));

async function open() {
  const t = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else listeners.forEach((f) => f(m));
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const js = async (expression) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result
      .value;
  const goto = async (url) => {
    const loaded = new Promise((r) =>
      listeners.push((m) => m.method === "Page.loadEventFired" && r()),
    );
    await send("Page.navigate", { url });
    await loaded;
  };
  const view = async (width, theme, height = width < 761 ? 844 : 900) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 761,
    });
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: theme }],
    });
  };
  const key = (k, code, keyCode, shift = false) =>
    ["keyDown", "keyUp"].reduce(
      (p, type) =>
        p.then(() =>
          send("Input.dispatchKeyEvent", {
            type,
            key: k,
            code,
            windowsVirtualKeyCode: keyCode,
            modifiers: shift ? 8 : 0,
            // Enter activates a button only when the key event carries its text.
            ...(k === "Enter" && type === "keyDown" ? { text: "\r" } : {}),
          }),
        ),
      Promise.resolve(),
    );
  const click = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  };
  const close = async () => {
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  return { send, js, goto, view, key, click, close, listeners };
}

/** The visible, on-screen control named "Help, emergency", or null. */
const HELP_VISIBLE = `(() => {
  const el = [...document.querySelectorAll('[aria-label="Help, emergency"]')].find((e) => e.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { tag: el.tagName, onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
})()`;

async function s1() {
  for (const width of [1440, 834, 390])
    for (const theme of ["light", "dark"]) {
      const p = await open();
      await p.view(width, theme);
      await p.goto(BASE + "/");
      await sleep(800);
      const top = await p.js(HELP_VISIBLE);
      await p.js("scrollTo(0, document.documentElement.scrollHeight / 2)");
      await sleep(700);
      const scrolled = await p.js(HELP_VISIBLE);
      report({
        s: "S1",
        width,
        theme,
        top,
        scrolled,
        pass: !!top?.onScreen && !!scrolled?.onScreen,
      });
      await p.close();
    }
}

const MENU = `[...document.querySelectorAll('button[aria-haspopup="dialog"]')].find((b) => b.textContent.trim() === "Menu")`;
const STATE = `(() => { const d = document.querySelector('dialog[open]'); const a = document.activeElement;
  return { open: !!d, inside: !!d && d.contains(a), onMenu: a === ${MENU}, expanded: ${MENU}?.getAttribute('aria-expanded') }; })()`;

async function s2() {
  const p = await open();
  await p.view(390, "light");
  await p.goto(BASE + "/");
  await sleep(800);
  const openMenu = async () => {
    await p.js(`${MENU}.focus()`);
    await p.key("Enter", "Enter", 13);
    await sleep(500);
    return p.js(STATE);
  };
  const results = {};
  results.opened = await openMenu();
  let trapped = true;
  for (let i = 0; i < 14; i++) {
    await p.key("Tab", "Tab", 9, i % 3 === 2);
    trapped &&= (await p.js(STATE)).inside;
  }
  results.trapped = trapped;
  await p.key("Escape", "Escape", 27);
  await sleep(300);
  results.escape = await p.js(STATE);
  await openMenu();
  await p.click(195, 820); // the scrim, below the panel
  await sleep(300);
  results.scrim = await p.js(STATE);
  await openMenu();
  await p.js(
    `[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === "Close").click()`,
  );
  await sleep(300);
  results.closeButton = await p.js(STATE);
  const pass =
    results.opened.open &&
    results.opened.inside &&
    results.opened.expanded === "true" &&
    trapped &&
    ["escape", "scrim", "closeButton"].every((k) => !results[k].open && results[k].onMenu);
  report({ s: "S2", ...results, pass });
  await p.close();
}

async function s3() {
  // A cold load in dark with no app JavaScript at all: only the inline theme script can set dark before paint.
  for (const [label, theme, stored] of [
    ["system dark", "dark", null],
    ["stored dark, system light", "light", "dark"],
  ]) {
    const p = await open();
    await p.view(1440, theme);
    await p.goto(BASE + "/emergency"); // same origin, to write the stored choice
    await p.js(
      stored
        ? `localStorage.setItem("medsync-theme", "${stored}")`
        : `localStorage.removeItem("medsync-theme")`,
    );
    await p.send("Network.enable");
    await p.send("Network.setBlockedURLs", { urls: ["*/_next/static/chunks/*.js"] });
    await p.goto(BASE + "/");
    const got = await p.js(
      `({ dark: document.documentElement.classList.contains("dark"), bg: getComputedStyle(document.querySelector("[data-tether]")).backgroundColor })`,
    );
    const { data } = await p.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: 1440, height: 400, scale: 1 },
    });
    writeFileSync(
      `${OUT}/s3-first-paint-${stored ? "stored" : "system"}.png`,
      Buffer.from(data, "base64"),
    );
    await p.js(`localStorage.removeItem("medsync-theme")`);
    report({ s: "S3", case: label, ...got, pass: got.dark && got.bg === "rgb(11, 17, 32)" });
    await p.close();
  }
}

async function s4() {
  for (const theme of ["light", "dark"]) {
    const p = await open();
    await p.view(390, theme);
    await p.goto(BASE + "/");
    await sleep(600);
    await p.js("scrollTo(0, document.documentElement.scrollHeight)");
    await sleep(700);
    const r = await p.js(`(() => {
      const line = [...document.querySelectorAll("footer p span")].find((s) => s.checkVisibility()).getBoundingClientRect();
      const bar = [...document.querySelectorAll('a[href="#modes"]')].map((a) => a.parentElement).find((e) => getComputedStyle(e).position === "fixed").getBoundingClientRect();
      return { lineBottom: Math.round(line.bottom), barTop: Math.round(bar.top), hscroll: document.documentElement.scrollWidth - innerWidth };
    })()`);
    report({ s: "S4", theme, ...r, pass: r.lineBottom <= r.barTop && r.hscroll === 0 });
    await p.close();
  }
}

async function shots() {
  const states = [
    ["top", async () => {}],
    ["scrolled", async (p) => (await p.js("scrollTo(0, 900)"), sleep(700))],
    ["menu", async (p, w) => w < 761 && (await p.js(`${MENU}.click()`), sleep(700))],
    [
      "help",
      async (p, w) =>
        w < 761 &&
        (await p.js(`document.querySelector('button[aria-label="Help, emergency"]').click()`),
        sleep(1500)),
    ],
  ];
  for (const width of [1440, 834, 390])
    for (const theme of ["light", "dark"])
      for (const [name, act] of states) {
        if ((name === "menu" || name === "help") && width >= 761) continue;
        const p = await open();
        await p.view(width, theme);
        await p.goto(BASE + "/");
        await sleep(800);
        await act(p, width);
        const { data } = await p.send("Page.captureScreenshot", { format: "jpeg", quality: 75 });
        writeFileSync(`${OUT}/${width}-${theme}-${name}.jpg`, Buffer.from(data, "base64"));
        await p.close();
      }
  report({ shots: OUT });
}

async function axe() {
  const src = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
  for (const width of [1440, 834, 390])
    for (const theme of ["light", "dark"]) {
      const p = await open();
      await p.view(width, theme);
      await p.goto(BASE + "/");
      await sleep(800);
      await p.js(src + ";1");
      const v = JSON.parse(
        await p.js(
          `axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}).then(r=>JSON.stringify(r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length}))))`,
        ),
      );
      const n = (i) => v.filter((x) => x.impact === i).reduce((a, x) => a + x.n, 0);
      report({
        axe: `${width}-${theme}`,
        critical: n("critical"),
        serious: n("serious"),
        other: v.filter((x) => !["critical", "serious"].includes(x.impact)).map((x) => x.id),
      });
      await p.close();
    }
}

async function bytes() {
  // Transfer sizes for a cold load of `/` (gzip from `next start`), by type, before any interaction.
  const p = await open();
  await p.send("Network.enable");
  await p.send("Network.setCacheDisabled", { cacheDisabled: true });
  await p.view(412, "light");
  const reqs = new Map();
  p.listeners.push((m) => {
    if (m.method === "Network.responseReceived")
      reqs.set(m.params.requestId, { url: m.params.response.url, type: m.params.type, enc: 0 });
    if (m.method === "Network.loadingFinished" && reqs.has(m.params.requestId))
      reqs.get(m.params.requestId).enc = m.params.encodedDataLength;
  });
  await p.goto(BASE + "/");
  await sleep(3000);
  const by = {};
  for (const r of reqs.values()) {
    by[r.type] ??= { n: 0, kb: 0, files: [] };
    by[r.type].n++;
    by[r.type].kb += r.enc / 1024;
    by[r.type].files.push(`${Math.round(r.enc / 1024)} ${r.url.replace(BASE, "").slice(0, 70)}`);
  }
  for (const t of Object.values(by)) t.kb = Math.round(t.kb * 10) / 10;
  report({ bytes: by });
  await p.close();
}

for (const s of STEPS) await { s1, s2, s3, s4, shots, axe, bytes }[s]();
process.exit(0);
