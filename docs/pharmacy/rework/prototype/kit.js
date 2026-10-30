/* The shared kit: icons, buttons, chips, segmented tabs, the stepper, the month picker, dialogs, toasts, the witness flow. */
(function () {
  const P = window.P;
  const { useState, useEffect, useRef } = React;
  const html = htm.bind(React.createElement);
  P.html = html;
  P.cx = (...a) => a.filter(Boolean).join(" ");

  P.useDb = () => {
    const [, set] = useState(0);
    useEffect(() => P.subscribe(() => set((x) => x + 1)), []);
    return P.db;
  };
  P.useMQ = (q) => {
    const [m, setM] = useState(() => window.matchMedia(q).matches);
    useEffect(() => {
      const mq = window.matchMedia(q), f = () => setM(mq.matches);
      mq.addEventListener("change", f);
      return () => mq.removeEventListener("change", f);
    }, [q]);
    return m;
  };

  /* Lucide-style strokes. "c:" circle, "r:" rect. */
  const I = {
    today: ["m3 17 2 2 4-4", "m3 7 2 2 4-4", "M13 6h8", "M13 12h8", "M13 18h8"],
    pill: ["m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z", "m8.5 8.5 7 7"],
    package: ["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z", "M3.3 7 12 12l8.7-5", "M12 22V12"],
    truck: ["M10 17h4V5H2v12h3", "M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5", "M14 17h1", "c:7.5,17.5,2.5", "c:17.5,17.5,2.5"],
    book: ["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"],
    search: ["c:11,11,8", "m21 21-4.3-4.3"],
    scan: ["M3 7V5a2 2 0 0 1 2-2h2", "M17 3h2a2 2 0 0 1 2 2v2", "M21 17v2a2 2 0 0 1-2 2h-2", "M7 21H5a2 2 0 0 1-2-2v-2", "M7 12h10"],
    plus: ["M12 5v14", "M5 12h14"],
    minus: ["M5 12h14"],
    check: ["M20 6 9 17l-5-5"],
    x: ["M18 6 6 18", "M6 6l12 12"],
    right: ["m9 18 6-6-6-6"],
    left: ["m15 18-6-6 6-6"],
    down: ["m6 9 6 6 6-6"],
    alert: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
    wifi: ["M12 20h.01", "M2 8.82a15 15 0 0 1 20 0", "M5 12.86a10 10 0 0 1 14 0", "M8.5 16.43a5 5 0 0 1 7 0"],
    wifioff: ["M12 20h.01", "M8.5 16.43a5 5 0 0 1 7 0", "M2 8.82a15 15 0 0 1 4.17-2.65", "M10.66 5c4.01-.36 8.14.9 11.34 3.76", "M16.85 11.25a10 10 0 0 1 2.22 1.68", "M5 13a10 10 0 0 1 5.24-2.76", "m2 2 20 20"],
    phone: ["r:5,2,14,20,2", "M12 18h.01"],
    printer: ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "r:6,14,12,8,1"],
    clock: ["c:12,12,10", "M12 6v6l4 2"],
    snow: ["M2 12h20", "M12 2v20", "m20 16-4-4 4-4", "m4 8 4 4-4 4", "m16 4-4 4-4-4", "m8 20 4-4 4 4"],
    lock: ["r:3,11,18,11,2", "M7 11V7a5 5 0 0 1 10 0v4"],
    sliders: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
    user: ["c:12,8,4", "M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"],
    arrow: ["M5 12h14", "m12 5 7 7-7 7"],
    shield: ["M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"],
    clip: ["r:8,2,8,4,1", "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "m9 14 2 2 4-4"],
    undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
    swap: ["m16 3 4 4-4 4", "M20 7H4", "m8 21-4-4 4-4", "M4 17h16"],
    ban: ["c:12,12,10", "m4.9 4.9 14.2 14.2"],
    file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M16 13H8", "M16 17H8"],
    send: ["m22 2-7 20-4-9-9-4Z", "M22 2 11 13"],
    history: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"],
    cart: ["c:8,21,1", "c:19,21,1", "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"],
    bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
    copy: ["r:8,8,14,14,2", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
    zap: ["M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"],
    syringe: ["m18 2 4 4", "m17 7 3-3", "M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5", "m9 11 4 4", "m5 19-3 3", "m14 4 6 6"],
    bed: ["M2 4v16", "M2 8h18a2 2 0 0 1 2 2v10", "M2 17h20", "M6 8v9"],
    pin: ["M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0", "c:12,10,3"],
  };
  const shape = (d, i) => {
    if (d.startsWith("c:")) { const [cx, cy, r] = d.slice(2).split(","); return html`<circle key=${i} cx=${cx} cy=${cy} r=${r} />`; }
    if (d.startsWith("r:")) { const [x, y, w, h, rx] = d.slice(2).split(","); return html`<rect key=${i} x=${x} y=${y} width=${w} height=${h} rx=${rx} />`; }
    return html`<path key=${i} d=${d} />`;
  };
  P.Icon = ({ n, s = 18 }) => html`<svg className="ic" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=${2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">${(I[n] || []).map(shape)}</svg>`;

  P.Btn = ({ kind = "outline", size, icon, children, className, ...rest }) =>
    html`<button type="button" className=${P.cx("btn", kind, size, className)} ...${rest}>${icon ? html`<${P.Icon} n=${icon} s=${size === "sm" ? 14 : 16} />` : null}${children}</button>`;

  P.Chip = ({ on, children, icon, size, ...rest }) =>
    html`<button type="button" className=${P.cx("chip", size)} aria-pressed=${on ? "true" : "false"} ...${rest}>${icon ? html`<${P.Icon} n=${icon} s=${14} />` : null}${children}</button>`;

  P.Tag = ({ kind, icon, children }) => html`<span className=${P.cx("tag", kind)}>${icon ? html`<${P.Icon} n=${icon} s=${12} />` : null}${children}</span>`;

  P.Seg = ({ value, onChange, items, label }) => html`
    <div className="seg" role="tablist" aria-label=${label}>
      ${items.map((it) => html`<button type="button" key=${it.v} role="tab" aria-selected=${value === it.v ? "true" : "false"} onClick=${() => onChange(it.v)}>
        ${it.label}${it.n != null ? html`<span className="n">${it.n}</span>` : null}</button>`)}
    </div>`;

  P.Stepper = ({ value, onChange, step = 1, unit, label, max }) => {
    const set = (v) => { let n = Math.max(0, Math.round(v || 0)); if (max != null) n = Math.min(n, max); onChange(n); };
    return html`<span className="stepper">
      <button type="button" aria-label=${"Less " + (label || "")} onClick=${() => set((value || 0) - step)}><${P.Icon} n="minus" s=${16} /></button>
      <input aria-label=${label || "Quantity"} inputMode="numeric" value=${value == null ? "" : String(value)} placeholder="0"
        onChange=${(e) => { const d = e.target.value.replace(/\D/g, ""); onChange(d === "" ? null : Math.min(Number(d), max != null ? max : 1e7)); }} />
      <button type="button" aria-label=${"More " + (label || "")} onClick=${() => set((value || 0) + step)}><${P.Icon} n="plus" s=${16} /></button>
      ${unit ? html`<span className="u">${unit}</span>` : null}
    </span>`;
  };

  P.MonthPick = ({ value, onChange, label = "Expiry month" }) => {
    const [open, setOpen] = useState(false);
    const [yr, setYr] = useState(value ? Number(value.slice(0, 4)) : 2027);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
      document.addEventListener("pointerdown", f); document.addEventListener("keydown", k, true);
      return () => { document.removeEventListener("pointerdown", f); document.removeEventListener("keydown", k, true); };
    }, [open]);
    const years = [2026, 2027, 2028, 2029, 2030, 2031];
    return html`<div className="mp" ref=${ref}>
      <button type="button" className=${P.cx("chip", value && "filled")} aria-expanded=${open ? "true" : "false"} aria-label=${label} onClick=${() => setOpen(!open)}>
        ${value ? P.expWord(value) : "Month"} <${P.Icon} n="down" s=${14} /></button>
      ${open ? html`<div className="mp-pop" role="group" aria-label=${label}>
        <div className="mp-years">${years.map((y) => html`<${P.Chip} key=${y} size="sm" on=${y === yr} onClick=${() => setYr(y)}>${y}<//>`)}</div>
        <div className="mp-months">${P.MON.map((m, i) => {
          const v = yr + "-" + String(i + 1).padStart(2, "0");
          return html`<button type="button" key=${v} className="mp-m" disabled=${v <= P.THIS_MONTH} aria-pressed=${v === value ? "true" : "false"} onClick=${() => { onChange(v); setOpen(false); }}>${m}</button>`;
        })}</div>
        <p className="hint">This month and earlier can't be chosen: stock has to be in date to receive.</p>
      </div>` : null}
    </div>`;
  };

  P.Dialog = ({ title, sub, onClose, size, children, foot }) => {
    const ref = useRef(null);
    useEffect(() => {
      const f = (e) => { if (e.key === "Escape" && onClose) onClose(); };
      window.addEventListener("keydown", f);
      const el = ref.current && (ref.current.querySelector("[data-autofocus]") || ref.current);
      if (el) el.focus({ preventScroll: true });
      return () => window.removeEventListener("keydown", f);
    }, []);
    return html`<div className="scrim" onPointerDown=${(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className=${P.cx("dialog", size)} role="dialog" aria-modal="true" aria-label=${title} tabIndex=${-1} ref=${ref}>
        <header className="dlg-h"><div><h2>${title}</h2>${sub ? html`<p className="muted">${sub}</p>` : null}</div>
          ${onClose ? html`<button type="button" className="iconbtn" aria-label="Close" onClick=${onClose}><${P.Icon} n="x" /></button>` : null}</header>
        <div className="dlg-b">${children}</div>
        ${foot ? html`<footer className="dlg-f">${foot}</footer>` : null}
      </div></div>`;
  };

  /* toasts */
  let toasts = [], tl = new Set(), tid = 1;
  P.toast = (msg, icon = "check") => {
    const t = { id: tid++, msg, icon };
    toasts = [...toasts, t]; tl.forEach((f) => f());
    setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); tl.forEach((f) => f()); }, 4200);
  };
  P.Toaster = () => {
    const [, set] = useState(0);
    useEffect(() => { const f = () => set((x) => x + 1); tl.add(f); return () => tl.delete(f); }, []);
    return html`<div className="toasts" role="status" aria-live="polite">${toasts.map((t) => html`<div className="toast" key=${t.id}><${P.Icon} n=${t.icon} />${t.msg}</div>`)}</div>`;
  };

  P.Empty = ({ icon = "check", title, children }) => html`<div className="empty"><${P.Icon} n=${icon} s=${28} /><b>${title}</b>${children ? html`<div>${children}</div>` : null}</div>`;

  /* Brand from what is on hand: only brands with stock at this place, each with its quantity. "" = any brand, earliest expiry first. */
  P.BrandPick = ({ med, place, value, onChange, label = "Brand" }) => {
    P.useDb();
    const m = P.med(med), av = P.brandsAt(med, place);
    const total = av.reduce((s, x) => s + x.qty, 0);
    const opts = value && !av.some((x) => x.brand === value) ? av.concat({ brand: value, qty: 0 }) : av;
    return html`<label className="brandsel" onClick=${(e) => e.stopPropagation()}>${label ? html`<span>${label}</span>` : null}
      <select value=${value || ""} aria-label=${"Brand of " + m.name} onChange=${(e) => onChange(e.target.value || null)}>
        <option value="">${av.length > 1 ? "Any of " + av.length + " brands" : av.length ? av[0].brand : "None in stock"} · ${P.q(total, med)}</option>
        ${av.length > 1 || (value && opts.length) ? opts.map((x) => html`<option key=${x.brand} value=${x.brand}>${x.brand} · ${P.q(x.qty, med)}</option>`) : null}
      </select></label>`;
  };

  /* Brand on the box (receiving) or to order: from the brands the formulary lists. */
  P.CatalogBrand = ({ med, value, onChange, label = "Brand", disabled }) => {
    const m = P.med(med);
    return html`<label className="brandsel" onClick=${(e) => e.stopPropagation()}>${label ? html`<span>${label}</span>` : null}
      <select value=${value || m.brands[0]} disabled=${disabled} aria-label=${label + " of " + m.name} onChange=${(e) => onChange(e.target.value)}>
        ${m.brands.map((b) => html`<option key=${b} value=${b}>${b}</option>`)}
      </select></label>`;
  };

  /* Available brands: pick one to see where it is and how much, batch by batch. */
  P.BrandStock = ({ med }) => {
    P.useDb();
    const [pick, setPick] = useState("");
    const av = P.brandsAt(med);
    const rows = [];
    av.filter((x) => !pick || x.brand === pick).forEach((x) => x.batches.forEach((id) => {
      const b = P.batch(id);
      P.REAL.forEach((p) => { const q = P.bal(id, p) + P.bal(id, "transit:" + p); if (q > 0) rows.push({ brand: x.brand, b, p, q, tr: P.bal(id, "transit:" + p) }); });
    }));
    if (!av.length) return html`<p className="muted small">No brand in stock anywhere.</p>`;
    return html`<div className="stack-s">
      <label className="brandsel"><select value=${pick} aria-label="Available brands" onChange=${(e) => setPick(e.target.value)}>
        <option value="">All ${av.length} ${av.length === 1 ? "brand" : "brands"} · ${P.q(av.reduce((s, x) => s + x.qty, 0), med)}</option>
        ${av.map((x) => html`<option key=${x.brand} value=${x.brand}>${x.brand} · ${P.q(x.qty, med)}</option>`)}
      </select></label>
      <div className="tblwrap"><table className="tbl compact"><thead><tr><th>Brand</th><th>Where</th><th>Batch</th><th className="r">Quantity</th></tr></thead>
        <tbody>${rows.map((r, i) => html`<tr key=${i}><td className="strong">${r.brand}</td><td>${P.place(r.p).short}${r.tr ? html` <span className="muted small">(${r.tr} on the way)</span>` : null}</td>
          <td><span className="mono">${r.b.no}</span> <span className="muted small">${P.expWord(r.b.exp)}</span></td><td className="r num">${P.q(r.q, med)}</td></tr>`)}</tbody></table></div>
    </div>`;
  };

  /* Pack size: 100, 50, 25, 10 or any other size typed in. */
  P.PackPick = ({ med, value, onChange, disabled }) => {
    const sizes = P.packSizes(med);
    const v = value || P.med(med).pack;
    const [other, setOther] = useState(!sizes.includes(v));
    const [typed, setTyped] = useState(sizes.includes(v) ? "" : String(v));
    return html`<span className="packpick">
      <span>packs of</span>
      <select value=${other ? "other" : String(v)} disabled=${disabled} aria-label=${"Pack size of " + P.med(med).name}
        onChange=${(e) => { if (e.target.value === "other") { setOther(true); setTyped(""); } else { setOther(false); onChange(Number(e.target.value)); } }}>
        ${sizes.map((n) => html`<option key=${n} value=${String(n)}>${n}</option>`)}
        <option value="other">Other…</option>
      </select>
      ${other ? html`<input className="packin" inputMode="numeric" placeholder="size" aria-label="Custom pack size" disabled=${disabled} value=${typed}
        onChange=${(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 5); setTyped(d); if (Number(d) > 0) onChange(Number(d)); }} />` : null}
      <span>${P.med(med).unit}</span>
    </span>`;
  };

  /* One line of the essentials: strength · usual adult dose · half-life. */
  P.MedFacts = ({ med }) => {
    const m = P.med(med);
    if (m.vaccine) return html`<div className="medfacts"><span>${m.strength}</span><span>${m.short}</span><span>${m.vac.freeze ? "Freeze-sensitive" : "Not freeze-sensitive"}</span></div>`;
    const half = m.pk.half.split(" (")[0];
    return html`<div className="medfacts"><span>${m.strength}</span><span>Adult ${m.short}</span>${/^Not/.test(half) ? null : html`<span>t½ ${half}</span>`}</div>`;
  };

  P.MedInfoBody = ({ med }) => {
    const m = P.med(med);
    const first = (t) => t.split(/;|\.\s| \(/)[0];
    const kv = (k, v, cls) => html`<div className=${P.cx("mi-kv", cls)}><span className="mi-k">${k}</span><span className="mi-v">${v}</span></div>`;
    const card = (icon, title, body, cls) => html`<section className=${P.cx("mi-card", cls)}><h4><${P.Icon} n=${icon} s=${15} />${title}</h4>${body}</section>`;
    if (m.vaccine) {
      const v = m.vac, bs = P.batchesOf(m.id).filter((b) => P.batchTotal(b.id) > 0);
      return html`<div className="medinfo">
        <div className="mi-tags">${m.routes.map((r) => html`<${P.Tag} key=${r}>${r}<//>`)}<span className="mi-pill">Never IV</span><${P.Tag} icon="snow">Cold chain 2–8 °C<//>
          ${v.freeze ? html`<span className="mi-pill frz">Freeze-sensitive</span>` : null}${v.light ? html`<span className="mi-pill">Protect from light</span>` : null}
          <span className="mi-class"><b>${m.cat}</b> · ${v.type}</span></div>
        <div className="mi-glance">
          <div><span>Schedule</span><b>${m.short}</b></div>
          <div><span>Dose and route</span><b>${m.strength.split(" · ")[0]} ${m.routes[0]}</b></div>
          <div><span>Vial</span><b>${v.vial}</b></div>
          <div><span>Opened vial</span><b>${/28 days/.test(v.open) ? "Keep up to 28 days" : /6 hours/.test(v.open) ? "Discard after 6 h" : /Single/.test(v.open) ? "Single use" : "Per label"}</b></div>
        </div>
        <div className="mi-alerts">
          <div className="mi-alert iv"><${P.Icon} n="pill" s=${16} /><div><b>How to give it</b><p>${m.ivNote}</p></div></div>
          <div className="mi-alert warn"><${P.Icon} n="alert" s=${16} /><div><b>Watch for (AEFI)</b><p>${m.adr.serious}</p></div></div>
        </div>
        <div className="mi-grid">
          ${card("clock", "Schedule (UNEPI, sample)", html`<ol className="vac-sched">${v.schedule.map(([age, d]) => html`<li key=${d}><b>${age}</b><span>${d}</span></li>`)}</ol>${kv("Children", m.dose.child)}${kv("Adults", m.dose.adult)}${kv("Note", m.dose.note, "dnote")}`)}
          ${card("zap", "Immunology", html`${kv("Type", v.type)}${kv("How it works", m.pd.mech)}${kv("Protects against", m.pd.effect)}${kv("Immunity", m.pk.peak)}`)}
          ${card("shield", "Safety and cold chain", html`${kv("Common reactions", m.adr.common)}${m.ix.length ? html`<div className="mi-kv"><span className="mi-k">Interactions</span><ul className="mi-ix">${m.ix.map(([d, e]) => html`<li key=${d}><b>${d}</b><span>${e}</span></li>`)}</ul></div>` : null}
            ${kv("Do not give", m.ci)}${kv("Pregnancy", m.preg)}${kv("Opened vial", v.open)}${kv("Freezing", v.freeze ? "Damaged by freezing: never freeze; shake test if freezing is suspected" : "Not damaged by freezing" + (m.routes.includes("Oral") ? "" : "; keep the diluent cold but never frozen"))}${kv("Monitor", m.monitor)}`)}
        </div>
        ${card("package", "Batches and vaccine vial monitors", html`<div className="vvm-list">${bs.length ? bs.map((b) => html`<div key=${b.id} className="vvm-row"><span className=${"vvm s" + (b.vvm || 1)} title=${"VVM stage " + (b.vvm || 1)}><i></i></span><span className="mono strong">${b.no}</span><span>${P.batchBrand(b)}</span><span className="muted">exp ${P.expWord(b.exp)}</span><span className="num">${P.q(P.batchTotal(b.id), m.id)}</span><span className=${(b.vvm || 1) >= 3 ? "err" : (b.vvm || 1) === 2 ? "vvm-use" : "muted"}>${(b.vvm || 1) >= 3 ? "VVM past the discard point: do not use" : (b.vvm || 1) === 2 ? "VVM stage 2: use this batch first" : "VVM stage 1: fine"}</span></div>`) : html`<p className="muted small">None in stock.</p>`}</div>
          <${P.BrandStock} med=${med} />`, "brands")}
        <p className="hint">Sample reference values. The real product follows the current UNEPI schedule and product inserts; VVM stages are read off each vial at receipt and at every session.</p>
      </div>`;
    }
    return html`<div className="medinfo">
      <div className="mi-tags">
        ${m.routes.map((r) => html`<${P.Tag} key=${r} kind=${r === "IV" ? "iv" : null}>${r}<//>`)}
        <span className=${P.cx("mi-pill", m.iv ? "iv" : "")}>${m.iv ? "IV formulation" : "Not for IV use"}</span>
        ${m.cold ? html`<${P.Tag} icon="snow">Cold chain 2–8 °C<//>` : null}${m.controlled ? html`<${P.Tag} icon="lock">Controlled<//>` : null}
        <span className="mi-class"><b>${m.cat}</b> · ${m.pd.cls}</span>
      </div>
      <div className="mi-glance">
        <div><span>Usual adult dose</span><b>${m.short}</b></div>
        <div><span>Child</span><b>${first(m.dose.child)}</b></div>
        <div><span>Half-life</span><b>${m.pk.half.split(" (")[0]}</b></div>
        <div><span>Onset / peak</span><b>${first(m.pk.peak)}</b></div>
      </div>
      <div className="mi-alerts">
        <div className=${P.cx("mi-alert", m.iv ? "iv" : "plain")}><${P.Icon} n=${m.iv ? "zap" : "pill"} s=${16} /><div><b>${m.iv ? "Giving it IV" : "Route"}</b><p>${m.ivNote}</p></div></div>
        <div className="mi-alert warn"><${P.Icon} n="alert" s=${16} /><div><b>Watch for</b><p>${m.adr.serious}</p></div></div>
      </div>
      <div className="mi-grid">
        ${card("pill", "Dosing", html`${kv("Adult", m.dose.adult)}${kv("Child", m.dose.child)}${kv("Note", m.dose.note, "dnote")}`)}
        ${card("zap", "Pharmacology", html`
          <div className="mi-sub">Pharmacodynamics</div>${kv("Mechanism", m.pd.mech)}${kv("Effect", m.pd.effect)}
          <div className="mi-sub">Pharmacokinetics</div>
          <dl className="mi-pk">${[["Absorption", m.pk.abs], ["Onset / peak", m.pk.peak], ["Half-life", m.pk.half], ["Metabolism", m.pk.metab], ["Excretion", m.pk.excr]].map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`)}
        ${card("shield", "Safety", html`
          ${kv("Common reactions", m.adr.common)}
          <div className="mi-kv"><span className="mi-k">Interactions</span>${m.ix.length ? html`<ul className="mi-ix">${m.ix.map(([d, e]) => html`<li key=${d}><b>${d}</b><span>${e}</span></li>`)}</ul>` : html`<span className="mi-v muted">None of note</span>`}</div>
          ${kv("Avoid / caution", m.ci)}${kv("Pregnancy, breastfeeding", m.preg)}${kv("Monitor", m.monitor)}`)}
      </div>
      ${card("package", "Available brands", html`<${P.BrandStock} med=${med} />`, "brands")}
      <p className="hint">Reference values for the prototype. The real product takes these from the signed formulary (Uganda Clinical Guidelines and the product leaflet). Brand names are examples; "Generic" means any NDA-registered supplier. The brand comes from the box at receiving and stays with the batch.</p>
    </div>`;
  };
  P.MedInfo = ({ med, onClose }) => {
    const m = P.med(med);
    return html`<${P.Dialog} size="xwide" title=${m.name} sub=${m.strength + " · " + m.form} onClose=${onClose}><${P.MedInfoBody} med=${med} /><//>`;
  };

  const MedInfoBtn = ({ med, short }) => {
    const [open, setOpen] = useState(false);
    return html`<button type="button" className=${P.cx("pkbtn", short && "sm")} aria-label=${"Clinical information on " + P.med(med).name} title="Dosage, pharmacology, reactions, interactions, brands"
      onClick=${(e) => { e.stopPropagation(); setOpen(true); }}>${short ? "Rx" : "Rx info"}</button>${open ? html`<span onClick=${(e) => e.stopPropagation()}><${P.MedInfo} med=${med} onClose=${() => setOpen(false)} /></span>` : null}`;
  };

  P.MedTags = ({ med, info = true, compact }) => {
    const m = P.med(med);
    if (compact) return html` <span className="ctags"><span className=${P.cx("ctag", m.iv && "iv")}>${m.routes.join("/")}</span>${m.cold ? html`<span className="ctag cold" title="Cold chain 2–8 °C"><${P.Icon} n="snow" s=${11} /></span>` : null}${m.controlled ? html`<span className="ctag" title="Controlled"><${P.Icon} n="lock" s=${11} /></span>` : null}${info ? html`<${MedInfoBtn} med=${med} short=${true} />` : null}</span>`;
    return html` <${P.Tag} kind=${m.iv ? "iv" : null}>${m.routes.join(" · ")}<//>${m.controlled ? html` <${P.Tag} icon="lock">Controlled<//>` : null}${m.cold ? (info ? html` <button type="button" className="tag coldtag" title="Live fridge temperature and trend" onClick=${(e) => { e.stopPropagation(); P.go({ to: "store", tab: "cold" }); }}><${P.Icon} n="snow" s=${12} />Cold chain · live temp</button>` : html` <${P.Tag} icon="snow">Cold chain<//>`) : null}${info ? html` <${MedInfoBtn} med=${med} />` : null}`;
  };

  /* Find a medicine to add (used by deliveries and issues). */
  P.MedPicker = ({ onPick, exclude = [], onClose }) => {
    const [q, setQ] = useState("");
    const qq = q.trim().toLowerCase();
    const list = P.MEDS.filter((m) => !exclude.includes(m.id) && (m.name.toLowerCase().includes(qq) || m.cat.toLowerCase().includes(qq)));
    const groups = P.CLASSES.concat("Other").map((c) => [c, list.filter((m) => m.cat === c)]).filter(([, l]) => l.length);
    return html`<${P.Dialog} title="Add a medicine" sub="Search by name, or scan the box" onClose=${onClose}>
      <input className="input" data-autofocus placeholder="Name or class, e.g. antibiotics" value=${q} onChange=${(e) => setQ(e.target.value)} aria-label="Search medicines" />
      <div className="list">${groups.map(([c, l]) => html`<${React.Fragment} key=${c}><div className="pick-grp">${c}</div>${l.map((m) => html`<button type="button" key=${m.id} className="lrow" onClick=${() => onPick(m.id)}>
        <div className="grow"><div className="t">${m.name}<${P.MedTags} med=${m.id} info=${false} /></div><div className="m">${m.strength} · pack of ${m.pack} ${m.unit}</div></div><${P.Icon} n="plus" /></button>`)}<//>`)}
        ${list.length ? null : html`<p className="muted">No medicine matches "${q}".</p>`}</div>
    <//>`;
  };

  /* Witness: on their own phone when online; the paper register and a typed name when offline. */
  P.WitnessDialog = ({ what, onDone, onClose, list, hint, title, place }) => {
    const db = P.useDb();
    const [who, setWho] = useState(null);
    const [person, setPerson] = useState(null);
    const roster = place && P.ROSTER[place] ? place : "pharmacy";
    const duty = who ? P.onDuty(roster, who) : [];
    const day = P.shiftNow() === "day";
    const pickRole = (w) => { setWho(w); const d = P.onDuty(roster, w); setPerson(d.length === 1 ? d[0].name : null); };
    const sel = duty.find((x) => x.name === person);
    const [sent, setSent] = useState(false);
    const [paperName, setPaperName] = useState("");
    const off = db.settings.offline;
    const foot = off
      ? html`<span className="grow">The in-charge sees this on Today and checks it against the register.</span>
          <${P.Btn} kind="primary" disabled=${paperName.trim().length < 3} onClick=${() => onDone({ name: paperName.trim(), how: "paper", at: P.now() })}>Record with paper witness<//>`
      : sent
        ? html`<span className="grow">Prototype only: in the real app the witness taps Approve on their phone.</span>
            <${P.Btn} kind="primary" icon="phone" onClick=${() => onDone({ name: person, role: who, how: "phone", at: P.now() })}>Simulate: witness approves<//>`
        : html`<${P.Btn} kind="primary" icon="send" disabled=${!sel} onClick=${() => setSent(true)}>${sel ? "Send to " + sel.name + "'s phone" : "Send to their phone"}<//>`;
    return html`<${P.Dialog} title=${title || "A witness for the controlled drug"} sub=${what} onClose=${onClose} foot=${foot}>
      ${off ? html`
        <div className="note"><${P.Icon} n="wifioff" /><span>No network, so phone approval can't reach the witness. The witness signs the paper controlled-drugs register now. Type their name and the entry is flagged for the in-charge.</span></div>
        <div className="field"><label htmlFor="pw">Witness's name, as signed on paper</label><input id="pw" className="input" data-autofocus value=${paperName} onChange=${(e) => setPaperName(e.target.value)} /></div>`
      : sent ? html`
        <div className="note"><${P.Icon} n="phone" /><span><b>Waiting for ${person}</b> (${who.toLowerCase()}) to approve on their own phone. They see what is being recorded, and approve with their own sign-in. Nobody types their password on this screen.</span></div>`
      : html`
        <div className="lbl">Who is witnessing?</div>
        <div className="chips">${(list || P.WITNESSES).map((w) => html`<${P.Chip} key=${w} on=${who === w} onClick=${() => pickRole(w)}>${w}<//>`)}</div>
        ${who ? html`<div className="stack-s"><span className="lbl">On duty now · ${day ? "day shift, 08:00–17:00" : "night shift, 17:00–08:00"}${roster === "pharmacy" ? " · pharmacy" : " · " + P.place(roster).short}</span>
          ${duty.length ? html`<div className="wit-ppl">${duty.map((x) => html`<button type="button" key=${x.name} className=${P.cx("wit-p", person === x.name && "on")} aria-pressed=${person === x.name ? "true" : "false"} onClick=${() => setPerson(x.name)}>
            <span className="wit-av">${x.name.replace(/^(Nurse in-charge|Midwife in-charge|Nurse|Midwife|Dr) /, "").split(/[ .]+/).filter(Boolean).map((t) => t[0]).join("").slice(0, 2)}</span>
            <span className="wit-t"><b>${x.name}</b><span>${x.cadre} · ${x.shift === "call" ? "on call, 24 h" : day ? "on until 17:00" : "on until 08:00"}</span></span></button>`)}</div>`
          : html`<p className="muted small">Nobody rostered in this role on this shift. Choose another role.</p>`}</div>` : null}
        <p className="hint">${hint || "This list comes from the signed rule \"Who may witness\". Whether a nurse may witness is still a legal question, so nurses are not on it."}</p>`}
    <//>`;
  };

  P.ErrorBoundary = class extends React.Component {
    constructor(p) { super(p); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err }; }
    componentDidCatch(err) { window.__protoErrors = (window.__protoErrors || []).concat(String(err && err.stack || err)); }
    render() {
      if (this.state.err) return html`<div className="errbox"><b>This screen hit a prototype bug.</b><p className="muted small">${String(this.state.err)}</p>
        <${P.Btn} kind="navy" onClick=${() => { this.setState({ err: null }); P.go({ to: "today" }); }}>Back to Today<//></div>`;
      return this.props.children;
    }
  };
})();
