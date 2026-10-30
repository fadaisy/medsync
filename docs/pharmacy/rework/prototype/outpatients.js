/* Outpatients: adherence and refills after the patient leaves the window.
   Chronic medicines run out on a date worked out from what was dispensed; the pill count at each refill gives adherence.
   Short courses (antibiotics) get a check-in while they are running. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const DAY = 864e5;
  const D = (y, m, d) => new Date(y, m - 1, d, 10).getTime();
  const today0 = () => { const t = new Date(P.now()); return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); };
  const fmtD = (ts) => { const d = new Date(ts); return d.getDate() + " " + P.MON[d.getMonth()] + (d.getFullYear() !== 2026 ? " " + d.getFullYear() : ""); };
  const days = (a, b) => Math.round((b - a) / DAY);
  const rel = (ts) => { const k = days(today0(), new Date(new Date(ts).setHours(0, 0, 0, 0)).getTime()); return k === 0 ? "today" : k === 1 ? "tomorrow" : k === -1 ? "yesterday" : k < 0 ? -k + " days ago" : "in " + k + " days"; };

  /* ── sample follow-up register ── */
  P.OP_PATIENTS = [
    { id: "op41", name: "Sample patient 41", sex: "M", age: 58, phone: "0772 ··· 141", conds: ["Type 2 diabetes", "Hypertension"], clinic: "Chronic care clinic", stable: true },
    { id: "op42", name: "Sample patient 42", sex: "F", age: 46, phone: "0701 ··· 242", conds: ["Hypertension"], clinic: "Chronic care clinic" },
    { id: "op43", name: "Sample patient 43", sex: "F", age: 34, phone: "0752 ··· 343", conds: ["HIV care: cotrimoxazole prophylaxis"], clinic: "ART clinic", stable: true },
    { id: "op44", name: "Sample patient 44", sex: "M", age: 29, phone: "0789 ··· 444", conds: ["Community-acquired pneumonia"], clinic: "OPD" },
    { id: "op45", name: "Sample patient 45", sex: "F", age: 23, phone: "0774 ··· 545", conds: ["Urinary tract infection"], clinic: "OPD" },
    { id: "op46", name: "Sample patient 46", sex: "F", age: 27, phone: "0706 ··· 646", conds: ["Antenatal care, 24 weeks"], clinic: "ANC" },
    { id: "op47", name: "Sample patient 47", sex: "M", age: 63, phone: "0757 ··· 747", conds: ["Type 2 diabetes"], clinic: "Chronic care clinic" },
    { id: "op48", name: "Sample patient 48", sex: "F", age: 51, phone: "0782 ··· 848", conds: ["Hypertension", "Type 2 diabetes"], clinic: "Chronic care clinic" },
  ];
  /* regimens: daily = units a day. chronic ones carry a refill history: [date, qty dispensed, pills brought back at that visit] */
  P.OP_REGS = [
    { id: "q1", pt: "op41", med: "metf", dose: "500 mg twice daily", daily: 2, kind: "chronic", hist: [[D(2026, 7, 2), 60, null], [D(2026, 8, 1), 60, 2], [D(2026, 8, 31), 60, 4], [D(2026, 9, 30), 60, 1]] },
    { id: "q2", pt: "op41", med: "amlo", dose: "5 mg once daily", daily: 1, kind: "chronic", hist: [[D(2026, 7, 2), 30, null], [D(2026, 8, 1), 30, 0], [D(2026, 8, 31), 30, 2], [D(2026, 9, 30), 30, 1]] },
    { id: "q3", pt: "op42", med: "amlo", dose: "10 mg once daily (2 × 5 mg)", daily: 2, kind: "chronic", hist: [[D(2026, 6, 12), 60, null], [D(2026, 7, 14), 60, 6], [D(2026, 8, 11), 60, 18], [D(2026, 9, 10), 60, 14]] },
    { id: "q4", pt: "op43", med: "ctx", dose: "960 mg once daily (2 × 480 mg)", daily: 2, kind: "chronic", hist: [[D(2026, 4, 7), 180, null], [D(2026, 7, 6), 180, 4], [D(2026, 10, 5), 180, 2]] },
    { id: "q5", pt: "op44", med: "amox", dose: "500 mg three times daily", daily: 3, kind: "course", start: D(2026, 10, 27), courseDays: 5, qty: 15, checks: [[D(2026, 10, 28), "SMS", "Taking as prescribed", 0, ""]] },
    { id: "q6", pt: "op45", med: "ctx", dose: "960 mg twice daily (2 × 480 mg)", daily: 4, kind: "course", start: D(2026, 10, 25), courseDays: 5, qty: 20, checks: [[D(2026, 10, 27), "Call", "Missed some doses", 2, "Nausea"]] },
    { id: "q7", pt: "op46", med: "ferr", dose: "1 tablet once daily", daily: 1, kind: "chronic", hist: [[D(2026, 8, 3), 30, null], [D(2026, 9, 2), 30, 9], [D(2026, 10, 1), 30, 8]] },
    { id: "q8", pt: "op47", med: "metf", dose: "1 g twice daily (2 × 500 mg)", daily: 4, kind: "chronic", hist: [[D(2026, 8, 16), 120, null], [D(2026, 9, 15), 120, 0], [D(2026, 10, 15), 120, 4]] },
    { id: "q9", pt: "op48", med: "amlo", dose: "5 mg once daily", daily: 1, kind: "chronic", hist: [[D(2026, 7, 28), 30, null], [D(2026, 8, 27), 30, 3], [D(2026, 9, 26), 30, 0]] },
    { id: "q10", pt: "op48", med: "metf", dose: "500 mg twice daily", daily: 2, kind: "chronic", hist: [[D(2026, 7, 28), 60, null], [D(2026, 8, 27), 60, 10], [D(2026, 9, 26), 60, 12]] },
  ];
  P.opPt = (id) => P.OP_PATIENTS.find((p) => p.id === id);
  P.opRegsOf = (pt) => P.OP_REGS.filter((r) => r.pt === pt);

  /* refill history (sample + recorded here) and what it means */
  P.opHist = (r) => (r.hist || []).map(([at, qty, back]) => ({ at, qty, back, sample: true })).concat((((P.db.opRefills || {})[r.id]) || []));
  P.opRefill = (r) => {
    const h = P.opHist(r), last = h[h.length - 1];
    const supply = Math.floor(last.qty / r.daily), runOut = last.at + supply * DAY;
    const left = Math.max(0, days(today0(), runOut));
    /* pill count adherence for each completed interval: pills taken / pills that should have been taken */
    const counts = h.slice(1).filter((x) => x.back != null).map((x, i) => {
      const prev = h[h.indexOf(x) - 1], gap = days(prev.at, x.at), shouldTake = Math.min(prev.qty, gap * r.daily), taken = prev.qty - x.back;
      return { at: x.at, back: x.back, should: shouldTake, taken, pct: Math.max(0, Math.min(100, Math.round((taken / shouldTake) * 100))), gap, late: Math.max(0, gap - Math.floor(prev.qty / r.daily)) };
    });
    /* medication possession ratio over the history: days supplied / days elapsed */
    const span = Math.max(1, days(h[0].at, Math.max(today0(), last.at))), supplied = h.slice(0, -1).reduce((a, x) => a + x.qty / r.daily, 0) + Math.min(supply, days(last.at, today0()));
    const mpr = Math.min(100, Math.round((supplied / span) * 100));
    const k = days(today0(), runOut) < 0 ? "overdue" : days(today0(), runOut) <= 5 ? "due" : "ok";
    return { last, runOut, supply, left, counts, mpr, k, late: -days(today0(), runOut), lastPct: counts.length ? counts[counts.length - 1].pct : null };
  };
  P.opCourse = (r) => {
    const end = r.start + r.courseDays * DAY, dayN = Math.min(r.courseDays, days(r.start, today0()) + 1);
    const checks = (r.checks || []).map(([at, how, how2, missed, se]) => ({ at, how, status: how2, missed, se, sample: true })).concat((((P.db.opChecks || {})[r.id]) || []));
    const lastC = checks[checks.length - 1], done = today0() >= end;
    const needCheck = !done && (!lastC || days(lastC.at, today0()) >= 2);
    const missed = checks.reduce((a, c) => a + (c.missed || 0), 0), expected = Math.min(r.courseDays, dayN) * r.daily / (r.daily >= 4 ? 2 : 1);
    return { end, dayN, checks, lastC, done, needCheck, missed, flag: lastC && lastC.status !== "Taking as prescribed" };
  };

  P.opAlerts = () => {
    const a = [];
    const rs = P.OP_REGS.filter((r) => r.kind === "chronic").map((r) => ({ r, s: P.opRefill(r) }));
    const od = rs.filter((x) => x.s.k === "overdue"), due = rs.filter((x) => x.s.k === "due" && x.s.left <= 1);
    if (od.length) a.push({ k: "op", icon: "history", title: od.length + (od.length === 1 ? " outpatient has" : " outpatients have") + " run out of chronic medicine", meta: od.map((x) => P.opPt(x.r.pt).name + " · " + P.med(x.r.med).name.split(" ")[0] + " " + x.s.late + " d").join(" · ") + " · call them", act: "Review", go: { to: "outpatients", tab: "refills" } });
    if (due.length) a.push({ k: "op", icon: "history", title: due.length + " refills due today or tomorrow", meta: due.map((x) => P.opPt(x.r.pt).name).join(" · ") + " · pre-pack them", act: "Pre-pack", go: { to: "outpatients", tab: "refills" } });
    const cc = P.OP_REGS.filter((r) => r.kind === "course" && P.opCourse(r).needCheck);
    if (cc.length) a.push({ k: "op", icon: "phone", title: cc.length + " antibiotic course" + (cc.length === 1 ? "" : "s") + " due a check-in", meta: cc.map((r) => P.opPt(r.pt).name + " · " + P.med(r.med).name.split(" ")[0]).join(" · "), act: "Check in", go: { to: "outpatients", tab: "courses" } });
    return a;
  };

  const initials = () => { const w = P.ROLES[P.db.settings.role].split(" "); return (w.length > 1 ? w.map((x) => x[0]).join("") : w[0]).slice(0, 2).toUpperCase(); };
  const pctClass = (p) => (p == null ? "" : p < 80 ? "bad" : p < 95 ? "mid" : "good");

  /* ── pill count + refill at the window ── */
  const RefillDialog = ({ r, onClose }) => {
    const db = P.useDb();
    const p = P.opPt(r.pt), m = P.med(r.med), s = P.opRefill(r);
    const sinceLast = Math.max(0, days(s.last.at, today0()));
    const expectLeft = Math.max(0, s.last.qty - sinceLast * r.daily);
    const [back, setBack] = useState(null);
    const [noBring, setNoBring] = useState(false);
    const [span, setSpan] = useState(p.stable ? 90 : 30);
    const qty = span * r.daily, have = P.medAt(r.med, "opd");
    const taken = back == null ? null : s.last.qty - back, should = Math.min(s.last.qty, sinceLast * r.daily);
    const pct = taken == null || !should ? null : Math.max(0, Math.min(100, Math.round((taken / should) * 100)));
    const ok = (back != null || noBring) && qty <= have;
    const save = () => {
      P.allocate(r.med, "opd", qty).parts.forEach((x) => P.move({ kind: "handover", med: r.med, batch: x.batch, from: "opd", to: "patient", qty: x.qty, ref: r.id, note: p.name + " · refill" }));
      db.opRefills = db.opRefills || {}; (db.opRefills[r.id] = db.opRefills[r.id] || []).push({ at: P.now(), qty, back: noBring ? null : back, by: initials() });
      if (db.opPrepack) delete db.opPrepack[r.id];
      P.commit(); P.toast("Refilled " + P.q(qty, r.med) + " for " + p.name + " · lasts to " + fmtD(today0() + span * DAY) + (pct != null ? " · adherence " + pct + "%" : "")); onClose();
    };
    return html`<${P.Dialog} title=${"Refill: " + m.name} sub=${p.name + " · " + r.dose + " · last refill " + fmtD(s.last.at) + " (" + P.q(s.last.qty, r.med) + ")"} onClose=${onClose}
      foot=${html`<span className="grow">Comes off OPD stock (${P.q(have, r.med)} there). Check identity at the window as usual.</span><${P.Btn} kind="primary" disabled=${!ok} onClick=${save}>Refill ${P.q(qty, r.med)}<//>`}>
      <div className="stack-s"><span className="lbl">Pill count: how many did they bring back?</span>
        <div className="row"><${P.Stepper} value=${back} onChange=${(v) => { setBack(v); setNoBring(false); }} unit=${m.unit} label="pills brought back" max=${s.last.qty} />
          <${P.Chip} size="sm" on=${noBring} onClick=${() => { setNoBring(!noBring); setBack(null); }}>Didn't bring them<//></div>
        <span className="hint">${sinceLast} days since the last refill × ${r.daily} a day: about ${expectLeft} should be left if every dose was taken.</span>
        ${pct != null ? html`<div className=${"pc-res " + pctClass(pct)}><b>${pct}%</b><span>${taken} of ${should} doses taken${pct < 80 ? ". Below 80%: ask why (side effects, cost, forgetting) and counsel before refilling." : pct < 95 ? ". Some doses missed: reinforce." : ". Good adherence."}</span></div>` : null}
        ${back != null && back > expectLeft + r.daily * 3 ? html`<p className="small ink2">More left than expected: possibly missed doses or extra supply at home.</p>` : null}</div>
      <div className="stack-s"><span className="lbl">Supply</span>
        <div className="chips">${[30, 60, 90].map((d) => html`<${P.Chip} key=${d} size="sm" on=${span === d} onClick=${() => setSpan(d)}>${d} days · ${d * r.daily} ${m.unit}<//>`)}</div>
        ${p.stable ? html`<span className="hint">Stable patient: a 3-month refill saves them trips (multi-month dispensing).</span>` : null}
        ${qty > have ? html`<div className="err"><${P.Icon} n="alert" s=${14} />Only ${have} at OPD: issue from the main store first.</div>` : null}
        <span className="small">Next refill due <b>${fmtD(today0() + span * DAY)}</b>. An SMS reminder goes 3 days before (sample).</span></div>
    <//>`;
  };

  const CheckIn = ({ r, onClose }) => {
    const db = P.useDb();
    const p = P.opPt(r.pt), m = P.med(r.med);
    const [how, setHow] = useState("Call"), [st, setSt] = useState(null), [missed, setMissed] = useState(null), [se, setSe] = useState([]);
    const ok = st && (st === "Taking as prescribed" || missed != null);
    const save = () => { db.opChecks = db.opChecks || {}; (db.opChecks[r.id] = db.opChecks[r.id] || []).push({ at: P.now(), how, status: st, missed: st === "Taking as prescribed" ? 0 : missed, se: se.join(", "), by: initials() }); P.commit(); P.toast("Check-in recorded for " + p.name); onClose(); };
    return html`<${P.Dialog} title=${"Check in: " + p.name} sub=${m.name + " · " + r.dose + " · " + p.phone} onClose=${onClose} foot=${html`<${P.Btn} kind="primary" disabled=${!ok} onClick=${save}>Record check-in<//>`}>
      <div className="chips">${["Call", "SMS reply", "At a visit"].map((x) => html`<${P.Chip} key=${x} size="sm" on=${how === x} onClick=${() => setHow(x)}>${x}<//>`)}</div>
      <div className="stack-s"><span className="lbl">How is it going?</span><div className="chips">${["Taking as prescribed", "Missed some doses", "Stopped early", "Not started"].map((x) => html`<${P.Chip} key=${x} on=${st === x} onClick=${() => setSt(x)}>${x}<//>`)}</div></div>
      ${st && st !== "Taking as prescribed" ? html`<div className="row"><span className="lbl">Doses missed</span><${P.Stepper} value=${missed} onChange=${setMissed} label="doses missed" /></div>
        <div className="note"><${P.Icon} n="alert" /><span>${st === "Stopped early" ? "Stopping an antibiotic early risks relapse and resistance: encourage them to finish the course, and ask the prescriber if side effects are the reason." : "Advise taking the next dose on time (don't double up) and finishing the course."}</span></div>` : null}
      <div className="stack-s"><span className="lbl">Side effects</span><div className="chips">${["None", "Nausea", "Diarrhoea", "Rash", "Dizziness"].map((x) => html`<${P.Chip} key=${x} size="sm" on=${se.includes(x)} onClick=${() => setSe(se.includes(x) ? se.filter((y) => y !== x) : se.concat(x))}>${x}<//>`)}</div>
        ${se.includes("Rash") ? html`<div className="err"><${P.Icon} n="alert" s=${14} />Rash: ask them to stop and come in today (possible allergy).</div>` : null}</div>
    <//>`;
  };

  /* ── rows ── */
  const SupplyBar = ({ s }) => { const pct = Math.max(0, Math.min(100, Math.round((s.left / s.supply) * 100))); return html`<span className=${"sup " + s.k}><i style=${{ width: pct + "%" }}></i></span>`; };

  const RefillRow = ({ r, onRefill }) => {
    const db = P.useDb();
    const p = P.opPt(r.pt), m = P.med(r.med), s = P.opRefill(r), pre = (db.opPrepack || {})[r.id];
    return html`<tr>
      <td><button type="button" className="clslink" onClick=${() => P.go({ to: "outpatients", pt: p.id })}>${p.name}</button><div className="dn-sub">${p.conds.join(", ")} · ${p.phone}</div></td>
      <td><div className="dn-name"><span className="strong">${m.name}</span><${P.MedTags} med=${r.med} compact=${true} /></div><div className="dn-sub">${r.dose}</div></td>
      <td><div className="row" style=${{ gap: "8px", flexWrap: "nowrap" }}><${SupplyBar} s=${s} /><span className=${"small strong sup-t " + s.k}>${s.k === "overdue" ? "Ran out " + s.late + " d ago" : s.left === 0 ? "Runs out today" : s.left + (s.left === 1 ? " day left" : " days left")}</span></div><div className="dn-sub">runs out ${fmtD(s.runOut)}</div></td>
      <td className=${"r num " + pctClass(s.lastPct)}>${s.lastPct == null ? "—" : s.lastPct + "%"}</td>
      <td className="r num">${s.mpr}%</td>
      <td><div className="row" style=${{ gap: "6px", flexWrap: "nowrap" }}>
        ${s.k !== "ok" ? html`<${P.Btn} size="sm" kind=${pre ? "ghost" : "outline"} icon=${pre ? "check" : "package"} onClick=${() => { db.opPrepack = { ...(db.opPrepack || {}), [r.id]: pre ? undefined : P.now() }; if (pre) delete db.opPrepack[r.id]; P.commit(); }}>${pre ? "Pre-packed" : "Pre-pack"}<//>` : null}
        <${P.Btn} size="sm" kind=${s.k === "ok" ? "ghost" : "navy"} onClick=${() => onRefill(r)}>Refill<//></div></td>
    </tr>`;
  };

  const RefillsTab = () => {
    const db = P.useDb();
    const [ref, setRef] = useState(null);
    const rs = P.OP_REGS.filter((r) => r.kind === "chronic").map((r) => ({ r, s: P.opRefill(r) })).sort((a, b) => a.s.runOut - b.s.runOut);
    const groups = [["Ran out: missed refill", (x) => x.s.k === "overdue"], ["Due within 5 days", (x) => x.s.k === "due"], ["Later", (x) => x.s.k === "ok"]];
    const dueSoon = rs.filter((x) => x.s.k !== "ok");
    return html`<div className="stack">
      <div className="row between"><p className="muted small">Run-out date = last refill + quantity ÷ daily dose. Pre-pack the ones due so the patient only waits for the pill count.</p>
        <${P.Btn} size="sm" icon="send" disabled=${!dueSoon.length} onClick=${() => { db.opSms = (db.opSms || 0) + dueSoon.length; P.commit(); P.toast("Reminder SMS sent to " + dueSoon.length + " patients (sample)", "send"); }}>Remind all due (${dueSoon.length})<//></div>
      ${groups.map(([w, f]) => { const l = rs.filter(f); return l.length ? html`<section key=${w} className="stack-s"><div className="section-h"><h2>${w}</h2><span className="muted">${l.length}</span></div>
        <div className="card"><div className="tblwrap"><table className="tbl dense">
          <thead><tr><th>Patient</th><th>Medicine</th><th>Supply left</th><th className="r">Last pill count</th><th className="r">Possession (MPR)</th><th></th></tr></thead>
          <tbody>${l.map(({ r }) => html`<${RefillRow} key=${r.id} r=${r} onRefill=${setRef} />`)}</tbody></table></div></div></section>` : null; })}
      ${ref ? html`<${RefillDialog} r=${ref} onClose=${() => setRef(null)} />` : null}
    </div>`;
  };

  const CoursesTab = () => {
    P.useDb();
    const [chk, setChk] = useState(null);
    const cs = P.OP_REGS.filter((r) => r.kind === "course");
    return html`<div className="stack">
      <p className="muted small">Short courses (antibiotics) get a check-in on day 2–3 and again near the end, by call or SMS. Missed doses and side effects show here.</p>
      <div className="op-grid">${cs.map((r) => {
        const p = P.opPt(r.pt), m = P.med(r.med), c = P.opCourse(r);
        return html`<div key=${r.id} className="card pad stack-s">
          <div className="row between"><button type="button" className="clslink" onClick=${() => P.go({ to: "outpatients", pt: p.id })}>${p.name}</button>${c.done ? html`<${P.Tag} icon="check">Course ended ${fmtD(c.end - DAY)}<//>` : c.needCheck ? html`<${P.Tag} kind="caution" icon="phone">Check-in due<//>` : html`<${P.Tag}>Day ${c.dayN} of ${r.courseDays}<//>`}</div>
          <div><span className="strong">${m.name}</span><${P.MedTags} med=${r.med} compact=${true} /><div className="dn-sub">${r.dose} · ${r.courseDays} days · ${P.q(r.qty, r.med)} from ${fmtD(r.start)} · ${p.conds[0]}</div></div>
          <div className="course">${Array.from({ length: r.courseDays }, (_, i) => html`<span key=${i} className=${i < c.dayN - (c.done ? 0 : 1) ? "past" : i === c.dayN - 1 && !c.done ? "now" : ""}>D${i + 1}</span>`)}</div>
          ${c.checks.length ? html`<div className="ip-notes">${c.checks.slice().reverse().map((x, i) => html`<div key=${i}><b className=${x.status === "Taking as prescribed" ? "" : "warn-t"}>${x.status}${x.missed ? " · " + x.missed + " missed" : ""}</b><span className="muted small">${x.how} · ${fmtD(x.at)}${x.se ? " · " + x.se : ""}</span></div>`)}</div>` : html`<p className="muted small">No check-in yet.</p>`}
          ${c.done ? null : html`<div><${P.Btn} size="sm" kind=${c.needCheck ? "navy" : "outline"} icon="phone" onClick=${() => setChk(r)}>Check in<//></div>`}
        </div>`;
      })}</div>
      ${chk ? html`<${CheckIn} r=${chk} onClose=${() => setChk(null)} />` : null}
    </div>`;
  };

  const AdherenceTab = () => {
    P.useDb();
    const rs = P.OP_REGS.filter((r) => r.kind === "chronic").map((r) => ({ r, s: P.opRefill(r) })).filter((x) => x.s.lastPct != null).sort((a, b) => a.s.lastPct - b.s.lastPct);
    const bands = [["Below 80%", (p) => p < 80, "bad"], ["80–94%", (p) => p >= 80 && p < 95, "mid"], ["95% and above", (p) => p >= 95, "good"]];
    return html`<div className="stack">
      <div className="kpis">${bands.map(([w, f, c]) => html`<div key=${w} className="kpi"><b className=${c === "bad" ? "bad" : ""}>${rs.filter((x) => f(x.s.lastPct)).length}</b><span>${w} at the last pill count</span></div>`)}
        <div className="kpi"><b>${rs.length ? Math.round(rs.reduce((a, x) => a + x.s.mpr, 0) / rs.length) : "—"}%</b><span>average medication possession (MPR)</span></div></div>
      <div className="card"><div className="tblwrap"><table className="tbl dense">
        <thead><tr><th>Patient</th><th>Medicine</th><th>Pill counts, oldest first</th><th className="r">MPR</th><th>Suggested</th></tr></thead>
        <tbody>${rs.map(({ r, s }) => { const p = P.opPt(r.pt); return html`<tr key=${r.id}>
          <td><button type="button" className="clslink" onClick=${() => P.go({ to: "outpatients", pt: p.id })}>${p.name}</button><div className="dn-sub">${p.conds.join(", ")}</div></td>
          <td>${P.med(r.med).name}<div className="dn-sub">${r.dose}</div></td>
          <td><div className="pcs">${s.counts.map((c, i) => html`<span key=${i} className=${"pc " + pctClass(c.pct)} title=${fmtD(c.at) + ": " + c.taken + " of " + c.should + " taken" + (c.late ? ", " + c.late + " days late for refill" : "")}>${c.pct}%</span>`)}</div></td>
          <td className="r num">${s.mpr}%</td>
          <td className="small">${s.lastPct < 80 ? "Adherence counselling; check side effects and cost; consider a treatment supporter" : s.lastPct < 95 ? "Reinforce at the window; SMS reminders" : p.stable ? "Stable: 3-month refills / fast-track" : "Keep going"}</td></tr>`; })}</tbody></table></div></div>
      <p className="hint">Adherence = pills taken ÷ pills that should have been taken since the last refill (from the pill count). MPR = days of medicine supplied ÷ days elapsed: gaps between refills lower it.</p>
    </div>`;
  };

  const PatientsTab = () => {
    P.useDb();
    const [q, setQ] = useState("");
    const list = P.OP_PATIENTS.filter((p) => (p.name + p.conds.join(" ") + p.phone + p.clinic).toLowerCase().includes(q.trim().toLowerCase()));
    return html`<div className="stack">
      <input className="input" style=${{ maxWidth: "340px" }} placeholder="Name, condition, clinic or phone" value=${q} onChange=${(e) => setQ(e.target.value)} />
      <div className="list">${list.map((p) => {
        const rs = P.opRegsOf(p.id), ch = rs.filter((r) => r.kind === "chronic").map((r) => P.opRefill(r)), worst = ch.some((s) => s.k === "overdue") ? "overdue" : ch.some((s) => s.k === "due") ? "due" : "ok";
        const course = rs.find((r) => r.kind === "course");
        return html`<button type="button" key=${p.id} className="lrow" onClick=${() => P.go({ to: "outpatients", pt: p.id })}>
          <div className=${"vx-av " + (course ? "due" : worst)}>${p.sex}</div>
          <div className="grow"><div className="t">${p.name} <span className="muted small">${p.age} y · ${p.clinic}</span></div><div className="m">${p.conds.join(", ")} · ${rs.map((r) => P.med(r.med).name.split(" ")[0]).join(", ")} · ${p.phone}</div></div>
          ${course ? html`<span className="vx-st due">On a course</span>` : html`<span className=${"vx-st " + worst}>${worst === "overdue" ? "Missed refill" : worst === "due" ? "Refill due" : "Up to date"}</span>`}</button>`;
      })}</div>
    </div>`;
  };

  const PatientPage = ({ p }) => {
    const db = P.useDb();
    const [ref, setRef] = useState(null), [chk, setChk] = useState(null), [note, setNote] = useState("");
    const rs = P.opRegsOf(p.id), notes = ((db.opNotes || {})[p.id]) || [];
    return html`<div className="stack">
      <div className="card pad ip-head">
        <div className="rx-av" aria-hidden="true">${p.name.slice(-2)}</div>
        <div className="grow"><h2 style=${{ fontSize: "18px" }}>${p.name}</h2><div className="muted">${p.sex} · ${p.age} y · ${p.clinic} · ${p.phone}</div><div className="row" style=${{ marginTop: "6px" }}>${p.conds.map((c) => html`<${P.Tag} key=${c}>${c}<//>`)}${p.stable ? html`<${P.Tag} icon="check">Stable: multi-month refills<//>` : null}</div></div>
      </div>
      ${rs.map((r) => {
        const m = P.med(r.med);
        if (r.kind === "course") { const c = P.opCourse(r); return html`<div key=${r.id} className="card pad stack-s">
          <div className="row between"><div><span className="strong">${m.name}</span><${P.MedTags} med=${r.med} /><div className="dn-sub">${r.dose} · ${r.courseDays}-day course from ${fmtD(r.start)}</div></div><${P.Btn} size="sm" icon="phone" kind=${c.needCheck ? "navy" : "outline"} onClick=${() => setChk(r)}>Check in<//></div>
          <div className="course">${Array.from({ length: r.courseDays }, (_, i) => html`<span key=${i} className=${i < c.dayN - (c.done ? 0 : 1) ? "past" : i === c.dayN - 1 && !c.done ? "now" : ""}>D${i + 1}</span>`)}</div>
          ${c.checks.length ? html`<div className="ip-notes">${c.checks.map((x, i) => html`<div key=${i}><b>${x.status}${x.missed ? " · " + x.missed + " missed" : ""}</b><span className="muted small">${x.how} · ${fmtD(x.at)}${x.se ? " · " + x.se : ""}</span></div>`)}</div>` : null}
        </div>`; }
        const s = P.opRefill(r), h = P.opHist(r);
        return html`<div key=${r.id} className="card pad stack-s">
          <div className="row between"><div><span className="strong">${m.name}</span><${P.MedTags} med=${r.med} /><div className="dn-sub">${r.dose} · ${r.daily} ${r.daily === 1 ? m.unit.replace(/s$/, "") : m.unit} a day</div></div><${P.Btn} size="sm" kind=${s.k === "ok" ? "outline" : "navy"} onClick=${() => setRef(r)}>Refill<//></div>
          <div className="op-kpis">
            <div><span>Supply left</span><b className=${"sup-t " + s.k}>${s.k === "overdue" ? "Ran out " + s.late + " d ago" : s.left + (s.left === 1 ? " day" : " days")}</b><${SupplyBar} s=${s} /></div>
            <div><span>Runs out</span><b>${fmtD(s.runOut)}</b><small>${rel(s.runOut)}</small></div>
            <div><span>Last pill count</span><b className=${pctClass(s.lastPct)}>${s.lastPct == null ? "—" : s.lastPct + "%"}</b><small>adherence</small></div>
            <div><span>Possession (MPR)</span><b>${s.mpr}%</b><small>since ${fmtD(h[0].at)}</small></div>
          </div>
          <div className="tl">${h.map((x, i) => { const c = s.counts.find((y) => y.at === x.at); return html`<div key=${i} className="tl-i"><b>${fmtD(x.at)}</b><span>${P.q(x.qty, r.med)} · ${Math.floor(x.qty / r.daily)} days</span>${c ? html`<span className=${"pc " + pctClass(c.pct)}>${c.pct}%${c.late ? " · " + c.late + " d late" : ""}</span>` : i ? html`<span className="muted small">no count</span>` : html`<span className="muted small">started</span>`}</div>`; })}</div>
        </div>`;
      })}
      <div className="card pad stack-s"><h3 style=${{ fontSize: "14px" }}>Counselling and follow-up notes</h3>
        <div className="chips">${["Counselled on adherence", "Discussed side effects", "Treatment supporter named", "Referred to clinician", "Moved to 3-month refills"].map((c) => html`<${P.Chip} key=${c} size="sm" onClick=${() => { db.opNotes = db.opNotes || {}; (db.opNotes[p.id] = db.opNotes[p.id] || []).push({ t: c, at: P.now(), by: P.who() }); P.commit(); }}>${c}<//>`)}</div>
        <div className="row"><input className="input" style=${{ flex: 1, minWidth: "180px" }} placeholder="Add a note" value=${note} onChange=${(e) => setNote(e.target.value)} /><${P.Btn} kind="navy" disabled=${!note.trim()} onClick=${() => { db.opNotes = db.opNotes || {}; (db.opNotes[p.id] = db.opNotes[p.id] || []).push({ t: note.trim(), at: P.now(), by: P.who() }); P.commit(); setNote(""); }}>Add<//></div>
        ${notes.length ? html`<div className="ip-notes">${notes.slice().reverse().map((n, i) => html`<div key=${i}><b>${n.t}</b><span className="muted small">${P.when(n.at)} · ${n.by}</span></div>`)}</div>` : null}
      </div>
      ${ref ? html`<${RefillDialog} r=${ref} onClose=${() => setRef(null)} />` : null}
      ${chk ? html`<${CheckIn} r=${chk} onClose=${() => setChk(null)} />` : null}
    </div>`;
  };

  P.OutpatientsView = ({ route }) => {
    P.useDb();
    if (route.pt) return html`<div className="stack"><button type="button" className="back" onClick=${() => P.go({ to: "outpatients", tab: "patients" })}><${P.Icon} n="left" s=${16} />Outpatients</button><${PatientPage} key=${route.pt} p=${P.opPt(route.pt)} /></div>`;
    const tab = route.tab || "refills";
    const ch = P.OP_REGS.filter((r) => r.kind === "chronic").map((r) => P.opRefill(r));
    const courses = P.OP_REGS.filter((r) => r.kind === "course").map((r) => P.opCourse(r));
    const counted = ch.filter((s) => s.lastPct != null);
    return html`<div className="stack">
      <div className="kpis">
        <div className="kpi"><b className=${ch.some((s) => s.k === "overdue") ? "bad" : ""}>${ch.filter((s) => s.k === "overdue").length}</b><span>ran out: missed refill</span></div>
        <div className="kpi"><b>${ch.filter((s) => s.k === "due").length}</b><span>refills due within 5 days</span></div>
        <div className="kpi"><b>${courses.filter((c) => !c.done).length}</b><span>antibiotic courses running (${courses.filter((c) => c.needCheck).length} need a check-in)</span></div>
        <div className="kpi"><b>${counted.length ? Math.round(counted.reduce((a, s) => a + s.lastPct, 0) / counted.length) : "—"}%</b><span>average adherence at the last pill count</span></div>
      </div>
      <${P.Seg} label="Outpatients" value=${tab} onChange=${(t) => P.go({ to: "outpatients", tab: t })} items=${[{ v: "refills", label: "Refills", n: ch.filter((s) => s.k !== "ok").length || null }, { v: "courses", label: "Courses", n: courses.filter((c) => c.needCheck).length || null }, { v: "adherence", label: "Adherence" }, { v: "patients", label: "Patients", n: P.OP_PATIENTS.length }]} />
      ${tab === "refills" ? html`<${RefillsTab} />` : tab === "courses" ? html`<${CoursesTab} />` : tab === "adherence" ? html`<${AdherenceTab} />` : html`<${PatientsTab} />`}
    </div>`;
  };
})();
