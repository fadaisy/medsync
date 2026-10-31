/* Discrepancy investigations: every count that didn't match, from anywhere (controlled-drug checks, shift handovers,
   store counts) plus anything reported by hand, becomes one case with an owner, a deadline, a timeline,
   findings and an in-charge sign-off. Fixing the number is not enough: a case closes only when someone signs off why. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const wl = (ms) => P.when(ms).replace(/^(Today|Yesterday)/, (x) => x.toLowerCase());
  const short = (id) => ({ morph: "Morphine inj", peth: "Pethidine inj", diaz: "Diazepam inj", omor: "Oral morphine", oxy: "Oxytocin", mgso4: "Magnesium sulphate", ceft: "Ceftriaxone", gent: "Gentamicin" }[id] || P.med(id).name);
  const uw = (med, n) => { const m = P.med(med), a = Math.abs(n); return m.unit === "mL" ? a + " mL" : a + " " + (a === 1 ? m.unit.replace(/s$/, "") : m.unit); };
  const initials = (n) => n.replace(/^(You \()/, "").replace(/^(Nurse in-charge|Midwife in-charge|Nurse|Midwife|Dr) /, "").split(/[ .()]+/).filter(Boolean).map((t) => t[0].toUpperCase()).join("").slice(0, 2);
  const dur = (ms) => { const h = Math.round(Math.abs(ms) / HOUR); return h < 1 ? Math.round(Math.abs(ms) / MIN) + " min" : h < 48 ? h + " h" : Math.round(h / 24) + " days"; };

  const SEV = (med) => (P.med(med).controlled ? { k: "high", word: "High", hours: 24 } : (P.HIGHRISK || []).includes(med) ? { k: "mid", word: "Medium", hours: 48 } : { k: "low", word: "Low", hours: 72 });
  const OWNERS = () => {
    const ph = P.ROSTER.pharmacy, wards = ["w3", "mat", "peds"].map((w) => (P.ROSTER[w]["Nurse in-charge"] || [])[0]).filter(Boolean);
    return { Pharmacy: [{ name: P.who(), cadre: "You" }].concat(ph["In-charge pharmacist"], ph["Second pharmacist"]), Wards: wards };
  };
  const STEPS = ["Checked the charts and the MAR", "Checked the register entries", "Spoke to the staff on shift", "Searched the ward: tray, fridge, drawers", "Checked the sharps bin for ampoules", "Quarantined the batch", "Recounted with a witness"];
  const CAUSES = ["Given, not recorded", "Miscounted", "Broken or wasted, not recorded", "Moved without a record", "Expired, discarded without a record", "Suspected diversion", "Unexplained"];
  const ACTIONS = ["Late entry made", "Register adjusted with an incident number", "Staff member counselled", "Reported to the medical superintendent", "Reported to the National Drug Authority", "Batch quarantined"];
  const PREVENT = ["Second-person check at every dose", "Emergency tray use sheet", "Extra daily count", "Key holder changed", "Refresher training on the register", "No change needed"];
  const BACK = ["Cause not supported by the timeline", "Action missing", "Ask the staff on shift first", "Needs an incident number"];

  /* ── the discrepancies, wherever they were found ── */
  const sources = () => {
    const db = P.db, out = [];
    (db.cdChecks || []).forEach((c) => c.lines.forEach((l) => {
      if (l.counted === l.expected) return;
      const r = (c.resolved || {})[l.med];
      out.push({ key: "cd:" + c.id + ":" + l.med, src: "cd", srcWord: c.handover ? "Handover count (controlled)" : "Controlled-drug balance check", med: l.med, place: c.place, qty: l.counted - l.expected, foundAt: c.at, foundBy: c.by, witness: c.witness && c.witness.name,
        fixed: r ? { at: r.at, by: r.by, word: { recount: "Recounted, matches", missed: "Late entry for " + r.pt, loss: "Loss confirmed, incident " + r.ref }[r.how] || r.how } : null, go: { to: "cd", tab: "flags" }, goWord: "Fix in Controlled drugs" });
    }));
    (db.handovers || []).forEach((h) => h.lines.forEach((l) => {
      if (l.counted === l.expected || l.known || P.med(l.med).controlled) return;
      const r = (h.resolved || {})[l.med];
      out.push({ key: "ho:" + h.id + ":" + l.med, src: "ho", srcWord: "Shift handover", med: l.med, place: h.place, qty: l.counted - l.expected, foundAt: h.at, foundBy: h.to.name, witness: h.from.name,
        fixed: r ? { at: r.at, by: r.by, word: { recount: "Recounted: " + (r.why || "matches").toLowerCase(), given: "Late entry: given to " + r.pt + " by " + r.givenBy, loss: "Loss confirmed (" + (r.why || "").toLowerCase() + "), incident " + r.ref }[r.how] || r.how } : null, go: { to: "handover" }, goWord: "Fix in Shift handover" });
    }));
    (db.counts || []).filter((c) => c.status === "approval" || c.status === "done").forEach((c) => P.countDiffs(c).forEach((d) => {
      const b = P.batch(d.r.batch), why = c.reasons[d.r.batch];
      if (!(P.med(b.med).controlled || (P.HIGHRISK || []).includes(b.med) || why === "Other")) return;
      out.push({ key: "count:" + c.id + ":" + d.r.batch, src: "count", srcWord: "Stock count · " + c.title, med: b.med, place: c.place, qty: d.diff, foundAt: c.at, foundBy: c.by, reason: why,
        fixed: c.status === "done" ? { at: c.doneAt, by: "In-charge", word: "Count approved, ledger adjusted (" + why + ")" } : null, go: { to: "store", tab: "count", count: c.id }, goWord: "Open the count" });
    }));
    Object.entries(db.cases || {}).filter(([, c]) => c.src === "manual").forEach(([key, c]) => out.push({ ...c, key, srcWord: "Reported by hand", manual: true }));
    return out;
  };
  P.caseList = () => sources().map((s) => {
    const st = (P.db.cases || {})[s.key] || {};
    const c = { ...s, ...st, key: s.key, fixed: s.fixed, sev: SEV(s.med) };
    c.status = st.signoff ? "closed" : st.submitted ? "signoff" : st.owner ? "open" : "new";
    c.overdue = c.status !== "closed" && st.due && st.due < P.now();
    return c;
  }).sort((a, b) => ({ new: 0, open: 1, signoff: 2, closed: 3 }[a.status] - { new: 0, open: 1, signoff: 2, closed: 3 }[b.status]) || (b.overdue - a.overdue) || ((a.due || a.foundAt + a.sev.hours * HOUR) - (b.due || b.foundAt + b.sev.hours * HOUR)));
  const titleOf = (c) => short(c.med) + " · " + P.place(c.place).short + " · " + (c.manual && c.what ? c.what : uw(c.med, c.qty) + (c.qty < 0 ? " short" : " over"));

  /* ── sample history ── */
  const seedCases = (db) => {
    const d = (day, h, mi) => new Date(2026, 9, day, h, mi || 0).getTime();
    db.cases = {};
    const peds = (db.cdChecks || []).find((c) => c.place === "peds" && c.lines.some((l) => l.counted !== l.expected));
    if (peds) db.cases["cd:" + peds.id + ":diaz"] = { owner: "Nurse in-charge M. Kyomugisha", assignedBy: "A. Kintu", assignedAt: d(28, 9, 0), due: d(29, 8, 0),
      steps: [{ at: d(28, 11, 10), by: "Nurse in-charge M. Kyomugisha", what: "Checked the charts and the MAR", note: "No diazepam charted after 04:10" }, { at: d(28, 15, 30), by: "Nurse in-charge M. Kyomugisha", what: "Spoke to the staff on shift", note: "Night nurse off until Friday" }] };
    db.cases["m-ceft"] = { src: "manual", med: "ceft", place: "w3", qty: -2, what: "2 vials short at the weekly count", foundAt: d(15, 9, 0), foundBy: "N. Babirye", owner: "Nurse in-charge R. Achan", assignedBy: "A. Kintu", assignedAt: d(15, 9, 30), due: d(17, 9, 30),
      steps: [{ at: d(15, 14, 0), by: "Nurse in-charge R. Achan", what: "Checked the charts and the MAR", note: "Two 1 g doses given at 02:00 to a septic admission, not charted" }],
      findings: { cause: "Given, not recorded", actions: ["Late entry made", "Staff member counselled"], prevent: ["Emergency tray use sheet"] }, submitted: { at: d(16, 10, 0), by: "Nurse in-charge R. Achan" }, signoff: { at: d(16, 16, 20), by: "A. Kintu" } };
    db.cases["m-morph"] = { src: "manual", med: "morph", place: "store", qty: 1, what: "1 ampoule over at the monthly count", foundAt: d(2, 16, 0), foundBy: "A. Kintu", owner: "N. Babirye", assignedBy: "A. Kintu", assignedAt: d(2, 16, 10), due: d(3, 16, 10),
      steps: [{ at: d(3, 9, 0), by: "N. Babirye", what: "Checked the register entries", note: "NMS delivery of 1 Oct: 1 ampoule returned by Ward 3 not entered" }],
      findings: { cause: "Moved without a record", actions: ["Register adjusted with an incident number"], prevent: ["Refresher training on the register"] }, submitted: { at: d(3, 9, 30), by: "N. Babirye" }, signoff: { at: d(3, 12, 0), by: "A. Kintu" } };
    db.cases["m-peth"] = { src: "manual", med: "peth", place: "mat", qty: 0, what: "ampoule seal looked tampered with", foundAt: d(27, 14, 0), foundBy: "Midwife C. Auma", owner: "Midwife in-charge J. Ayo", assignedBy: "A. Kintu", assignedAt: d(27, 14, 30), due: d(28, 14, 30),
      steps: [{ at: d(27, 15, 0), by: "Midwife in-charge J. Ayo", what: "Quarantined the batch", note: "1 ampoule set aside, sealed bag" }] };
    db.casesSeeded = 1;
  };
  if (!P.db.casesSeeded) { seedCases(P.db); P.commit(); }
  const reset0 = P.reset;
  P.reset = () => { reset0(); seedCases(P.db); P.commit(); };

  const upd = (key, patch) => { const db = P.db; db.cases = db.cases || {}; db.cases[key] = { ...(db.cases[key] || {}), ...patch }; P.commit(); };
  const addStep = (key, s) => { const cur = (P.db.cases || {})[key] || {}; upd(key, { steps: (cur.steps || []).concat([{ at: P.now(), by: P.who(), ...s }]) }); };

  /* a short line for the place the discrepancy was found: who is investigating it */
  P.caseWord = (key) => { const c = P.caseList().find((x) => x.key === key); if (!c) return ""; return c.status === "closed" ? " · investigation closed" : c.owner ? " · investigating: " + c.owner + (c.overdue ? " (overdue)" : "") : " · investigation not assigned"; };

  /* ── who needs to act ── */
  P.caseFlags = () => {
    const me = P.who(), inch = P.db.settings.role === "incharge", out = [];
    P.caseList().forEach((c) => {
      if (c.status === "closed") return;
      if (inch && c.status === "new") out.push({ c, why: "Not assigned yet" });
      else if (inch && c.status === "signoff") out.push({ c, why: "Waiting for your sign-off" });
      else if (c.overdue && (inch || c.owner === me)) out.push({ c, why: "Overdue by " + dur(P.now() - c.due) + " · " + c.owner });
      else if (c.owner === me && c.status === "open") out.push({ c, why: "Yours · due " + (c.due > P.now() ? "in " + dur(c.due - P.now()) : "now") });
    });
    return out;
  };

  /* ── one case ── */
  const Stepper = ({ c }) => {
    const done = { found: true, assigned: !!c.owner, fixed: !!c.fixed || (c.manual && !!c.findings), submitted: !!c.submitted, closed: !!c.signoff };
    const L = [["found", "Found"], ["assigned", "Assigned"], ["fixed", c.manual ? "Findings" : "Number fixed"], ["submitted", "Submitted"], ["closed", "Signed off"]];
    return html`<div className="cs-steps">${L.map(([k, w], i) => html`<div key=${k} className=${P.cx("cs-step", done[k] && "on")}><span>${done[k] ? html`<${P.Icon} n="check" s=${12} />` : i + 1}</span>${w}</div>`)}</div>`;
  };

  const CaseDialog = ({ k, onClose }) => {
    const db = P.useDb();
    const c = P.caseList().find((x) => x.key === k);
    const inch = db.settings.role === "incharge", me = P.who(), mine = c.owner === me;
    const [mode, setMode] = useState(null);
    const [owner, setOwner] = useState(c.owner || null);
    const [hrs, setHrs] = useState(c.sev.hours);
    const [step, setStep] = useState(null);
    const [note, setNote] = useState("");
    const f0 = c.findings || {};
    const [cause, setCause] = useState(f0.cause || null);
    const [acts, setActs] = useState(f0.actions || []);
    const [prev, setPrev] = useState(f0.prevent || []);
    const [back, setBack] = useState(null);
    const fixedOk = c.manual || !!c.fixed;
    const canWork = mine || inch;
    const tl = [{ at: c.foundAt, by: c.foundBy, what: "Found: " + (c.manual ? c.what : "counted " + (c.qty < 0 ? "short" : "over") + " by " + uw(c.med, c.qty)), note: c.srcWord + (c.witness ? " · with " + c.witness : "") }]
      .concat(c.owner ? [{ at: c.assignedAt, by: c.assignedBy || "—", what: "Assigned to " + c.owner, note: "Due " + P.when(c.due) }] : [])
      .concat((c.steps || []).map((s) => ({ ...s })))
      .concat(c.fixed ? [{ at: c.fixed.at, by: c.fixed.by, what: "Number fixed: " + c.fixed.word, src: true }] : [])
      .concat(c.submitted ? [{ at: c.submitted.at, by: c.submitted.by, what: "Findings submitted for sign-off" }] : [])
      .concat((c.backs || []).map((b) => ({ ...b, what: "Sent back: " + b.why })))
      .concat((c.escalations || []).map((e) => ({ ...e, what: "Escalated: " + e.to })))
      .concat(c.signoff ? [{ at: c.signoff.at, by: c.signoff.by, what: "Signed off and closed" }] : [])
      .sort((a, b) => a.at - b.at);
    const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : arr.concat([v]));
    const O = OWNERS();
    const assign = () => { upd(k, { owner, due: P.now() + hrs * HOUR, assignedAt: P.now(), assignedBy: me }); P.toast("Assigned to " + owner + ", due in " + dur(hrs * HOUR)); setMode(null); };
    const saveStep = () => { addStep(k, { what: step, note: note.trim() }); setStep(null); setNote(""); setMode(null); P.toast("Added to the timeline"); };
    const submit = () => { upd(k, { findings: { cause, actions: acts, prevent: prev }, submitted: { at: P.now(), by: me } }); P.toast("Submitted to the in-charge for sign-off"); setMode(null); };
    const signoff = () => { upd(k, { signoff: { at: P.now(), by: me } }); P.toast("Case closed and signed off", "check"); onClose(); };
    const sendBack = () => { upd(k, { submitted: null, backs: (c.backs || []).concat([{ at: P.now(), by: me, why: back }]) }); P.toast("Sent back to " + c.owner); setBack(null); setMode(null); };
    const escalate = (to) => { upd(k, { escalations: (c.escalations || []).concat([{ at: P.now(), by: me, to }]) }); P.toast("Escalated: " + to.toLowerCase()); };
    const dueWord = c.status === "closed" ? "Closed " + wl(c.signoff.at) : !c.due ? "Not assigned" : c.overdue ? "Overdue by " + dur(P.now() - c.due) : "Due in " + dur(c.due - P.now()) + " (" + P.when(c.due) + ")";
    return html`<${P.Dialog} size="wide" title=${titleOf(c)} sub=${c.srcWord + " · found " + P.when(c.foundAt) + " by " + c.foundBy} onClose=${onClose}
      foot=${mode === "assign" ? html`<${P.Btn} kind="ghost" onClick=${() => setMode(null)}>Cancel<//><${P.Btn} kind="primary" disabled=${!owner} onClick=${assign}>Assign<//>`
        : mode === "step" ? html`<${P.Btn} kind="ghost" onClick=${() => setMode(null)}>Cancel<//><${P.Btn} kind="primary" disabled=${!step} onClick=${saveStep}>Add to the timeline<//>`
        : mode === "findings" ? html`<span className="grow muted small">${!fixedOk ? "Fix the number at the source first" : !cause ? "Tap the cause" : !acts.length ? "Tap at least one action" : !prev.length ? "Tap what changes" : ""}</span><${P.Btn} kind="ghost" onClick=${() => setMode(null)}>Cancel<//><${P.Btn} kind="primary" disabled=${!fixedOk || !cause || !acts.length || !prev.length} onClick=${submit}>Submit for sign-off<//>`
        : mode === "back" ? html`<${P.Btn} kind="ghost" onClick=${() => setMode(null)}>Cancel<//><${P.Btn} kind="primary" disabled=${!back} onClick=${sendBack}>Send back to ${c.owner}<//>`
        : c.status === "signoff" && inch ? html`<${P.Btn} onClick=${() => setMode("back")}>Send back<//><${P.Btn} kind="primary" icon="check" onClick=${signoff}>Sign off and close<//>`
        : c.status === "signoff" ? html`<span className="grow muted small">Waiting for the in-charge to sign off.</span>`
        : c.status === "closed" ? html`<span className="grow muted small">Closed. The case stays on the record.</span>`
        : html`${!c.owner && !inch ? html`<${P.Btn} kind="primary" onClick=${() => { upd(k, { owner: me, due: P.now() + c.sev.hours * HOUR, assignedAt: P.now(), assignedBy: me }); P.toast("You took the case"); }}>Take this case<//>` : null}
            ${inch ? html`<${P.Btn} onClick=${() => setMode("assign")}>${c.owner ? "Reassign" : "Assign"}<//>` : null}
            ${c.owner && canWork ? html`<${P.Btn} onClick=${() => setMode("step")}>Add a step<//><${P.Btn} kind="primary" onClick=${() => setMode("findings")}>Write the findings<//>` : null}`}>
      <div className="cs-head">
        <span className=${P.cx("cs-sev", c.sev.k)}>${c.sev.word}</span>
        <div className="grow"><${Stepper} c=${c} /></div>
        <div className="cs-own">${c.owner ? html`<span className="wit-av">${initials(c.owner)}</span><span className="small"><b>${c.owner}</b><br /><span className=${c.overdue ? "bad" : "muted"}>${dueWord}</span></span>` : html`<span className="small bad">${dueWord}</span>`}</div>
      </div>
      ${!c.manual ? html`<div className=${P.cx("cs-fix", c.fixed && "on")}><${P.Icon} n=${c.fixed ? "check" : "alert"} s=${16} /><span>${c.fixed ? html`<b>Number fixed:</b> ${c.fixed.word} · ${c.fixed.by}, ${wl(c.fixed.at)}` : html`<b>The ledger still differs from the count.</b> Fix it where it was found; this case records why it happened.`}</span>
        ${c.fixed ? null : html`<${P.Btn} size="sm" onClick=${() => { onClose(); P.go(c.go); }}>${c.goWord}<//>`}</div>` : null}
      ${mode === "assign" ? html`<div className="ho-sec"><h4>Owner</h4>${Object.entries(O).map(([g, ppl]) => html`<div key=${g} className="stack-s"><span className="lbl">${g}</span><div className="wit-ppl">${ppl.map((x) => html`<button type="button" key=${x.name} className=${P.cx("wit-p", owner === x.name && "on")} onClick=${() => setOwner(x.name)}><span className="wit-av">${initials(x.name)}</span><span className="wit-t"><b>${x.name}</b><span>${x.cadre}</span></span></button>`)}</div></div>`)}
        <span className="lbl">Deadline</span><div className="chips">${[24, 48, 72, 168].map((hh) => html`<${P.Chip} key=${hh} size="sm" on=${hrs === hh} onClick=${() => setHrs(hh)}>${hh < 168 ? hh + " h" : "7 days"}${hh === c.sev.hours ? " (usual for " + c.sev.word.toLowerCase() + ")" : ""}<//>`)}</div></div>` : null}
      ${mode === "step" ? html`<div className="ho-sec"><h4>What did you do?</h4><div className="chips">${STEPS.map((s) => html`<${P.Chip} key=${s} size="sm" on=${step === s} onClick=${() => setStep(s)}>${s}<//>`)}</div>
        <input className="input" placeholder="What you found (optional)" value=${note} onChange=${(e) => setNote(e.target.value)} /></div>` : null}
      ${mode === "findings" ? html`<div className="ho-sec"><h4>Cause</h4><div className="chips">${CAUSES.map((s) => html`<${P.Chip} key=${s} size="sm" on=${cause === s} onClick=${() => setCause(s)}>${s}<//>`)}</div>
        <h4>Action taken</h4><div className="chips">${ACTIONS.map((s) => html`<${P.Chip} key=${s} size="sm" on=${acts.includes(s)} onClick=${() => toggle(acts, setActs, s)}>${s}<//>`)}</div>
        <h4>So it doesn't happen again</h4><div className="chips">${PREVENT.map((s) => html`<${P.Chip} key=${s} size="sm" on=${prev.includes(s)} onClick=${() => toggle(prev, setPrev, s)}>${s}<//>`)}</div>
        ${cause === "Suspected diversion" ? html`<div className="note warn"><${P.Icon} n="alert" /><span>Suspected diversion: report it to the medical superintendent and keep the staff member off controlled-drug duties until it is closed. The sign-off will ask for the report.</span></div>` : null}</div>` : null}
      ${mode === "back" ? html`<div className="ho-sec"><h4>Why it goes back</h4><div className="chips">${BACK.map((s) => html`<${P.Chip} key=${s} size="sm" on=${back === s} onClick=${() => setBack(s)}>${s}<//>`)}</div></div>` : null}
      ${c.findings && !mode ? html`<div className="cs-find"><div><span className="lbl">Cause</span><b>${c.findings.cause}</b></div><div><span className="lbl">Action taken</span><span>${c.findings.actions.join(" · ")}</span></div><div><span className="lbl">So it doesn't happen again</span><span>${c.findings.prevent.join(" · ")}</span></div></div>` : null}
      <div className="ho-sec"><h4>Timeline</h4>
        <div className="cs-tl">${tl.map((t, i) => html`<div key=${i} className="cs-tli"><span className="cs-dot"></span><div><b>${t.what}</b><div className="muted small">${P.when(t.at)} · ${t.by}${t.note ? " · " + t.note : ""}</div></div></div>`)}</div>
        ${inch && c.status !== "closed" ? html`<div className="row"><span className="muted small">Escalate:</span>${["To the medical superintendent", "To the National Drug Authority"].map((to) => html`<${P.Btn} key=${to} size="sm" kind="ghost" disabled=${(c.escalations || []).some((e) => e.to === to)} onClick=${() => escalate(to)}>${to.replace("To the m", "M").replace("To the ", "")}<//>`)}</div>` : null}
      </div>
    <//>`;
  };

  /* ── reporting a case by hand: tap only ── */
  const NewCase = ({ onClose }) => {
    const db = P.useDb();
    const [place, setPlace] = useState(P.myStation ? P.myStation() : "opd");
    const [med, setMed] = useState(null);
    const [what, setWhat] = useState(null);
    const meds = P.MEDS.filter((m) => P.medAt(m.id, place) > 0 && (m.controlled || (P.HIGHRISK || []).includes(m.id)));
    const save = () => { const key = "m" + db.seq++; upd(key, { src: "manual", med, place, qty: 0, what, foundAt: P.now(), foundBy: P.who() }); P.toast("Case opened: " + short(med) + " at " + P.place(place).short); onClose(); };
    return html`<${P.Dialog} title="Report a discrepancy" sub="For something a count won't show: a tampered ampoule, a wrong patient, a suspicion" onClose=${onClose} foot=${html`<${P.Btn} kind="primary" disabled=${!med || !what} onClick=${save}>Open the case<//>`}>
      <div className="stack-s"><span className="lbl">Where</span><div className="chips">${(P.HO_PLACES || ["opd", "store", "w3", "mat", "peds"]).map((p) => html`<${P.Chip} key=${p} size="sm" on=${place === p} onClick=${() => { setPlace(p); setMed(null); }}>${P.place(p).short}<//>`)}</div></div>
      <div className="stack-s"><span className="lbl">Medicine</span><div className="chips">${meds.map((m) => html`<${P.Chip} key=${m.id} size="sm" on=${med === m.id} onClick=${() => setMed(m.id)}>${short(m.id)}${m.controlled ? " (controlled)" : ""}<//>`)}</div></div>
      <div className="stack-s"><span className="lbl">What happened</span><div className="chips">${["ampoule seal looked tampered with", "given to the wrong patient", "register entry looks altered", "stock missing, not yet counted", "suspected diversion"].map((w) => html`<${P.Chip} key=${w} size="sm" on=${what === w} onClick=${() => setWhat(w)}>${w[0].toUpperCase() + w.slice(1)}<//>`)}</div></div>
    <//>`;
  };

  const FILTERS = [["open", "Open"], ["new", "Not assigned"], ["overdue", "Overdue"], ["signoff", "Awaiting sign-off"], ["mine", "Mine"], ["closed", "Closed"], ["all", "All"]];
  P.CasesView = () => {
    const db = P.useDb();
    const [f, setF] = useState(db.settings.role === "incharge" ? "open" : "mine");
    const [open, setOpen] = useState(null);
    const [nc, setNc] = useState(false);
    const all = P.caseList(), me = P.who(), now = P.now();
    const pick = { open: (c) => c.status !== "closed", new: (c) => c.status === "new", overdue: (c) => c.overdue, signoff: (c) => c.status === "signoff", mine: (c) => c.owner === me && c.status !== "closed", closed: (c) => c.status === "closed", all: () => true };
    const list = all.filter(pick[f]);
    const closed = all.filter((c) => c.status === "closed"), avg = closed.length ? closed.reduce((a, c) => a + (c.signoff.at - c.foundAt), 0) / closed.length : 0;
    const n = (k) => all.filter(pick[k]).length;
    return html`<div className="stack">
      <div className="kpis">
        <div className="kpi"><b>${n("open")}</b><span>open cases</span></div>
        <div className="kpi"><b className=${n("new") ? "bad" : "ok"}>${n("new")}</b><span>not assigned to anyone</span></div>
        <div className="kpi"><b className=${n("overdue") ? "bad" : "ok"}>${n("overdue")}</b><span>past their deadline</span></div>
        <div className="kpi"><b>${closed.length ? dur(avg) : "—"}</b><span>average time to close (${closed.length} closed)</span></div>
      </div>
      <div className="row between"><div className="chips">${FILTERS.map(([k, w]) => html`<${P.Chip} key=${k} on=${f === k} onClick=${() => setF(k)}>${w}${n(k) && k !== "all" ? " · " + n(k) : ""}<//>`)}</div>
        <${P.Btn} icon="plus" onClick=${() => setNc(true)}>Report a discrepancy<//></div>
      <div className="card">
        ${list.length ? html`<div className="cs-list">${list.map((c) => html`<button type="button" key=${c.key} className="cs-row" onClick=${() => setOpen(c.key)}>
          <span className=${P.cx("cs-sev", c.sev.k)}>${c.sev.word}</span>
          <span className="cs-main"><b>${titleOf(c)}</b><span className="muted small">${c.srcWord} · found ${wl(c.foundAt)}${c.fixed ? " · number fixed" : c.manual ? "" : " · ledger still differs"}${(c.escalations || []).length ? " · escalated" : ""}</span></span>
          <span className="cs-owner">${c.owner ? html`<span className="wit-av sm">${initials(c.owner)}</span><span className="small">${c.owner}</span>` : html`<span className="small bad">Not assigned</span>`}</span>
          <span className=${P.cx("small cs-due", c.overdue && "bad")}>${c.status === "closed" ? "Closed " + wl(c.signoff.at) : c.due ? (c.overdue ? "Overdue " + dur(now - c.due) : "Due in " + dur(c.due - now)) : "Usual: " + c.sev.hours + " h"}</span>
          <span>${{ new: html`<span className="vx-st overdue">New</span>`, open: html`<span className="vx-st">Investigating</span>`, signoff: html`<span className="vx-st due">Sign-off</span>`, closed: html`<span className="vx-st ok">Closed</span>` }[c.status]}</span>
        </button>`)}</div>` : html`<${P.Empty} title="Nothing here">${f === "mine" ? "No open cases assigned to you." : "No cases in this view."}<//>`}
      </div>
      <p className="hint">Cases open themselves from controlled-drug checks, shift handovers and stock counts that don't match (controlled and high-risk medicines, or any "Other" reason). Deadlines: 24 h for controlled drugs, 48 h for high-risk, 72 h otherwise. Only the in-charge can sign a case off.</p>
      ${open ? html`<${CaseDialog} k=${open} onClose=${() => setOpen(null)} />` : null}
      ${nc ? html`<${NewCase} onClose=${() => setNc(false)} />` : null}
    </div>`;
  };
})();
