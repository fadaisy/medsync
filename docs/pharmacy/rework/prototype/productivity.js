/* Productivity: monthly reports filled from the ledger (HMIS 105 sections, the controlled-drugs return, losses),
   SMS reminders for refills and immunisation, and the team view (workload and quality per person and per shift). */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const wl = (ms) => P.when(ms).replace(/^(Today|Yesterday)/, (x) => x.toLowerCase());
  const today0 = () => { const d = new Date(P.now()); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const fmtD = (t) => { const d = new Date(t); return d.getDate() + " " + P.MON[d.getMonth()]; };
  const n0 = (x) => Math.round(x).toLocaleString("en-GB");

  /* ═════════ Reports ═════════ */
  const OUT_DAYS = { metro: 18, oxy: 4, ors: 6, mgso4: 3 };
  const TRACER = ["amox", "ctx", "metro", "ors", "pcm", "ceft", "gent", "oxy", "mgso4", "ferr", "metf", "amlo", "ns", "rl"];
  const EPI_USED = { bcg: 96, bopv: 372, ipv: 88, penta: 294, pcv: 290, rota: 196, mr: 145, hpv: 21, td: 130 };
  const ANTIGEN = [["BCG", "bcg", 96], ["OPV0", "bopv", 80], ["OPV1", "bopv", 104], ["OPV3", "bopv", 91], ["Penta1", "penta", 104], ["Penta3", "penta", 92], ["PCV1", "pcv", 103], ["PCV3", "pcv", 90], ["Rota1", "rota", 101], ["Rota2", "rota", 95], ["IPV", "ipv", 88], ["MR1", "mr", 85], ["MR2", "mr", 60], ["Td1", "td", 58], ["Td2+", "td", 44], ["HPV", "hpv", 21]];
  const monthStart = () => { const d = new Date(P.now()); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
  const medRows = () => TRACER.map((id) => {
    const m = P.med(id), recv = P.db.moves.filter((x) => x.med === id && x.kind === "receive" && x.at >= monthStart()).reduce((a, x) => a + x.qty, 0);
    const closing = P.medTotal(id), used = Math.round(m.amc * (90 - (OUT_DAYS[id] || 0)) / 90), opening = Math.max(0, closing + used - recv);
    return { m, opening, recv, used, closing, out: OUT_DAYS[id] || 0, mos: m.amc ? closing / m.amc : 0 };
  });
  const cdRows = () => P.CDS().map((m) => {
    const mv = P.db.moves.filter((x) => x.med === m.id && x.at >= monthStart() && x.kind !== "opening");
    const inn = mv.filter((x) => x.kind === "receive").reduce((a, x) => a + x.qty, 0);
    const used = mv.filter((x) => ["administer", "handover"].includes(x.kind)).reduce((a, x) => a + x.qty, 0);
    const wasted = mv.filter((x) => x.to === "waste" || x.to === "loss").reduce((a, x) => a + x.qty, 0);
    const closing = P.medTotal(m.id), opening = closing - inn + used + wasted;
    const open = P.caseList ? P.caseList().filter((c) => c.med === m.id && c.status !== "closed").length : 0;
    return { m, opening, inn, used, wasted, closing, open };
  });
  const REPORTS = [
    { id: "hmis-meds", name: "HMIS 105 · Essential medicines and health supplies", to: "DHIS2, through the district biostatistician", due: 7, who: "Pharmacist" },
    { id: "hmis-epi", name: "HMIS 105 · Immunisation", to: "DHIS2, through the district biostatistician", due: 7, who: "EPI focal person" },
    { id: "cd-return", name: "Controlled drugs monthly return", to: "National Drug Authority, signed by the in-charge", due: 10, who: "In-charge pharmacist" },
    { id: "loss", name: "Monthly losses and expiries", to: "Medicines and therapeutics committee", due: 5, who: "In-charge pharmacist" },
  ];
  const issues = (id) => {
    const out = [];
    if (id === "hmis-meds") medRows().filter((r) => r.out).forEach((r) => out.push({ sev: "warn", t: r.m.name + ": " + r.out + " days out of stock. Add a remark.", k: "rm-" + r.m.id }));
    if (id === "hmis-epi") { out.push({ sev: "warn", t: "BCG wastage 38% and MR 24%: above the indicative rates. Add a remark.", k: "rm-waste" }); out.push({ sev: "info", t: (P.epiDefaulters ? P.epiDefaulters().length : 0) + " defaulters on the register: listed for tracing, not reported." }); }
    if (id === "cd-return") { cdRows().filter((r) => r.open).forEach((r) => out.push({ sev: "stop", t: r.m.name + ": " + r.open + " open investigation. The closing balance may change: resolve or explain before submitting." })); const nw = P.cdFlags ? P.cdFlags().filter((f) => f.k === "wit").length : 0; if (nw) out.push({ sev: "warn", t: nw + " entries without a witness this month." }); }
    if (id === "loss") { const o = P.caseList ? P.caseList().filter((c) => c.status !== "closed").length : 0; if (o) out.push({ sev: "info", t: o + " investigations still open: listed as pending in the report." }); }
    return out;
  };
  const REMARKS = { meds: ["Not supplied by NMS this cycle", "Delivered late", "Demand higher than usual"], epi: ["Opened vials discarded at session end (policy)", "Outreach sessions with few children", "Cold chain discard"] };

  const ReportBody = ({ id }) => {
    if (id === "hmis-meds") return html`<table className="tbl dense rp-form"><thead><tr><th>Tracer item</th><th>Unit</th><th className="r">Opening</th><th className="r">Received</th><th className="r">Consumed</th><th className="r">Closing</th><th className="r">Days out of stock</th><th className="r">Months of stock</th></tr></thead>
      <tbody>${medRows().map((r) => html`<tr key=${r.m.id}><td>${r.m.name}</td><td>${r.m.unit}</td><td className="r num">${n0(r.opening)}</td><td className="r num">${n0(r.recv)}</td><td className="r num">${n0(r.used)}</td><td className="r num strong">${n0(r.closing)}</td><td className=${P.cx("r num", r.out && "bad")}>${r.out}</td><td className=${P.cx("r num", r.mos < 1 && "bad")}>${r.mos.toFixed(1)}</td></tr>`)}</tbody></table>`;
    if (id === "hmis-epi") return html`<table className="tbl dense rp-form"><thead><tr><th>Antigen</th><th className="r">Doses given</th><th className="r">Doses used (vaccine)</th><th className="r">Wastage</th></tr></thead>
      <tbody>${ANTIGEN.map(([a, v, n]) => html`<tr key=${a}><td>${a}</td><td className="r num">${n}</td><td className="r num">${a.endsWith("0") || a.endsWith("1") || a === "BCG" || a === "IPV" || a === "HPV" || a === "MR1" ? n0(EPI_USED[v]) : ""}</td><td className="r num">${{ bcg: "38%", bopv: "14%", ipv: "9%", penta: "6%", pcv: "5%", rota: "1%", mr: "24%", hpv: "0%", td: "11%" }[v]}</td></tr>`)}</tbody></table>`;
    if (id === "cd-return") return html`<table className="tbl dense rp-form"><thead><tr><th>Controlled medicine</th><th className="r">Opening</th><th className="r">Received</th><th className="r">Given / handed out</th><th className="r">Destroyed or lost</th><th className="r">Closing (register)</th><th>Open cases</th></tr></thead>
      <tbody>${cdRows().map((r) => html`<tr key=${r.m.id}><td>${r.m.name}</td><td className="r num">${n0(r.opening)}</td><td className="r num">${n0(r.inn)}</td><td className="r num">${n0(r.used)}</td><td className="r num">${n0(r.wasted)}</td><td className="r num strong">${n0(r.closing)}</td><td className=${r.open ? "bad" : ""}>${r.open || "—"}</td></tr>`)}</tbody></table>`;
    const L = P.losses ? P.losses(monthStart(), P.now()) : [];
    return html`<table className="tbl dense rp-form"><thead><tr><th>Cause</th><th className="r">Lines</th><th className="r">Value</th></tr></thead>
      <tbody>${["Expired", "Opened-vial wastage", "Cold chain", "Damaged", "Unexplained shortfall"].map((k) => { const l = L.filter((x) => x.cause === k); return html`<tr key=${k}><td>${k}</td><td className="r num">${l.length}</td><td className="r num strong">${P.ugx(l.reduce((a, x) => a + x.v, 0))}</td></tr>`; })}
      <tr><td><b>Total</b></td><td></td><td className="r num strong">${P.ugx(L.reduce((a, x) => a + x.v, 0))}</td></tr></tbody></table>`;
  };

  const ReportDialog = ({ r, onClose }) => {
    const db = P.useDb();
    const st = (db.reports || {})[r.id] || {}, iss = issues(r.id), inch = db.settings.role === "incharge";
    const rem = st.remarks || {};
    const setRem = (k, v) => { db.reports = db.reports || {}; db.reports[r.id] = { ...st, remarks: { ...rem, [k]: v } }; P.commit(); };
    const blocked = iss.some((x) => x.sev === "stop"), needRem = iss.filter((x) => x.k && !rem[x.k]);
    const set = (patch) => { db.reports = db.reports || {}; db.reports[r.id] = { ...st, ...patch }; P.commit(); };
    const d = new Date(P.now());
    return html`<${P.Dialog} size="xwide" title=${r.name} sub=${P.MON[d.getMonth()] + " " + d.getFullYear() + " · to " + r.to} onClose=${onClose}
      foot=${html`<span className="grow muted small">${st.submitted ? "Submitted " + wl(st.submitted.at) + " by " + st.submitted.by : blocked ? "Resolve the red items first" : needRem.length ? needRem.length + " remark" + (needRem.length > 1 ? "s" : "") + " to add" : st.checked ? "Checked by " + st.checked.by + ". The in-charge submits." : "Check the figures, then mark as checked."}</span>
        <${P.Btn} kind="ghost" icon="printer" onClick=${() => P.toast("Report printed in the official layout (prototype)", "printer")}>Print<//>
        ${!st.checked ? html`<${P.Btn} kind="navy" disabled=${needRem.length > 0} onClick=${() => { set({ checked: { by: P.who(), at: P.now() } }); P.toast("Marked as checked"); }}>Mark as checked<//>`
          : !st.submitted ? html`<${P.Btn} kind="primary" icon="send" disabled=${!inch || blocked} onClick=${() => { set({ submitted: { by: P.who(), at: P.now() } }); P.toast("Submitted. Saved with the figures as they were."); }}>${inch ? "Submit" : "In-charge submits"}<//>` : null}`}>
      <div className="rp-head"><div><span className="lbl">Facility</span><b>Sample hospital</b></div><div><span className="lbl">District</span><b>(sample)</b></div><div><span className="lbl">Period</span><b>${P.MON[d.getMonth()]} ${d.getFullYear()}</b></div><div><span className="lbl">Prepared by</span><b>${st.checked ? st.checked.by : P.who()}</b></div><div><span className="lbl">Due</span><b>${r.due} ${P.MON[(d.getMonth() + 1) % 12]}</b></div></div>
      ${iss.length ? html`<div className="ck-list">${iss.map((x, i) => html`<div key=${i} className=${P.cx("ck-flag", x.sev, x.k && rem[x.k] && "done")}><span className="ck-sev">${{ stop: "Blocks", warn: "Remark", info: "Note" }[x.sev]}</span><div className="grow"><b>${x.t}</b>
        ${x.k ? html`<div className="chips" style=${{ marginTop: "6px" }}>${REMARKS[r.id === "hmis-epi" ? "epi" : "meds"].map((w) => html`<${P.Chip} key=${w} size="sm" on=${rem[x.k] === w} onClick=${() => setRem(x.k, w)}>${w}<//>`)}</div>` : null}</div></div>`)}</div>` : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />No problems found in the figures.</p>`}
      <div className="tblwrap"><${ReportBody} id=${r.id} /></div>
      <p className="hint">Filled from the ledger; nothing is typed in. The layout here is simplified: the real export follows the official HMIS 105 and NDA forms, and is checked against them before go-live.</p>
    <//>`;
  };

  P.ReportsView = () => {
    const db = P.useDb();
    const [open, setOpen] = useState(null);
    const d = new Date(P.now());
    return html`<div className="stack">
      <div className="rp-grid">${REPORTS.map((r) => {
        const st = (db.reports || {})[r.id] || {}, iss = issues(r.id), stop = iss.filter((x) => x.sev === "stop").length, rem = iss.filter((x) => x.k && !(st.remarks || {})[x.k]).length;
        return html`<button type="button" key=${r.id} className="rp-card" onClick=${() => setOpen(r)}>
          <div className="row between"><span className="lbl">${P.MON[d.getMonth()]} ${d.getFullYear()} · due ${r.due} ${P.MON[(d.getMonth() + 1) % 12]}</span>${st.submitted ? html`<span className="vx-st ok">Submitted</span>` : st.checked ? html`<span className="vx-st due">Checked</span>` : html`<span className="vx-st">Draft</span>`}</div>
          <b>${r.name}</b><span className="muted small">To ${r.to} · prepared by the ${r.who.toLowerCase()}</span>
          <span className=${P.cx("small", stop ? "bad" : rem ? "warn-t" : "ok-c")}>${stop ? stop + " item blocks submission" : rem ? rem + " remark" + (rem > 1 ? "s" : "") + " to add" : "Figures ready"}</span>
        </button>`;
      })}</div>
      <p className="hint">Reports fill themselves from the ledger, the registers and the immunisation records. The person who checks and the person who submits are both recorded, and the submitted figures are kept as they were.</p>
      ${open ? html`<${ReportDialog} r=${open} onClose=${() => setOpen(null)} />` : null}
    </div>`;
  };

  /* ═════════ SMS reminders ═════════ */
  const RULES = [
    { id: "refill3", label: "Refill due in 3 days", who: "Chronic refills", on: true, en: "{name}, your {med} runs out on {date}. Please come to {clinic} for your refill. Sample hospital pharmacy.", lg: "{name}, eddagala lyo erya {med} liggwaawo {date}. Jjangu ku {clinic} ofune eddala. Sample hospital." },
    { id: "missed", label: "Missed refill (day 1 and day 7)", who: "Chronic refills", on: true, en: "{name}, we missed you: your {med} ran out on {date}. Please come for a refill or call 0800 ··· 000.", lg: "{name}, tetwakulabye: eddagala lyo erya {med} lyaggwaawo {date}. Jjangu ofune eddala oba tukubire 0800 ··· 000." },
    { id: "course", label: "Antibiotic course: day 3 reminder", who: "Antibiotic courses", on: true, en: "{name}, keep taking your {med} until it is finished ({date}), even if you feel better.", lg: "{name}, weeyongere okumira {med} okutuusa lwe liggwaawo ({date}), ne bw'owulira bulungi." },
    { id: "epi1", label: "Immunisation: visit tomorrow", who: "Immunisation", on: true, en: "{carer}, {name} is due for {vaccines} tomorrow at the immunisation clinic. Bring the child health card.", lg: "{carer}, {name} alina okugemebwa {vaccines} enkya ku ddwaliro. Leeta kaadi y'omwana." },
    { id: "epid", label: "Immunisation: defaulter (3 and 14 days late)", who: "Immunisation", on: true, en: "{carer}, {name} missed {vaccines}. Please come to the immunisation clinic any weekday morning.", lg: "{carer}, {name} yasubwa {vaccines}. Jjangu ku ddwaliro ku nkya yonna mu wiiki." },
  ];
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] || "");
  P.smsQueue = () => {
    const db = P.db, on = db.smsRules || {}, out = [], t0 = today0(), ok = (id) => on[id] !== false, lang = (i) => (i % 3 === 1 ? "lg" : "en");
    let i = 0;
    (P.OP_REGS || []).filter((r) => r.kind === "chronic").forEach((r) => {
      const s = P.opRefill(r), pt = P.OP_PATIENTS.find((p) => p.id === r.pt), med = P.med(r.med).name.replace(" tablets", "").toLowerCase();
      const v = { name: pt.name, med, date: fmtD(s.runOut), clinic: pt.clinic };
      if (ok("refill3") && s.k === "due" && s.left <= 3) out.push({ id: "s-r-" + r.id, rule: "refill3", to: pt.name, phone: pt.phone, lang: lang(i++), v, why: "Refill due " + (s.left ? "in " + s.left + (s.left === 1 ? " day" : " days") : "today") });
      if (ok("missed") && s.k === "overdue" && (s.late === 1 || s.late === 7 || s.late >= 1)) out.push({ id: "s-m-" + r.id, rule: "missed", to: pt.name, phone: pt.phone, lang: lang(i++), v, why: "Refill " + s.late + " days late" });
    });
    (P.OP_REGS || []).filter((r) => r.kind === "course").forEach((r) => {
      const c = P.opCourse(r), pt = P.OP_PATIENTS.find((p) => p.id === r.pt);
      if (ok("course") && c && c.dayN >= 2 && !c.done) out.push({ id: "s-c-" + r.id, rule: "course", to: pt.name, phone: pt.phone, lang: lang(i++), v: { name: pt.name, med: P.med(r.med).name.toLowerCase(), date: fmtD(r.start + r.courseDays * DAY) }, why: "Day " + c.dayN + " of " + r.courseDays });
    });
    (P.epiClients ? P.epiClients() : []).forEach((c) => {
      const s = P.epiStatus(c), v = { carer: c.carer === "Self" ? c.name : c.carer, name: c.carer === "Self" ? "you" : c.name };
      if (ok("epi1") && s.k === "ok" && s.appt && s.appt - t0 >= DAY && s.appt - t0 < 2 * DAY) out.push({ id: "s-e-" + c.id, rule: "epi1", to: v.carer, phone: c.phone, lang: lang(i++), v: { ...v, vaccines: s.next ? s.next.lab : "the next vaccines" }, why: "Due tomorrow" });
      if (ok("epid") && (s.k === "overdue" || s.k === "due") && s.late >= 3) out.push({ id: "s-d-" + c.id, rule: "epid", to: v.carer, phone: c.phone, lang: lang(i++), v: { ...v, vaccines: s.due.map((x) => x.lab).join(", ") }, why: s.late + " days late" });
    });
    return out.map((m, k) => { const st = (db.sms || {})[m.id]; const rule = RULES.find((r) => r.id === m.rule); return { ...m, text: fill((db.smsText || {})[m.rule + m.lang] || rule[m.lang], m.v), status: st ? st.status : k % 9 === 4 ? "failed" : "scheduled", st }; });
  };

  P.RemindersView = () => {
    const db = P.useDb();
    const [tab, setTab] = useState("today");
    const [edit, setEdit] = useState(null);
    const q = P.smsQueue(), on = db.smsRules || {};
    const setSt = (m, status) => { db.sms = { ...(db.sms || {}), [m.id]: { status, at: P.now(), by: P.who() } }; P.commit(); };
    const sendAll = () => { q.filter((m) => m.status === "scheduled").forEach((m) => { db.sms = { ...(db.sms || {}), [m.id]: { status: "sent", at: P.now(), by: P.who() } }; }); P.commit(); P.toast("Sent " + q.filter((m) => m.status === "scheduled").length + " messages (prototype: nothing leaves the browser)", "send"); };
    const counts = { scheduled: q.filter((m) => m.status === "scheduled").length, sent: q.filter((m) => m.status === "sent").length, failed: q.filter((m) => m.status === "failed").length };
    return html`<div className="stack">
      <div className="kpis">
        <div className="kpi"><b>${q.length}</b><span>messages for today · ${counts.scheduled} waiting to go at 08:00</span></div>
        <div className="kpi"><b>94%</b><span>delivered this month (612 of 651, sample)</span></div>
        <div className="kpi"><b>84%</b><span>refills on time after a reminder · 63% without (sample)</span></div>
        <div className="kpi"><b>UGX ${n0(651 * 25)}</b><span>SMS cost this month at UGX 25 each (sample)</span></div>
      </div>
      <${P.Seg} label="Reminders" value=${tab} onChange=${setTab} items=${[{ v: "today", label: "Today's messages", n: q.length || null }, { v: "rules", label: "Rules and wording" }]} />
      ${tab === "today" ? html`<div className="card">
          <div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>Today</h3><span className="muted small">built from the refill dates, antibiotic courses and the immunisation register</span><span className="grow"></span>${counts.scheduled ? html`<${P.Btn} size="sm" kind="primary" icon="send" onClick=${sendAll}>Send ${counts.scheduled} now<//>` : null}</div>
          <div className="sms-list">${q.map((m) => html`<div key=${m.id} className="sms-row">
            <div className="sms-who"><b>${m.to}</b><span className="muted small">${m.phone} · ${m.why}</span><span className="ctag">${RULES.find((r) => r.id === m.rule).who}</span></div>
            <div className="sms-bubble"><span className="sms-lang">${m.lang === "lg" ? "Luganda" : "English"}</span>${m.text}</div>
            <div className="sms-st">${m.status === "failed" ? html`<span className="vx-st overdue">Not delivered</span><span className="muted small">number not reachable</span><div className="row"><${P.Btn} size="sm" kind="ghost" onClick=${() => setSt(m, "called")}>Called instead<//><${P.Btn} size="sm" kind="ghost" onClick=${() => setSt(m, "sent")}>Retry<//></div>`
              : m.status === "sent" ? html`<span className="vx-st ok">Sent</span><span className="muted small">${m.st ? P.time(m.st.at) + " · " + m.st.by : ""}</span>`
              : m.status === "called" ? html`<span className="vx-st">Phoned</span><span className="muted small">${m.st ? P.time(m.st.at) + " · " + m.st.by : ""}</span>`
              : m.status === "skipped" ? html`<span className="vx-st">Skipped</span>`
              : html`<span className="vx-st due">08:00</span><div className="row"><${P.Btn} size="sm" kind="ghost" onClick=${() => setSt(m, "sent")}>Send now<//><${P.Btn} size="sm" kind="ghost" onClick=${() => setSt(m, "skipped")}>Skip<//></div>`}</div>
          </div>`)}</div>
          ${q.length ? null : html`<p className="muted small" style=${{ padding: "0 16px 14px" }}>Nothing to send today.</p>`}
        </div>`
      : html`<div className="card pad stack-s">${RULES.map((r) => html`<div key=${r.id} className="sms-rule">
          <div className="row between"><div><b>${r.label}</b><div className="muted small">${r.who}</div></div>
            <${P.Chip} size="sm" on=${on[r.id] !== false} onClick=${() => { db.smsRules = { ...on, [r.id]: on[r.id] === false }; P.commit(); }}>${on[r.id] !== false ? "On" : "Off"}<//></div>
          ${["en", "lg"].map((l) => html`<div key=${l} className="sms-tpl"><span className="sms-lang">${l === "lg" ? "Luganda" : "English"}</span>
            ${edit === r.id + l ? html`<textarea className="input" style=${{ height: "64px", padding: "8px 10px" }} value=${(db.smsText || {})[r.id + l] || r[l]} onChange=${(e) => { db.smsText = { ...(db.smsText || {}), [r.id + l]: e.target.value }; P.commit(); }}></textarea><button type="button" className="clslink" onClick=${() => setEdit(null)}>Done</button>`
              : html`<span className="small">${(db.smsText || {})[r.id + l] || r[l]}</span><button type="button" className="clslink" onClick=${() => setEdit(r.id + l)}>Edit</button>`}</div>`)}
        </div>`)}
        <p className="hint">Words in braces are filled in for each person. Each patient's language comes from their record; patients who reply STOP are never messaged again. The Luganda wording is a draft for a native speaker to check before go-live.</p></div>`}
    </div>`;
  };

  /* ═════════ Team: workload and quality, per person and per shift ═════════ */
  const STAFF = [
    { name: "S. Nantongo", cadre: "Pharmacy Technician", shift: "day", hours: 8, rx: 74, wait: 9, owed: 3, counts: [12, 12], late: 0, nowit: 0, cases: [1, 1], ho: [6, 6] },
    { name: "P. Waiswa", cadre: "Pharmacy Technician", shift: "day", hours: 8, rx: 61, wait: 12, owed: 5, counts: [9, 10], late: 1, nowit: 0, cases: [0, 0], ho: [6, 6] },
    { name: "N. Babirye", cadre: "Pharmacist", shift: "day", hours: 8, rx: 48, wait: 8, owed: 2, counts: [7, 7], late: 0, nowit: 0, cases: [2, 2], ho: [5, 5] },
    { name: "A. Kintu", cadre: "Principal Pharmacist", shift: "day", hours: 8, rx: 19, wait: 7, owed: 0, counts: [4, 4], late: 0, nowit: 0, cases: [3, 3], ho: [5, 5] },
    { name: "I. Okot", cadre: "Pharmacy Technician", shift: "night", hours: 15, rx: 33, wait: 6, owed: 1, counts: [6, 7], late: 2, nowit: 1, cases: [0, 0], ho: [7, 7] },
    { name: "D. Lubega", cadre: "Pharmacist", shift: "night", hours: 15, rx: 27, wait: 7, owed: 1, counts: [5, 5], late: 0, nowit: 0, cases: [0, 1], ho: [6, 7] },
  ];
  const HOURLY = [3, 2, 1, 1, 1, 2, 4, 9, 18, 26, 24, 17, 12, 15, 21, 19, 13, 9, 7, 6, 5, 4, 3, 3];
  P.TeamView = () => {
    const db = P.useDb();
    const inch = db.settings.role === "incharge";
    const [sh, setSh] = useState("all");
    const meToday = db.moves.filter((m) => m.kind === "handover" && m.by === P.who() && m.at >= today0()).length;
    const rows = STAFF.filter((s) => sh === "all" || s.shift === sh);
    const max = Math.max(...HOURLY), nowH = new Date(P.now()).getHours();
    const tot = rows.reduce((a, s) => a + s.rx, 0);
    const med = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    return html`<div className="stack">
      ${inch ? null : html`<div className="note"><${P.Icon} n="user" /><span>You see your own numbers. The in-charge sees the whole team, to plan shifts and support, not to rank people.</span></div>`}
      <div className="kpis">
        <div className="kpi"><b>${inch ? tot : meToday}</b><span>${inch ? "prescriptions handed over this week, " + (sh === "all" ? "all shifts" : sh + " shift") + " (sample)" : "prescriptions you handed over today"}</span></div>
        <div className="kpi"><b>${med(rows.map((s) => s.wait))} min</b><span>median wait at the window</span></div>
        <div className="kpi"><b>${Math.round((rows.reduce((a, s) => a + s.counts[0], 0) / rows.reduce((a, s) => a + s.counts[1], 0)) * 100)}%</b><span>of counts matched first time</span></div>
        <div className="kpi"><b>${rows.reduce((a, s) => a + s.ho[0], 0)} of ${rows.reduce((a, s) => a + s.ho[1], 0)}</b><span>handovers signed on time</span></div>
      </div>
      <div className="card pad stack-s">
        <div className="dash-h"><h3>Prescriptions per hour at the window</h3><span className="muted small">average weekday, last 4 weeks (sample) · to plan who is on when</span></div>
        <div className="tm-hours">${HOURLY.map((v, h) => html`<div key=${h} className=${P.cx("tm-h", h === nowH && "now", h >= 8 && h < 17 ? "day" : "night")} title=${String(h).padStart(2, "0") + ":00 · " + v + " prescriptions an hour"}><i style=${{ height: Math.max(2, (v / max) * 100) + "%" }}></i><span>${h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span></div>`)}</div>
        <p className="hint">Paler bars are night-shift hours (17:00–08:00); the dark bar is now. Busiest 09:00–11:00 and 14:00–16:00: a second technician at the window then cuts the wait most.</p>
      </div>
      ${inch ? html`<div className="card">
        <div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>The team this week</h3><div className="chips" style=${{ marginLeft: "12px" }}>${[["all", "All shifts"], ["day", "Day"], ["night", "Night"]].map(([k, w]) => html`<${P.Chip} key=${k} size="sm" on=${sh === k} onClick=${() => setSh(k)}>${w}<//>`)}</div></div>
        <div className="tblwrap"><table className="tbl dense"><thead><tr><th>Person</th><th className="r">Prescriptions</th><th className="r">Per hour on shift</th><th className="r">Median wait</th><th className="r">Owed lines</th><th className="r">Counts matched</th><th className="r">Handovers on time</th><th className="r">Late entries</th><th className="r">No witness</th><th className="r">Cases closed</th></tr></thead>
          <tbody>${rows.map((s) => html`<tr key=${s.name}><td><b>${s.name}</b><div className="dn-sub">${s.cadre} · ${s.shift} shift</div></td>
            <td className="r num">${s.rx}</td><td className="r num">${(s.rx / (s.hours * 5)).toFixed(1)}</td><td className=${P.cx("r num", s.wait > 10 && "bad")}>${s.wait} min</td><td className="r num">${s.owed}</td>
            <td className=${P.cx("r num", s.counts[0] < s.counts[1] && "bad")}>${s.counts[0]} of ${s.counts[1]}</td><td className=${P.cx("r num", s.ho[0] < s.ho[1] && "bad")}>${s.ho[0]} of ${s.ho[1]}</td>
            <td className=${P.cx("r num", s.late && "bad")}>${s.late}</td><td className=${P.cx("r num", s.nowit && "bad")}>${s.nowit}</td><td className="r num">${s.cases[0]} of ${s.cases[1]}</td></tr>`)}</tbody></table></div>
        <p className="hint" style=${{ padding: "0 16px 14px" }}>Per hour is per hour on shift, so night staff with fewer patients aren't compared unfairly. Red marks something to talk about, not a score. Counts, handovers, late entries and witnesses come from the audit trail.</p>
      </div>` : null}
    </div>`;
  };
})();
