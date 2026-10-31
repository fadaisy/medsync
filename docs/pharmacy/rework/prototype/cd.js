/* Controlled drugs: one register per medicine per place, built from the ledger.
   Every ampoule or mL in, given, handed over, discarded and counted, each with two signatures.
   Flags make gaps visible: no witness, residue not recorded, a dose sooner than prescribed, a count that doesn't match, a check overdue. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  /* strength per unit, for the dose and residue maths */
  P.CDU = { morph: { mg: 10, ml: 1, per: "ampoule", step: 2.5 }, diaz: { mg: 10, ml: 2, per: "ampoule", step: 2.5 }, peth: { mg: 100, ml: 2, per: "ampoule", step: 25 }, omor: { mg: 1, ml: 1, per: "mL", step: 2.5, liquid: true } };
  /* shortest gap between doses before it is flagged (sample rule; the prescription decides in the real product) */
  P.CD_GAP = { morph: 4, peth: 3, omor: 4 };
  const CHECK_EVERY = { store: 7 * DAY, dispensary: DAY, ward: DAY, clinic: DAY };
  const WARD_WIT = ["Second nurse on shift", "Nurse in-charge", "Doctor on duty"];
  /* Staff who may prescribe controlled drugs (a signed rule in the real product; sample names).
     only: limited to these medicines (palliative care nurse prescribers: oral morphine). */
  P.STAFF = [
    { id: "s1", name: "Dr A. Okello", role: "Medical Officer", dept: "Medical" },
    { id: "s2", name: "Dr R. Namukasa", role: "Consultant Physician", dept: "Medical" },
    { id: "s3", name: "Dr J. Mugisha", role: "Surgeon", dept: "Surgery" },
    { id: "s4", name: "Dr P. Atim", role: "Obstetrician", dept: "Obstetrics" },
    { id: "s5", name: "Dr S. Nakato", role: "Medical Officer", dept: "Obstetrics" },
    { id: "s6", name: "Dr K. Ssali", role: "Paediatrician", dept: "Paediatrics" },
    { id: "s7", name: "Dr M. Achieng", role: "Medical Officer", dept: "Paediatrics" },
    { id: "s8", name: "Dr D. Opio", role: "Anaesthetist", dept: "Theatre" },
    { id: "s9", name: "Dr E. Namata", role: "Palliative Care Physician", dept: "Palliative care" },
    { id: "s10", name: "L. Akello", role: "Palliative Care Nurse Prescriber", dept: "Palliative care", only: ["omor"] },
  ];
  const DEPT_OF = { w3: ["Medical", "Surgery"], mat: ["Obstetrics"], peds: ["Paediatrics"], opd: ["Palliative care"] };
  /* nurses and midwives on each ward (sample), for "given by" on a late entry */
  P.NURSES = { w3: ["Nurse G. Apio", "Nurse T. Kato", "Nurse in-charge R. Achan"], mat: ["Midwife C. Auma", "Midwife B. Nalwoga", "Midwife in-charge J. Ayo"], peds: ["Nurse H. Nabirye", "Nurse F. Odongo", "Nurse in-charge M. Kyomugisha"], opd: ["Pharmacist (sample)", "Pharmacy technician (sample)"], store: ["Pharmacist (sample)", "In-charge pharmacist (sample)"] };
  const pad = (n) => String(n).padStart(2, "0");
  const toLocal = (ms) => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const staffWord = (st) => st.name + " (" + st.role + ")";
  /* a drop-down of staff allowed to prescribe this medicine, the place's own team first */
  const StaffSelect = ({ id, med, place, value, onChange }) => {
    const ok = P.STAFF.filter((x) => !x.only || x.only.includes(med)), mine = DEPT_OF[place] || [];
    const own = ok.filter((x) => mine.includes(x.dept)), rest = ok.filter((x) => !mine.includes(x.dept));
    const opt = (x) => html`<option key=${x.id} value=${x.id}>${x.name} · ${x.role}${mine.includes(x.dept) ? "" : " · " + x.dept}</option>`;
    return html`<select id=${id} className="input" value=${value || ""} onChange=${(e) => onChange(e.target.value || null)}>
      <option value="">Choose the prescriber</option>
      ${own.length ? html`<optgroup label=${P.place(place).short + " team"}>${own.map(opt)}</optgroup>` : null}
      <optgroup label="Other prescribers">${rest.map(opt)}</optgroup>
    </select>`;
  };
  const SKIP = ["confirm", "quarantine", "count"];
  const short = (id) => ({ morph: "Morphine inj", peth: "Pethidine inj", diaz: "Diazepam inj", omor: "Oral morphine" }[id] || P.med(id).name);
  const isCd = (id) => { const m = P.med(id); return !!(m && m.controlled); };
  P.CDS = () => P.MEDS.filter((m) => m.controlled);
  const balAt = (med, place, t) => P.db.moves.reduce((a, m) => (m.med === med && m.at <= t ? a + (m.to === place ? m.qty : 0) - (m.from === place ? m.qty : 0) : a), 0);
  P.balAt = balAt;
  const unitWord = (med, n) => { const m = P.med(med); return m.unit === "mL" ? n + " mL" : n + " " + (n === 1 ? m.unit.replace(/s$/, "") : m.unit); };
  const wl = (ms) => P.when(ms).replace(/^(Today|Yesterday)/, (x) => x.toLowerCase());
  const mgFmt = (x) => (Math.round(x * 10) / 10).toString();

  /* ── sample history: a week of entries, so the register has something to show ── */
  const seedCd = (db) => {
    const T = P.NOW0, d = (day, h, mi) => new Date(2026, 9, day, h, mi).getTime();
    db.moves.forEach((m) => { if (m.kind === "opening" && isCd(m.med)) { m.at = T - 7 * DAY; m.by = "Balance brought forward (sample)"; } });
    const W = (name, at) => ({ name, how: "phone", at });
    const add = (o) => { const mv = { id: "m" + db.seq++, ...o }; db.moves.push(mv); return mv; };
    const give = (at, med, place, qty, pt, bed, prescriber, dose, doseMg, residueMg, residueOk, by, wit) =>
      add({ at, kind: "administer", med, batch: med + "-1", from: place, to: "patient", qty, note: pt, by, witness: wit ? W(wit, at) : undefined, cd: { pt, bed, prescriber, dose, doseMg, residueMg, residueOk } });
    const N3 = "Nurse (sample), Ward 3", NM = "Midwife (sample), Maternity", NP = "Nurse (sample), Paediatrics";
    give(d(23, 21, 10), "morph", "w3", 1, "Sample patient 55 (discharged)", "Bed 2", "Dr A. Okello (Medical Officer)", "5 mg IV", 5, 5, true, N3, "Second nurse on shift");
    give(d(24, 3, 15), "morph", "w3", 1, "Sample patient 55 (discharged)", "Bed 2", "Dr A. Okello (Medical Officer)", "5 mg IV", 5, 5, true, N3, "Second nurse on shift");
    add({ at: d(25, 9, 0), kind: "issue", med: "morph", batch: "morph-1", from: "store", to: "w3", qty: 10, ref: "CD requisition", by: "Pharmacist (sample)", witness: W("In-charge pharmacist", d(25, 9, 0)) });
    give(d(26, 14, 0), "morph", "w3", 1, "Sample patient 57 (discharged)", "Bed 6", "Dr J. Mugisha (Surgeon)", "10 mg IM", 10, 0, true, N3, "Nurse in-charge");
    give(d(27, 9, 40), "morph", "w3", 1, "Sample patient 61", "Bed 4", "Dr A. Okello (Medical Officer)", "10 mg IM", 10, 0, true, N3, "Second nurse on shift");
    give(d(27, 22, 5), "morph", "w3", 1, "Sample patient 61", "Bed 4", "Dr A. Okello (Medical Officer)", "10 mg IM", 10, 0, true, N3, null);
    give(d(28, 1, 5), "morph", "w3", 1, "Sample patient 61", "Bed 4", "Dr A. Okello (Medical Officer)", "10 mg IM", 10, 0, true, N3, "Second nurse on shift");
    give(d(28, 14, 30), "morph", "w3", 1, "Sample patient 63", "Bed 12", "Dr A. Okello (Medical Officer)", "2.5 mg IV", 2.5, 7.5, false, N3, "Second nurse on shift");
    give(d(29, 1, 20), "morph", "w3", 1, "Sample patient 61", "Bed 4", "Dr A. Okello (Medical Officer)", "10 mg IM", 10, 0, true, N3, "Doctor on duty");
    give(d(29, 7, 25), "morph", "w3", 1, "Sample patient 63", "Bed 12", "Dr A. Okello (Medical Officer)", "5 mg IV", 5, 5, true, N3, "Nurse in-charge");
    give(d(28, 16, 45), "diaz", "w3", 1, "Sample patient 59 (transferred)", "Bed 6", "Dr A. Okello (Medical Officer)", "10 mg IV", 10, 0, true, N3, "Doctor on duty");
    give(d(26, 11, 0), "diaz", "peds", 1, "Sample patient 84 (discharged)", "Cot 3", "Dr K. Ssali (Paediatrician)", "5 mg rectal", 5, 5, true, NP, "Second nurse on shift");
    give(d(28, 4, 10), "diaz", "peds", 1, "Sample patient 81", "Cot 2", "Dr K. Ssali (Paediatrician)", "5 mg rectal", 5, 5, true, NP, "Doctor on duty");
    give(d(27, 23, 30), "peth", "mat", 1, "Sample patient 68 (delivered)", "Bed 4", "Dr P. Atim (Obstetrician)", "100 mg IM", 100, 0, true, NM, "Second nurse on shift");
    give(d(29, 3, 10), "peth", "mat", 1, "Sample patient 72", "Bed 3", "Dr P. Atim (Obstetrician)", "50 mg IM", 50, 50, true, NM, "Nurse in-charge");
    const home = (at, pt, prescriber, dose, qty, wit) => add({ at, kind: "handover", med: "omor", batch: "omor-1", from: "opd", to: "patient", qty, note: pt, by: "Pharmacist (sample)", witness: W(wit, at), cd: { pt, bed: "Palliative care clinic", prescriber, dose, home: true } });
    home(d(24, 11, 20), "Sample patient 90", "Dr E. Namata (Palliative Care Physician)", "5 mg every 4 h · 7 days", 210, "Second pharmacist");
    home(d(28, 15, 0), "Sample patient 92", "Dr E. Namata (Palliative Care Physician)", "2.5 mg every 4 h · 7 days", 105, "Pharmacy technician (on shift)");
    /* balance checks: counted against the register; Paediatrics came up one short */
    const chk = (at, place, by, wit, short) => {
      const lines = P.CDS().filter((m) => db.moves.some((x) => x.med === m.id && x.at <= at && (x.from === place || x.to === place))).map((m) => { const e = balAt(m.id, place, at); return { med: m.id, expected: e, counted: short && short[m.id] != null ? e + short[m.id] : e }; });
      (db.cdChecks = db.cdChecks || []).push({ id: "c" + db.seq++, at, place, by, witness: W(wit, at), lines, status: lines.every((l) => l.counted === l.expected) ? "ok" : "open" });
    };
    chk(d(26, 17, 0), "store", "In-charge pharmacist (sample)", "Second pharmacist");
    chk(d(27, 8, 0), "w3", N3, "Nurse in-charge");
    chk(d(28, 8, 0), "peds", NP, "Nurse in-charge", { diaz: -1 });
    chk(d(29, 7, 0), "mat", NM, "Second nurse on shift");
    chk(d(29, 8, 0), "opd", "Pharmacist (sample)", "Pharmacy technician (on shift)");
    db.cdDone = db.cdDone || {};
    db.cdSeeded = 3;
  };
  const RX_NAMES = { "Dr (sample), Medical": "Dr A. Okello (Medical Officer)", "Dr (sample), Surgery": "Dr J. Mugisha (Surgeon)", "Dr (sample), Paediatrics": "Dr K. Ssali (Paediatrician)", "Dr (sample), Obstetrics": "Dr P. Atim (Obstetrician)", "Palliative care team (sample)": "Dr E. Namata (Palliative Care Physician)" };
  if (P.db.cdSeeded === 2) { P.db.moves.forEach((m) => { if (m.cd && RX_NAMES[m.cd.prescriber]) m.cd.prescriber = RX_NAMES[m.cd.prescriber]; }); P.db.cdSeeded = 3; P.commit(); }
  else if (P.db.cdSeeded !== 3) { seedCd(P.db); P.commit(); }
  /* sample witnesses were recorded by role; name the person who held that role on that shift (idempotent) */
  const nameWitnesses = (db) => {
    let n = 0;
    const fix = (w, place, at) => {
      if (!w || w.role || w.how === "paper") return;
      const ro = (P.ROSTER[place] || {})[w.name] || P.ROSTER.pharmacy[w.name]; if (!ro) return;
      const h = new Date(w.at || at).getHours(), sh = h >= 8 && h < 17 ? "day" : "night";
      const p = ro.find((x) => x.shift === sh) || ro.find((x) => x.shift === "call") || ro[0];
      w.role = w.name; w.name = p.name; n++;
    };
    db.moves.forEach((m) => fix(m.witness, P.ROSTER[m.from] ? m.from : P.ROSTER[m.to] ? m.to : "pharmacy", m.at));
    (db.cdChecks || []).forEach((c) => fix(c.witness, c.place, c.at));
    return n;
  };
  if (nameWitnesses(P.db)) P.commit();
  const reset0 = P.reset;
  P.reset = () => { reset0(); seedCd(P.db); nameWitnesses(P.db); P.commit(); };

  /* ── registers, checks and flags ── */
  P.cdRegisters = () => {
    const out = [];
    P.CDS().forEach((m) => P.REAL.forEach((p) => { if (P.db.moves.some((x) => x.med === m.id && (x.from === p || x.to === p))) out.push({ med: m.id, place: p, bal: P.medAt(m.id, p) }); }));
    return out;
  };
  /* a shift handover that counted the controlled drugs counts as a check */
  const lastCheck = (place) => (P.db.cdChecks || []).filter((c) => c.place === place)
    .concat((P.db.handovers || []).filter((h) => h.place === place && h.lines.some((l) => P.med(l.med).controlled)).map((h) => ({ at: h.at, by: h.from.name, witness: { name: h.to.name }, ho: true })))
    .sort((a, b) => b.at - a.at)[0];
  const checkDue = (place) => { const c = lastCheck(place), every = CHECK_EVERY[P.place(place).kind] || DAY; return !c || P.now() - c.at > every; };
  const cdPlaces = () => [...new Set(P.cdRegisters().map((r) => r.place))];
  const ptOf = (m) => (m.cd && m.cd.pt) || m.note;
  const verb = (m) => (m.kind === "administer" ? "given to " + ptOf(m) : m.kind === "handover" ? "handed to " + ptOf(m) : (P.KIND[m.kind] || m.kind).toLowerCase() + " " + (P.REAL.includes(m.from) ? P.place(m.from).short + " → " + P.placeName(m.to) : "into " + P.placeName(m.to)));

  P.cdFlags = () => {
    const db = P.db, done = db.cdDone || {}, f = [], real = new Set(P.REAL);
    db.moves.filter((m) => isCd(m.med) && m.kind !== "opening" && !SKIP.includes(m.kind) && (real.has(m.from) || real.has(m.to))).forEach((m) => {
      const place = real.has(m.from) ? m.from : m.to;
      if (!m.witness) f.push({ k: "wit", id: "w" + m.id, mv: m, place, med: m.med, title: "No witness: " + short(m.med) + " " + verb(m), meta: P.place(place).short + " · " + P.when(m.at) + " · entered by " + m.by, act: "Add the witness" });
      if (m.cd && m.cd.residueMg > 0 && !m.cd.residueOk) f.push({ k: "res", id: "r" + m.id, mv: m, place, med: m.med, title: "Residue not recorded: " + mgFmt(m.cd.residueMg) + " mg " + short(m.med) + " left after " + m.cd.dose, meta: P.place(place).short + " · " + ptOf(m) + " · " + P.when(m.at), act: "Record the disposal" });
    });
    const last = {};
    db.moves.filter((m) => isCd(m.med) && m.cd && m.cd.pt && !m.cd.home && P.CD_GAP[m.med]).sort((a, b) => a.at - b.at).forEach((m) => {
      const key = m.med + "|" + m.cd.pt, prev = last[key], gap = P.CD_GAP[m.med];
      if (prev && m.at - prev.at < gap * HOUR && !done["p" + m.id]) { const h = (m.at - prev.at) / HOUR; f.push({ k: "gap", id: "p" + m.id, mv: m, prev, place: m.from, med: m.med, title: short(m.med) + " given " + (h < 1 ? Math.round(h * 60) + " min" : Math.floor(h) + " h " + Math.round((h % 1) * 60) + " min") + " after the last dose", meta: m.cd.pt + " · " + P.place(m.from).short + " · usual gap at least " + gap + " h · " + P.when(m.at), act: "Review" }); }
      last[key] = m;
    });
    (db.cdChecks || []).filter((c) => c.status === "open").forEach((c) => c.lines.filter((l) => l.counted !== l.expected).forEach((l) => f.push({ k: "disc", id: "d" + c.id + l.med, check: c, line: l, place: c.place, med: l.med, title: short(l.med) + " at " + P.place(c.place).short + ": counted " + l.counted + ", register says " + l.expected, meta: (l.counted < l.expected ? unitWord(l.med, l.expected - l.counted) + " unaccounted for" : unitWord(l.med, l.counted - l.expected) + " more than the register") + " · counted " + wl(c.at) + " by " + c.by + (P.caseWord ? P.caseWord("cd:" + c.id + ":" + l.med) : ""), act: "Resolve" })));
    cdPlaces().filter(checkDue).forEach((p) => { const c = lastCheck(p); f.push({ k: "due", id: "c" + p, place: p, title: "Balance check due: " + P.place(p).name, meta: (c ? "Last checked " + wl(c.at) : "Never checked") + " · " + (P.place(p).kind === "store" ? "weekly" : "every day") + " with a witness", act: "Check now" }); });
    db.paperWitness.filter((p) => !p.checked).forEach((p) => f.push({ k: "paper", id: "pw" + p.id, title: "Witnessed on paper: " + p.what, meta: "Witness \"" + p.name + "\" · " + P.when(p.at) + " · the in-charge checks it against the paper register", act: "Check" }));
    return f;
  };
  const ORDER = ["disc", "wit", "res", "gap", "due", "paper"];
  const KWORD = { disc: ["count not matching", "counts not matching"], wit: ["without a witness", "without a witness"], res: ["residue not recorded", "residues not recorded"], gap: ["dose sooner than usual", "doses sooner than usual"], due: ["check due", "checks due"], paper: ["paper witness", "paper witnesses"] };
  P.cdSummary = () => { const f = P.cdFlags(), by = {}; f.forEach((x) => { by[x.k] = (by[x.k] || 0) + 1; }); return { n: f.length, words: ORDER.filter((k) => by[k]).map((k) => by[k] + " " + KWORD[k][by[k] === 1 ? 0 : 1]).join(" · ") }; };

  /* ── record a dose given on a ward, or oral morphine handed to a patient to take home ── */
  const DoseDialog = ({ med, place, onClose }) => {
    const db = P.useDb();
    const m = P.med(med), u = P.CDU[med] || { mg: 1, ml: 1, per: m.unit, step: 1 }, ward = P.place(place).kind === "ward", liquid = !!u.liquid;
    const pts = (P.INPATIENTS || []).filter((p) => p.ward === place);
    const [ptId, setPtId] = useState(null);
    const [ptText, setPtText] = useState("");
    const [rxBy, setRxBy] = useState(null);
    const prescriber = rxBy ? staffWord(P.STAFF.find((x) => x.id === rxBy)) : "";
    const pickPt = (p) => { setPtId(p.id); setPtText(""); if (!rxBy) { const dep = (p.by || "").split(", ").pop(), st = P.STAFF.find((x) => x.dept === dep && (!x.only || x.only.includes(med))); if (st) setRxBy(st.id); } };
    const [dose, setDose] = useState(null);
    const [route, setRoute] = useState(m.routes[0]);
    const [every, setEvery] = useState(4);
    const [days, setDays] = useState(7);
    const [resOk, setResOk] = useState(false);
    const [wit, setWit] = useState(false);
    const pt = ptId ? pts.find((p) => p.id === ptId) : null, ptName = pt ? pt.name : ptText.trim();
    const have = P.medAt(med, place);
    const units = !dose ? 0 : liquid ? Math.round((dose / u.mg) * (24 / every) * days) : Math.ceil(dose / u.mg);
    const residueMg = liquid || !dose ? 0 : units * u.mg - dose;
    const prev = ptName ? db.moves.filter((x) => x.med === med && x.cd && x.cd.pt === ptName).sort((a, b) => b.at - a.at)[0] : null;
    const gap = P.CD_GAP[med], soon = !liquid && prev && gap && P.now() - prev.at < gap * HOUR;
    const ok = ptName.length > 2 && !!rxBy && dose > 0 && units > 0 && units <= have;
    const doseWord = liquid ? mgFmt(dose) + " mg every " + every + " h · " + days + " days" : mgFmt(dose) + " mg " + route;
    const save = (w) => {
      P.allocate(med, place, units).parts.forEach((x) => P.move({ kind: liquid ? "handover" : "administer", med, batch: x.batch, from: place, to: "patient", qty: x.qty, note: ptName, witness: w,
        cd: { pt: ptName, bed: pt ? pt.bed : liquid ? "Take-home" : "", prescriber: prescriber.trim(), dose: doseWord, doseMg: dose, residueMg, residueOk: residueMg > 0 ? resOk : true, home: liquid || undefined } }));
      P.commit(); P.toast(short(med) + ": " + (liquid ? units + " mL handed to " : doseWord + " given to ") + ptName + ", witnessed by " + w.name, "lock"); onClose();
    };
    if (wit) return html`<${P.WitnessDialog} title="Second signature" what=${short(med) + " · " + doseWord + " · " + ptName + " · " + unitWord(med, units) + " from the " + P.place(place).short + " register" + (residueMg ? " · " + mgFmt(residueMg) + " mg discarded" : "")}
      place=${place} list=${ward ? WARD_WIT : P.WITNESSES} hint=${ward ? "The witness watches the dose drawn up" + (residueMg ? " and the residue discarded" : "") + ", then approves on their own phone." : "The witness checks the prescription, the measured amount and the patient, then approves on their own phone."}
      onClose=${() => setWit(false)} onDone=${(w) => { setWit(false); save(w); }} />`;
    return html`<${P.Dialog} title=${(liquid ? "Hand over " : "Record a dose: ") + m.name} sub=${P.place(place).name + " · " + unitWord(med, have) + " in the register"} onClose=${onClose}
      foot=${html`<span className="grow muted small">${units ? (liquid ? units + " mL" : unitWord(med, units)) + " out of the register · " : ""}You sign first, then a witness.</span><${P.Btn} kind="primary" icon="lock" disabled=${!ok} onClick=${() => setWit(true)}>Sign and ask a witness<//>`}>
      <div className="stack-s"><span className="lbl">Patient</span>
        ${pts.length ? html`<div className="chips">${pts.map((p) => html`<${P.Chip} key=${p.id} size="sm" on=${ptId === p.id} onClick=${() => pickPt(p)}>${p.bed} · ${p.name}<//>`)}</div>` : null}
        <input className="input" placeholder=${pts.length ? "Or type another patient's name and number" : "Patient's name and number"} value=${ptText} onChange=${(e) => { setPtText(e.target.value); setPtId(null); }} /></div>
      <div className="field"><label htmlFor="cdrx">Prescriber</label><${StaffSelect} id="cdrx" med=${med} place=${place} value=${rxBy} onChange=${setRxBy} />
        <span className="hint">Only staff allowed to prescribe controlled drugs are listed. Choosing a patient fills in their admitting team's doctor; change it if someone else wrote the order.</span></div>
      <div className="cd-dose">
        <div className="stack-s"><span className="lbl">Dose</span><${P.Stepper} value=${dose} onChange=${setDose} step=${u.step} unit="mg" label="dose in mg" /></div>
        ${liquid ? html`<div className="stack-s"><span className="lbl">Every</span><div className="chips">${[4, 6, 12].map((h) => html`<${P.Chip} key=${h} size="sm" on=${every === h} onClick=${() => setEvery(h)}>${h} h<//>`)}</div></div>
          <div className="stack-s"><span className="lbl">For</span><div className="chips">${[3, 7, 14].map((x) => html`<${P.Chip} key=${x} size="sm" on=${days === x} onClick=${() => setDays(x)}>${x} days<//>`)}</div></div>`
        : html`<div className="stack-s"><span className="lbl">Route</span><div className="chips">${m.routes.map((r) => html`<${P.Chip} key=${r} size="sm" on=${route === r} onClick=${() => setRoute(r)}>${r}<//>`)}</div></div>`}
      </div>
      ${dose ? html`<div className="cd-calc">
        ${liquid ? html`<span><b>${units} mL</b> of ${u.mg} mg/mL: ${mgFmt(dose)} mg × ${24 / every} a day × ${days} days</span>`
          : html`<span><b>${unitWord(med, units)}</b> of ${u.mg} mg in ${u.ml} mL</span>${residueMg ? html`<span><b>${mgFmt(residueMg)} mg (${mgFmt((residueMg / u.mg) * u.ml)} mL)</b> left to discard</span>` : html`<span>Nothing left over</span>`}`}
        ${units > have ? html`<span className="err">Only ${unitWord(med, have)} in this register</span>` : null}
      </div>` : null}
      ${residueMg > 0 ? html`<label className="cd-tick"><input type="checkbox" checked=${resOk} onChange=${(e) => setResOk(e.target.checked)} /><span>The ${mgFmt(residueMg)} mg left in the ampoule was discarded in front of the witness</span></label>` : null}
      ${soon ? html`<div className="note warn"><${P.Icon} n="alert" /><span>The last dose for ${ptName} was ${P.ago(prev.at)} ago (${P.time(prev.at)}, ${prev.cd.dose}). The usual gap is at least ${gap} h: check the chart and the prescriber before giving. If you go ahead it is flagged for review.</span></div>` : null}
      <p className="hint">${m.dose ? "Usual dose: " + (m.dose.adult || "") : ""}</p>
    <//>`;
  };

  /* ── balance check: a blind count, then compare, then a second signature ── */
  const CheckDialog = ({ place, onClose }) => {
    P.useDb();
    const lines = P.cdRegisters().filter((r) => r.place === place);
    const [n, setN] = useState({});
    const [shown, setShown] = useState(false);
    const [wit, setWit] = useState(false);
    const all = lines.every((l) => n[l.med] != null);
    const diffs = lines.filter((l) => n[l.med] !== l.bal);
    const save = (w) => {
      const c = { id: "c" + P.db.seq++, at: P.now(), place, by: P.who(), witness: w, lines: lines.map((l) => ({ med: l.med, expected: l.bal, counted: n[l.med] })), status: diffs.length ? "open" : "ok" };
      (P.db.cdChecks = P.db.cdChecks || []).push(c); P.commit();
      P.toast(diffs.length ? "Check saved: " + diffs.length + " not matching, now flagged for the in-charge" : "Check saved: everything matches the register", diffs.length ? "alert" : "check"); onClose();
    };
    if (wit) return html`<${P.WitnessDialog} title="Second signature for the check" what=${"Balance check · " + P.place(place).name + " · " + lines.map((l) => short(l.med) + " " + n[l.med]).join(", ")} place=${place} list=${P.place(place).kind === "ward" ? WARD_WIT : P.WITNESSES}
      hint="The witness counts with you and approves on their own phone." onClose=${() => setWit(false)} onDone=${(w) => { setWit(false); save(w); }} />`;
    return html`<${P.Dialog} title=${"Balance check · " + P.place(place).name} sub="Count what is physically there first. The register's figure shows only after you have counted." onClose=${onClose}
      foot=${shown ? html`<span className="grow muted small">${diffs.length ? diffs.length + " not matching: saving flags them for the in-charge to resolve." : "All match."}</span><${P.Btn} kind="primary" icon="lock" onClick=${() => setWit(true)}>Sign and ask a witness<//>`
        : html`<span className="grow muted small">Open ampoules count as used only if they are recorded.</span><${P.Btn} kind="navy" disabled=${!all} onClick=${() => setShown(true)}>Compare with the register<//>`}>
      <div className="cd-count">${lines.map((l) => html`<div className="cd-crow" key=${l.med}>
        <div className="grow"><b>${P.med(l.med).name}</b><div className="muted small">${P.med(l.med).shelf && P.med(l.med).shelf[place] ? P.med(l.med).shelf[place] + " · " : ""}in ${P.med(l.med).unit}</div></div>
        <${P.Stepper} value=${n[l.med]} onChange=${(v) => { setN({ ...n, [l.med]: v }); setShown(false); }} step=${P.med(l.med).unit === "mL" ? 5 : 1} unit=${P.med(l.med).unit} label=${"count of " + P.med(l.med).name} />
        <span className=${P.cx("cd-reg", shown && (n[l.med] === l.bal ? "ok" : "bad"))}>${shown ? (n[l.med] === l.bal ? "Matches" : "Register " + l.bal) : "Register hidden"}</span></div>`)}</div>
    <//>`;
  };

  /* ── resolve a count that doesn't match ── */
  const ResolveDialog = ({ fl, onClose }) => {
    const db = P.useDb();
    const { check: c, line: l } = fl, diff = l.counted - l.expected, incharge = db.settings.role === "incharge";
    const m = P.med(l.med), u = P.CDU[l.med] || { mg: 1, ml: 1, step: 1 };
    const [how, setHow] = useState(null);
    const [pt, setPt] = useState("");
    const [ptKey, setPtKey] = useState(null);
    const [ref, setRef] = useState("");
    const [note, setNote] = useState("");
    const [rxBy, setRxBy] = useState(null);
    const [dose, setDose] = useState(null);
    const [route, setRoute] = useState(m.routes[0]);
    const [resOk, setResOk] = useState(false);
    const [givenBy, setGivenBy] = useState("");
    const [wit, setWit] = useState(false);
    /* the window it went missing in: from the last count that matched to this one */
    const prevOk = (db.cdChecks || []).filter((x) => x.place === c.place && x.at < c.at && x.lines.some((y) => y.med === l.med && y.counted === y.expected)).sort((a, b) => b.at - a.at)[0];
    const from = prevOk ? prevOk.at : Math.min(...db.moves.filter((x) => x.med === l.med && (x.to === c.place || x.from === c.place)).map((x) => x.at));
    const [when, setWhen] = useState("");
    const whenMs = when ? new Date(when).getTime() : null, inWin = whenMs && whenMs > from && whenMs < c.at;
    /* who it is likely to have been: patients on the ward now, and patients who had this medicine here around then */
    const onWard = (P.INPATIENTS || []).filter((p) => p.ward === c.place).map((p) => ({ key: "i" + p.id, name: p.name, bed: p.bed, why: "on the ward now", by: p.by }));
    const hadIt = [];
    db.moves.filter((x) => x.med === l.med && x.from === c.place && x.cd && x.cd.pt && x.at > from - 2 * DAY && x.at < c.at + DAY).sort((a, b) => b.at - a.at)
      .forEach((x) => { if (!hadIt.some((h) => h.name === x.cd.pt)) hadIt.push({ key: "r" + x.id, name: x.cd.pt, bed: x.cd.bed, why: "had " + short(l.med).toLowerCase() + " here " + wl(x.at) + " (" + x.cd.dose + ")", rx: x.cd.prescriber }); });
    const cands = hadIt.concat(onWard.filter((o) => !hadIt.some((h) => h.name === o.name)));
    const pick = (cd) => {
      setPtKey(cd.key); setPt(cd.name);
      const st = cd.rx ? P.STAFF.find((x) => staffWord(x) === cd.rx) : P.STAFF.find((x) => x.dept === (cd.by || "").split(", ").pop() && (!x.only || x.only.includes(l.med)));
      if (st) setRxBy(st.id);
    };
    const units = dose ? Math.ceil(dose / u.mg) : 0, residueMg = dose ? units * u.mg - dose : 0;
    const okMissed = pt.trim().length > 2 && !!rxBy && dose > 0 && units === -diff && inWin && !!givenBy;
    const ok = how === "recount" ? true : how === "missed" ? okMissed && diff < 0 : how === "loss" ? incharge && ref.trim().length > 2 : false;
    const done = (w) => {
      if (how === "missed") P.allocate(l.med, c.place, -diff).parts.forEach((x) => P.move({ kind: "administer", med: l.med, batch: x.batch, from: c.place, to: "patient", qty: x.qty, note: pt.trim(), witness: w, late: true, at: whenMs, entered: P.now(), enteredBy: P.who(), by: givenBy,
        cd: { pt: pt.trim(), bed: (cands.find((cd) => cd.key === ptKey) || {}).bed || "", prescriber: staffWord(P.STAFF.find((x) => x.id === rxBy)), dose: mgFmt(dose) + " mg " + route, doseMg: dose, residueMg, residueOk: residueMg > 0 ? resOk : true, late: true } }));
      if (how === "loss") { if (diff < 0) P.allocate(l.med, c.place, -diff).parts.forEach((x) => P.move({ kind: "count", med: l.med, batch: x.batch, from: c.place, to: "loss", qty: x.qty, note: "Confirmed controlled-drug loss · incident " + ref.trim(), witness: w }));
        else P.move({ kind: "count", med: l.med, batch: l.med + "-1", from: "found", to: c.place, qty: diff, note: "Confirmed excess · incident " + ref.trim(), witness: w }); }
      c.resolved = c.resolved || {}; c.resolved[l.med] = { how, note: note.trim(), ref: ref.trim(), pt: pt.trim(), by: P.who(), witness: w, at: P.now() };
      if (c.lines.every((x) => x.counted === x.expected || c.resolved[x.med])) c.status = "resolved";
      P.commit(); P.toast("Resolved: " + short(l.med) + " at " + P.place(c.place).short, "check"); onClose();
    };
    if (wit) return html`<${P.WitnessDialog} title="Second signature" what=${"Resolving " + short(l.med) + " at " + P.place(c.place).short + ": " + { recount: "recounted, matches", missed: "late entry · " + mgFmt(dose || 0) + " mg " + route + " to " + pt + " at " + (whenMs ? P.when(whenMs) : "") + " · given by " + givenBy, loss: "confirmed " + (diff < 0 ? "loss" : "excess") + " · " + ref }[how]}
      place=${c.place} list=${how === "missed" && P.place(c.place).kind === "ward" ? WARD_WIT : P.WITNESSES} onClose=${() => setWit(false)} onDone=${(w) => { setWit(false); done(w); }} />`;
    return html`<${P.Dialog} title=${"Resolve: " + short(l.med) + " at " + P.place(c.place).short} sub=${"Counted " + l.counted + ", register " + l.expected + " · " + P.when(c.at) + " by " + c.by} onClose=${onClose}
      foot=${html`${how === "missed" && !okMissed ? html`<span className="grow muted small">${!pt ? "Choose the patient" : !rxBy ? "Choose the prescriber" : !dose ? "Enter the dose" : units !== -diff ? "That dose uses " + unitWord(l.med, units) + "; " + unitWord(l.med, -diff) + " are missing" : !inWin ? "Set when it was given, inside the window" : "Choose who gave it"}</span>` : null}<${P.Btn} kind="primary" icon="lock" disabled=${!ok} onClick=${() => setWit(true)}>Sign and ask a witness<//>`}>
      <div className="stack-s"><span className="lbl">What was found</span>
        <div className="chips"><${P.Chip} on=${how === "recount"} onClick=${() => setHow("recount")}>Recounted: it matches<//>${diff < 0 ? html`<${P.Chip} on=${how === "missed"} onClick=${() => setHow("missed")}>A dose was given but not entered<//>` : null}<${P.Chip} on=${how === "loss"} onClick=${() => setHow("loss")}>Confirmed ${diff < 0 ? "loss" : "excess"}<//></div></div>
      ${how === "missed" ? html`
        <div className="cd-win"><${P.Icon} n="clock" s=${16} /><span>${unitWord(l.med, -diff)} went missing between <b>${P.when(from)}</b> (${prevOk ? "last count that matched" : "first entry"}) and <b>${P.when(c.at)}</b> (this count). Look for the dose on the charts of patients here in that window.</span></div>
        <div className="stack-s"><span className="lbl">Patient, from the chart</span>
          ${cands.length ? html`<div className="cd-pts">${cands.map((cd) => html`<button type="button" key=${cd.key} className=${P.cx("cd-pt", ptKey === cd.key && "on")} aria-pressed=${ptKey === cd.key ? "true" : "false"} onClick=${() => pick(cd)}>
            <b>${cd.name}</b><span>${cd.bed ? cd.bed + " · " : ""}${cd.why}</span></button>`)}</div>` : null}
          <input id="rpt" className="input" placeholder="Not listed? Type the patient's name and IP number" value=${ptKey ? "" : pt} onChange=${(e) => { setPt(e.target.value); setPtKey(null); }} /></div>
        <div className="cd-grid2">
          <div className="field"><label htmlFor="rrx">Prescriber</label><${StaffSelect} id="rrx" med=${l.med} place=${c.place} value=${rxBy} onChange=${setRxBy} /></div>
          <div className="field"><label htmlFor="rgb">Given by</label><select id="rgb" className="input" value=${givenBy} onChange=${(e) => setGivenBy(e.target.value)}><option value="">Who gave it</option>${(P.NURSES[c.place] || []).map((n) => html`<option key=${n} value=${n}>${n}</option>`)}</select></div>
        </div>
        <div className="cd-dose">
          <div className="stack-s"><span className="lbl">Dose on the chart</span><${P.Stepper} value=${dose} onChange=${setDose} step=${u.step} unit="mg" label="dose in mg" /></div>
          <div className="stack-s"><span className="lbl">Route</span><div className="chips">${m.routes.map((r) => html`<${P.Chip} key=${r} size="sm" on=${route === r} onClick=${() => setRoute(r)}>${r}<//>`)}</div></div>
          <div className="field" style=${{ minWidth: "200px" }}><label htmlFor="rwhen">When it was given</label><input id="rwhen" type="datetime-local" className="input" min=${toLocal(from)} max=${toLocal(c.at)} value=${when} onChange=${(e) => setWhen(e.target.value)} /></div>
        </div>
        ${dose ? html`<div className="cd-calc"><span><b>${unitWord(l.med, units)}</b> of ${u.mg} mg in ${u.ml} mL${units === -diff ? " · accounts for the shortfall" : ""}</span>${residueMg ? html`<span><b>${mgFmt(residueMg)} mg</b> would have been left to discard</span>` : null}
          ${units !== -diff ? html`<span className="err">${unitWord(l.med, -diff)} missing, this dose uses ${unitWord(l.med, units)}</span>` : null}${when && !inWin ? html`<span className="err">Outside the window</span>` : null}</div>` : null}
        ${residueMg > 0 ? html`<label className="cd-tick"><input type="checkbox" checked=${resOk} onChange=${(e) => setResOk(e.target.checked)} /><span>The chart or the nurse confirms the ${mgFmt(residueMg)} mg left over was discarded</span></label>` : null}
        <p className="hint">Saved at the time it was given, marked "late entry" in the register for good, with who entered it and when. The person who gave it is named on the line; the witness signs now.</p>` : null}
      ${how === "loss" ? html`${incharge ? null : html`<div className="note warn"><${P.Icon} n="lock" /><span>Only the in-charge pharmacist can sign a loss. Switch to the in-charge (top banner, "try things") to finish this.</span></div>`}
        <div className="field"><label htmlFor="rref">Incident report number</label><input id="rref" className="input" placeholder="e.g. IR-2026-041" value=${ref} onChange=${(e) => setRef(e.target.value)} /></div>
        <div className="field"><label htmlFor="rn2">What happened</label><input id="rn2" className="input" value=${note} onChange=${(e) => setNote(e.target.value)} /></div>
        <p className="hint">The register is adjusted with the incident number on the line. A controlled-drug loss is reported to the medical superintendent and to the National Drug Authority.</p>` : null}
      ${how === "recount" ? html`<div className="field"><label htmlFor="rn3">Note (optional)</label><input id="rn3" className="input" placeholder="e.g. one ampoule was in the emergency tray" value=${note} onChange=${(e) => setNote(e.target.value)} /></div>` : null}
    <//>`;
  };

  /* ── reviewing a dose given sooner than usual ── */
  const GapDialog = ({ fl, onClose }) => {
    const db = P.useDb();
    const [why, setWhy] = useState(null);
    const save = () => { db.cdDone = db.cdDone || {}; db.cdDone[fl.id] = { why, by: P.who(), at: P.now() }; P.commit(); P.toast("Reviewed: " + why.toLowerCase()); onClose(); };
    return html`<${P.Dialog} title="Dose sooner than usual" sub=${fl.title + " · " + fl.meta} onClose=${onClose} foot=${html`<${P.Btn} kind="primary" disabled=${!why} onClick=${save}>Save the review<//>`}>
      <div className="cd-pair"><div><span className="lbl">Before</span><b>${P.when(fl.prev.at)}</b><span className="muted small">${fl.prev.cd.dose} · ${fl.prev.witness ? "witness " + fl.prev.witness.name : "no witness"}</span></div>
        <div><span className="lbl">This dose</span><b>${P.when(fl.mv.at)}</b><span className="muted small">${fl.mv.cd.dose} · ${fl.mv.witness ? "witness " + fl.mv.witness.name : "no witness"}</span></div></div>
      <div className="stack-s"><span className="lbl">After checking the chart with the prescriber</span>
        <div className="chips">${["Prescribed as needed (breakthrough pain)", "Prescriber approved the extra dose", "Not prescribed: incident reported"].map((w) => html`<${P.Chip} key=${w} on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div></div>
    <//>`;
  };

  /* ── one register, as the bound book reads ── */
  const Register = ({ med, place, onDose, onCheck }) => {
    const db = P.useDb();
    const m = P.med(med), flags = P.cdFlags().filter((f) => f.mv && f.med === med && f.place === place);
    const fl = {}; flags.forEach((f) => { (fl[f.mv.id] = fl[f.mv.id] || []).push(f); });
    let bal = 0, no = 0;
    const rows = db.moves.filter((x) => x.med === med && (x.from === place || x.to === place)).sort((a, b) => a.at - b.at).map((x) => {
      const inn = x.to === place ? x.qty : 0, out = x.from === place ? x.qty : 0; bal += inn - out; no++;
      return { t: "mv", at: x.at, x, inn, out, bal, no };
    });
    (db.cdChecks || []).filter((c) => c.place === place).forEach((c) => { const l = c.lines.find((y) => y.med === med); if (l) rows.push({ t: "chk", at: c.at + 1, c, l }); });
    rows.sort((a, b) => b.at - a.at);
    const ward = P.place(place).kind === "ward", canGive = ward || (P.CDU[med] && P.CDU[med].liquid && place === "opd");
    return html`<div className="card">
      <div className="dash-h" style=${{ padding: "14px 16px 6px" }}><div><h3>${m.name} · ${P.place(place).name}</h3><div className="muted small">${m.strength || ""} · balance <b>${unitWord(med, P.medAt(med, place))}</b>${flags.length ? " · " + flags.length + " to fix" : ""}</div></div><span className="grow"></span>
        ${canGive ? html`<${P.Btn} size="sm" kind="primary" icon="plus" onClick=${onDose}>${ward ? "Record a dose given" : "Hand over to a patient"}<//>` : null}
        <${P.Btn} size="sm" icon="clip" onClick=${onCheck}>Balance check<//>
        <${P.Btn} size="sm" kind="ghost" icon="printer" onClick=${() => P.toast("Register page for " + short(med) + " at " + P.place(place).short + " sent to the printer (prototype)", "printer")}>Print<//></div>
      <div className="tblwrap"><table className="tbl dense cd-tbl">
        <thead><tr><th className="r">No.</th><th>Date</th><th>Patient, or from / to</th><th>Prescriber</th><th>Dose · residue</th><th className="r">In</th><th className="r">Out</th><th className="r">Balance</th><th>Signed</th><th>Witness</th></tr></thead>
        <tbody>${rows.map((r) => r.t === "chk" ? html`<tr key=${"c" + r.c.id} className="cd-chk"><td></td><td className="num">${P.when(r.c.at)}</td>
            <td colSpan="5"><b>Balance check:</b> counted ${r.l.counted} · register ${r.l.expected} · ${r.l.counted === r.l.expected ? html`<span className="okc">matches</span>` : r.c.resolved && r.c.resolved[med] ? html`<span>resolved: ${{ recount: "recounted, matches", missed: "late entry found", loss: "confirmed loss" }[r.c.resolved[med].how]}</span>` : html`<span className="bad">${r.l.counted - r.l.expected} · open</span>`}</td>
            <td></td><td className="small">${r.c.by}</td><td className="small">${r.c.witness ? r.c.witness.name : "—"}</td></tr>`
          : html`<tr key=${r.x.id} className=${P.cx(fl[r.x.id] && "cd-flag", r.x.reversedBy && "au-rev")}><td className="r num muted">${r.no}</td><td className="num">${P.when(r.x.at)}</td>
            <td>${r.x.kind === "opening" ? html`<span className="muted">Balance brought forward</span>` : r.x.cd ? html`<b>${r.x.cd.pt}</b>${r.x.cd.bed ? html`<span className="muted"> · ${r.x.cd.bed}</span>` : null}${r.x.cd.late ? html` <span className="ctag bad">late entry</span>` : null}` : html`<span>${P.KIND[r.x.kind] || r.x.kind}: ${r.inn ? "from " + P.placeName(r.x.from) : "to " + P.placeName(r.x.to)}</span>${r.x.note ? html`<div className="dn-sub">${r.x.note}</div>` : null}`}</td>
            <td className="small">${r.x.cd ? r.x.cd.prescriber : r.x.ref || "—"}</td>
            <td className="small">${r.x.cd ? html`${r.x.cd.dose}${r.x.cd.residueMg > 0 ? html`<div className=${r.x.cd.residueOk ? "dn-sub" : "bad"}>${mgFmt(r.x.cd.residueMg)} mg ${r.x.cd.residueOk ? "discarded, witnessed" + (r.x.cd.residueLate ? " (recorded late)" : "") : "residue not recorded"}</div>` : null}` : "—"}</td>
            <td className="r num">${r.inn || ""}</td><td className="r num">${r.out || ""}</td><td className="r num strong">${r.bal}</td>
            <td className="small">${r.x.by}${r.x.entered ? html`<div className="dn-sub">entered ${wl(r.x.entered)} by ${r.x.enteredBy}</div>` : null}</td>
            <td className="small">${r.x.kind === "opening" ? "—" : r.x.witness ? html`${r.x.witness.name}${r.x.witness.how === "paper" ? " (paper)" : ""}${r.x.witness.late ? html` <span className="ctag">added late</span>` : null}${r.x.witness.role && r.x.witness.role !== r.x.witness.name ? html`<div className="dn-sub">${r.x.witness.role}</div>` : null}` : html`<span className="bad">None</span>`}
              ${fl[r.x.id] ? fl[r.x.id].filter((f) => f.k === "gap").map((f) => html`<div key=${f.id} className="bad">Sooner than ${P.CD_GAP[med]} h</div>`) : null}</td></tr>`)}</tbody></table></div>
    </div>`;
  };

  const RegCard = ({ r, on, onPick }) => {
    const c = lastCheck(r.place), due = checkDue(r.place), n = P.cdFlags().filter((f) => f.med === r.med && f.place === r.place && f.k !== "due").length;
    return html`<button type="button" className=${P.cx("cd-card", on && "on")} aria-pressed=${on ? "true" : "false"} onClick=${onPick}>
      <div><div className="strong">${short(r.med)}</div><div className="muted small">${P.place(r.place).short}</div></div>
      <div className="cd-bal"><b>${r.bal}</b><span>${P.med(r.med).unit}</span></div>
      <div className="row"><span className=${P.cx("small", due ? "bad" : "muted")}>${c ? "Checked " + wl(c.at) : "Never checked"}</span>${n ? html`<span className="vx-st overdue">${n} to fix</span>` : null}</div>
    </button>`;
  };

  const FlagRow = ({ f, onAct }) => html`<div className="cd-frow">
    <span className=${P.cx("cd-fk", f.k)}>${{ disc: "Count", wit: "Witness", res: "Residue", gap: "Timing", due: "Check", paper: "Paper" }[f.k]}</span>
    <div className="grow"><b>${f.title}</b><div className="muted small">${f.meta}</div></div>
    <${P.Btn} size="sm" kind=${f.k === "disc" ? "primary" : "outline"} onClick=${() => onAct(f)}>${f.act}<//></div>`;

  /* paper witness entries from a network cut (moved here from Records) */
  const Paper = () => {
    const db = P.useDb(), incharge = db.settings.role === "incharge";
    return html`<div className="card pad stack-s">
      <h3 style=${{ fontSize: "14px" }}>Witnessed on paper during a network cut</h3>
      <p className="muted small">Each one is checked against the paper controlled-drugs register by the in-charge, then confirmed here.</p>
      ${db.paperWitness.length ? db.paperWitness.map((p) => html`<div className="check" key=${p.id}><${P.Icon} n=${p.checked ? "check" : "shield"} /><div><b>${p.what}</b><div className="muted small">Witness "${p.name}" · ${P.when(p.at)}</div></div>
        ${p.checked ? html`<${P.Tag} icon="check">Checked<//>` : incharge ? html`<${P.Btn} size="sm" kind="primary" onClick=${() => { p.checked = true; p.checkedAt = P.now(); P.commit(); P.toast("Checked against the paper register"); }}>Matches the register<//>` : html`<${P.Tag} icon="clock">For the in-charge<//>`}</div>`)
      : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />None. Entries witnessed on paper during a network cut appear here.</p>`}
    </div>`;
  };

  P.CdView = ({ route }) => {
    const db = P.useDb();
    const regs = P.cdRegisters(), flags = P.cdFlags();
    const tab = route.tab || "register";
    const [sel, setSel] = useState(() => { const f = flags.find((x) => x.mv); return f ? f.med + "|" + f.place : regs[0].med + "|" + regs[0].place; });
    const [dlg, setDlg] = useState(null);
    const [med, place] = sel.split("|");
    const day = db.moves.filter((m) => isCd(m.med) && (m.kind === "administer" || m.kind === "handover") && m.at > P.now() - DAY).length;
    const dueN = flags.filter((f) => f.k === "due").length, fixN = flags.filter((f) => f.k !== "due").length;
    const act = (f) => {
      if (f.k === "wit") setDlg({ t: "wit", f });
      else if (f.k === "res") setDlg({ t: "res", f });
      else if (f.k === "gap") setDlg({ t: "gap", f });
      else if (f.k === "disc") setDlg({ t: "disc", f });
      else if (f.k === "due") setDlg({ t: "check", place: f.place });
      else P.go({ to: "cd", tab: "paper" });
    };
    const checks = (db.cdChecks || []).slice().sort((a, b) => b.at - a.at);
    const sorted = flags.slice().sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
    return html`<div className="stack">
      <div className="kpis">
        <div className="kpi"><b>${regs.length}</b><span>registers: ${P.CDS().length} medicines in ${cdPlaces().length} places</span></div>
        <div className="kpi"><b>${day}</b><span>doses given or handed over, last 24 h</span></div>
        <div className="kpi"><b className=${fixN ? "bad" : "ok"}>${fixN}</b><span>entries to fix</span></div>
        <div className="kpi"><b className=${dueN ? "bad" : ""}>${dueN}</b><span>balance checks due</span></div>
      </div>
      <${P.Seg} label="Controlled drugs" value=${tab} onChange=${(t) => P.go({ to: "cd", tab: t })} items=${[{ v: "register", label: "Registers" }, { v: "flags", label: "To fix", n: flags.length || null }, { v: "checks", label: "Balance checks", n: dueN || null }, { v: "paper", label: "Paper witness", n: db.paperWitness.filter((p) => !p.checked).length || null }]} />
      ${tab === "register" ? html`
        <div className="cd-cards">${regs.map((r) => html`<${RegCard} key=${r.med + r.place} r=${r} on=${sel === r.med + "|" + r.place} onPick=${() => setSel(r.med + "|" + r.place)} />`)}</div>
        <${Register} med=${med} place=${place} onDose=${() => setDlg({ t: "dose", med, place })} onCheck=${() => setDlg({ t: "check", place })} />
        <p className="hint">The register is the ledger itself: every line is a movement, so the balance can't drift from the stock, and nothing can be deleted. A correction is a new signed line.</p>`
      : tab === "flags" ? html`<div className="card pad stack-s">
          <div className="dash-h"><h3>To fix</h3><span className="muted small">most serious first · each one is closed by a signed action, never deleted</span></div>
          ${sorted.length ? sorted.map((f) => html`<${FlagRow} key=${f.id} f=${f} onAct=${act} />`) : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />Nothing to fix. Every entry is witnessed and every count matches.</p>`}
        </div>`
      : tab === "checks" ? html`<div className="stack">
          <div className="card pad stack-s"><div className="dash-h"><h3>Places</h3><span className="muted small">wards and the dispensary every day, the store weekly, always with a witness</span></div>
            ${cdPlaces().map((p) => { const c = lastCheck(p), due = checkDue(p); return html`<div className="cd-frow" key=${p}><div className="grow"><b>${P.place(p).name}</b><div className="muted small">${P.cdRegisters().filter((r) => r.place === p).map((r) => short(r.med) + " " + r.bal).join(" · ")}</div></div>
              <span className=${P.cx("small", due ? "bad" : "muted")}>${c ? "Last checked " + wl(c.at) : "Never checked"}</span><${P.Btn} size="sm" kind=${due ? "primary" : "outline"} icon="clip" onClick=${() => setDlg({ t: "check", place: p })}>Check now<//></div>`; })}</div>
          <div className="card"><div className="tblwrap"><table className="tbl dense"><thead><tr><th>When</th><th>Place</th><th>Counted</th><th>Result</th><th>Signed</th><th>Witness</th></tr></thead>
            <tbody>${checks.map((c) => html`<tr key=${c.id}><td className="num">${P.when(c.at)}</td><td>${P.place(c.place).short}</td><td className="small">${c.lines.map((l) => short(l.med) + " " + l.counted + (l.counted !== l.expected ? " (reg. " + l.expected + ")" : "")).join(" · ")}</td>
              <td>${c.status === "ok" ? html`<span className="vx-st ok">Matches</span>` : c.status === "resolved" ? html`<span className="vx-st">Resolved</span>` : html`<span className="vx-st overdue">Not matching</span>`}</td><td className="small">${c.by}</td><td className="small">${c.witness ? html`${c.witness.name}${c.witness.role ? html`<div className="dn-sub">${c.witness.role}</div>` : null}` : "—"}</td></tr>`)}</tbody></table></div></div>
        </div>`
      : html`<${Paper} />`}
      ${dlg && dlg.t === "dose" ? html`<${DoseDialog} med=${dlg.med} place=${dlg.place} onClose=${() => setDlg(null)} />` : null}
      ${dlg && dlg.t === "check" ? html`<${CheckDialog} place=${dlg.place} onClose=${() => setDlg(null)} />` : null}
      ${dlg && dlg.t === "disc" ? html`<${ResolveDialog} fl=${dlg.f} onClose=${() => setDlg(null)} />` : null}
      ${dlg && dlg.t === "gap" ? html`<${GapDialog} fl=${dlg.f} onClose=${() => setDlg(null)} />` : null}
      ${dlg && dlg.t === "wit" ? html`<${P.WitnessDialog} title="Add the missing witness" what=${dlg.f.title + " · " + dlg.f.meta} place=${dlg.f.place} list=${P.place(dlg.f.place).kind === "ward" ? WARD_WIT : P.WITNESSES}
        hint="Only someone who actually saw it may sign. The line keeps showing that the witness was added late, and when." onClose=${() => setDlg(null)}
        onDone=${(w) => { dlg.f.mv.witness = { ...w, late: true }; P.commit(); setDlg(null); P.toast("Witness added, marked as late"); }} />` : null}
      ${dlg && dlg.t === "res" ? html`<${P.WitnessDialog} title="Record the residue disposal" what=${dlg.f.title + " · " + dlg.f.meta} place=${dlg.f.place} list=${WARD_WIT}
        hint="The witness confirms the leftover amount was discarded. It is marked as recorded late." onClose=${() => setDlg(null)}
        onDone=${(w) => { dlg.f.mv.cd.residueOk = true; dlg.f.mv.cd.residueLate = { at: P.now(), witness: w }; P.commit(); setDlg(null); P.toast("Residue disposal recorded, marked as late"); }} />` : null}
    </div>`;
  };
})();
