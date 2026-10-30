/* Dispense: Waiting, Ready to collect, Owed, Handed over. A prescription is one screen: check, pick, hand over. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const digits = (s) => String(s || "").replace(/\D/g, "");

  const RxRow = ({ r, current, tab }) => html`
    <button type="button" className="lrow" aria-current=${current ? "true" : "false"} onClick=${() => P.go({ to: "dispense", tab, rx: r.id })}>
      <div className="rx-av" aria-hidden="true">${r.patient.slice(-2)}</div>
      <div className="grow">
        <div className="t">${r.patient}</div>
        <div className="m">${r.sex} · ${r.age} y · ${r.from} · ${r.lines.length} ${r.lines.length === 1 ? "medicine" : "medicines"}</div>
      </div>
      <div className="m num" style=${{ textAlign: "right" }}>${r.status === "ready" ? "Ready" : P.ago(r.since)}</div>
    </button>`;

  function RxScreen({ rx, onDone }) {
    P.useDb();
    const place = "opd";
    const [lines, setLines] = useState(() => rx.draft || rx.lines.map((l) => {
      const f = P.fefo(l.med, place)[0];
      return { decision: null, batch: f ? f.id : null, qty: null, why: null, hold: null, showBatches: false, brand: null };
    }));
    const [idMode, setIdMode] = useState("dob");
    const [idVal, setIdVal] = useState("");
    const [idOk, setIdOk] = useState(null);
    const [counsel, setCounsel] = useState([]);
    const [lang, setLang] = useState("English");
    const [labels, setLabels] = useState(true);
    const [ack, setAck] = useState(rx.ack || {});
    const [query, setQuery] = useState(null);
    const upd = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

    const lineState = rx.lines.map((l, i) => {
      const s = lines[i], have = P.medAt(l.med, place), b = s.batch && P.batch(s.batch), inBatch = b ? P.bal(b.id, place) : 0;
      let problem = null;
      if (s.decision === "give") {
        if (!s.qty) problem = "Type or step the quantity you are giving.";
        else if (s.qty > inBatch) problem = "Only " + P.q(inBatch, l.med) + " in batch " + (b ? b.no : "") + ". Choose another batch or give less.";
        else if (s.qty !== l.qty && !s.why) problem = "Different from the prescribed " + P.q(l.qty, l.med) + ": say why.";
      }
      if (s.decision === "hold" && !s.hold) problem = "Say why it is held.";
      return { have, b, inBatch, problem, decided: !!s.decision && !problem };
    });
    const allDecided = lineState.every((x) => x.decided);
    const anyGive = lines.some((l) => l.decision === "give");
    const allHeld = lines.every((l) => l.decision === "hold");
    const needId = anyGive || lines.some((l) => l.decision === "owe");
    const checksOpen = P.rxChecksOpen ? P.rxChecksOpen(rx, lines.map((l) => l.decision), ack) : 0;
    const canHand = allDecided && (!needId || idOk === true) && !allHeld && !checksOpen;
    const sendQuery = (f, ask) => {
      upd(f.i, { decision: "hold", hold: "Query the prescriber" });
      const db = P.db; (db.rxQueries = db.rxQueries || []).push({ id: "q" + db.seq++, rx: rx.id, patient: rx.patient, from: rx.from, med: rx.lines[f.i].med, flag: f.title, ask, at: P.now(), by: P.who(), status: "open" });
      P.commit(); P.toast("Sent to the prescriber at " + rx.from + ". The line is held.", "send"); setQuery(null);
    };

    const checkId = () => {
      const want = idMode === "dob" ? digits(rx.dob) : "0772";
      const got = digits(idVal);
      setIdOk(got.length >= 4 && (idMode === "dob" ? got === want : want.endsWith(got.slice(-4))));
    };

    const handOver = () => {
      const db = P.db;
      rx.lines.forEach((l, i) => {
        const s = lines[i];
        if (s.decision === "give") {
          P.move({ kind: "handover", med: l.med, batch: s.batch, from: place, to: "patient", qty: s.qty, ref: rx.id, note: rx.patient });
          if (s.why === "partial" && s.qty < l.qty) db.owed.push({ id: "o" + db.seq++, patient: rx.patient, med: l.med, qty: l.qty - s.qty, since: P.now(), told: null, done: false, kind: "owed" });
        }
        if (s.decision === "owe") db.owed.push({ id: "o" + db.seq++, patient: rx.patient, med: l.med, qty: l.qty, since: P.now(), told: null, done: false, kind: "owed" });
        if (s.decision === "hold") db.owed.push({ id: "o" + db.seq++, patient: rx.patient, med: l.med, qty: l.qty, since: P.now(), told: null, done: false, kind: "hold", reason: s.hold });
      });
      rx.status = "done"; rx.doneAt = P.now(); rx.draft = null; rx.ack = ack; rx.doneBy = P.who();
      P.commit();
      P.toast("Handed over to " + rx.patient + (labels && anyGive ? " · labels sent to the OPD label printer" : ""), "check");
      onDone();
    };
    const holdAll = () => { rx.status = "held"; rx.draft = lines; P.commit(); P.toast(rx.patient + " is on hold: " + (lines[0].hold || "held")); onDone(); };
    const later = () => { rx.status = "ready"; rx.draft = lines; P.commit(); P.toast(rx.patient + " moved to Ready to collect"); onDone(); };

    return html`<div className="card">
      <div className="pad stack">
        <div className="rx-h">
          <div className="rx-av" aria-hidden="true">${rx.patient.slice(-2)}</div>
          <div className="grow">
            <h2 style=${{ fontSize: "18px" }}>${rx.patient}</h2>
            <div className="muted">${rx.sex} · ${rx.age} y · ${rx.from} · prescriber (sample) · waiting ${P.ago(rx.since)}</div>
          </div>
        </div>
        ${P.RxChecksPanel ? html`<${P.RxChecksPanel} rx=${rx} decisions=${lines.map((l) => l.decision)} ack=${ack} setAck=${setAck} onQuery=${(f) => setQuery(f)} />` : null}

        <div className=${P.cx("step", lineState.every((x) => x.decided) && "done")}>
          <div className="step-n">1</div>
          <div>
            <h3>Check and pick each medicine</h3>
            ${rx.lines.map((l, i) => {
              const s = lines[i], st = lineState[i], m = P.med(l.med), fe = P.fefo(l.med, place, s.brand);
              return html`<div className="line" key=${i}>
                <div className="line-top">
                  <div className="line-info">
                    <div className="line-h"><b>${m.name}</b><${P.MedTags} med=${l.med} /><span className="muted">${(P.rxClin ? (P.rxClin(rx).doses[i] || {}).txt : null) || P.SAMPLE_DOSE} · prescribed ${P.q(l.qty, l.med)}</span></div>
                    <div className="muted small">${st.have ? P.q(st.have, l.med) + " at OPD" : "None at OPD"}${P.medAt(l.med, "store") ? " · " + P.q(P.medAt(l.med, "store"), l.med) + " in the main store" : " · none in the main store"}</div>
                    <div className="medrow"><${P.MedFacts} med=${l.med} /><${P.BrandPick} med=${l.med} place=${place} value=${s.brand} onChange=${(b) => { const f = P.fefo(l.med, place, b)[0]; upd(i, { brand: b, batch: f ? f.id : null, showBatches: false }); }} /></div>
                  </div>
                  <div className="chips">
                    <${P.Chip} on=${s.decision === "give"} disabled=${!st.have} onClick=${() => upd(i, { decision: "give" })}>Give<//>
                    <${P.Chip} on=${s.decision === "owe"} onClick=${() => upd(i, { decision: "owe" })}>${st.have ? "Owe it (patient returns)" : "Not in stock: owe it"}<//>
                    <${P.Chip} on=${s.decision === "hold"} onClick=${() => upd(i, { decision: "hold" })}>Hold<//>
                  </div>
                </div>
                ${s.decision === "hold" ? html`<div className="chips">${["Query the prescriber", "Patient will come back", "Possible interaction"].map((h) => html`<${P.Chip} size="sm" key=${h} on=${s.hold === h} onClick=${() => upd(i, { hold: h })}>${h}<//>`)}</div>` : null}
                ${s.decision === "give" ? html`
                  <div className="row">
                    <div className="stack-s">
                      <span className="lbl">Batch</span>
                      <div className="chips">
                        ${(s.showBatches ? fe : fe.filter((b) => b.id === s.batch)).map((b) => html`<${P.Chip} key=${b.id} on=${b.id === s.batch} onClick=${() => upd(i, { batch: b.id, showBatches: false })}>
                          ${P.batchBrand(b)} · <span className="mono">${b.no}</span> · ${P.expWord(b.exp)} · ${P.bal(b.id, place)}<//>`)}
                        ${!s.showBatches && fe.length > 1 ? html`<button type="button" className="btn ghost sm" onClick=${() => upd(i, { showBatches: true })}>Other batch</button>` : null}
                      </div>
                      <span className="hint">Earliest expiry first. Scan the box to confirm it.</span>
                    </div>
                    <div className="stack-s">
                      <span className="lbl">Giving</span>
                      <${P.Stepper} value=${s.qty} onChange=${(v) => upd(i, { qty: v })} step=${1} unit=${m.unit} label=${"quantity of " + m.name} />
                      <span className="hint">Typed or stepped. Never filled in for you (rule SU-6).</span>
                    </div>
                  </div>
                  ${s.qty && s.qty !== l.qty ? html`<div className="chips">
                    ${(s.qty < l.qty ? [["partial", "Partial: owe the rest"], ["pack", "Pack size"], ["agreed", "Prescriber agreed"]] : [["pack", "Pack size"], ["agreed", "Prescriber agreed"]]).map(([k, w]) => html`<${P.Chip} size="sm" key=${k} on=${s.why === k} onClick=${() => upd(i, { why: k })}>${w}<//>`)}
                  </div>` : null}` : null}
                ${st.problem && s.decision ? html`<div className="err"><${P.Icon} n="alert" s=${14} />${st.problem}</div>` : null}
              </div>`;
            })}
          </div>
        </div>

        ${needId ? html`<div className=${P.cx("step", idOk && "done")}>
          <div className="step-n">2</div>
          <div className="stack-s">
            <h3>Hand over</h3>
            <div className="row">
              <${P.Chip} size="sm" on=${idMode === "dob"} onClick=${() => { setIdMode("dob"); setIdOk(null); setIdVal(""); }}>Ask date of birth<//>
              <${P.Chip} size="sm" on=${idMode === "phone"} onClick=${() => { setIdMode("phone"); setIdOk(null); setIdVal(""); }}>Ask phone number<//>
              <input className="input" style=${{ maxWidth: "220px" }} inputMode="numeric" aria-label=${idMode === "dob" ? "Patient's date of birth" : "Patient's phone number"}
                placeholder=${idMode === "dob" ? "DD/MM/YYYY" : "Last 4 digits"} value=${idVal} onChange=${(e) => { setIdVal(e.target.value); setIdOk(null); }}
                onKeyDown=${(e) => { if (e.key === "Enter") checkId(); }} />
              <${P.Btn} kind="navy" onClick=${checkId} disabled=${digits(idVal).length < 4}>Check<//>
              ${idOk === true ? html`<span className="ok-line"><${P.Icon} n="check" s=${14} />Matches the record</span>` : null}
              ${idOk === false ? html`<span className="err"><${P.Icon} n="alert" s=${14} />Does not match. Check the name and ask again.</span>` : null}
            </div>
            <span className="hint">Prototype hint: the sample record says ${idMode === "dob" ? rx.dob : "…0772"}. It stays typed, so nobody can pick it from a list.</span>
            <div className="ho-grid">
              <div className="stack-s"><span className="lbl">Counselling given</span>
                <div className="chips">${["How to take it", "Side effects to watch for", "If a dose is missed", "How to store it"].map((c) => html`<${P.Chip} size="sm" key=${c} on=${counsel.includes(c)} onClick=${() => setCounsel(counsel.includes(c) ? counsel.filter((x) => x !== c) : counsel.concat(c))}>${c}<//>`)}</div></div>
              <div className="stack-s"><span className="lbl">Language</span>
                <div className="chips">${["English", "Luganda", "Runyankole", "Swahili", "Other"].map((c) => html`<${P.Chip} size="sm" key=${c} on=${lang === c} onClick=${() => setLang(c)}>${c}<//>`)}</div></div>
            </div>
            <div className="chips"><${P.Chip} size="sm" icon="printer" on=${labels} onClick=${() => setLabels(!labels)}>Print labels on the OPD label printer<//></div>
          </div>
        </div>` : null}
      </div>
      ${query ? html`<${P.QueryDialog} rx=${rx} f=${query} onClose=${() => setQuery(null)} onSend=${(ask) => sendQuery(query, ask)} />` : null}
      <div className="sticky-foot">
        <span className="grow muted small">${checksOpen ? checksOpen + " check" + (checksOpen > 1 ? "s" : "") + " to answer before hand-over" : allDecided ? (canHand ? "Ready to hand over." : allHeld ? "Every line is held." : "Check the patient's identity to hand over.") : lineState.filter((x) => !x.decided).length + " of " + rx.lines.length + " lines still to decide"}</span>
        ${rx.status === "waiting" ? html`<${P.Btn} kind="ghost" onClick=${later}>Patient stepped away<//>` : null}
        ${allHeld && allDecided ? html`<${P.Btn} kind="navy" onClick=${holdAll}>Put on hold<//>` : html`<${P.Btn} kind="primary" size="lg" disabled=${!canHand} onClick=${handOver} icon="check">Hand over<//>`}
      </div>
    </div>`;
  }

  function OwedHandover({ o, onClose }) {
    P.useDb();
    const fe = P.fefo(o.med, "opd");
    const [batch, setBatch] = useState(fe[0] ? fe[0].id : null);
    const [qty, setQty] = useState(o.qty);
    const ok = batch && qty > 0 && qty <= P.bal(batch, "opd");
    return html`<${P.Dialog} title=${"Hand over owed medicine: " + o.patient} sub=${P.med(o.med).name + " · owed " + P.q(o.qty, o.med) + " since " + P.when(o.since)} onClose=${onClose}
      foot=${html`<${P.Btn} kind="primary" disabled=${!ok} onClick=${() => { P.move({ kind: "handover", med: o.med, batch, from: "opd", to: "patient", qty, ref: o.id, note: o.patient }); o.done = true; o.doneAt = P.now(); P.commit(); P.toast("Owed medicine handed over to " + o.patient); onClose(); }}>Hand over<//>`}>
      ${fe.length ? html`<div className="stack-s"><span className="lbl">Batch (earliest expiry first)</span><div className="chips">${fe.map((b) => html`<${P.Chip} key=${b.id} on=${b.id === batch} onClick=${() => setBatch(b.id)}><span className="mono">${b.no}</span> · ${P.expWord(b.exp)} · ${P.bal(b.id, "opd")}<//>`)}</div></div>
        <div className="stack-s"><span className="lbl">Giving</span><${P.Stepper} value=${qty} onChange=${setQty} unit=${P.med(o.med).unit} label="quantity" /><span className="hint">The owed quantity was decided at the first visit. Change it only if the prescriber changed it.</span></div>
        <div className="note"><${P.Icon} n="user" /><span>Check identity at the window as usual (left out of this prototype dialog).</span></div>`
      : html`<div className="note"><${P.Icon} n="package" /><span>None at the OPD dispensary yet. Issue some from the main store first: Store › Issue › OPD dispensary.</span></div>`}
    <//>`;
  }

  function OwedList() {
    const db = P.useDb();
    const [hand, setHand] = useState(null);
    const list = db.owed.filter((o) => !o.done);
    if (!list.length) return html`<div className="card"><${P.Empty} title="Nobody is owed medicine">When a medicine is out of stock at hand-over, choose "Owe it" and the patient appears here.<//></div>`;
    return html`<div className="card"><div className="tblwrap"><table className="tbl">
      <thead><tr><th>Patient</th><th>Medicine</th><th className="r">Owed</th><th>Since</th><th>Stock now</th><th>Told</th><th></th></tr></thead>
      <tbody>${list.map((o) => {
        const opd = P.medAt(o.med, "opd"), store = P.medAt(o.med, "store");
        const stock = o.kind === "hold" ? html`<${P.Tag} kind="caution" icon="alert">Held: ${o.reason}<//>` : opd >= o.qty ? html`<${P.Tag} kind="ok" icon="check">In stock at OPD<//>` : store >= o.qty ? html`<${P.Tag}>Main store only<//>` : html`<${P.Tag}>Still out<//>`;
        return html`<tr key=${o.id}>
          <td className="strong">${o.patient}</td><td>${P.med(o.med).name}<${P.MedTags} med=${o.med} /></td><td className="r">${P.q(o.qty, o.med)}</td><td className="muted">${P.ago(o.since)}</td><td>${stock}</td>
          <td><div className="chips">${["Phoned", "Not reachable"].map((t) => html`<${P.Chip} size="sm" key=${t} on=${o.told === t} onClick=${() => { o.told = o.told === t ? null : t; P.commit(); }}>${t}<//>`)}</div></td>
          <td>${o.kind === "owed" && opd > 0 ? html`<${P.Btn} size="sm" kind="navy" onClick=${() => setHand(o)}>Hand over<//>` : null}</td></tr>`;
      })}</tbody></table></div>
      ${hand ? html`<${OwedHandover} o=${hand} onClose=${() => setHand(null)} />` : null}
    </div>`;
  }

  function DoneList() {
    const db = P.useDb();
    const groups = new Map();
    db.moves.filter((m) => m.kind === "handover").forEach((m) => {
      const k = m.ref + "|" + m.note;
      if (!groups.has(k)) groups.set(k, { who: m.note, at: m.at, by: m.by, items: [], pending: false });
      const g = groups.get(k); g.items.push(P.q(m.qty, m.med) + " " + P.med(m.med).name); g.at = Math.max(g.at, m.at); g.pending = g.pending || m.pending;
    });
    const list = [...groups.values()].sort((a, b) => b.at - a.at);
    return html`<div className="list">${list.map((g, i) => html`<div className="lrow" key=${i}>
      <div className="rx-av" aria-hidden="true">${g.who.slice(-2)}</div>
      <div className="grow"><div className="t">${g.who}</div><div className="m">${g.items.join(" · ")}</div></div>
      <div className="m" style=${{ textAlign: "right" }}>${P.time(g.at)}<br />${g.pending ? html`<${P.Tag} kind="pending" icon="wifioff">On this tablet<//>` : g.by}</div></div>`)}</div>`;
  }

  P.DispenseView = ({ route }) => {
    const db = P.useDb();
    const wide = P.useMQ("(min-width: 1024px)");
    const tab = route.tab || "waiting";
    const waiting = db.rx.filter((r) => r.status === "waiting").sort((a, b) => a.since - b.since);
    const ready = db.rx.filter((r) => r.status === "ready" || r.status === "held");
    const owedN = db.owed.filter((o) => !o.done).length;
    const handedN = new Set(db.moves.filter((m) => m.kind === "handover").map((m) => m.ref + m.note)).size;
    const seg = html`<${P.Seg} label="Dispense" value=${tab} onChange=${(t) => P.go({ to: "dispense", tab: t })} items=${[
      { v: "waiting", label: "Waiting", n: waiting.length }, { v: "ready", label: "Ready to collect", n: ready.length }, { v: "owed", label: "Owed", n: owedN }, { v: "done", label: "Handed over", n: handedN }]} />`;
    if (tab === "owed") return html`${seg}<${OwedList} />`;
    if (tab === "done") return html`${seg}<${DoneList} />`;
    const items = tab === "ready" ? ready : waiting;
    const sel = route.rx ? db.rx.find((r) => r.id === route.rx && (r.status === "waiting" || r.status === "ready" || r.status === "held")) : null;
    const shown = sel || (wide ? items[0] : null);
    const next = () => { const n = P.db.rx.filter((r) => r.status === "waiting").sort((a, b) => a.since - b.since)[0]; P.go({ to: "dispense", tab: "waiting", rx: n ? n.id : undefined }); };
    if (!wide && shown) return html`<div className="stack">
      <button type="button" className="back" onClick=${() => P.go({ to: "dispense", tab })}><${P.Icon} n="left" s=${16} />${tab === "ready" ? "Ready to collect" : "Queue"}</button>
      <${RxScreen} key=${shown.id} rx=${shown} onDone=${next} /></div>`;
    return html`${seg}<div className="split">
      <div className="list">${items.length ? items.map((r) => html`<${RxRow} key=${r.id} r=${r} tab=${tab} current=${shown && shown.id === r.id} />`)
        : html`<div className="card"><${P.Empty} title=${tab === "ready" ? "Nothing waiting to be collected" : "Nobody is waiting"}>${tab === "ready" ? "If a patient steps away, their prescription waits here with what you picked." : "New prescriptions from the clinics arrive here."}<//></div>`}</div>
      ${wide ? (shown ? html`<${RxScreen} key=${shown.id} rx=${shown} onDone=${next} />` : html`<div className="card"><${P.Empty} icon="pill" title="Choose a prescription">It opens here, beside the queue.<//></div>`) : null}
    </div>`;
  };
})();
