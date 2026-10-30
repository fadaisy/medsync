/* Prescription checks at the window: allergy, dose for weight in children, kidney function, pregnancy,
   duplicate therapy and interactions with what the patient already takes. Each flag is answered before hand-over:
   checked and why, or held to talk to the prescriber. Sample rules, not a clinical reference. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;

  /* sample clinical context for the waiting prescriptions, and the directions on each line */
  const CLIN = {
    r1: { kg: 64, allergy: "Penicillin (rash, 2023)", current: [], doses: [{ txt: "500 mg three times a day · 5 days", mg: 500, perDay: 3, days: 5 }, { txt: "1 g three times a day · 3 days", mg: 1000, perDay: 3, days: 3 }] },
    r2: { kg: 20, allergy: null, current: [], doses: [{ txt: "1 sachet after each loose stool", mg: null }, { txt: "500 mg (1 tablet) three times a day · 3 days", mg: 500, perDay: 3, days: 3 }] },
    r3: { kg: 58, allergy: null, pregnant: "10 weeks", current: [], alcohol: true, doses: [{ txt: "400 mg three times a day · 7 days", mg: 400, perDay: 3, days: 7 }, { txt: "1 tablet daily · 30 days", mg: 200, perDay: 1, days: 30 }] },
    r4: { kg: 81, allergy: null, egfr: 38, current: ["amlo"], doses: [{ txt: "1 g twice a day · 30 days", mg: 1000, perDay: 2, days: 30 }] },
    r5: { kg: 70, allergy: null, current: ["ctx"], currentNote: "Cotrimoxazole prophylaxis from the HIV clinic", doses: [{ txt: "960 mg twice a day · 7 days", mg: 960, perDay: 2, days: 7 }, { txt: "1 g three times a day · 3 days", mg: 1000, perDay: 3, days: 3 }] },
  };
  P.rxClin = (rx) => CLIN[rx.id] || { doses: [] };
  /* per-dose mg/kg ranges for children (sample) */
  const PAED = { pcm: [10, 15, "paracetamol"], amox: [12, 30, "amoxicillin"], metro: [7.5, 10, "metronidazole"], ctx: [12, 24, "cotrimoxazole (as total)"] };
  const ALLERGY = { amox: /penicillin/i, ceft: /cephalosporin|penicillin \(anaph/i };
  const IX = { metro: [/alcohol/, "Alcohol: disulfiram-like reaction (flushing, vomiting). No alcohol during the course and for 48 h after."] };

  P.rxChecks = (rx) => {
    const c = P.rxClin(rx), out = [];
    rx.lines.forEach((l, i) => {
      const m = P.med(l.med), d = c.doses[i] || {}, id = (k) => rx.id + ":" + i + ":" + k;
      if (c.allergy && ALLERGY[l.med] && ALLERGY[l.med].test(c.allergy)) out.push({ id: id("allergy"), i, sev: "stop", title: "Allergy: " + c.allergy, body: m.name + " is a penicillin. Don't give it unless the prescriber confirms after review; a macrolide (e.g. erythromycin) is the usual alternative." });
      if (rx.age < 12 && PAED[l.med] && d.mg && c.kg) {
        const per = d.mg / c.kg, [lo, hi] = PAED[l.med];
        if (per > hi * 1.1 || per < lo * 0.8) out.push({ id: id("dose"), i, sev: "warn", title: "Dose " + (per > hi ? "high" : "low") + " for weight: " + Math.round(per) + " mg/kg per dose", body: "For " + c.kg + " kg the usual is " + lo + "–" + hi + " mg/kg per dose: " + Math.round(lo * c.kg) + "–" + Math.round(hi * c.kg) + " mg. Prescribed " + d.mg + " mg." });
      }
      if (c.egfr && l.med === "metf" && d.mg) { const day = d.mg * d.perDay; if (c.egfr < 30) out.push({ id: id("renal"), i, sev: "stop", title: "Kidney function: eGFR " + c.egfr, body: "Metformin should not be used below eGFR 30." }); else if (c.egfr < 45 && day > 1000) out.push({ id: id("renal"), i, sev: "warn", title: "Kidney function: eGFR " + c.egfr + " (last month)", body: "With eGFR 30–45 the maximum is 1 g a day. Prescribed " + day / 1000 + " g a day." }); }
      if (c.pregnant && l.med === "metro") out.push({ id: id("preg"), i, sev: "warn", title: "Pregnant, " + c.pregnant + " (first trimester)", body: "Metronidazole: avoid high-dose and long courses in the first trimester. Confirm the indication with the prescriber." });
      if ((c.current || []).includes(l.med)) out.push({ id: id("dup"), i, sev: "warn", title: "Already taking it: " + (c.currentNote || m.name), body: "Duplicate therapy. Treatment dose replaces the prophylaxis for the course; make sure the patient doesn't take both." });
      if (IX[l.med] && c.alcohol && IX[l.med][0].test("alcohol")) out.push({ id: id("ix"), i, sev: "info", title: "Counsel: alcohol", body: IX[l.med][1] });
    });
    return out;
  };
  const OKWHY = { stop: ["Prescriber confirmed after review"], warn: ["Prescriber aware and confirmed", "Dose adjusted with the prescriber", "Benefit outweighs the risk, documented"], info: ["Counselled"] };

  /* the panel inside a prescription: patient context, then each flag with its answer */
  P.RxChecksPanel = ({ rx, decisions, ack, setAck, onQuery }) => {
    const db = P.useDb();
    const c = P.rxClin(rx), flags = P.rxChecks(rx);
    const [open, setOpen] = useState(null);
    const [who, setWho] = useState(null);
    const docs = (P.STAFF || []).filter((x) => !x.only);
    return html`<div className="ck-panel">
      <div className="ck-facts">
        ${c.kg ? html`<span><b>${c.kg} kg</b> weight</span>` : null}
        <span className=${c.allergy ? "bad" : ""}><b>${c.allergy ? "Allergy" : "No allergies"}</b> ${c.allergy || "recorded"}</span>
        ${c.pregnant ? html`<span className="warn"><b>Pregnant</b> ${c.pregnant}</span>` : null}
        ${c.egfr ? html`<span className="warn"><b>eGFR ${c.egfr}</b> last month</span>` : null}
        ${(c.current || []).length ? html`<span><b>Already taking</b> ${c.current.map((x) => P.med(x).name).join(", ")}</span>` : null}
      </div>
      ${flags.length ? html`<div className="ck-list">${flags.map((f) => {
        const a = ack[f.id], dec = decisions[f.i], held = dec === "hold" || dec === "owe";
        return html`<div key=${f.id} className=${P.cx("ck-flag", f.sev, (a || held) && "done")}>
          <span className="ck-sev">${{ stop: "Stop", warn: "Check", info: "Counsel" }[f.sev]}</span>
          <div className="grow"><b>${P.med(rx.lines[f.i].med).name}: ${f.title}</b><div className="small">${f.body}</div>
            ${a ? html`<div className="small ok-c"><${P.Icon} n="check" s=${12} /> ${a.why}${a.who ? " · " + a.who : ""} · ${a.by}</div>` : held ? html`<div className="small muted">Line ${dec === "hold" ? "held" : "owed"}: not given today.</div>` : null}
            ${open === f.id && !a ? html`<div className="stack-s" style=${{ marginTop: "8px" }}>
              <div className="chips">${OKWHY[f.sev].map((w) => html`<${P.Chip} key=${w} size="sm" on=${who === w || (f.sev !== "stop" && false)} onClick=${() => { if (f.sev === "stop") setWho(w); else { setAck({ ...ack, [f.id]: { why: w, by: P.who(), at: P.now() } }); setOpen(null); } }}>${w}<//>`)}</div>
              ${f.sev === "stop" && who ? html`<div className="chips">${docs.slice(0, 6).map((d) => html`<${P.Chip} key=${d.id} size="sm" onClick=${() => { setAck({ ...ack, [f.id]: { why: who, who: d.name, by: P.who(), at: P.now() } }); setOpen(null); setWho(null); }}>${d.name}<//>`)}</div>` : null}
            </div>` : null}
          </div>
          ${a || held ? null : html`<div className="ck-acts">
            ${f.sev === "info" ? html`<${P.Btn} size="sm" onClick=${() => setAck({ ...ack, [f.id]: { why: "Counselled", by: P.who(), at: P.now() } })}>Counselled<//>`
              : html`<${P.Btn} size="sm" kind="primary" onClick=${() => onQuery(f)}>Talk to the prescriber<//><${P.Btn} size="sm" kind="ghost" onClick=${() => setOpen(open === f.id ? null : f.id)}>${f.sev === "stop" ? "Prescriber confirmed" : "Checked, give it"}<//>`}</div>`}
        </div>`; })}</div>`
      : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />No allergy, dose, kidney, pregnancy, duplicate or interaction flags for these lines.</p>`}
    </div>`;
  };
  /* is anything still unanswered on a line that is being given? */
  P.rxChecksOpen = (rx, decisions, ack) => P.rxChecks(rx).filter((f) => f.sev !== "info" && !ack[f.id] && decisions[f.i] === "give").length + P.rxChecks(rx).filter((f) => f.sev === "info" && !ack[f.id] && decisions[f.i] === "give").length;

  /* the query sent to the prescriber (shows on Today until answered) */
  P.QueryDialog = ({ rx, f, onSend, onClose }) => {
    const [ask, setAsk] = useState(null);
    return html`<${P.Dialog} title=${"Talk to the prescriber: " + rx.patient} sub=${P.med(rx.lines[f.i].med).name + " · " + f.title} onClose=${onClose}
      foot=${html`<span className="grow muted small">The line is held; the patient waits or comes back.</span><${P.Btn} kind="primary" icon="send" disabled=${!ask} onClick=${() => onSend(ask)}>Send to ${rx.from}<//>`}>
      <div className="stack-s"><span className="lbl">What you're asking</span><div className="chips">${["Change to an alternative", "Confirm or adjust the dose", "Confirm it should be given", "Stop it"].map((w) => html`<${P.Chip} key=${w} on=${ask === w} onClick=${() => setAsk(w)}>${w}<//>`)}</div></div>
      <p className="hint">Sent to the prescriber's queue at ${rx.from} with the flag attached (prototype: shown on Today).</p>
    <//>`;
  };
})();
