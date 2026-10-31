/* Inpatients: the medication administration record (MAR) the nurses keep on the ward, seen from the pharmacy.
   Each prescribed regimen has its dose times; each time is given (when, by whom) or not given (why). The pharmacy sees
   adherence, missed doses, doses not given for lack of stock, and whether ward stock covers the next 24 hours. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const at = (d, h, m) => new Date(2026, 9, d, h, m || 0).getTime();

  P.INPATIENTS = [
    { id: "p61", ward: "w3", bed: "Bed 4", name: "Sample patient 61", sex: "M", age: 45, kg: 70, dx: "Severe community-acquired pneumonia", allergy: "None known", admitted: at(27, 7, 30), by: "Dr (sample), Medical" },
    { id: "p62", ward: "w3", bed: "Bed 9", name: "Sample patient 62", sex: "F", age: 38, kg: 60, dx: "Acute pyelonephritis", allergy: "Penicillin (rash)", admitted: at(28, 9, 0), by: "Dr (sample), Medical" },
    { id: "p63", ward: "w3", bed: "Bed 12", name: "Sample patient 63", sex: "M", age: 29, kg: 65, dx: "Amoebic dysentery with some dehydration", allergy: "None known", admitted: at(28, 11, 0), by: "Dr (sample), Medical" },
    { id: "p71", ward: "mat", bed: "Bed 1", name: "Sample patient 71", sex: "F", age: 24, kg: 68, dx: "Severe pre-eclampsia, 36 weeks", allergy: "None known", admitted: at(29, 1, 30), by: "Dr (sample), Obstetrics" },
    { id: "p72", ward: "mat", bed: "Bed 3", name: "Sample patient 72", sex: "F", age: 31, kg: 72, dx: "Day 1 after caesarean section", allergy: "None known", admitted: at(28, 6, 0), by: "Dr (sample), Obstetrics" },
    { id: "p81", ward: "peds", bed: "Cot 2", name: "Sample patient 81", sex: "M", age: 3, kg: 14, dx: "Severe pneumonia", allergy: "None known", admitted: at(29, 7, 0), by: "Dr (sample), Paediatrics" },
    { id: "p82", ward: "peds", bed: "Cot 5", name: "Sample patient 82", sex: "F", age: 1, kg: 9, dx: "Acute watery diarrhoea, some dehydration", allergy: "None known", admitted: at(29, 6, 30), by: "Dr (sample), Paediatrics" },
  ];
  P.REGIMENS = [
    { id: "r1", pt: "p61", med: "ceft", dose: "2 g", qty: 2, route: "IV", times: ["08:00"], start: at(27, 8), days: 7, freq: "Once daily" },
    { id: "r2", pt: "p61", med: "pcm", dose: "1 g", qty: 2, route: "Oral", times: ["06:00", "12:00", "18:00", "00:00"], start: at(27, 12), days: 5, freq: "6-hourly" },
    { id: "r3", pt: "p61", med: "amlo", dose: "5 mg", qty: 1, route: "Oral", times: ["08:00"], start: at(27, 8), days: 30, freq: "Once daily" },
    { id: "r4", pt: "p62", med: "gent", dose: "300 mg (5 mg/kg)", qty: 4, route: "IV", times: ["12:00"], start: at(28, 12), days: 5, freq: "Once daily", check: "60 kg × 5 mg/kg = 300 mg: 4 ampoules of 80 mg. Check creatinine; trough level if the course goes beyond 48 h." },
    { id: "r5", pt: "p62", med: "pcm", dose: "1 g", qty: 2, route: "Oral", prn: true, freq: "Up to 6-hourly when needed", start: at(28, 9), days: 5, prnSeed: [[at(28, 20, 15), "SK", "Fever 38.6 °C"]] },
    { id: "r6", pt: "p63", med: "metro", dose: "400 mg", qty: 2, route: "Oral", times: ["06:00", "14:00", "22:00"], start: at(28, 14), days: 7, freq: "8-hourly" },
    { id: "r7", pt: "p63", med: "rl", dose: "1 L", qty: 2, route: "IV", times: ["06:00", "14:00", "22:00"], start: at(28, 14), days: 2, freq: "Over 8 h, 3 bags a day" },
    { id: "r8", pt: "p71", med: "mgso4", dose: "5 g deep IM", qty: 1, route: "IM", times: ["06:00", "10:00", "14:00", "18:00", "22:00", "02:00"], start: at(29, 6), days: 1, freq: "4-hourly for 24 h", mg: true, check: "Loading dose (4 g IV + 10 g IM) given 01:50 (sample). Before each dose: knee reflex present, respiratory rate 16/min or more, urine 30 mL/h or more." },
    { id: "r9", pt: "p71", med: "pcm", dose: "1 g", qty: 2, route: "Oral", prn: true, freq: "Up to 6-hourly when needed", start: at(29, 2), days: 3, prnSeed: [] },
    { id: "r10", pt: "p72", med: "amox", dose: "500 mg", qty: 1, route: "Oral", times: ["06:00", "14:00", "22:00"], start: at(28, 14), days: 5, freq: "8-hourly" },
    { id: "r11", pt: "p72", med: "ferr", dose: "1 tablet", qty: 1, route: "Oral", times: ["08:00"], start: at(29, 8), days: 90, freq: "Once daily" },
    { id: "r12", pt: "p72", med: "pcm", dose: "1 g", qty: 2, route: "Oral", times: ["06:00", "12:00", "18:00", "00:00"], start: at(28, 12), days: 3, freq: "6-hourly" },
    { id: "r13", pt: "p81", med: "ceft", dose: "1 g (≈ 70 mg/kg)", qty: 1, route: "IV", times: ["08:00"], start: at(29, 8), days: 5, freq: "Once daily", check: "14 kg: 50–80 mg/kg is 700 mg–1.1 g. 1 g is in range." },
    { id: "r14", pt: "p81", med: "pcm", dose: "250 mg (½ tablet)", qty: 1, route: "Oral", prn: true, freq: "Up to 6-hourly when needed", start: at(29, 7), days: 5, prnSeed: [[at(29, 7, 40), "OM", "Fever 39.1 °C"]] },
    { id: "r15", pt: "p82", med: "ors", dose: "675 mL over 4 h (75 mL/kg), then after each stool", qty: 1, route: "Oral", times: ["07:00", "11:00", "15:00", "19:00"], start: at(29, 7), days: 2, freq: "Plan B, then after each loose stool" },
  ];
  /* sample history: anything before 10:00 today is recorded as given unless listed here */
  const SEED = {
    ["r3|" + at(28, 8)]: { s: "not", why: "Patient away (X-ray)", by: "NA" },
    ["r6|" + at(28, 14)]: { s: "not", why: "Not in stock at pharmacy", by: "SK" },
    ["r6|" + at(28, 22)]: { s: "not", why: "Not in stock at pharmacy", by: "OM" },
    ["r6|" + at(29, 6)]: { s: "not", why: "Not in stock at pharmacy", by: "OM" },
    ["r8|" + at(29, 10)]: { s: "open" },
    ["r10|" + at(28, 22)]: { s: "not", why: "Patient refused (vomiting)", by: "OM" },
    ["r12|" + at(29, 6)]: { s: "given", late: 95, by: "OM" },
    ["r13|" + at(29, 8)]: { s: "not", why: "Not in stock on ward", by: "NA" },
    ["r7|" + at(29, 6)]: { s: "given", late: 70, by: "OM" },
  };
  const CUT = at(29, 10);
  const NURSES = ["NA", "SK", "OM"];
  const REASONS = ["Not in stock on ward", "Not in stock at pharmacy", "Patient refused", "Patient vomited", "Patient away from ward", "Nil by mouth", "Withheld: clinical reason", "Cannula not working"];
  const STOCK_REASONS = ["Not in stock on ward", "Not in stock at pharmacy"];

  P.pt = (id) => P.INPATIENTS.find((p) => p.id === id);
  const SHORT = { ors: "ORS", ns: "Saline", rl: "Ringer's lactate", mgso4: "Magnesium sulphate", ferr: "Ferrous sulphate" };
  const sn = (id) => SHORT[id] || P.med(id).name.split(" ")[0];
  P.regsOf = (pt) => P.REGIMENS.filter((r) => r.pt === pt);
  const hm = (t) => t.split(":").map(Number);

  P.slots = (r, from, to) => {
    if (r.prn) return [];
    const out = [], end = r.start + r.days * DAY;
    for (let d = new Date(r.start); ; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (day0 > Math.min(end, to)) break;
      r.times.forEach((t) => { const [h, m] = hm(t); const ts = day0 + h * HOUR + m * MIN; if (ts >= r.start && ts < end && ts >= from && ts <= to) out.push(ts); });
    }
    return out.sort((a, b) => a - b);
  };

  /* what happened at one dose time */
  P.doseAt = (r, ts) => {
    const rec = ((P.db.mar || {})[r.id] || {})[ts];
    if (rec) return rec;
    const s = SEED[r.id + "|" + ts];
    if (s && s.s === "not") return { s: "not", why: s.why, by: s.by, at: ts + 10 * MIN, sample: true };
    if (s && s.s === "given") return { s: "given", at: ts + s.late * MIN, by: s.by, sample: true };
    if ((!s || s.s !== "open") && ts < CUT) { const k = (ts / MIN + r.id.length * 7) % 31; return { s: "given", at: ts + (4 + k) * MIN, by: NURSES[(ts / HOUR + r.id.length) % 3 | 0], sample: true }; }
    return null;
  };
  P.doseState = (r, ts) => {
    const d = P.doseAt(r, ts), now = P.now();
    if (d && d.s === "given") return { k: d.at - ts > HOUR ? "late" : "given", d };
    if (d && d.s === "not") return { k: STOCK_REASONS.includes(d.why) ? "stock" : "not", d };
    if (now < ts - 30 * MIN) return { k: "next" };
    if (now <= ts + HOUR) return { k: "due" };
    return { k: "overdue" };
  };
  P.prnDoses = (r) => (r.prnSeed || []).map(([t, by, why]) => ({ at: t, by, why, sample: true })).concat(((P.db.marPrn || {})[r.id]) || []).sort((a, b) => a.at - b.at);

  P.regStats = (r) => {
    const now = P.now(), due = P.slots(r, r.start, now + 30 * MIN).filter((t) => t <= now + 30 * MIN);
    const st = due.map((t) => P.doseState(r, t));
    const given = st.filter((x) => x.k === "given" || x.k === "late").length;
    const past = st.filter((x) => x.k !== "due" && x.k !== "next").length;
    return { due: past, given, missed: st.filter((x) => x.k === "not" || x.k === "stock" || x.k === "overdue").length, stock: st.filter((x) => x.k === "stock").length,
      overdue: st.filter((x) => x.k === "overdue").length, dueNow: st.filter((x) => x.k === "due").length, late: st.filter((x) => x.k === "late").length,
      pct: past ? Math.round((given / past) * 100) : null };
  };
  P.coverage = (r) => {
    const p = P.pt(r.pt), have = P.medAt(r.med, p.ward);
    if (r.prn) return { need: r.qty, have, ok: have >= r.qty, n: 1 };
    const n = P.slots(r, P.now() - 30 * MIN, P.now() + DAY).filter((t) => !P.doseAt(r, t)).length;
    return { need: n * r.qty, have, ok: have >= n * r.qty, n };
  };
  P.ptStats = (pt) => {
    const rs = P.regsOf(pt).map((r) => ({ r, s: P.regStats(r), c: P.coverage(r) }));
    const sum = (k) => rs.reduce((a, x) => a + x.s[k], 0);
    const due = sum("due"), given = sum("given");
    return { rs, due, given, pct: due ? Math.round((given / due) * 100) : null, missed: sum("missed"), stock: sum("stock"), overdue: sum("overdue"), dueNow: sum("dueNow"), short: rs.filter((x) => !x.c.ok).length };
  };
  /* for Today */
  P.marAlerts = () => {
    const out = [];
    P.PLACES.filter((p) => p.kind === "ward").forEach((w) => {
      const pts = P.INPATIENTS.filter((p) => p.ward === w.id), stock = [], overdue = [], short = [];
      pts.forEach((p) => P.regsOf(p.id).forEach((r) => {
        const now = P.now();
        P.slots(r, now - DAY, now).forEach((t) => { const s = P.doseState(r, t); if (s.k === "stock") stock.push(sn(r.med) + " (" + p.bed + ")"); if (s.k === "overdue" || s.k === "due" && t < now) overdue.push(sn(r.med) + " (" + p.bed + ")"); });
        if (!P.coverage(r).ok) short.push(sn(r.med) + " (" + p.bed + ")");
      }));
      if (stock.length) out.push({ ward: w.id, kind: "stock", title: w.short + ": " + stock.length + (stock.length === 1 ? " dose" : " doses") + " not given for lack of stock in the last 24 h", meta: [...new Set(stock)].join(" · ") });
      if (overdue.length) out.push({ ward: w.id, kind: "late", title: w.short + ": " + overdue.length + (overdue.length === 1 ? " dose" : " doses") + " due and not yet recorded", meta: [...new Set(overdue)].join(" · ") });
      if (short.length) out.push({ ward: w.id, kind: "short", title: w.short + ": ward stock won't cover the next 24 h", meta: [...new Set(short)].join(" · ") });
    });
    return out;
  };

  const initials = () => { const w = P.ROLES[P.db.settings.role].split(" "); return (w.length > 1 ? w.map((x) => x[0]).join("") : w[0]).slice(0, 2).toUpperCase(); };
  const dayLabel = (ts) => { const d = new Date(ts), t = new Date(P.now()); const k = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / DAY); return k === 0 ? "Today" : k === 1 ? "Yesterday" : k === -1 ? "Tomorrow" : d.getDate() + " " + P.MON[d.getMonth()]; };

  /* ── one dose cell ── */
  const WORD = { given: "Given", late: "Given late", not: "Not given", stock: "No stock", next: "Due", due: "Due now", overdue: "Not recorded" };
  const DoseCell = ({ r, ts, onOpen }) => {
    const s = P.doseState(r, ts);
    const sub = s.d ? (s.k === "given" || s.k === "late" ? P.time(s.d.at) + " · " + s.d.by : s.d.why) : P.time(ts);
    const act = s.k === "due" || s.k === "overdue" || s.k === "next";
    return html`<button type="button" className=${P.cx("dose", s.k)} title=${WORD[s.k] + " · " + P.time(ts) + (s.d && s.d.why ? " · " + s.d.why : "")} onClick=${() => onOpen(r, ts)} disabled=${!act && !s.d}>
      <span className="dose-t">${P.time(ts)}</span><span className="dose-w">${WORD[s.k]}</span><span className="dose-s">${s.k === "next" || s.k === "due" || s.k === "overdue" ? (s.k === "next" ? "" : "Record") : sub}</span></button>`;
  };

  /* ── the nurse records a dose (simulated here; the real one is on the ward tablet) ── */
  const RecordDose = ({ r, ts, onClose }) => {
    P.useDb();
    const p = P.pt(r.pt), m = P.med(r.med), have = P.medAt(r.med, p.ward), existing = ts ? P.doseAt(r, ts) : null;
    const [mode, setMode] = useState(null);
    const [why, setWhy] = useState(null);
    const [checks, setChecks] = useState({});
    const [prnWhy, setPrnWhy] = useState("");
    const mgOk = !r.mg || (checks.reflex === "yes" && checks.rr === "yes" && checks.urine === "yes");
    const mgFail = r.mg && ["reflex", "rr", "urine"].some((k) => checks[k] === "no");
    const enough = have >= r.qty;
    const canGive = mode === "given" && enough && mgOk && (!r.prn || prnWhy.trim().length > 2);
    const canNot = mode === "not" && why;
    const save = () => {
      const db = P.db, now = P.now();
      if (mode === "given") {
        const a = P.allocate(r.med, p.ward, r.qty);
        a.parts.forEach((x) => P.move({ kind: "administer", med: r.med, batch: x.batch, from: p.ward, to: "patient", qty: x.qty, ref: r.id, note: p.name + " · " + p.bed, by: "Nurse " + initials() + " (sample), " + P.place(p.ward).short }));
      }
      if (r.prn) {
        db.marPrn = db.marPrn || {}; (db.marPrn[r.id] = db.marPrn[r.id] || []).push({ at: now, by: initials(), why: prnWhy.trim() });
      } else {
        db.mar = db.mar || {}; db.mar[r.id] = db.mar[r.id] || {};
        db.mar[r.id][ts] = mode === "given" ? { s: "given", at: now, by: initials(), checks: r.mg ? checks : undefined } : { s: "not", why, at: now, by: initials() };
      }
      P.commit();
      P.toast(mode === "given" ? m.name + " " + r.dose + " given to " + p.name + " · " + P.q(r.qty, r.med) + " off " + P.place(p.ward).short + " stock" : "Recorded as not given: " + why, mode === "given" ? "check" : "alert");
      onClose();
    };
    const yn = (k, label) => html`<div className="row between mg-row"><span>${label}</span><div className="chips"><${P.Chip} size="sm" on=${checks[k] === "yes"} onClick=${() => setChecks({ ...checks, [k]: "yes" })}>Yes<//><${P.Chip} size="sm" on=${checks[k] === "no"} onClick=${() => setChecks({ ...checks, [k]: "no" })}>No<//></div></div>`;
    return html`<${P.Dialog} title=${(r.prn ? "Record a dose when needed: " : "Record the " + P.time(ts) + " dose: ") + m.name} sub=${p.name + " · " + p.bed + ", " + P.place(p.ward).short + " · " + r.dose + " " + r.route + " · " + r.freq} onClose=${onClose}
      foot=${html`<span className="grow">Prototype: in the real product the nurse records this on the ward tablet, and the pharmacy sees it at once.</span>
        <${P.Btn} kind="primary" disabled=${!(canGive || canNot)} onClick=${save}>${mode === "not" ? "Record as not given" : "Record as given"}<//>`}>
      ${existing ? html`<div className="note"><${P.Icon} n="clip" /><span>Already recorded: ${existing.s === "given" ? "given " + P.time(existing.at) + " by " + existing.by : "not given, " + existing.why}. Recording again replaces it.</span></div>` : null}
      <div className="chips"><${P.Chip} on=${mode === "given"} onClick=${() => setMode("given")}>Given<//><${P.Chip} on=${mode === "not"} onClick=${() => setMode("not")}>Not given<//></div>
      ${mode === "given" ? html`
        ${r.mg ? html`<div className="stack-s"><span className="lbl">Checks before magnesium sulphate</span>${yn("reflex", "Knee reflex present")}${yn("rr", "Respiratory rate 16/min or more")}${yn("urine", "Urine 30 mL/h or more over the last 4 h")}
          ${mgFail ? html`<div className="err"><${P.Icon} n="alert" s=${14} />Withhold this dose and call the doctor now. Antidote: calcium gluconate 10%, 10 mL IV over 10 minutes. Record it as not given.</div>` : null}</div>` : null}
        ${r.prn ? html`<div className="field"><label htmlFor="prnw">Reason it was needed</label><input id="prnw" className="input" placeholder="e.g. Fever 38.8 °C, pain 7/10" value=${prnWhy} onChange=${(e) => setPrnWhy(e.target.value)} /></div>` : null}
        <div className=${enough ? "ok-line" : "err"}><${P.Icon} n=${enough ? "check" : "alert"} s=${14} />${enough ? P.q(r.qty, r.med) + " comes off " + P.place(p.ward).short + " stock (" + have + " there now)" : "Only " + P.q(have, r.med) + " on " + P.place(p.ward).short + ": record it as not given, or issue stock first"}</div>` : null}
      ${mode === "not" ? html`<div className="stack-s"><span className="lbl">Why</span><div className="chips">${REASONS.map((x) => html`<${P.Chip} key=${x} size="sm" on=${why === x} onClick=${() => setWhy(x)}>${x}<//>`)}</div>
        ${STOCK_REASONS.includes(why) ? html`<p className="hint">The pharmacy sees this on Today straight away.</p>` : null}</div>` : null}
    <//>`;
  };

  const NOTE_CHIPS = ["Dose checked: correct", "Spoke to the prescriber", "Alternative suggested", "Issued stock to the ward", "Level / renal function requested", "Counselled the patient"];
  const PharmNotes = ({ p }) => {
    const db = P.useDb();
    const [txt, setTxt] = useState("");
    const notes = ((db.ipNotes || {})[p.id]) || [];
    const add = (t) => { db.ipNotes = db.ipNotes || {}; (db.ipNotes[p.id] = db.ipNotes[p.id] || []).push({ t, at: P.now(), by: P.who() }); P.commit(); setTxt(""); };
    return html`<div className="card pad stack-s">
      <h3 style=${{ fontSize: "14px" }}>Pharmacy review</h3>
      <div className="chips">${NOTE_CHIPS.map((c) => html`<${P.Chip} key=${c} size="sm" onClick=${() => add(c)}>${c}<//>`)}</div>
      <div className="row"><input className="input" style=${{ flex: 1, minWidth: "180px" }} placeholder="Add a note for the ward and prescriber" value=${txt} onChange=${(e) => setTxt(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter" && txt.trim()) add(txt.trim()); }} />
        <${P.Btn} kind="navy" disabled=${!txt.trim()} onClick=${() => add(txt.trim())}>Add<//></div>
      ${notes.length ? html`<div className="ip-notes">${notes.slice().reverse().map((n, i) => html`<div key=${i}><b>${n.t}</b><span className="muted small">${P.when(n.at)} · ${n.by}</span></div>`)}</div>` : html`<p className="muted small">No notes yet. Notes show on the ward's chart too.</p>`}
    </div>`;
  };


  /* ── the journey of one prescription: prescribed → checked → picked → on the ward → given → back to the ledger ── */
  const RX_BY = "Pharmacist (sample)";
  const SUP = {
    r1: [[at(27, 8, 20), 6, "ceft-1", at(27, 8, 50), "NA"]], r2: [[at(27, 11, 40), 40, "pcm-1", at(27, 12, 5), "SK"]], r3: [[at(27, 8, 20), 7, "amlo-1", at(27, 8, 50), "NA"]],
    r4: [[at(28, 11, 30), 8, "gent-1", at(28, 11, 55), "SK"]], r7: [[at(28, 13, 30), 6, "rl-1", at(28, 13, 50), "SK"]], r8: [[at(29, 1, 40), 6, "mgso4-1", at(29, 1, 55), "OM"]],
    r10: [[at(28, 13, 20), 15, "amox-1", at(28, 13, 45), "SK"]], r11: [[at(29, 7, 50), 30, "ferr-1", at(29, 8, 5), "NA"]], r12: [[at(28, 11, 40), 24, "pcm-1", at(28, 12, 0), "SK"]],
    r15: [[at(29, 6, 50), 4, "ors-1", at(29, 7, 0), "OM"]],
  };
  P.supplies = (r) => (SUP[r.id] || []).map(([t, q, b, rt, rb]) => ({ at: t, qty: q, parts: [{ batch: b, qty: q }], by: RX_BY, recvAt: rt, recvBy: rb, sample: true }))
    .concat((((P.db.ipSupply || {})[r.id]) || []).map((s) => { const t = P.db.transits.find((x) => x.id === s.tid); return { ...s, recvAt: t && t.status === "confirmed" ? t.confirmedAt : null, recvBy: t && t.status === "confirmed" ? "Nurse in-charge" : null, t }; }));
  P.givenUnits = (r) => (r.prn ? P.prnDoses(r).length : P.slots(r, r.start, P.now() + HOUR).filter((ts) => { const s = P.doseState(r, ts); return s.k === "given" || s.k === "late"; }).length) * r.qty;
  P.returnedUnits = (r) => ((P.db.ipReturn || {})[r.id] || []).reduce((a, x) => a + x.qty, 0);
  P.journey = (r) => {
    const sup = P.supplies(r), picked = sup.reduce((a, x) => a + x.qty, 0), recv = sup.filter((x) => x.recvAt).reduce((a, x) => a + x.qty, 0);
    const given = P.givenUnits(r), ret = P.returnedUnits(r), total = r.prn ? null : P.slots(r, r.start, r.start + r.days * DAY).length;
    const doses = r.prn ? P.prnDoses(r).length : P.slots(r, r.start, P.now() + HOUR).filter((ts) => ["given", "late"].includes(P.doseState(r, ts).k)).length;
    return { sup, picked, recv, given, ret, left: Math.max(0, recv - given - ret), onway: picked - recv, total, doses, imprest: !!r.prn && !sup.length };
  };

  const Step = ({ n, done, warn, title, children }) => html`<li className=${P.cx("jr-step", done && "done", warn && "warn")}><span className="jr-dot">${done ? html`<${P.Icon} n="check" s=${13} />` : warn ? "!" : n}</span><div><b>${title}</b>${children}</div></li>`;

  const Track = ({ r, onClose }) => {
    const db = P.useDb();
    const p = P.pt(r.pt), m = P.med(r.med), j = P.journey(r);
    const [qty, setQty] = useState(null);
    const next24 = r.prn ? r.qty * 4 : P.slots(r, P.now() - 30 * MIN, P.now() + DAY).filter((t) => !P.doseAt(r, t)).length * r.qty;
    const rest = r.prn ? r.qty * 4 : P.slots(r, P.now() - 30 * MIN, r.start + r.days * DAY).filter((t) => !P.doseAt(r, t)).length * r.qty;
    const store = P.medAt(r.med, "store");
    const pick = () => {
      const a = P.allocate(r.med, "store", qty), t = { id: "t" + db.seq++, dest: p.ward, at: P.now(), status: "onway", moves: [], patient: p.name };
      a.parts.forEach((x) => { const mv = P.move({ kind: "issue", med: r.med, batch: x.batch, from: "store", to: "transit:" + p.ward, qty: x.qty, ref: t.id, note: "For " + p.name + " · " + p.bed }); t.moves.push({ med: mv.med, batch: mv.batch, qty: mv.qty }); });
      db.transits.push(t); db.ipSupply = db.ipSupply || {}; (db.ipSupply[r.id] = db.ipSupply[r.id] || []).push({ at: P.now(), qty, parts: a.parts, by: P.who(), tid: t.id });
      P.commit(); P.toast("Picked " + P.q(qty, r.med) + " for " + p.name + " · on the way to " + P.place(p.ward).short); setQty(null);
    };
    const giveBack = () => {
      const fromSup = j.sup.flatMap((s) => s.parts.map((x) => x.batch));
      const batch = fromSup.find((b) => P.bal(b, p.ward) > 0) || (P.fefo(r.med, p.ward)[0] || {}).id;
      const q = Math.min(j.left, batch ? P.bal(batch, p.ward) : 0); if (!q) { P.toast("Nothing on the ward to return", "alert"); return; }
      P.move({ kind: "returned", med: r.med, batch, from: p.ward, to: "store", qty: q, ref: r.id, note: "Unused, " + p.name + " · " + p.bed, by: "Nurse in-charge, " + P.place(p.ward).short + " (sample)" });
      db.ipReturn = db.ipReturn || {}; (db.ipReturn[r.id] = db.ipReturn[r.id] || []).push({ at: P.now(), qty: q }); P.commit(); P.toast(P.q(q, r.med) + " returned to the main store");
    };
    const doseList = r.prn ? P.prnDoses(r).map((d) => ({ t: d.at, k: "given", d })) : P.slots(r, r.start, P.now() + 30 * MIN).map((ts) => ({ t: ts, ...P.doseState(r, ts) }));
    const batchOf = (ts) => { const mv = P.db.moves.find((x) => x.kind === "administer" && x.ref === r.id && Math.abs(x.at - ((((P.db.mar || {})[r.id] || {})[ts] || {}).at || 0)) < 5000); return mv ? P.batch(mv.batch).no : null; };
    return html`<${P.Dialog} size="wide" title=${"Track: " + m.name + " for " + p.name} sub=${p.bed + ", " + P.place(p.ward).short + " · " + r.dose + " " + r.route + " · " + r.freq + (r.prn ? "" : " · " + r.days + " days")} onClose=${onClose}>
      <ol className="journey">
        <${Step} n="1" done=${true} title="Prescribed"><div className="small ink2">${P.when(r.start - 40 * MIN)} · ${p.by}</div><div className="small">${r.dose} ${r.route}, ${r.freq.toLowerCase()}${r.prn ? "" : ", " + r.days + " days (" + j.total + " doses)"}</div><//>
        <${Step} n="2" done=${true} title="Checked by the pharmacy"><div className="small ink2">${P.when(r.start - 25 * MIN)} · ${RX_BY}</div>${r.check ? html`<div className="small mar-check">${r.check}</div>` : html`<div className="small muted">Dose, route and allergies checked.</div>`}<//>
        <${Step} n="3" done=${j.picked > 0 || j.imprest} warn=${!j.picked && !j.imprest} title="Picked and issued by the pharmacy">
          ${j.imprest ? html`<div className="small ink2">Given from ${P.place(p.ward).short} ward stock (imprest), not picked for this patient. Ward stock: ${P.q(P.medAt(r.med, p.ward), r.med)}.</div>` : null}
          ${j.sup.map((s, i) => html`<div key=${i} className="jr-line"><span className="num strong">${P.q(s.qty, r.med)}</span><span>${s.parts.map((x) => P.batch(x.batch).no + " (" + P.batchBrand(x.batch) + ", exp " + P.expWord(P.batch(x.batch).exp) + ")").join(", ")}</span><span className="muted">${P.when(s.at)} · ${s.by}${s.sample ? " · sample history" : ""}</span></div>`)}
          ${!j.imprest ? html`<div className="jr-pick">
            ${!j.picked ? html`<div className="err"><${P.Icon} n="alert" s=${14} />${store ? "Not picked yet. The main store has " + P.q(store, r.med) + "." : "Not picked: the pharmacy is out of " + m.name + ". Talk to the prescriber about an alternative."}</div>` : null}
            ${store ? html`<div className="row"><span className="lbl">Pick for this patient</span><${P.Stepper} value=${qty} onChange=${setQty} unit=${m.unit} label=${"pick " + m.name} max=${store} />
              <${P.Chip} size="sm" onClick=${() => setQty(Math.min(store, next24))}>Next 24 h: ${next24}<//><${P.Chip} size="sm" onClick=${() => setQty(Math.min(store, rest))}>Rest of course: ${rest}<//>
              <${P.Btn} kind="navy" icon="send" disabled=${!qty} onClick=${pick}>Pick and send<//></div>` : null}</div>` : null}<//>
        <${Step} n="4" done=${j.recv > 0 && !j.onway} warn=${j.onway > 0} title=${"Received on " + P.place(p.ward).short}>
          ${j.sup.length ? j.sup.map((s, i) => html`<div key=${i} className="jr-line"><span className="num strong">${P.q(s.qty, r.med)}</span>${s.recvAt ? html`<span>confirmed ${P.when(s.recvAt)} · ${s.recvBy}</span>` : html`<span className="err">on the way, not yet confirmed</span><${P.Btn} size="sm" kind="ghost" icon="phone" onClick=${() => P.confirmTransit(s.t)}>Simulate: ward confirms<//>`}</div>`) : html`<div className="small muted">${j.imprest ? "Already on the ward." : "Nothing sent yet."}</div>`}<//>
        <${Step} n="5" done=${j.doses > 0} title=${"Given to the patient: " + j.doses + (j.total ? " of " + j.total + " doses" : " doses")}>
          <div className="jr-doses">${doseList.slice(-12).map((d) => html`<span key=${d.t} className=${P.cx("dose", d.k)}><span className="dose-t">${dayLabel(d.t) === "Today" ? "" : dayLabel(d.t) + " "}${P.time(d.t)}</span><span className="dose-w">${WORD[d.k] || "Given"}</span><span className="dose-s">${d.d ? (d.d.s === "not" ? d.d.why : P.time(d.d.at) + " · " + d.d.by + (batchOf(d.t) ? " · " + batchOf(d.t) : "")) : ""}</span></span>`)}</div><//>
        <${Step} n="6" done=${true} title="Back to the pharmacy ledger">
          <div className="jr-bal">
            <div><span>Picked for this patient</span><b>${j.imprest ? "—" : P.q(j.picked, r.med)}</b></div>
            <div><span>Received on the ward</span><b>${j.imprest ? "—" : P.q(j.recv, r.med)}</b></div>
            <div><span>Given</span><b>${P.q(j.given, r.med)}</b></div>
            <div><span>Returned</span><b>${P.q(j.ret, r.med)}</b></div>
            <div className=${j.left ? "hl" : ""}><span>Should still be on the ward</span><b>${j.imprest ? "—" : P.q(j.left, r.med)}</b></div>
          </div>
          <div className="small muted">Every pick, ward confirmation, dose given and return is a line in the ledger, so ${P.place(p.ward).short}'s stock of ${m.name} (${P.q(P.medAt(r.med, p.ward), r.med)} now) always adds up.</div>
          ${!j.imprest && j.left > P.medAt(r.med, p.ward) ? html`<div className="err"><${P.Icon} n="alert" s=${14} />The ledger shows only ${P.q(P.medAt(r.med, p.ward), r.med)} on ${P.place(p.ward).short}: ${P.q(j.left - P.medAt(r.med, p.ward), r.med)} not accounted for. Count the ward cupboard and record the difference.</div>` : null}
          ${j.left && !j.imprest && P.medAt(r.med, p.ward) ? html`<div><${P.Btn} size="sm" icon="undo" onClick=${giveBack}>Ward returns ${P.q(Math.min(j.left, P.medAt(r.med, p.ward)), r.med)} unused<//></div>` : null}<//>
      </ol>
    <//>`;
  };

  const JourneyChips = ({ r, onOpen }) => {
    const j = P.journey(r);
    const pickWord = j.imprest ? "ward stock" : j.picked ? P.q(j.picked, r.med) : "not picked";
    return html`<button type="button" className="jr-mini" onClick=${onOpen} title="Track this prescription from prescribing to the patient">
      <span className="ok">Prescribed</span><i></i><span className="ok">Checked</span><i></i><span className=${j.picked || j.imprest ? "ok" : "bad"}>Picked: ${pickWord}</span><i></i><span className=${j.onway ? "wait" : j.recv || j.imprest ? "ok" : "off"}>${j.onway ? "On the way" : "On ward"}</span><i></i><span className=${j.doses ? "ok" : "off"}>Given ${j.doses}${j.total ? "/" + j.total : ""}</span><b>Track</b></button>`;
  };

  /* ── one patient's chart ── */
  /* adherence ring */
  const Ring = ({ pct, size = 54 }) => {
    const r = size / 2 - 5, c = 2 * Math.PI * r, v = pct == null ? 0 : pct;
    return html`<svg className=${P.cx("ring", pct != null && pct < 80 && "low", pct != null && pct < 60 && "bad")} width=${size} height=${size} viewBox=${"0 0 " + size + " " + size} role="img" aria-label=${(pct == null ? "No doses due yet" : pct + "% of due doses given")}>
      <circle cx=${size / 2} cy=${size / 2} r=${r} className="ring-bg" />
      <circle cx=${size / 2} cy=${size / 2} r=${r} className="ring-fg" strokeDasharray=${c} strokeDashoffset=${c * (1 - v / 100)} transform=${"rotate(-90 " + size / 2 + " " + size / 2 + ")"} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">${pct == null ? "—" : pct + "%"}</text></svg>`;
  };
  const todayDoses = (pt) => {
    const t = new Date(P.now()), d0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    return P.regsOf(pt).flatMap((r) => P.slots(r, d0, d0 + DAY - 1).map((ts) => ({ ts, r, k: P.doseState(r, ts).k }))).sort((a, b) => a.ts - b.ts);
  };
  const sevOf = (s) => (s.stock || s.short ? "bad" : s.overdue || s.dueNow || s.missed ? "warn" : "ok");

  /* what the pharmacy has to do, across all inpatients */
  P.ipActions = (ward) => {
    const out = [];
    P.INPATIENTS.filter((p) => !ward || ward === "all" || p.ward === ward).forEach((p) => P.regsOf(p.id).forEach((r) => {
      const s = P.regStats(r), c = P.coverage(r), j = P.journey(r), m = P.med(r.med), store = P.medAt(r.med, "store"), where = p.bed + ", " + P.place(p.ward).short;
      if (s.stock && !store) out.push({ sev: 3, icon: "ban", t: sn(r.med) + " is out at the pharmacy", sub: where + " · " + s.stock + " doses missed. Ask the prescriber for an alternative.", act: "Open chart", go: { to: "inpatients", pt: p.id } });
      else if ((s.stock || !c.ok) && !j.onway) out.push({ sev: 3, icon: "package", t: (r.prn ? "Top up " : "Pick ") + sn(r.med) + (r.prn ? " on " + P.place(p.ward).short : " for " + p.bed), sub: where + " · " + (s.stock ? s.stock + (s.stock === 1 ? " dose" : " doses") + " not given for lack of stock" : "ward has " + c.have + ", next 24 h need " + c.need), act: r.prn ? "Issue" : "Pick", go: r.prn ? { to: "store", tab: "issue", ward: p.ward } : { to: "inpatients", pt: p.id, track: r.id } });
      if (j.onway) out.push({ sev: 1, icon: "send", t: "Waiting for " + P.place(p.ward).short + " to confirm " + sn(r.med), sub: where + " · " + P.q(j.onway, r.med) + " on the way", act: "Track", go: { to: "inpatients", pt: p.id, track: r.id } });
      if (s.dueNow || s.overdue) out.push({ sev: 2, icon: "clock", t: sn(r.med) + " " + r.dose + (s.overdue ? " not recorded" : " due now"), sub: where + " · the ward's to give; you'll see it here once recorded", act: "Open chart", go: { to: "inpatients", pt: p.id } });
    }));
    return out.sort((a, b) => b.sev - a.sev);
  };

  const PatientChart = ({ p, openTrack }) => {
    P.useDb();
    const [rec, setRec] = useState(null);
    const [track, setTrack] = useState(() => (openTrack ? P.REGIMENS.find((r) => r.id === openTrack) : null));
    const now = P.now(), t0 = new Date(now); const today0 = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate()).getTime();
    const days = [today0 - DAY, today0];
    const st = P.ptStats(p.id);
    const flags = [];
    st.rs.forEach(({ r, s, c }) => {
      const m = P.med(r.med), jj = P.journey(r), store = P.medAt(r.med, "store");
      /* patient-specific supply: the fix is a pick for this patient; ward stock (imprest) items: an issue to the ward */
      const fix = store ? (r.prn ? { a: "Issue to " + P.place(p.ward).short, go: { to: "store", tab: "issue", ward: p.ward } } : { a: "Pick for this patient", fn: () => setTrack(r) }) : { a: "Out at the pharmacy too: talk to the prescriber" };
      if (s.stock) flags.push({ k: "bad", t: m.name + ": " + s.stock + (s.stock === 1 ? " dose" : " doses") + " not given for lack of stock", ...fix });
      if (s.overdue) flags.push({ k: "warn", t: m.name + ": " + s.overdue + (s.overdue === 1 ? " dose" : " doses") + " past due with nothing recorded" });
      if (s.dueNow) flags.push({ k: "warn", t: m.name + " " + r.dose + " is due now" });
      if (!c.ok && !jj.onway) flags.push({ k: "warn", t: m.name + ": " + P.place(p.ward).short + " has " + P.q(c.have, r.med) + ", the next 24 h need " + P.q(c.need, r.med), ...(s.stock ? {} : fix) });
      if (!r.prn && !jj.picked && store && !s.stock && c.ok) flags.push({ k: "warn", t: m.name + ": not picked for this patient yet (given from ward stock so far)", a: "Pick for this patient", fn: () => setTrack(r) });
      if (jj.onway) flags.push({ k: "warn", t: m.name + ": " + P.q(jj.onway, r.med) + " picked for this patient, on the way, not yet confirmed by the ward", a: "Track", fn: () => setTrack(r) });
      if (p.allergy !== "None known" && m.cat === "Antibiotics" && /penicillin/i.test(p.allergy) && ["amox"].includes(r.med)) flags.push({ k: "bad", t: "Penicillin allergy and " + m.name });
    });
    return html`<div className="stack">
      <div className="card pad ip-head">
        <div className="rx-av" aria-hidden="true">${p.bed.split(" ")[1]}</div>
        <div className="grow">
          <h2 style=${{ fontSize: "18px" }}>${p.name} <span className="muted" style=${{ fontWeight: 500, fontSize: "14px" }}>${p.bed} · ${P.place(p.ward).short}</span></h2>
          <div className="muted">${p.sex} · ${p.age} y · ${p.kg} kg · ${p.dx} (sample) · admitted ${P.when(p.admitted)} · ${p.by}</div>
        </div>
        <${P.Tag} kind=${p.allergy === "None known" ? null : "caution"} icon=${p.allergy === "None known" ? null : "alert"}>Allergies: ${p.allergy}<//>
      </div>
      <div className="kpis">
        <div className="kpi"><b>${st.pct == null ? "—" : st.pct + "%"}</b><span>of due doses given (${st.given} of ${st.due})</span></div>
        <div className="kpi"><b className=${st.missed ? "bad" : ""}>${st.missed}</b><span>missed or not given</span></div>
        <div className="kpi"><b className=${st.stock ? "bad" : ""}>${st.stock}</b><span>not given for lack of stock</span></div>
        <div className="kpi"><b>${st.dueNow}</b><span>due now</span></div>
      </div>
      ${flags.length ? html`<div className="ip-flags">${flags.map((f, i) => html`<div key=${i} className=${P.cx("ip-flag", f.k)}><${P.Icon} n="alert" s=${15} /><span className="grow">${f.t}</span>${f.fn ? html`<${P.Btn} size="sm" kind="navy" onClick=${f.fn}>${f.a}<//>` : f.go ? html`<${P.Btn} size="sm" kind="navy" onClick=${() => P.go(f.go)}>${f.a}<//>` : f.a ? html`<span className="small strong">${f.a}</span>` : null}</div>`)}</div>` : null}
      <div className="card"><div className="tblwrap"><table className="tbl mar">
        <thead><tr><th>Prescribed</th><th>Yesterday</th><th>Today</th><th className="r">Given</th><th>Ward stock, next 24 h</th></tr></thead>
        <tbody>${st.rs.map(({ r, s, c }) => {
          const m = P.med(r.med), dayN = Math.floor((today0 - new Date(new Date(r.start).setHours(0, 0, 0, 0)).getTime()) / DAY) + 1;
          return html`<tr key=${r.id}>
            <td className="mar-rx"><div className="strong">${m.name}<${P.MedTags} med=${r.med} /></div>
              <div className="small">${r.dose} · ${r.route} · ${r.freq}</div>
              <div className="muted small">${r.prn ? "When needed" : "Day " + Math.min(dayN, r.days) + " of " + r.days}${r.check ? html`<span className="mar-check"> · ${r.check}</span>` : null}</div>
              <${JourneyChips} r=${r} onOpen=${() => setTrack(r)} /></td>
            ${r.prn ? html`<td colSpan="2"><div className="prn">${P.prnDoses(r).filter((d) => d.at >= days[0]).map((d, i) => html`<span key=${i} className="dose given"><span className="dose-t">${P.time(d.at)}</span><span className="dose-w">${dayLabel(d.at)}</span><span className="dose-s">${d.by} · ${d.why}</span></span>`)}
                <button type="button" className="btn outline sm" onClick=${() => setRec({ r, ts: null })}><${P.Icon} n="plus" s=${14} />Record a dose<//></div></td>`
              : days.map((d0) => html`<td key=${d0}><div className="doses">${P.slots(r, d0, d0 + DAY - 1).map((ts) => html`<${DoseCell} key=${ts} r=${r} ts=${ts} onOpen=${(rr, t) => setRec({ r: rr, ts: t })} />`)}${P.slots(r, d0, d0 + DAY - 1).length ? null : html`<span className="muted small">—</span>`}</div></td>`)}
            <td className="r">${r.prn ? P.prnDoses(r).length + " doses" : html`<div className="adh"><b>${s.given}/${s.due}</b><i style=${{ "--p": (s.pct == null ? 0 : s.pct) + "%" }} className=${s.pct != null && s.pct < 80 ? "low" : ""}></i></div>`}</td>
            <td>${c.ok ? html`<span className="ok-line"><${P.Icon} n="check" s=${14} />${c.have} on ward · needs ${c.need}</span>` : html`<span className="err"><${P.Icon} n="alert" s=${14} />${c.have} on ward · needs ${c.need}</span>`}</td>
          </tr>`;
        })}</tbody></table></div></div>
      <div className="mar-key"><span className="dose given"><span className="dose-w">Given</span></span><span className="dose late"><span className="dose-w">Given late</span></span><span className="dose due"><span className="dose-w">Due now</span></span><span className="dose overdue"><span className="dose-w">Not recorded</span></span><span className="dose not"><span className="dose-w">Not given</span></span><span className="dose stock"><span className="dose-w">No stock</span></span>
        <span className="muted small">Tap a due dose to record it as the nurse would. Given doses come off the ward's stock.</span></div>
      <${PharmNotes} p=${p} />
      ${rec ? html`<${RecordDose} r=${rec.r} ts=${rec.ts} onClose=${() => setRec(null)} />` : null}
      ${track ? html`<${Track} r=${track} onClose=${() => setTrack(null)} />` : null}
    </div>`;
  };

  const PatientCard = ({ p }) => {
    const s = P.ptStats(p.id), next = P.regsOf(p.id).flatMap((r) => P.slots(r, P.now() - 30 * MIN, P.now() + DAY).filter((t) => !P.doseAt(r, t)).map((t) => ({ t, r }))).sort((a, b) => a.t - b.t)[0];
    return html`<button type="button" className="ip-card" onClick=${() => P.go({ to: "inpatients", pt: p.id })}>
      <div className="row between"><span className="ip-bed">${p.bed} · ${P.place(p.ward).short}</span>${p.allergy !== "None known" ? html`<${P.Tag} kind="caution" icon="alert">${p.allergy}<//>` : null}</div>
      <div className="strong">${p.name}</div>
      <div className="muted small">${p.sex} · ${p.age} y · ${p.kg} kg · ${p.dx}</div>
      <div className="ip-adh"><i style=${{ "--p": (s.pct || 0) + "%" }} className=${s.pct != null && s.pct < 80 ? "low" : ""}></i><span><b>${s.pct == null ? "—" : s.pct + "%"}</b> of due doses given (${s.given}/${s.due})</span></div>
      <div className="row">${s.stock ? html`<${P.Tag} kind="caution" icon="package">${s.stock} not given: no stock<//>` : null}${s.missed - s.stock ? html`<${P.Tag} icon="alert">${s.missed - s.stock} other missed<//>` : null}${s.dueNow ? html`<${P.Tag} kind="pending" icon="clock">${s.dueNow} due now<//>` : null}${s.short ? html`<${P.Tag} kind="caution" icon="alert">Ward stock short<//>` : null}</div>
      <div className="muted small">${P.regsOf(p.id).length} ${P.regsOf(p.id).length === 1 ? "medicine" : "medicines"}${next ? " · next: " + sn(next.r.med) + " " + dayLabel(next.t).toLowerCase() + " " + P.time(next.t) : ""}</div>
    </button>`;
  };

  P.InpatientsView = ({ route }) => {
    const db = P.useDb();
    const wards = P.PLACES.filter((p) => p.kind === "ward");
    const ward = route.ward || "all";
    if (route.pt) return html`<div className="stack"><button type="button" className="back" onClick=${() => P.go({ to: "inpatients", ward: P.pt(route.pt).ward })}><${P.Icon} n="left" s=${16} />${P.place(P.pt(route.pt).ward).short}</button><${PatientChart} key=${route.pt + (route.track || "")} p=${P.pt(route.pt)} openTrack=${route.track} /></div>`;
    const nRound = P.roundLines ? P.PLACES.filter((p) => p.kind === "ward").reduce((a, w) => a + P.roundLines(w.id, 24).filter((l) => l.pick > 0).length, 0) : 0;
    const top = html`<${P.Seg} label="View" value=${route.tab === "round" ? "round" : "patients"} onChange=${(v) => P.go({ to: "inpatients", tab: v === "round" ? "round" : undefined })} items=${[{ v: "patients", label: "Patients and charts" }, { v: "round", label: "Round pick lists", n: nRound || null }]} />`;
    if (route.tab === "round") return html`<div className="stack">${top}<${P.RoundView} /></div>`;
    const scope = P.INPATIENTS.filter((p) => ward === "all" || p.ward === ward);
    const all = scope.map((p) => P.ptStats(p.id));
    const tot = (k) => all.reduce((a, x) => a + x[k], 0);
    const given = tot("given"), due = tot("due"), pct = due ? Math.round((given / due) * 100) : null;
    const acts = P.ipActions(ward);
    const groups = wards.filter((w) => ward === "all" || w.id === ward).map((w) => [w, scope.filter((p) => p.ward === w.id)]).filter(([, l]) => l.length);
    return html`<div className="stack">
      ${top}
      <${P.Seg} label="Ward" value=${ward} onChange=${(w) => P.go({ to: "inpatients", ward: w })} items=${[{ v: "all", label: "All wards", n: P.INPATIENTS.length }].concat(wards.map((w) => ({ v: w.id, label: w.short, n: P.INPATIENTS.filter((p) => p.ward === w.id).length })))} />
      <div className="kpis">
        <div className="kpi"><b>${pct == null ? "—" : pct + "%"}</b><span>of due doses given${ward === "all" ? ", all wards" : ""} (${given} of ${due})</span></div>
        <div className="kpi"><b className=${tot("stock") ? "bad" : ""}>${tot("stock")}</b><span>doses not given for lack of stock</span></div>
        <div className="kpi"><b>${tot("dueNow") + tot("overdue")}</b><span>due now or not yet recorded</span></div>
        <div className="kpi"><b className=${tot("short") ? "bad" : ""}>${tot("short")}</b><span>regimens the ward stock won't cover for 24 h</span></div>
      </div>
      ${acts.length ? html`<div className="card pad stack-s">
        <div className="row between"><h3 style=${{ fontSize: "14px" }}>For the pharmacy</h3><span className="muted small">${acts.length} to do</span></div>
        <div className="ip-actlist">${acts.slice(0, 6).map((a, i) => html`<div key=${i} className="ip-act"><${P.Icon} n=${a.icon} s=${15} /><div className="grow" style=${{ minWidth: 0 }}><b>${a.t}</b><span>${a.sub}</span></div><${P.Btn} size="sm" kind=${a.sev === 3 ? "navy" : "outline"} onClick=${() => P.go(a.go)}>${a.act}<//></div>`)}</div>
      </div>` : null}
      ${groups.map(([w, list]) => {
        const ws = list.map((p) => P.ptStats(p.id)), g = ws.reduce((a, x) => a + x.given, 0), d = ws.reduce((a, x) => a + x.due, 0), ns = ws.reduce((a, x) => a + x.stock, 0);
        return html`<section key=${w.id} className="stack-s">
          <div className="section-h"><h2>${w.name}</h2><span className="muted">${list.length} ${list.length === 1 ? "patient" : "patients"} · ${d ? Math.round((g / d) * 100) + "% of due doses given" : "no doses due yet"}${ns ? " · " + ns + " not given for lack of stock" : ""}</span></div>
          <div className="ip-grid">${list.map((p) => html`<${PatientCard} key=${p.id} p=${p} />`)}</div>
        </section>`;
      })}
      <p className="hint">Sample patients. Nurses record each dose on the ward tablet; the pharmacy sees adherence, missed doses and ward stock here and on Today.</p>
    </div>`;
  };
})();
