/* eslint-disable no-console -- a console snippet: printing is its output. */
/*
 * Lab Phase 2 §13: scan to received p95 (target ≤ 1 s) and a receipt visible on another open worklist
 * (target ≤ 5 s live, ≤ 15 s on the polling fallback). A browser snippet, run by a signed-in lab user
 * on a real deployment with 0107–0111 applied and LAB_BENCH on; it needs no credentials of its own.
 *
 * 1. Open /lab in two tabs of the same browser (same clock). Paste this file into both consoles.
 * 2. Tab B: set the stage filter to "To receive", then benchTiming.watch(). A receipt removes the row there,
 *    so only rows added or removed count (the waiting clocks' text changes do not).
 * 3. Tab A: await benchTiming.scan(["L…", "L…"])  — labels of collected TEST specimens, 20 or more.
 *    Tab A prints the scan p95; tab B prints, per receipt, the time from A's "Received" to B's update.
 * Scanning receives the specimens for real: use test patients only.
 */
(() => {
  const channel = new BroadcastChannel("bench-timing");
  const pct = (xs, q) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * q) - 1)];
  const report = (name, xs) =>
    console.log(
      `${name}: n=${xs.length} p50=${Math.round(pct(xs, 0.5))} ms p95=${Math.round(pct(xs, 0.95))} ms`,
    );

  async function scan(labels) {
    const field = document.querySelector('form input[aria-describedby$="-hint"]');
    const status = document.querySelector('p[role="status"]');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    const times = [];
    for (const label of labels) {
      const t0 = performance.now();
      setValue.call(field, label);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.form.requestSubmit();
      // Done when the status names this label (received, already received, or refused).
      while (!status.textContent.includes(label)) await new Promise((r) => setTimeout(r, 10));
      const ms = performance.now() - t0;
      times.push(ms);
      channel.postMessage({ label, at: Date.now(), ok: status.textContent.startsWith("Received") });
      await new Promise((r) => setTimeout(r, 500));
    }
    report("Scan to received", times);
    return times;
  }

  function watch() {
    const lags = [];
    let waiting = null;
    channel.onmessage = (e) => e.data.ok && (waiting = e.data);
    new MutationObserver(() => {
      if (!waiting) return;
      lags.push(Date.now() - waiting.at);
      console.log(`${waiting.label}: visible after ${lags.at(-1)} ms`);
      waiting = null;
    }).observe(document.querySelector("main") ?? document.body, {
      childList: true,
      subtree: true,
    });
    window.benchTiming.report = () => report("Visible on another worklist", lags);
    console.log("Watching. Call benchTiming.report() when tab A is done.");
  }

  window.benchTiming = { scan, watch };
})();
