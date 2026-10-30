/* Cold chain: live temperature per fridge / cold room, trend chart, excursions to act on,
   and the monthly temperature chart in the same layout as the paper form (am/pm readings, FI, alarms, initials).
   Sensor readings are SIMULATED for the prototype; the real product reads them from the continuous temperature monitoring device. */
(function () {
  const P = window.P, html = P.html;
  const { useState, useEffect, useRef } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const at = (d, h, m) => new Date(2026, 9, d, h, m || 0).getTime(); // a time in October 2026
  const LOW = 2, HIGH = 8, FREEZE = -0.5;

  P.FRIDGES = [
    { id: "cr1", no: "CR-01", name: "Main store cold room", model: "Walk-in cold room (sample)", where: "Main store", place: "store", base: 4.6, amp: 0.35, seed: 3,
      bumps: [[at(14, 10, 40), at(14, 11, 0), 2.6]] },
    { id: "rf2", no: "RF-02", name: "Maternity fridge", model: "Ice-lined refrigerator (sample)", where: "Maternity", place: "mat", base: 5.1, amp: 0.55, seed: 7,
      bumps: [[at(28, 14, 5), at(28, 15, 20), 4.7], [at(23, 11, 10), at(23, 11, 40), 3.5]] },
    { id: "rf3", no: "RF-03", name: "EPI vaccine fridge", model: "Solar direct-drive refrigerator (sample)", where: "EPI clinic", place: "epi", base: 4.3, amp: 0.45, seed: 11,
      bumps: [[at(20, 2, 45), at(20, 4, 35), -5.6]],
      freezeSensitive: "Freeze-sensitive vaccines here (IPV, Pentavalent, PCV, Rotavirus, HPV, Td) may be damaged: do the shake test on the adsorbed ones before using any of them." },
  ];
  P.fridge = (id) => P.FRIDGES.find((f) => f.id === id);

  /* simulated sensor */
  const hash = (n, s) => { const x = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
  const noise = (t, s) => { const x = t / (20 * MIN), i = Math.floor(x), f = x - i, k = f * f * (3 - 2 * f); return (hash(i, s) * (1 - k) + hash(i + 1, s) * k) * 2 - 1; };
  P.temp = (f, t) => {
    const d = new Date(t), h = d.getHours() + d.getMinutes() / 60;
    let v = f.base + f.amp * Math.sin((2 * Math.PI * (h - 9)) / 24) + 0.28 * Math.sin((2 * Math.PI * t) / (47 * MIN) + f.seed) + 0.35 * noise(t, f.seed);
    for (const [s, e, dv] of f.bumps) if (t > s && t < e) { const w = (t - s) / (e - s); v += dv * Math.min(1, w / 0.25, (1 - w) / 0.25); }
    return Math.round(v * 10) / 10;
  };
  P.series = (f, from, to, step) => { const out = []; for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push({ t, v: P.temp(f, t) }); return out; };

  /* one day, as the device reports it: max/min, and the alarms (30-DTR style: high >+8 °C for 10 h, low < -0.5 °C for 60 min) */
  const dayCache = new Map();
  P.coldDay = (f, day) => {
    const key = f.id + day, end = Math.min(at(day + 1, 0), P.now());
    const c = dayCache.get(key); if (c && c.end >= end - 5 * MIN) return c;
    const s = P.series(f, at(day, 0), end, 5 * MIN);
    let max = -99, min = 99, hiRun = 0, loRun = 0, hiAlarm = null, loAlarm = null;
    s.forEach((x) => {
      max = Math.max(max, x.v); min = Math.min(min, x.v);
      hiRun = x.v > HIGH ? hiRun + 5 : 0; loRun = x.v < FREEZE ? loRun + 5 : 0;
      if (!hiAlarm && hiRun >= 600) hiAlarm = x.t;
      if (!loAlarm && loRun >= 60) loAlarm = x.t;
    });
    const r = { end, max, min, hiAlarm, loAlarm, n: s.length };
    dayCache.set(key, r); return r;
  };

  /* Excursions: outside 2–8 °C for 30 minutes or more (a sample rule: the real one is signed by the in-charge). */
  const excCache = new Map();
  P.excursions = (f, days = 30) => {
    const ck = f.id + days + "|" + Math.floor(P.now() / MIN);
    if (excCache.has(ck)) return excCache.get(ck).slice();
    const res = excRaw(f, days); excCache.clear(); excCache.set(ck, res); return res.slice();
  };
  const excRaw = (f, days) => {
    const s = P.series(f, P.now() - days * DAY, P.now(), 5 * MIN), out = [];
    let cur = null;
    s.forEach((x) => {
      const out2 = x.v > HIGH || x.v < LOW;
      if (out2 && !cur) cur = { start: x.t, end: x.t, peak: x.v, kind: x.v > HIGH ? "high" : "low" };
      else if (out2 && cur) { cur.end = x.t; cur.peak = cur.kind === "high" ? Math.max(cur.peak, x.v) : Math.min(cur.peak, x.v); }
      else if (!out2 && cur) { if (cur.end - cur.start >= 30 * MIN) out.push(cur); cur = null; }
    });
    if (cur && cur.end - cur.start >= 30 * MIN) out.push(cur);
    return out.map((e) => ({ ...e, id: f.id + "-" + e.start, mins: Math.round((e.end - e.start) / MIN) + 5, frozen: e.peak < FREEZE }));
  };
  P.coldOpen = () => P.FRIDGES.flatMap((f) => P.excursions(f, 30).filter((e) => !(P.db.coldAck || {})[e.id]).map((e) => ({ ...e, f })));
  P.coldStatus = (v) => (v > HIGH ? "high" : v < LOW ? (v < FREEZE ? "freeze" : "low") : "ok");

  /* twice-daily readings on the paper chart: sample history up to this morning; this session's entries are kept in the db */
  const INITIALS = ["JK", "AN", "JK", "RM"];
  const today = () => new Date(P.now()).getDate();
  P.reading = (f, day, slot) => {
    const log = ((P.db.coldLog || {})[f.id] || {})[day] || {};
    if (log[slot]) return log[slot];
    const t = at(day, slot === "am" ? 8 : 16);
    if (day > today() || t > P.now() || (day === today() && slot === "pm")) return null;
    return { v: Math.round(P.temp(f, t)), by: INITIALS[(day + (slot === "pm" ? 1 : 0)) % INITIALS.length], sample: true };
  };
  P.fi = (f, day) => {
    const log = ((P.db.coldLog || {})[f.id] || {})[day] || {};
    if (log.fi) return log.fi;
    if (day >= today()) return null;
    return P.coldDay(f, day).min < FREEZE ? "X" : "OK";
  };
  const fmt = (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " °C";
  const dur = (m) => (m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60 ? (m % 60) + " min" : ""));
  const dayWord = (t) => { const d = new Date(t); const k = Math.round((at(today(), 0) - at(d.getDate(), 0)) / DAY); return k === 0 ? "Today" : k === 1 ? "Yesterday" : d.getDate() + " " + P.MON[d.getMonth()]; };

  /* live reading, re-drawn every few seconds */
  const useTick = (ms) => { const [, set] = useState(0); useEffect(() => { const i = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(i); }, [ms]); };

  const StatusTag = ({ v }) => {
    const s = P.coldStatus(v);
    return s === "ok" ? html`<span className="cc-st ok"><${P.Icon} n="check" s=${13} />In range 2–8 °C</span>`
      : html`<span className="cc-st bad"><${P.Icon} n="alert" s=${13} />${s === "high" ? "Too warm" : s === "freeze" ? "Freezing" : "Too cold"}</span>`;
  };

  /* ── trend chart: one sensor line, the 2–8 °C band, alarm lines, and the am/pm readings as dots ── */
  P.TempChart = ({ f, range }) => {
    const ref = useRef(null);
    const [w, setW] = useState(800);
    const [hover, setHover] = useState(null);
    useEffect(() => {
      const el = ref.current; if (!el) return;
      const ro = new ResizeObserver(() => setW(el.clientWidth || 800)); ro.observe(el); setW(el.clientWidth || 800);
      return () => ro.disconnect();
    }, []);
    const now = P.now(), span = { day: DAY, week: 7 * DAY, month: 30 * DAY }[range];
    /* 24 h: every 5-minute reading. 7 and 30 days: hourly / 3-hourly buckets, a mean line inside a min–max envelope, so short excursions still show */
    const raw = P.series(f, now - span, now, range === "day" ? 5 * MIN : 10 * MIN);
    const bucket = { day: 0, week: HOUR, month: 3 * HOUR }[range];
    let pts = raw.map((p) => ({ t: p.t, v: p.v, lo: p.v, hi: p.v }));
    if (bucket) {
      const m = new Map();
      raw.forEach((p) => { const k = Math.floor(p.t / bucket) * bucket; const e = m.get(k) || { t: k + bucket / 2, s: 0, n: 0, lo: 99, hi: -99 }; e.s += p.v; e.n++; e.lo = Math.min(e.lo, p.v); e.hi = Math.max(e.hi, p.v); m.set(k, e); });
      pts = [...m.values()].map((e) => ({ t: Math.min(e.t, now), v: Math.round((e.s / e.n) * 10) / 10, lo: e.lo, hi: e.hi }));
    }
    const reads = [];
    for (let t = at(new Date(now - span).getDate(), 0); t <= now; t += DAY) {
      const d = new Date(t).getDate();
      ["am", "pm"].forEach((s) => { const r = P.reading(f, d, s), tt = at(d, s === "am" ? 8 : 16); if (r && tt >= now - span) reads.push({ t: tt, v: r.v, by: r.by, s }); });
    }
    const yMin = Math.min(-2, Math.floor(Math.min(...pts.map((p) => p.lo)) - 0.5)), yMax = Math.max(12, Math.ceil(Math.max(...pts.map((p) => p.hi)) + 0.5));
    const H = 260, L = 40, R = 12, T = 12, B = 26, iw = Math.max(100, w - L - R), ih = H - T - B;
    const x = (t) => L + ((t - (now - span)) / span) * iw, y = (v) => T + ((yMax - v) / (yMax - yMin)) * ih;
    const d = pts.map((p, i) => (i ? "L" : "M") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1)).join("");
    const env = bucket ? pts.map((p, i) => (i ? "L" : "M") + x(p.t).toFixed(1) + " " + y(p.hi).toFixed(1)).join("") + pts.slice().reverse().map((p) => "L" + x(p.t).toFixed(1) + " " + y(p.lo).toFixed(1)).join("") + "Z" : null;
    const ticks = [];
    if (range === "day") { for (let t = Math.ceil((now - span) / (4 * HOUR)) * 4 * HOUR; t <= now; t += 4 * HOUR) ticks.push([t, P.time(t)]); }
    else { const every = range === "week" ? 1 : 5; for (let t = at(new Date(now - span).getDate() + 1, 0); t <= now; t += DAY) { const dd = new Date(t); if (range === "week" || dd.getDate() % every === 0) ticks.push([t, dd.getDate() + " " + P.MON[dd.getMonth()]]); } }
    const yt = []; for (let v = Math.ceil(yMin / 2) * 2; v <= yMax; v += 2) yt.push(v);
    const onMove = (e) => {
      const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left;
      const t = now - span + ((px - L) / iw) * span;
      if (px < L || px > L + iw) { setHover(null); return; }
      let best = pts[0]; for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      const rd = reads.find((q) => Math.abs(x(q.t) - x(best.t)) < 8);
      setHover({ p: best, rd });
    };
    const id = "cc" + f.id + range;
    return html`<div className="cc-chart" ref=${ref}>
      <svg width=${w} height=${H} role="img" aria-label=${f.name + " temperature, last " + { day: "24 hours", week: "7 days", month: "30 days" }[range]}
        onPointerMove=${onMove} onPointerLeave=${() => setHover(null)}>
        <defs>
          <clipPath id=${id + "hi"}><rect x=${L} y=${T} width=${iw} height=${Math.max(0, y(HIGH) - T)} /></clipPath>
          <clipPath id=${id + "lo"}><rect x=${L} y=${y(LOW)} width=${iw} height=${Math.max(0, T + ih - y(LOW))} /></clipPath>
        </defs>
        <rect className="cc-band" x=${L} y=${y(HIGH)} width=${iw} height=${y(LOW) - y(HIGH)} />
        ${yt.map((v) => html`<g key=${"y" + v}><line className="cc-grid" x1=${L} x2=${L + iw} y1=${y(v)} y2=${y(v)} /><text className="cc-ax" x=${L - 6} y=${y(v) + 4} textAnchor="end">${v > 0 ? "+" + v : v}</text></g>`)}
        <line className="cc-alarm" x1=${L} x2=${L + iw} y1=${y(HIGH)} y2=${y(HIGH)} />
        <line className="cc-alarm" x1=${L} x2=${L + iw} y1=${y(FREEZE)} y2=${y(FREEZE)} />
        <text className="cc-ax alarm" x=${L + iw - 4} y=${y(HIGH) - 5} textAnchor="end">+8 °C high</text>
        <text className="cc-ax alarm" x=${L + iw - 4} y=${y(FREEZE) + 13} textAnchor="end">−0.5 °C freeze</text>
        ${ticks.map(([t, lab]) => html`<text key=${"x" + t} className="cc-ax" x=${x(t)} y=${H - 7} textAnchor="middle">${lab}</text>`)}
        ${env ? html`<path className="cc-env" d=${env} /><path className="cc-env out" d=${env} clipPath=${"url(#" + id + "hi)"} /><path className="cc-env out" d=${env} clipPath=${"url(#" + id + "lo)"} />` : null}
        <path className="cc-line" d=${d} />
        <path className="cc-line out" d=${d} clipPath=${"url(#" + id + "hi)"} />
        <path className="cc-line out" d=${d} clipPath=${"url(#" + id + "lo)"} />
        ${reads.map((q) => html`<circle key=${"r" + q.t} className="cc-read" cx=${x(q.t)} cy=${y(q.v)} r=${range === "month" ? 3.5 : 4.5} />`)}
        ${hover ? html`<g><line className="cc-cross" x1=${x(hover.p.t)} x2=${x(hover.p.t)} y1=${T} y2=${T + ih} /><circle className="cc-dot" cx=${x(hover.p.t)} cy=${y(hover.p.v)} r="4.5" /></g>` : null}
      </svg>
      ${hover ? html`<div className="cc-tip" style=${{ left: Math.min(Math.max(x(hover.p.t), 90), w - 90) + "px" }}>
        <b>${fmt(hover.p.v)}</b>${bucket ? html`<span className="muted"> mean · range ${fmt(hover.p.lo)} to ${fmt(hover.p.hi)}</span>` : null} <span className="muted">${dayWord(hover.p.t)} ${P.time(hover.p.t)}</span>
        ${hover.rd ? html`<div className="small">Recorded ${hover.rd.s} reading: ${hover.rd.v > 0 ? "+" : ""}${hover.rd.v} °C · ${hover.rd.by}</div>` : null}</div>` : null}
      <div className="cc-legend"><span><i className="ccsw ln"></i>${bucket ? "Sensor, " + (range === "week" ? "hourly" : "3-hourly") + " mean" : "Sensor (every 5 min)"}</span>${bucket ? html`<span><i className="ccsw env"></i>Lowest to highest in that time</span>` : null}<span><i className="ccsw out"></i>Out of 2–8 °C</span><span><i className="ccsw dot"></i>am / pm reading on the chart</span><span><i className="ccsw band"></i>Safe range 2–8 °C</span></div>
    </div>`;
  };

  /* ── the monthly chart, laid out like the paper form ── */
  const MonthChart = ({ f }) => {
    const days = 31, rows = []; for (let v = 16; v >= -5; v--) rows.push(v);
    const DAYS = Array.from({ length: days }, (_, i) => i + 1);
    const cell = (d, s, v) => { const r = P.reading(f, d, s); return r && Math.max(-5, Math.min(16, r.v)) === v; };
    return html`<div className="mc">
      <div className="mc-head">
        <div><span>Cold room/refrigerator number:</span><b>${f.no}</b></div><div><span>Start date:</span><b>01/Oct/2026</b></div>
        <div><span>Equipment model:</span><b>${f.model}</b></div><div><span>Location:</span><b>${f.where}</b></div>
        <div className="mc-key">Key: FI = freeze indicator (status OK or X)</div>
      </div>
      <div className="tblwrap"><table className="mc-t">
        <thead>
          <tr><th className="mc-lab" colSpan="2">Day</th>${DAYS.map((d) => html`<th key=${d} colSpan="2" className=${P.cx("mc-day", d === today() && "now")}>${d}</th>`)}</tr>
          <tr><th className="mc-lab" colSpan="2">°C</th>${DAYS.map((d) => html`<${React.Fragment} key=${d}><th className="mc-ap">am</th><th className="mc-ap">pm</th><//>`)}</tr>
        </thead>
        <tbody>
          ${rows.map((v, i) => html`<tr key=${v} className=${v > HIGH || v < LOW ? "shade" : ""}>
            ${i === 0 ? html`<th className="mc-side" rowSpan=${rows.length}><span>Temperature chart</span></th>` : null}
            <th className="mc-deg">${v > 0 ? "+" + v : v}</th>
            ${DAYS.map((d) => html`<${React.Fragment} key=${d}>${["am", "pm"].map((s) => html`<td key=${s} className=${cell(d, s, v) ? (v > HIGH || v < LOW ? "hit bad" : "hit") : ""}>${cell(d, s, v) ? "●" : ""}</td>`)}<//>`)}
          </tr>`)}
          <tr className="mc-row"><th colSpan="2">FI (X or OK)</th>${DAYS.map((d) => { const x = P.fi(f, d); return html`<td key=${d} colSpan="2" className=${x === "X" ? "bad strong" : ""}>${x || ""}</td>`; })}</tr>
          <tr className="mc-band"><th colSpan="2">${">+8 °C alarm"}</th><td colSpan=${days * 2}>Once every 24 hours: high alarm status and maximum temperature from the continuous temperature monitoring device</td></tr>
          <tr className="mc-row"><th colSpan="2">Alarm time or OK</th>${DAYS.map((d) => { if (d >= today()) return html`<td key=${d} colSpan="2"></td>`; const x = P.coldDay(f, d); return html`<td key=${d} colSpan="2" className=${x.hiAlarm ? "bad strong" : ""}>${x.hiAlarm ? P.time(x.hiAlarm) : "OK"}</td>`; })}</tr>
          <tr className="mc-row"><th colSpan="2">Maximum °C</th>${DAYS.map((d) => { if (d >= today()) return html`<td key=${d} colSpan="2"></td>`; const x = P.coldDay(f, d); return html`<td key=${d} colSpan="2" className=${x.max > HIGH ? "bad strong" : ""}>${x.max.toFixed(1)}</td>`; })}</tr>
          <tr className="mc-band"><th colSpan="2">${"< −0.5 °C alarm"}</th><td colSpan=${days * 2}>Once every 24 hours: low alarm status and minimum temperature from the continuous temperature monitoring device</td></tr>
          <tr className="mc-row"><th colSpan="2">Alarm time or OK</th>${DAYS.map((d) => { if (d >= today()) return html`<td key=${d} colSpan="2"></td>`; const x = P.coldDay(f, d); return html`<td key=${d} colSpan="2" className=${x.loAlarm ? "bad strong" : ""}>${x.loAlarm ? P.time(x.loAlarm) : "OK"}</td>`; })}</tr>
          <tr className="mc-row"><th colSpan="2">Min °C</th>${DAYS.map((d) => { if (d >= today()) return html`<td key=${d} colSpan="2"></td>`; const x = P.coldDay(f, d); return html`<td key=${d} colSpan="2" className=${x.min < FREEZE ? "bad strong" : ""}>${x.min.toFixed(1)}</td>`; })}</tr>
          <tr className="mc-row init"><th colSpan="2">Initials</th>${DAYS.map((d) => html`<${React.Fragment} key=${d}>${["am", "pm"].map((s) => { const r = P.reading(f, d, s); return html`<td key=${s}>${r ? r.by : ""}</td>`; })}<//>`)}</tr>
        </tbody></table></div>
      <div className="mc-foot">
        <div><span>Province / region:</span><b>(sample)</b></div><div><span>Month:</span><b>October</b></div><div className="mc-rem"><span>Remarks:</span><b>${P.excursions(f, 30).map((e) => dayWord(e.start) + " " + P.time(e.start) + ": " + (e.kind === "high" ? "up to " : "down to ") + fmt(e.peak) + " for " + dur(e.mins)).join(" · ") || "—"}</b></div>
        <div><span>District:</span><b>(sample)</b></div><div><span>Year:</span><b>2026</b></div>
        <div><span>Health centre:</span><b>(sample hospital)</b></div><div><span>Supervisor:</span><b></b></div>
      </div>
    </div>`;
  };

  /* ── record the am or pm reading: typed, never filled in ── */
  const RecordDialog = ({ f, onClose }) => {
    const nowH = new Date(P.now()).getHours();
    const [slot, setSlot] = useState(nowH < 12 ? "am" : "pm");
    const [val, setVal] = useState("");
    const [fi, setFi] = useState(null);
    const n = Number(val.replace(",", "."));
    const ok = val.trim() !== "" && !isNaN(n) && n > -30 && n < 40 && (slot === "am" || fi);
    const rw = P.ROLES[P.db.settings.role].split(" "), initials = (rw.length > 1 ? rw.map((w) => w[0]).join("") : rw[0]).slice(0, 2).toUpperCase();
    const save = () => {
      const db = P.db, d = today();
      db.coldLog = db.coldLog || {}; db.coldLog[f.id] = db.coldLog[f.id] || {}; const e = (db.coldLog[f.id][d] = db.coldLog[f.id][d] || {});
      e[slot] = { v: Math.round(n), raw: n, by: initials, at: P.now() }; if (fi) e.fi = fi;
      P.commit(); P.toast(f.name + ": " + slot + " reading " + (n > 0 ? "+" : "") + n + " °C recorded" + (n > HIGH || n < LOW ? " · out of range, act now" : ""), n > HIGH || n < LOW ? "alert" : "check"); onClose();
    };
    return html`<${P.Dialog} title=${"Record the " + slot + " reading"} sub=${f.name + " · " + f.no + " · read the thermometer, don't copy the sensor"} onClose=${onClose}
      foot=${html`<span className="grow">Saved with your initials (${initials}) on the monthly chart.</span><${P.Btn} kind="primary" disabled=${!ok} onClick=${save}>Record<//>`}>
      <div className="chips"><${P.Chip} on=${slot === "am"} onClick=${() => setSlot("am")}>Morning (am)<//><${P.Chip} on=${slot === "pm"} onClick=${() => setSlot("pm")}>Afternoon (pm)<//></div>
      <div className="field"><label htmlFor="ccv">Temperature on the thermometer (°C)</label>
        <input id="ccv" className="input" data-autofocus inputMode="decimal" style=${{ maxWidth: "160px" }} placeholder="e.g. 5" value=${val} onChange=${(e) => setVal(e.target.value.replace(/[^0-9.,-]/g, "").slice(0, 5))} /></div>
      ${val && !isNaN(n) && (n > HIGH || n < LOW) ? html`<div className="err"><${P.Icon} n="alert" s=${14} />Outside 2–8 °C. Record it as read, then check the fridge and the stock.</div>` : null}
      ${slot === "pm" ? html`<div className="stack-s"><span className="lbl">Freeze indicator today</span><div className="chips"><${P.Chip} on=${fi === "OK"} onClick=${() => setFi("OK")}>OK<//><${P.Chip} on=${fi === "X"} onClick=${() => setFi("X")}>X (triggered)<//></div></div>` : null}
    <//>`;
  };

  const ACTIONS = ["Stock checked: still usable", "Shake test done: passed", "Moved stock to another fridge", "Quarantined the stock", "Reported to the in-charge"];
  const Excursion = ({ e, f }) => {
    const db = P.useDb();
    const ack = (db.coldAck || {})[e.id];
    const [pick, setPick] = useState([]);
    return html`<div className=${P.cx("cc-exc", !ack && "open")}>
      <div className="row between"><div><b>${e.kind === "high" ? "Too warm" : e.frozen ? "Froze" : "Too cold"}: ${e.kind === "high" ? "up to " : "down to "}${fmt(e.peak)}</b>
        <div className="muted small">${dayWord(e.start)} ${P.time(e.start)}–${P.time(e.end + 5 * MIN)} · ${dur(e.mins)} outside 2–8 °C</div></div>
        ${ack ? html`<${P.Tag} icon="check">Acted on · ${ack.by}<//>` : html`<${P.Tag} kind="caution" icon="alert">Needs action<//>`}</div>
      ${e.frozen && f.freezeSensitive ? html`<div className="note"><${P.Icon} n="snow" /><span>${f.freezeSensitive}</span></div>` : null}
      ${ack ? html`<div className="small ink2">${ack.actions.join(" · ")} · ${P.when(ack.at)}</div>` : html`
        <div className="chips">${ACTIONS.map((a) => html`<${P.Chip} size="sm" key=${a} on=${pick.includes(a)} onClick=${() => setPick(pick.includes(a) ? pick.filter((x) => x !== a) : pick.concat(a))}>${a}<//>`)}</div>
        <div><${P.Btn} size="sm" kind="navy" disabled=${!pick.length} onClick=${() => { db.coldAck = { ...(db.coldAck || {}), [e.id]: { actions: pick, by: P.who(), at: P.now() } }; P.commit(); P.toast("Excursion recorded with the action taken"); }}>Record what was done<//></div>`}
    </div>`;
  };

  const FridgeCard = ({ f, on, onPick }) => {
    useTick(5000);
    const v = P.temp(f, P.now()), s = P.series(f, P.now() - DAY, P.now(), 10 * MIN);
    const mx = Math.max(...s.map((x) => x.v)), mn = Math.min(...s.map((x) => x.v)), open = P.excursions(f, 30).filter((e) => !(P.db.coldAck || {})[e.id]).length;
    return html`<button type="button" className=${P.cx("cc-card", on && "on")} aria-pressed=${on ? "true" : "false"} onClick=${onPick}>
      <div className="row between"><span className="strong">${f.name}</span><span className="mono muted small">${f.no}</span></div>
      <div className="cc-now"><b className=${P.coldStatus(v) === "ok" ? "" : "bad"}>${fmt(v)}</b><span className="cc-live"><i></i>live</span></div>
      <div className="row"><${StatusTag} v=${v} />${open ? html`<${P.Tag} kind="caution" icon="alert">${open} to act on<//>` : null}</div>
      <div className="muted small">24 h: min ${fmt(mn)} · max ${fmt(mx)} · ${f.where}</div>
    </button>`;
  };

  /* put another medicine in this fridge: record that it is kept here, and optionally move stock in from another place */
  const AddToFridge = ({ f, med, onClose }) => {
    const db = P.useDb();
    const m = P.med(med);
    const sources = P.PLACES.filter((p) => p.id !== f.place && P.medAt(med, p.id) > 0);
    const [from, setFrom] = useState(null);
    const [qty, setQty] = useState(null);
    const max = from ? P.medAt(med, from) : 0;
    const save = () => {
      db.fridgeExtra = db.fridgeExtra || {}; const l = (db.fridgeExtra[f.id] = db.fridgeExtra[f.id] || []);
      if (!l.includes(med)) l.push(med);
      if (from && qty) P.allocate(med, from, qty).parts.forEach((x) => P.move({ kind: "transfer", med, batch: x.batch, from, to: f.place, qty: x.qty, note: "Into " + f.name + " (" + f.no + ")" }));
      P.commit(); P.toast(m.name + " is now kept in " + f.name + (from && qty ? " · " + P.q(qty, med) + " moved from " + P.place(from).short : "")); onClose();
    };
    return html`<${P.Dialog} title=${"Keep " + m.name + " in " + f.name} sub=${f.no + " · " + f.where} onClose=${onClose}
      foot=${html`<${P.Btn} kind="primary" icon="snow" disabled=${!!from && !qty} onClick=${save}>${from && qty ? "Move " + P.q(qty, med) + " in" : "Add to this fridge"}<//>`}>
      ${m.cold ? html`<div className="ok-line"><${P.Icon} n="snow" s=${14} />Needs 2–8 °C: the right place for it.</div>`
        : html`<div className="note"><${P.Icon} n="alert" /><span>${m.name} doesn't need the cold chain. Keep it here only if there is space and a reason, and don't let it crowd out vaccines or oxytocin.</span></div>`}
      <div className="row"><span className="lbl">Already at ${P.place(f.place).short}</span><b>${P.q(P.medAt(med, f.place), med)}</b></div>
      ${sources.length ? html`<div className="stack-s"><span className="lbl">Move stock in from (optional)</span>
        <div className="chips">${sources.map((p) => html`<${P.Chip} key=${p.id} size="sm" on=${from === p.id} onClick=${() => { setFrom(from === p.id ? null : p.id); setQty(null); }}>${p.short} · ${P.medAt(med, p.id)}<//>`)}</div>
        ${from ? html`<div className="row"><${P.Stepper} value=${qty} onChange=${setQty} max=${max} unit=${m.unit} label=${"move " + m.name} /><span className="muted small">${max} at ${P.place(from).short} · earliest expiry first</span></div>` : null}</div>` : null}
    <//>`;
  };

  /* take a medicine out of this fridge: move it elsewhere, discard it as unusable, or stop listing it here */
  const WHY = ["Expired", "VVM stage 3–4", "Froze: shake test failed", "Heat exposure", "Broken / damaged", "Recalled"];
  const RemoveFromFridge = ({ f, med, extra, onClose }) => {
    const db = P.useDb();
    const m = P.med(med), have = f.place ? P.medAt(med, f.place) : 0;
    const [how, setHow] = useState(have ? "move" : "unlist");
    const [to, setTo] = useState(null);
    const [qty, setQty] = useState(null);
    const [why, setWhy] = useState(null);
    const [bt, setBt] = useState(null);
    const bats = f.place ? P.fefo(med, f.place).filter((b) => P.bal(b.id, f.place) > 0) : [];
    const cap = bt ? P.bal(bt, f.place) : have;
    const dests = P.PLACES.filter((p) => p.id !== f.place);
    const unlist = () => { if (db.fridgeExtra && db.fridgeExtra[f.id]) db.fridgeExtra[f.id] = db.fridgeExtra[f.id].filter((x) => x !== med); };
    const ok = how === "unlist" || (qty > 0 && (how === "move" ? !!to : !!why));
    const save = () => {
      const nm = m.name.split(" (")[0];
      if (how === "unlist") { unlist(); P.commit(); P.toast(nm + " no longer listed in " + f.name); return onClose(); }
      const parts = bt ? [{ batch: bt, qty: Math.min(qty, cap) }] : P.allocate(med, f.place, qty).parts;
      parts.forEach((x) => P.move(how === "move"
        ? { kind: "transfer", med, batch: x.batch, from: f.place, to, qty: x.qty, note: "Out of " + f.name + " (" + f.no + ")" }
        : { kind: "wastage", med, batch: x.batch, from: f.place, to: "waste", qty: x.qty, note: why + " · taken out of " + f.name + " (" + f.no + ")" }));
      if (qty >= have) unlist();
      P.commit();
      P.toast(how === "move" ? P.q(qty, med) + " of " + nm + " moved to " + P.place(to).short : P.q(qty, med) + " of " + nm + " discarded: " + why.toLowerCase());
      onClose();
    };
    const items = [have ? { v: "move", label: "Move elsewhere" } : null, have ? { v: "discard", label: "Discard as unusable" } : null, extra ? { v: "unlist", label: "Stop listing here" } : null].filter(Boolean);
    return html`<${P.Dialog} title=${"Take " + m.name + " out of " + f.name} sub=${f.no + " · " + P.q(have, med) + " here now"} onClose=${onClose}
      foot=${html`<${P.Btn} kind=${how === "discard" ? "caution" : "primary"} icon=${how === "discard" ? "ban" : "minus"} disabled=${!ok} onClick=${save}>${how === "unlist" ? "Stop listing it" : how === "move" ? "Move " + (qty ? P.q(qty, med) : "") + " out" : "Discard " + (qty ? P.q(qty, med) : "")}<//>`}>
      ${items.length > 1 ? html`<${P.Seg} label="What to do" value=${how} onChange=${setHow} items=${items} />` : null}
      ${how === "unlist" ? html`<p className="small">Removes it from this fridge's list. ${have ? "The " + P.q(have, med) + " stays on the ledger at " + P.place(f.place).short + "." : "No stock is recorded here."}</p>` : html`<div className="stack-s">
        <div className="row"><${P.Stepper} value=${qty} onChange=${setQty} max=${cap} unit=${m.unit} label=${"take out " + m.name} /><${P.Btn} size="sm" kind="ghost" onClick=${() => setQty(cap)}>All ${cap}<//></div>
        ${bats.length > 1 ? html`<div className="stack-s"><span className="lbl">Batch</span><div className="chips"><${P.Chip} size="sm" on=${!bt} onClick=${() => { setBt(null); setQty(null); }}>Earliest expiry first<//>${bats.map((b) => html`<${P.Chip} key=${b.id} size="sm" on=${bt === b.id} onClick=${() => { setBt(b.id); setQty(null); }}><span className="mono">${b.no}</span> · ${P.bal(b.id, f.place)}${b.vvm >= 2 ? " · VVM " + b.vvm : ""}<//>`)}</div></div>` : null}
        ${how === "move" ? html`<div className="stack-s"><span className="lbl">Move to</span>
          <div className="chips">${dests.map((p) => html`<${P.Chip} key=${p.id} size="sm" on=${to === p.id} onClick=${() => setTo(p.id)}>${p.short}<//>`)}</div>
          ${m.cold ? html`<div className="note"><${P.Icon} n="snow" /><span>${m.name.split(" (")[0]} needs 2–8 °C: put it straight into a fridge or cold box there.</span></div>` : null}</div>`
        : html`<div className="stack-s"><span className="lbl">Why it can't be used</span>
          <div className="chips">${WHY.map((w) => html`<${P.Chip} key=${w} size="sm" on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div>
          <p className="hint">Recorded as wastage on the ledger with your name and the reason. It shows in Records and in the monthly wastage figures.</p></div>`}
      </div>`}
    <//>`;
  };

  P.ColdView = ({ route }) => {
    const db = P.useDb();
    useTick(5000);
    const [sel0, setSel] = useState(route.fridge || "rf2");
    const sel = route.only || sel0;
    const [range, setRange] = useState("day");
    const [rec, setRec] = useState(false);
    const [adding, setAdding] = useState(null);
    const [removing, setRemoving] = useState(null);
    const f = P.fridge(sel), v = P.temp(f, P.now());
    const exc = P.excursions(f, 30).reverse();
    const extra = ((db.fridgeExtra || {})[f.id]) || [];
    const meds = P.MEDS.filter((m) => (m.cold && f.place && P.medAt(m.id, f.place) > 0) || extra.includes(m.id)).map((m) => ({ m, q: f.place ? P.medAt(m.id, f.place) : 0, extra: extra.includes(m.id) && !m.cold }));
    const d = today(), am = P.reading(f, d, "am"), pm = P.reading(f, d, "pm");
    const s24 = P.series(f, P.now() - DAY, P.now(), 10 * MIN), mn24 = Math.min(...s24.map((x) => x.v)), mx24 = Math.max(...s24.map((x) => x.v));
    const s30 = P.series(f, P.now() - 30 * DAY, P.now(), 10 * MIN), inRange = Math.round((s30.filter((x) => x.v >= LOW && x.v <= HIGH).length / s30.length) * 1000) / 10;
    const openN = exc.filter((e) => !(db.coldAck || {})[e.id]).length;
    return html`<div className="stack">
      <div className="note"><${P.Icon} n="snow" /><span>Sensor readings here are <b>simulated</b> for the prototype. In the real product they come from each fridge's continuous temperature monitoring device; the am and pm readings are still read off the thermometer and typed, as on the paper chart.</span></div>
      ${route.only ? null : html`<div className="cc-cards">${P.FRIDGES.map((x) => html`<${FridgeCard} key=${x.id} f=${x} on=${x.id === sel} onPick=${() => setSel(x.id)} />`)}</div>`}
      <div className="cc-top">
        <div className="card pad stack-s">
          <div className="row between"><div><h3 style=${{ fontSize: "15px" }}>${f.name} · trend</h3><div className="muted small">${f.model} · ${f.where}</div></div>
            <${P.Seg} label="Range" value=${range} onChange=${setRange} items=${[{ v: "day", label: "24 h" }, { v: "week", label: "7 days" }, { v: "month", label: "30 days" }]} /></div>
          <${P.TempChart} key=${f.id + range} f=${f} range=${range} />
        </div>
        <div className="card pad stack-s cc-side">
          <div className="row between"><h3 style=${{ fontSize: "14px" }}>${f.no} now</h3><${StatusTag} v=${v} /></div>
          <div className="cc-ind">
            <div><span>Now</span><b className=${P.coldStatus(v) === "ok" ? "" : "bad"}>${fmt(v)}</b></div>
            <div><span>24 h min / max</span><b>${fmt(mn24).replace(" °C", "")} / ${fmt(mx24)}</b></div>
            <div><span>In range, 30 days</span><b>${inRange}%</b></div>
            <div><span>To act on</span><b className=${openN ? "bad" : ""}>${openN}</b></div>
          </div>
          <div className="cc-sep"></div>
          <h3 style=${{ fontSize: "14px" }}>Today's chart readings</h3>
          <div className="cc-reads">
            <div><span className="lbl">am</span><b>${am ? (am.v > 0 ? "+" : "") + am.v + " °C" : "—"}</b><span className="muted small">${am ? am.by : "not yet"}</span></div>
            <div><span className="lbl">pm</span><b>${pm ? (pm.v > 0 ? "+" : "") + pm.v + " °C" : "—"}</b><span className="muted small">${pm ? pm.by : "due after 14:00"}</span></div>
          </div>
          <${P.Btn} kind="navy" icon="plus" onClick=${() => setRec(true)}>Record a reading<//>
        </div>
      </div>
      <div className="card pad stack-s">
        <div className="row between"><div><h3 style=${{ fontSize: "15px" }}>Monthly temperature chart · October 2026</h3><div className="muted small">The paper form's layout, filled from the readings and the device. Dots in grey rows are out of range.</div></div>
          <${P.Btn} icon="printer" onClick=${() => P.toast("Monthly chart for " + f.no + " sent to the printer (prototype)", "printer")}>Print the chart<//></div>
        <${MonthChart} f=${f} />
      </div>
      <div className="cc-bottom">
        <div className="card pad stack-s">
          <h3 style=${{ fontSize: "14px" }}>Excursions, last 30 days</h3>
          <p className="hint">Outside 2–8 °C for 30 minutes or more (sample rule). Each needs a record of what was done.</p>
          ${exc.length ? exc.map((e) => html`<${Excursion} key=${e.id} e=${e} f=${f} />`) : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />None. Stayed in range.</p>`}
        </div>
        <div className="card pad stack-s">
          <div className="row between"><h3 style=${{ fontSize: "14px" }}>In this ${f.id === "cr1" ? "cold room" : "fridge"}</h3><${P.Btn} size="sm" icon="plus" onClick=${() => setAdding("pick")}>Add a medicine<//></div>
          ${meds.length ? html`<div className="cc-in">${meds.map(({ m, q, extra: ex }) => html`<div className="cc-inrow" key=${m.id}><button type="button" className="cc-inname" onClick=${() => P.go({ to: "medicines", med: m.id })}>${m.name}</button>${m.vaccine && m.vac.freeze ? html`<span className="cc-frz" title="Freeze-sensitive">❄</span>` : null}${ex ? html`<span className="ctag" title="Doesn't need the cold chain">not cold-chain</span>` : null}<b className="num">${P.q(q, m.id)}</b>
            <button type="button" className="cc-out" aria-label=${"Take " + m.name + " out"} onClick=${() => setRemoving(m.id)}><${P.Icon} n="minus" s=${13} />Take out</button></div>`)}</div>` : html`<p className="muted small">Nothing from the pharmacy ledger.</p>`}
        </div>
      </div>
      ${rec ? html`<${RecordDialog} f=${f} onClose=${() => setRec(false)} />` : null}
      ${adding === "pick" ? html`<${P.MedPicker} exclude=${meds.map((x) => x.m.id)} onPick=${(id) => setAdding(id)} onClose=${() => setAdding(null)} />` : adding ? html`<${AddToFridge} f=${f} med=${adding} onClose=${() => setAdding(null)} />` : null}
      ${removing ? html`<${RemoveFromFridge} f=${f} med=${removing} extra=${extra.includes(removing)} onClose=${() => setRemoving(null)} />` : null}
    </div>`;
  };
})();
