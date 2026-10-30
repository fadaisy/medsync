/* Audit trail and loss value.
   Audit: one timeline of who did what, from every part of the pharmacy. Nothing is edited or deleted: a correction is a
   reversal plus a new line, with a reason, and the original stays visible.
   Losses: what was lost this month in UGX, by cause and by place, and what is about to expire before it can be used. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const wl = (ms) => P.when(ms).replace(/^(Today|Yesterday)/, (x) => x.toLowerCase());

  /* ── prices: UGX per unit (sample; the real product reads the NMS price catalogue) ── */
  P.PRICE = { amox: 80, pcm: 20, metro: 30, metf: 50, ctx: 40, ferr: 20, ors: 600, ceft: 3500, gent: 1200, oxy: 1500, morph: 4000, ns: 3000, rl: 3200, amlo: 60, mgso4: 2500, diaz: 1500, peth: 5000, omor: 50,
    bcg: 350, bopv: 500, ipv: 6500, penta: 3500, pcv: 11000, rota: 7000, mr: 2500, hpv: 16000, td: 400 };
  P.ugx = (n) => "UGX " + Math.round(n).toLocaleString("en-GB");
  const ugxS = (n) => (n >= 1e6 ? "UGX " + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + " M" : n >= 1e4 ? "UGX " + Math.round(n / 1000) + " k" : P.ugx(n));
  P.KIND.reversal = "Reversed (correction)";

  /* ── sample losses this month, and slow movers that will expire before they are used ── */
  const seedLoss = (db) => {
    const d = (day, h) => new Date(2026, 9, day, h || 10, 0).getTime();
    const add = (b, med, no, exp, place, qty, day, cause, note, by) => {
      if (!db.batches.some((x) => x.id === b)) db.batches.push({ id: b, med, no, exp, brand: "Generic" });
      db.moves.push({ id: "m" + db.seq++, at: d(day) - 20 * DAY, kind: "opening", med, batch: b, from: null, to: place, qty, by: "Opening balance (sample)" });
      db.moves.push({ id: "m" + db.seq++, at: d(day), kind: "wastage", med, batch: b, from: place, to: "waste", qty, cause, note, by });
    };
    add("amoxx-1", "amox", "AX24050", "2026-09", "store", 400, 3, "Expired", "Expired 30 Sep, removed from the shelf", "P. Waiswa");
    add("ctxx-1", "ctx", "CT24112", "2026-09", "store", 900, 7, "Expired", "Expired 30 Sep, removed from the shelf", "P. Waiswa");
    add("ceftx-1", "ceft", "CF25002", "2027-03", "w3", 3, 12, "Damaged", "Box dropped on the ward, 3 vials broken", "Nurse G. Apio");
    add("pentax-1", "penta", "PE25120", "2027-02", "epi", 30, 20, "Cold chain", "Froze on 20 Oct: shake test failed", "EPI nurse (sample)");
    add("ipvx-1", "ipv", "IP25041", "2027-01", "epi", 10, 20, "Cold chain", "Froze on 20 Oct: shake test failed", "EPI nurse (sample)");
    add("oxyx-1", "oxy", "OX25040", "2027-02", "mat", 10, 23, "Cold chain", "Maternity fridge at +8.6 °C for 30 min, discarded on the in-charge's advice", "Midwife in-charge J. Ayo");
    add("orsx-1", "ors", "OR25071", "2027-06", "opd", 12, 25, "Damaged", "Water damage under the window", "S. Nantongo");
    /* slow movers: more than will be used before expiry */
    [["ferr-0", "ferr", "FF24190", "2026-11", 3000], ["amlo-0", "amlo", "AM24233", "2026-12", 4000]].forEach(([b, med, no, exp, q]) => {
      if (!db.batches.some((x) => x.id === b)) db.batches.push({ id: b, med, no, exp, brand: "Generic" });
      db.moves.push({ id: "m" + db.seq++, at: d(1), kind: "opening", med, batch: b, from: null, to: "store", qty: q, by: "Opening balance (sample)" });
    });
    db.lossSeeded = 1;
  };
  if (!P.db.lossSeeded) { seedLoss(P.db); P.commit(); }
  const reset0 = P.reset;
  P.reset = () => { reset0(); seedLoss(P.db); P.commit(); };

  /* EPI opened-vial wastage for the month (sample figures, same as the Immunisation page) */
  const EPI_USED = { bcg: 96, bopv: 372, ipv: 88, penta: 294, pcv: 290, rota: 196, mr: 145, hpv: 21, td: 130 };
  const EPI_WASTE = { bcg: 38, bopv: 14, ipv: 9, penta: 6, pcv: 5, rota: 1, mr: 24, hpv: 0, td: 11 };
  const LOSS_HIST = [["May", 820000], ["Jun", 1120000], ["Jul", 690000], ["Aug", 1460000], ["Sep", 910000]];
  const CAUSES = ["Expired", "Opened-vial wastage", "Cold chain", "Damaged", "Unexplained shortfall", "Recall"];

  const causeOf = (m) => {
    if (m.cause) return m.cause;
    const n = (m.note || "").toLowerCase();
    if (/expir/.test(n)) return "Expired";
    if (/vvm|froze|freez|heat|cold|°c/.test(n)) return "Cold chain";
    if (/opened vial|opened/.test(n)) return "Opened-vial wastage";
    if (/broken|damag|dropped/.test(n)) return "Damaged";
    if (/recall/.test(n)) return "Recall";
    return "Unexplained shortfall";
  };
  P.losses = (from, to) => {
    const out = [];
    P.db.moves.forEach((m) => {
      if (m.at < from || m.at > to || m.reversedBy) return;
      const isLoss = m.to === "waste" || m.to === "loss" || (m.kind === "count" && m.from && !m.to);
      if (!isLoss) return;
      out.push({ at: m.at, place: m.from, med: m.med, batch: m.batch, qty: m.qty, cause: causeOf(m), note: m.note, by: m.by, v: m.qty * (P.PRICE[m.med] || 0), mv: m });
    });
    Object.keys(EPI_USED).forEach((med) => { const w = Math.round(EPI_USED[med] * EPI_WASTE[med] / (100 - EPI_WASTE[med])); if (w) out.push({ at: to, place: "epi", med, qty: w, cause: "Opened-vial wastage", note: "Doses left in opened multi-dose vials this month (sample)", by: "EPI clinic", v: w * P.PRICE[med], epi: true }); });
    return out;
  };
  /* open discrepancies, valued: stock nobody can account for yet */
  const openShort = () => (P.caseList ? P.caseList().filter((c) => c.status !== "closed" && c.qty < 0 && !c.fixed).map((c) => ({ med: c.med, place: c.place, qty: -c.qty, v: -c.qty * (P.PRICE[c.med] || 0), c })) : []);
  /* stock that will expire before it can be used, at the current rate of use (earliest expiry used first) */
  P.atRisk = () => {
    const out = [];
    P.MEDS.forEach((m) => {
      const bs = P.batchesOf(m.id).filter((b) => !P.expired(b) && !b.recalled && P.batchTotal(b.id) > 0).sort((a, b) => (a.exp < b.exp ? -1 : 1));
      let usedBefore = 0;
      bs.forEach((b) => {
        const mo = P.monthsTo(b.exp), have = P.batchTotal(b.id);
        if (mo > 6) { usedBefore += have; return; }
        const canUse = Math.max(0, m.amc * mo - usedBefore), waste = Math.max(0, have - canUse);
        usedBefore += have;
        out.push({ b, m, mo, have, waste, v: waste * (P.PRICE[m.id] || 0), where: P.REAL.filter((p) => P.bal(b.id, p) > 0) });
      });
    });
    return out.sort((a, b) => b.v - a.v);
  };

  /* ── a single-series horizontal bar list (hover shows the value) ── */
  const Bars = ({ rows, total }) => {
    const max = Math.max(1, ...rows.map((r) => r.v));
    return html`<div className="lv-bars">${rows.map((r) => html`<div key=${r.k} className="lv-row" title=${r.k + ": " + P.ugx(r.v) + (total ? " (" + Math.round((r.v / total) * 100) + "%)" : "")}>
      <span className="lv-k">${r.k}</span><span className="lv-track"><i style=${{ width: Math.max(1, (r.v / max) * 100) + "%" }}></i></span><span className="lv-v">${ugxS(r.v)}</span></div>`)}</div>`;
  };

  P.LossView = () => {
    const db = P.useDb();
    const now = P.now(), m0 = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
    const L = P.losses(m0, now), total = L.reduce((a, x) => a + x.v, 0);
    const byCause = CAUSES.map((k) => ({ k, v: L.filter((x) => x.cause === k).reduce((a, x) => a + x.v, 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const byPlace = P.REAL.map((p) => ({ k: P.place(p).short, v: L.filter((x) => x.place === p).reduce((a, x) => a + x.v, 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const risk = P.atRisk(), riskV = risk.reduce((a, x) => a + x.v, 0), shorts = openShort(), shortV = shorts.reduce((a, x) => a + x.v, 0);
    const last = LOSS_HIST[LOSS_HIST.length - 1][1], ch = Math.round(((total - last) / last) * 100);
    const months = LOSS_HIST.concat([["Oct", total]]), mmax = Math.max(...months.map((x) => x[1]));
    const [show, setShow] = useState(false);
    const act = (r, what) => { db.riskActs = (db.riskActs || []).concat([{ at: P.now(), by: P.who(), batch: r.b.id, med: r.m.id, what, v: r.v }]); P.commit(); P.toast(what + ": " + r.m.name + " " + r.b.no); };
    const rows = L.slice().sort((a, b) => b.v - a.v);
    return html`<div className="stack">
      <div className="kpis">
        <div className="kpi"><b>${ugxS(total)}</b><span>lost this month · ${ch > 0 ? "+" : ""}${ch}% on September</span></div>
        <div className="kpi"><b>${ugxS(L.filter((x) => x.cause === "Expired").reduce((a, x) => a + x.v, 0))}</b><span>of it expired on the shelf</span></div>
        <div className="kpi"><b className=${riskV ? "bad" : "ok"}>${ugxS(riskV)}</b><span>will expire before it's used, next 6 months</span></div>
        <div className="kpi"><b className=${shortV ? "bad" : "ok"}>${ugxS(shortV)}</b><span>unaccounted for, cases open</span></div>
      </div>
      <div className="lv-grid">
        <div className="card pad stack-s"><div className="dash-h"><h3>Lost this month, by cause</h3><span className="muted small">${P.ugx(total)}</span></div><${Bars} rows=${byCause} total=${total} /></div>
        <div className="card pad stack-s"><div className="dash-h"><h3>By place</h3></div><${Bars} rows=${byPlace} total=${total} /></div>
        <div className="card pad stack-s"><div className="dash-h"><h3>Monthly loss</h3><span className="muted small">May–October</span></div>
          <div className="lv-cols">${months.map(([k, v], i) => html`<div key=${k} className=${P.cx("lv-col", i === months.length - 1 && "now")} title=${k + ": " + P.ugx(v)}><span className="lv-cv">${ugxS(v).replace("UGX ", "")}</span><i style=${{ height: Math.max(3, (v / mmax) * 100) + "%" }}></i><span className="lv-cl">${k}</span></div>`)}</div>
          <p className="hint">October so far, including the EPI clinic's opened-vial wastage (sample).</p></div>
      </div>
      <div className="card">
        <div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>Will expire before it's used</h3><span className="muted small">at the current rate of use, earliest expiry first · act now while it can still be moved or swapped</span></div>
        <div className="tblwrap"><table className="tbl dense"><thead><tr><th>Medicine</th><th>Batch</th><th>Expires</th><th>Where</th><th className="r">In stock</th><th className="r">Won't be used</th><th className="r">Value at risk</th><th>Act</th></tr></thead>
          <tbody>${risk.filter((r) => r.waste > 0).map((r) => { const done = (db.riskActs || []).filter((a) => a.batch === r.b.id); return html`<tr key=${r.b.id}>
            <td>${r.m.name}</td><td className="mono">${r.b.no}</td><td className=${r.mo <= 1 ? "bad" : ""}>${P.expWord(r.b.exp)} · ${r.mo} mo</td><td className="small">${r.where.map((p) => P.place(p).short + " " + P.bal(r.b.id, p)).join(" · ")}</td>
            <td className="r num">${r.have.toLocaleString("en-GB")}</td><td className="r num bad">${r.waste.toLocaleString("en-GB")}</td><td className="r num strong">${P.ugx(r.v)}</td>
            <td>${done.length ? html`<span className="small">${done.map((a) => a.what).join(", ")} · ${done[done.length - 1].by}</span>` : html`<div className="row">${["Offer to another facility", "Ask NMS to swap", "Use first everywhere"].map((w) => html`<${P.Btn} key=${w} size="sm" kind="ghost" onClick=${() => act(r, w)}>${w}<//>`)}</div>`}</td></tr>`; })}</tbody></table></div>
        ${risk.some((r) => r.waste > 0) ? null : html`<p className="ok-line" style=${{ padding: "0 16px 14px" }}><${P.Icon} n="check" s=${14} />Everything in stock will be used before it expires.</p>`}
      </div>
      <div className="card">
        <div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>Every loss this month</h3><span className="muted small">${rows.length} lines · from the ledger</span><span className="grow"></span><button type="button" className="clslink" onClick=${() => setShow(!show)}>${show ? "Show fewer" : "Show all"}</button></div>
        <div className="tblwrap"><table className="tbl dense"><thead><tr><th>Date</th><th>Place</th><th>Medicine</th><th>Cause</th><th className="r">Qty</th><th className="r">Value</th><th>What happened</th><th>Recorded by</th></tr></thead>
          <tbody>${(show ? rows : rows.slice(0, 8)).map((x, i) => html`<tr key=${i}><td className="num">${x.epi ? "October" : P.when(x.at)}</td><td>${P.place(x.place) ? P.place(x.place).short : x.place}</td><td>${P.med(x.med).name}</td><td>${x.cause}</td><td className="r num">${x.qty}</td><td className="r num strong">${P.ugx(x.v)}</td><td className="small">${x.note || ""}</td><td className="small">${x.by}</td></tr>`)}</tbody></table></div>
      </div>
      <p className="hint">Prices are sample UGX unit prices; the real product reads them from the NMS catalogue, so the monthly figure matches what the facility paid. Losses never change on their own: each line is a ledger entry with a reason and a name.</p>
    </div>`;
  };

  /* ── audit trail ── */
  const CATS = { rx: "Prescription check", stock: "Stock movement", cd: "Controlled drug", check: "Count or check", ho: "Shift handover", case: "Investigation", corr: "Correction", cold: "Cold chain", loss: "Loss action" };
  P.audit = () => {
    const db = P.db, ev = [];
    db.moves.forEach((m) => {
      if (m.kind === "opening") return;
      const med = P.med(m.med), cd = med && med.controlled;
      const late = m.entered && !m.correctionOf && m.entered - m.at > 30 * MIN;
      ev.push({ at: m.entered || m.at, happened: m.at, who: m.by, cat: m.kind === "reversal" || m.correctionOf ? "corr" : cd ? "cd" : "stock", action: P.KIND[m.kind] || m.kind,
        detail: (med ? med.name : m.med) + " · " + (med ? (med.unit === "mL" ? m.qty + " mL" : m.qty + " " + (m.qty === 1 ? med.unit.replace(/s$/, "") : med.unit)) : m.qty) + " · " + (P.REAL.includes(m.from) ? P.place(m.from).short : P.placeName(m.from)) + " → " + (m.to === "patient" && m.note ? m.note : P.placeName(m.to)),
        place: P.REAL.includes(m.from) ? m.from : m.to, reason: m.kind === "reversal" ? m.note : m.correctionOf ? "Replaces an entry: " + (m.note || "") : m.cause || (m.kind === "wastage" || m.kind === "count" ? m.note : ""),
        tags: [late ? "late entry" : null, cd && !m.witness && !["confirm", "quarantine", "count", "reversal"].includes(m.kind) ? "no witness" : null, m.witness && m.witness.late ? "witness added late" : null, m.reversedBy ? "corrected" : null, m.pending ? "not sent yet" : null].filter(Boolean),
        witness: m.witness ? m.witness.name : null, mv: m });
      if (m.witness && m.witness.late) ev.push({ at: m.witness.at, who: m.witness.name, cat: "cd", action: "Witness added late", detail: (med ? med.name : "") + " · entry of " + P.when(m.at), place: m.from, tags: ["late"] });
      if (m.cd && m.cd.residueLate) ev.push({ at: m.cd.residueLate.at, who: m.cd.residueLate.witness.name, cat: "cd", action: "Residue disposal recorded late", detail: (med ? med.name : "") + " · " + m.cd.residueMg + " mg from " + P.when(m.at), place: m.from, tags: ["late"] });
    });
    (db.cdChecks || []).forEach((c) => ev.push({ at: c.at, who: c.by, cat: "check", action: c.handover ? "Handover count (controlled)" : "Controlled-drug balance check", detail: c.lines.map((l) => P.med(l.med).name.split(" ")[0] + " " + l.counted + (l.counted !== l.expected ? " (reg. " + l.expected + ")" : "")).join(" · "), place: c.place, witness: c.witness && c.witness.name, tags: c.lines.some((l) => l.counted !== l.expected) ? ["not matching"] : [] }));
    (db.counts || []).forEach((c) => { ev.push({ at: c.at, who: c.by, cat: "check", action: "Stock count started", detail: c.title, place: c.place, tags: [] }); if (c.doneAt) ev.push({ at: c.doneAt, who: "In-charge", cat: "check", action: "Stock count approved", detail: c.title + " · " + P.countDiffs(c).length + " changes", place: c.place, tags: [] }); });
    (db.handovers || []).forEach((h) => ev.push({ at: h.at, who: h.from.name, cat: "ho", action: (h.mid ? "Mid-shift handover" : "Shift handover") + " to " + h.to.name, detail: h.lines.map((l) => P.med(l.med).name.split(" ")[0] + " " + l.counted).join(" · ") + (h.seal ? " · seal " + h.seal : ""), place: h.place, witness: h.to.name, tags: h.lines.some((l) => l.counted !== l.expected && !l.known) ? ["not matching"] : [] }));
    Object.entries(db.hoMiss || {}).forEach(([k, v]) => { const [p, s] = k.split("|"); ev.push({ at: v.at, who: v.by, cat: "ho", action: "Missed handover explained", detail: P.when(+s) + ": " + v.why, place: p, reason: v.note, tags: [] }); });
    Object.entries(db.cdDone || {}).forEach(([k, v]) => ev.push({ at: v.at, who: v.by, cat: "cd", action: "Early dose reviewed", detail: v.why, tags: [] }));
    (P.caseList ? P.caseList() : []).forEach((c) => {
      const t = P.med(c.med).name + " · " + P.place(c.place).short;
      if (c.assignedAt) ev.push({ at: c.assignedAt, who: c.assignedBy, cat: "case", action: "Case assigned to " + c.owner, detail: t, place: c.place, tags: [] });
      (c.steps || []).forEach((s) => ev.push({ at: s.at, who: s.by, cat: "case", action: s.what, detail: t + (s.note ? " · " + s.note : ""), place: c.place, tags: [] }));
      if (c.submitted) ev.push({ at: c.submitted.at, who: c.submitted.by, cat: "case", action: "Findings submitted", detail: t + (c.findings ? " · " + c.findings.cause : ""), place: c.place, tags: [] });
      (c.backs || []).forEach((b) => ev.push({ at: b.at, who: b.by, cat: "case", action: "Case sent back", detail: t, reason: b.why, place: c.place, tags: [] }));
      (c.escalations || []).forEach((e) => ev.push({ at: e.at, who: e.by, cat: "case", action: "Escalated " + e.to.toLowerCase(), detail: t, place: c.place, tags: ["escalated"] }));
      if (c.signoff) ev.push({ at: c.signoff.at, who: c.signoff.by, cat: "case", action: "Case signed off", detail: t, place: c.place, tags: [] });
    });
    Object.entries(db.coldAck || {}).forEach(([k, v]) => ev.push({ at: v.at, who: v.by, cat: "cold", action: "Excursion action recorded", detail: v.actions.join(", "), tags: [] }));
    db.rx.forEach((r) => Object.entries(r.ack || {}).forEach(([k, a]) => ev.push({ at: a.at, who: a.by, cat: "rx", action: "Prescription check answered", detail: r.patient + " · " + (P.rxChecks ? (P.rxChecks(r).find((f) => f.id === k) || {}).title || k : k), reason: a.why + (a.who ? " (" + a.who + ")" : ""), tags: [] })));
    (db.rxQueries || []).forEach((q) => ev.push({ at: q.at, who: q.by, cat: "rx", action: "Query sent to the prescriber", detail: q.patient + " · " + P.med(q.med).name + " · " + q.flag, reason: q.ask, tags: [] }));
    (db.riskActs || []).forEach((a) => ev.push({ at: a.at, who: a.by, cat: "loss", action: a.what, detail: P.med(a.med).name + " " + (P.batch(a.batch) || {}).no + " · " + P.ugx(a.v) + " at risk", tags: [] }));
    db.paperWitness.filter((p) => p.checked).forEach((p) => ev.push({ at: p.checkedAt, who: "In-charge", cat: "cd", action: "Paper witness checked", detail: p.what, tags: [] }));
    return ev.filter((e) => e.at).sort((a, b) => b.at - a.at);
  };

  /* ── correcting an entry: a reversal and, if needed, the right line; the original stays ── */
  const FIXABLE = ["handover", "administer", "receive", "wastage", "transfer", "vaccinate", "emergency", "returned"];
  const canFix = (m) => FIXABLE.includes(m.kind) && !m.reversedBy && !m.correctionOf && (m.to === "patient" || m.to === "waste" || m.to === "loss" || P.bal(m.batch, m.to) >= m.qty);
  const WHY = ["Wrong quantity", "Wrong batch", "Entered twice", "Did not happen", "Wrong patient or place"];
  const CorrectDialog = ({ m, onClose }) => {
    const db = P.useDb();
    const med = P.med(m.med), cd = med.controlled;
    const [why, setWhy] = useState(null);
    const [qty, setQty] = useState(m.qty);
    const [batch, setBatch] = useState(null);
    const [wit, setWit] = useState(false);
    const src = P.REAL.includes(m.from) ? m.from : null;
    const others = src ? P.fefo(m.med, src).filter((b) => b.id !== m.batch) : [];
    const replace = why === "Wrong quantity" ? qty > 0 && qty !== m.qty : why === "Wrong batch" ? !!batch : false;
    const ok = why && (why === "Wrong quantity" ? qty !== m.qty && qty >= 0 : why === "Wrong batch" ? !!batch : true);
    const save = (w) => {
      const rev = P.move({ kind: "reversal", med: m.med, batch: m.batch, from: m.to, to: m.from, qty: m.qty, ref: m.id, note: why, witness: w || undefined });
      let rep = null;
      if (why === "Wrong quantity" && qty > 0) rep = P.move({ kind: m.kind, med: m.med, batch: m.batch, from: m.from, to: m.to, qty, note: m.note, cd: m.cd, correctionOf: m.id, at: m.at, entered: P.now(), witness: w || m.witness });
      if (why === "Wrong batch") rep = P.move({ kind: m.kind, med: m.med, batch, from: m.from, to: m.to, qty: m.qty, note: m.note, cd: m.cd, correctionOf: m.id, at: m.at, entered: P.now(), witness: w || m.witness });
      m.reversedBy = rev.id; m.correction = { why, by: P.who(), at: P.now(), replacement: rep ? rep.id : null };
      P.commit(); P.toast("Corrected: " + why.toLowerCase() + ". The original line stays, marked as corrected.", "undo"); onClose();
    };
    if (wit) return html`<${P.WitnessDialog} title="Second signature for the correction" what=${"Correcting " + med.name + " · " + why} place=${src || "pharmacy"} onClose=${() => setWit(false)} onDone=${(w) => { setWit(false); save(w); }} />`;
    return html`<${P.Dialog} title=${"Correct an entry: " + med.name} sub=${(P.KIND[m.kind] || m.kind) + " · " + m.qty + " " + med.unit + " · " + P.when(m.at) + " · by " + m.by} onClose=${onClose}
      foot=${html`<span className="grow muted small">${cd ? "Controlled drug: a witness signs the correction." : "Nothing is deleted: the original stays, marked as corrected."}</span><${P.Btn} kind="primary" icon="undo" disabled=${!ok} onClick=${() => (cd ? setWit(true) : save(null))}>${cd ? "Sign and ask a witness" : "Save the correction"}<//>`}>
      <div className="stack-s"><span className="lbl">What was wrong</span><div className="chips">${WHY.map((w) => html`<${P.Chip} key=${w} on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div></div>
      ${why === "Wrong quantity" ? html`<div className="stack-s"><span className="lbl">The right quantity</span><${P.Stepper} value=${qty} onChange=${setQty} unit=${med.unit} label="the right quantity" /></div>` : null}
      ${why === "Wrong batch" ? (others.length ? html`<div className="stack-s"><span className="lbl">The batch it really came from</span><div className="chips">${others.map((b) => html`<${P.Chip} key=${b.id} size="sm" on=${batch === b.id} onClick=${() => setBatch(b.id)}><span className="mono">${b.no}</span> · exp ${P.expWord(b.exp)}<//>`)}</div></div>` : html`<p className="muted small">No other batch of ${med.name} at ${P.place(src).short}.</p>`) : null}
      ${why === "Wrong patient or place" ? html`<p className="small">The entry is reversed. Record it again from where it really happened, so the right patient or place is on it.</p>` : null}
      ${why ? html`<div className="cd-calc"><span>Adds a reversal line of ${m.qty} ${med.unit}${replace ? html` and a new line of ${why === "Wrong quantity" ? qty + " " + med.unit : "batch " + P.batch(batch).no}` : ""}, linked to the original.</span></div>` : null}
    <//>`;
  };

  P.AuditView = () => {
    const db = P.useDb();
    const [per, setPer] = useState(7);
    const [cat, setCat] = useState("all");
    const [who, setWho] = useState("");
    const [flag, setFlag] = useState(false);
    const [fix, setFix] = useState(null);
    const [n, setN] = useState(60);
    const now = P.now(), all = P.audit().filter((e) => !per || e.at > now - per * DAY);
    const people = [...new Set(all.map((e) => e.who).filter(Boolean))].sort();
    const list = all.filter((e) => (cat === "all" || e.cat === cat) && (!who || e.who === who) && (!flag || e.tags.length));
    const sum = (es) => ({ n: es.length, late: es.filter((e) => e.tags.some((t) => /late/.test(t))).length, corr: es.filter((e) => e.cat === "corr").length, nowit: es.filter((e) => e.tags.includes("no witness")).length });
    const top = people.map((p) => ({ p, ...sum(all.filter((e) => e.who === p)) })).sort((a, b) => b.n - a.n).slice(0, 8);
    const me = who ? sum(all.filter((e) => e.who === who)) : null;
    const byCat = who ? Object.keys(CATS).map((k) => ({ k: CATS[k], v: all.filter((e) => e.who === who && e.cat === k).length })).filter((x) => x.v) : [];
    return html`<div className="stack">
      <div className="au-filters">
        <div className="chips">${[[1, "Today"], [7, "7 days"], [30, "30 days"], [0, "All"]].map(([v, w]) => html`<${P.Chip} key=${w} on=${per === v} onClick=${() => setPer(v)}>${w}<//>`)}</div>
        <select className="input au-sel" aria-label="Person" value=${who} onChange=${(e) => setWho(e.target.value)}><option value="">Everyone</option>${people.map((p) => html`<option key=${p} value=${p}>${p}</option>`)}</select>
        <select className="input au-sel" aria-label="Kind of action" value=${cat} onChange=${(e) => setCat(e.target.value)}><option value="all">Every kind of action</option>${Object.entries(CATS).map(([k, w]) => html`<option key=${k} value=${k}>${w}</option>`)}</select>
        <${P.Chip} on=${flag} onClick=${() => setFlag(!flag)}>Only flagged (late, no witness, corrected)<//>
      </div>
      ${who ? html`<div className="card pad au-person">
          <div className="row"><span className="wit-av">${who.replace(/^(You \(|Nurse in-charge |Midwife in-charge |Nurse |Midwife |Dr )/, "").split(/[ .()]+/).filter(Boolean).map((t) => t[0].toUpperCase()).join("").slice(0, 2)}</span><div><h3 style=${{ fontSize: "16px" }}>${who}</h3><div className="muted small">${me.n} actions ${per ? "in the last " + (per === 1 ? "day" : per + " days") : "on record"} · last ${wl(all.find((e) => e.who === who).at)}</div></div><span className="grow"></span><button type="button" className="clslink" onClick=${() => setWho("")}>Everyone</button></div>
          <div className="au-stats"><div><b>${me.n}</b><span>actions</span></div><div><b className=${me.late ? "bad" : ""}>${me.late}</b><span>late entries</span></div><div><b className=${me.nowit ? "bad" : ""}>${me.nowit}</b><span>without a witness</span></div><div><b>${me.corr}</b><span>corrections</span></div></div>
          <div className="lv-bars">${byCat.map((x) => html`<div key=${x.k} className="lv-row" title=${x.k + ": " + x.v}><span className="lv-k">${x.k}</span><span className="lv-track"><i style=${{ width: (x.v / Math.max(...byCat.map((y) => y.v))) * 100 + "%" }}></i></span><span className="lv-v">${x.v}</span></div>`)}</div>
        </div>`
      : html`<div className="card"><div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>Who did what</h3><span className="muted small">${per ? "last " + (per === 1 ? "day" : per + " days") : "all time"} · tap a name for their log</span></div>
          <div className="tblwrap"><table className="tbl dense"><thead><tr><th>Person</th><th className="r">Actions</th><th className="r">Late entries</th><th className="r">No witness</th><th className="r">Corrections</th></tr></thead>
          <tbody>${top.map((t) => html`<tr key=${t.p} className="click" onClick=${() => setWho(t.p)}><td><b>${t.p}</b></td><td className="r num">${t.n}</td><td className=${P.cx("r num", t.late && "bad")}>${t.late}</td><td className=${P.cx("r num", t.nowit && "bad")}>${t.nowit}</td><td className="r num">${t.corr}</td></tr>`)}</tbody></table></div></div>`}
      <div className="card">
        <div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>Audit trail</h3><span className="muted small">${list.length} entries · newest first · nothing here can be edited or deleted</span></div>
        <div className="tblwrap"><table className="tbl dense au-tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>Witness</th><th>Reason</th><th></th></tr></thead>
          <tbody>${list.slice(0, n).map((e, i) => html`<tr key=${i} className=${e.mv && e.mv.reversedBy ? "au-rev" : ""}>
            <td className="num">${P.when(e.at)}${e.happened && e.happened !== e.at ? html`<div className="dn-sub">happened ${wl(e.happened)}</div>` : null}</td>
            <td className="small"><button type="button" className="clslink" onClick=${() => setWho(e.who)}>${e.who}</button></td>
            <td><span className="au-cat">${CATS[e.cat]}</span> ${e.action}${e.tags.map((t) => html` <span key=${t} className=${P.cx("ctag", /late|no witness|not matching|escalated/.test(t) && "bad")}>${t}</span>`)}</td>
            <td className="small">${e.detail}${e.mv && e.mv.correction ? html`<div className="dn-sub">Corrected ${wl(e.mv.correction.at)} by ${e.mv.correction.by}: ${e.mv.correction.why.toLowerCase()}</div>` : null}</td>
            <td className="small">${e.witness || ""}</td><td className="small">${e.reason || ""}</td>
            <td>${e.mv && canFix(e.mv) ? html`<${P.Btn} size="sm" kind="ghost" icon="undo" onClick=${() => setFix(e.mv)}>Correct<//>` : null}</td></tr>`)}</tbody></table></div>
        ${list.length > n ? html`<div style=${{ padding: "10px 16px" }}><button type="button" className="clslink" onClick=${() => setN(n + 100)}>Show ${Math.min(100, list.length - n)} more</button></div>` : null}
      </div>
      <p className="hint">Gathered from the ledger, the controlled-drug registers, counts, handovers, investigations and the cold chain. A mistake is fixed with "Correct": it adds a reversal and, if needed, the right line, both linked to the original with a reason. A controlled-drug correction needs a witness.</p>
      ${fix ? html`<${CorrectDialog} m=${fix} onClose=${() => setFix(null)} />` : null}
    </div>`;
  };
})();
