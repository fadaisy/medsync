/* Store: Receive, Issue, Count, Order. Each is one job with a clear end, started from Today or +. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;

  /* ───────── Receive ───────── */
  const shortDated = (l) => l.exp && P.monthsTo(l.exp) <= 6;
  P.lineReady = (l) => {
    if (l.recv == null) return false;
    if (l.recv === 0 || l.cond === "sendback") return true;
    if (!l.batch || !l.batch.trim() || !l.exp) return false;
    if (shortDated(l) && l.cond === "good") return false;
    return true;
  };
  const lineWord = (l) => {
    if (l.recv == null) return "Needs a quantity";
    if (l.recv === 0) return "Not in this delivery";
    if (l.cond === "sendback") return "Sent back";
    if (!l.batch || !l.batch.trim()) return "Needs a batch number";
    if (!l.exp) return "Needs an expiry month";
    if (shortDated(l) && l.cond === "good") return "Short-dated: decide";
    return "Ready";
  };
  const newLine = (med, packs) => ({ med, packs, recv: null, batch: "", exp: null, scanned: false, cond: "good" });

  function StartDelivery({ d, onClose }) {
    const [supplier, setSupplier] = useState(d ? d.supplier : null);
    const [note, setNote] = useState("");
    const [tpl, setTpl] = useState("blank");
    const go = () => {
      const db = P.db;
      let del = d;
      if (!del) {
        del = { id: "d" + db.seq++, supplier, title: supplier + " · delivery " + P.time(P.now()), ordered: "not ordered", status: "receiving", witness: null,
          lines: tpl === "nms" ? db.deliveries[0].lines.map((l) => ({ med: l.med, packs: l.packs })) : [] };
        db.deliveries.push(del);
      }
      del.status = "receiving"; del.note = note.trim(); del.started = P.now();
      del.lines = del.lines.map((l) => newLine(l.med, l.packs));
      P.commit(); onClose(); P.go({ to: "store", tab: "receive", delivery: del.id });
    };
    return html`<${P.Dialog} title=${d ? "Receive: " + d.title : "Receive a delivery"} sub=${d ? d.lines.length + " lines expected, from the order of " + d.ordered : "Something that wasn't ordered: a donation, a transfer, or an NMS push"} onClose=${onClose}
      foot=${html`<${P.Btn} kind="primary" disabled=${!supplier || note.trim().length < 3} onClick=${go}>Start receiving<//>`}>
      ${d ? null : html`<div className="stack-s"><span className="lbl">From</span><div className="chips">${["NMS", "JMS", "Donation", "Another facility"].map((s) => html`<${P.Chip} key=${s} on=${supplier === s} onClick=${() => setSupplier(s)}>${s}<//>`)}</div></div>
        <div className="stack-s"><span className="lbl">Start from</span><div className="chips"><${P.Chip} on=${tpl === "blank"} onClick=${() => setTpl("blank")}>Empty, I'll scan as I go<//><${P.Chip} on=${tpl === "nms"} onClick=${() => setTpl("nms")}>Like the last NMS order<//></div></div>`}
      <div className="field"><label htmlFor="dn">Delivery note number</label><input id="dn" className="input mono" data-autofocus value=${note} onChange=${(e) => setNote(e.target.value)} placeholder="As printed on the note" /><span className="hint">The one thing to type. The arrival time, the place (Main store) and who received it are filled in.</span></div>
    <//>`;
  }

  function GRN({ d, onClose }) {
    return html`<${P.Dialog} size="wide" title="Goods received note" sub=${d.title + " · note " + d.note + " · " + P.when(d.receivedAt)} onClose=${onClose}
      foot=${html`<${P.Btn} kind="navy" icon="printer" onClick=${() => P.toast("GRN sent to the printer (prototype)", "printer")}>Print GRN<//>`}>
      <div className="tblwrap"><table className="tbl"><thead><tr><th>Medicine</th><th className="r">Ordered</th><th className="r">Received</th><th>Batch</th><th>Expiry</th><th>Condition</th></tr></thead>
        <tbody>${d.lines.map((l, i) => html`<tr key=${i}><td>${P.med(l.med).name}</td><td className="r">${l.packs ? l.packs + " packs" : "—"}</td><td className="r">${l.recv || 0} packs of ${l.pack || P.med(l.med).pack}</td><td className="mono">${l.batch || "—"}</td><td>${l.exp ? P.expWord(l.exp) : "—"}</td>
          <td>${l.recv === 0 ? "Not delivered" : { good: "Good", short: "Short-dated, use first", damaged: "Damaged: quarantined", sendback: "Sent back" }[l.cond]}</td></tr>`)}</tbody></table></div>
      ${d.witness ? html`<p className="muted small">Controlled lines witnessed by ${d.witness.name}${d.witness.how === "paper" ? " on the paper register" : " on their phone"} at ${P.time(d.witness.at)}.</p>` : null}
    <//>`;
  }

  function DeliveryScreen({ d }) {
    P.useDb();
    const [wit, setWit] = useState(false);
    const [add, setAdd] = useState(false);
    const [grn, setGrn] = useState(false);
    const set = (i, patch) => { Object.assign(d.lines[i], patch); P.commit(); };
    const scanLine = (i) => { const l = d.lines[i], m = P.med(l.med); if (!m.code) { P.toast("This box has no 2D barcode: type the batch number", "scan"); return; } set(i, { batch: m.code, exp: m.codeExp, scanned: true }); P.toast("Scanned " + m.name + ": batch " + m.code + ", expiry " + P.expWord(m.codeExp), "scan"); };
    const scanNext = () => { const i = d.lines.findIndex((l) => !l.scanned && P.med(l.med).code && l.recv !== 0); if (i < 0) { P.toast("No more boxes with a 2D barcode. Type the batch for the rest.", "scan"); return; } scanLine(i); };
    const ready = d.lines.filter(P.lineReady).length;
    const cdLines = d.lines.filter((l) => P.med(l.med).controlled && l.recv > 0 && l.cond !== "sendback");
    const needWit = cdLines.length > 0 && !d.witness;
    const done = d.status === "received";
    const canAdd = !done && d.lines.length > 0 && ready === d.lines.length && !needWit;
    const addToStock = () => {
      const db = P.db; let n = 0; const meds = new Set();
      d.lines.forEach((l) => {
        if (!l.recv || l.cond === "sendback") return;
        const m = P.med(l.med);
        let b = db.batches.find((x) => x.med === l.med && x.no.toUpperCase() === l.batch.trim().toUpperCase());
        if (!b) { b = { id: l.med + "-" + db.seq++, med: l.med, no: l.batch.trim().toUpperCase(), exp: l.exp, brand: l.brand || m.brands[0] }; db.batches.push(b); }
        P.move({ kind: "receive", med: l.med, batch: b.id, from: "supplier", to: l.cond === "damaged" ? "store:q" : "store", qty: l.recv * (l.pack || m.pack), ref: d.id, pack: l.pack || m.pack, note: d.supplier + " note " + d.note, witness: m.controlled ? d.witness : undefined });
        n++; meds.add(l.med);
      });
      d.status = "received"; d.receivedAt = P.now(); P.commit();
      const owed = db.owed.filter((o) => !o.done && o.kind === "owed" && meds.has(o.med));
      P.toast(n + " lines added to the main store" + (owed.length ? " · " + owed.length + " patients owed " + [...new Set(owed.map((o) => P.med(o.med).name))].join(", ") + ": see Today" : ""));
      setGrn(true);
    };
    return html`<div className="stack">
      <button type="button" className="back" onClick=${() => P.go({ to: "store", tab: "receive" })}><${P.Icon} n="left" s=${16} />Deliveries</button>
      <div className="row between">
        <div><h2 style=${{ fontSize: "20px" }}>${d.title}</h2><div className="muted">Note ${d.note || "—"} · into the Main store · started ${d.started ? P.time(d.started) : "—"} · saved as you go</div></div>
        ${done ? html`<${P.Tag} icon="check">Received ${P.time(d.receivedAt)}<//>` : html`<${P.Tag}>${ready} of ${d.lines.length} lines ready<//>`}
      </div>
      ${done ? null : html`<div className="scanbox"><${P.Icon} n="scan" s=${22} /><div className="grow"><b>Scan each box</b><div className="small ink2">The 2D barcode fills the batch and expiry. A line without one needs only its batch typed.</div></div>
        <${P.Btn} kind="navy" icon="scan" onClick=${scanNext}>Simulate: scan next box<//><${P.Btn} icon="plus" onClick=${() => setAdd(true)}>Add a medicine<//></div>`}
      <div className="card">
        <div className="dl-line dl-head"><div>Medicine</div><div>Packs received</div><div>Batch</div><div>Expiry</div><div>Condition</div></div>
        ${d.lines.map((l, i) => {
          const m = P.med(l.med), sd = shortDated(l), word = lineWord(l);
          return html`<div className="dl-line" key=${i}>
            <div><div className="strong">${m.name}<${P.MedTags} med=${l.med} /></div><div className="muted small">${l.packs ? "Ordered " + l.packs + " packs of " + m.pack : "Not on the order"} · <span className=${word === "Ready" ? "" : "strong"}>${word}</span></div>
              <div className="medrow"><${P.MedFacts} med=${l.med} /><${P.CatalogBrand} med=${l.med} label="Brand on the box" value=${l.brand} disabled=${done} onChange=${(b) => set(i, { brand: b })} /></div></div>
            <div><span className="cell-l">Received (packs)</span>
              ${l.packs && l.recv == null && !done ? html`<button type="button" className="chip" onClick=${() => set(i, { recv: l.packs })}><${P.Icon} n="check" s=${14} />As ordered: ${l.packs}<//>` :
                html`<${P.Stepper} value=${l.recv} onChange=${(v) => set(i, { recv: v })} label=${"packs of " + m.name} />`}
              ${l.recv !== 0 ? html`<div className="packrow"><${P.PackPick} med=${l.med} value=${l.pack} disabled=${done} onChange=${(n) => set(i, { pack: n })} />${l.recv ? html`<span className="muted small">= ${P.q(l.recv * (l.pack || m.pack), l.med)}</span>` : null}</div>` : null}
              ${!done && l.recv == null ? html`<div><button type="button" className="btn ghost sm" onClick=${() => set(i, { recv: 0 })}>Not in this delivery</button></div>` : null}</div>
            <div><span className="cell-l">Batch</span>
              ${l.scanned ? html`<div className="row"><span className="mono strong">${l.batch}</span><${P.Tag} icon="scan">Scanned<//></div>`
                : html`<div className="row"><input className="input mono" style=${{ maxWidth: "150px" }} aria-label=${"Batch number of " + m.name} placeholder=${m.code ? "Scan or type" : "No barcode: type"} value=${l.batch} disabled=${done || l.recv === 0} onChange=${(e) => set(i, { batch: e.target.value })} />
                  ${m.code && !done ? html`<button type="button" className="iconbtn" aria-label=${"Scan " + m.name} onClick=${() => scanLine(i)}><${P.Icon} n="scan" /></button>` : null}</div>`}</div>
            <div><span className="cell-l">Expiry</span>${l.scanned || done || l.recv === 0 ? html`<span>${l.exp ? P.expWord(l.exp) : "—"}</span>` : html`<${P.MonthPick} value=${l.exp} onChange=${(v) => set(i, { exp: v })} label=${"Expiry of " + m.name} />`}</div>
            <div><span className="cell-l">Condition</span>
              ${done || l.recv === 0 ? html`<span className="muted">${l.recv === 0 ? "—" : { good: "Good", short: "Short-dated, use first", damaged: "Damaged: quarantined", sendback: "Sent back" }[l.cond]}</span>` : html`<div className="chips">
                ${(sd ? [["short", "Accept, use first"], ["sendback", "Send back"]] : [["good", "Good"], ["damaged", "Damaged"], ["sendback", "Send back"]]).map(([k, w]) => html`<${P.Chip} key=${k} size="sm" on=${l.cond === k} onClick=${() => set(i, { cond: k })}>${w}<//>`)}</div>
                ${sd ? html`<div className="hint">Expires ${P.expWord(l.exp)}, within 6 months.</div>` : null}`}</div>
          </div>`;
        })}
        ${d.lines.length ? null : html`<${P.Empty} icon="scan" title="No lines yet">Scan the first box or add a medicine.<//>`}
      </div>
      ${done ? html`<div className="row"><${P.Btn} kind="navy" icon="file" onClick=${() => setGrn(true)}>Goods received note<//><${P.Btn} onClick=${() => P.go({ to: "today" })}>Back to Today<//></div>` : html`
      <div className="card pad row">
        <div className="grow">
          ${cdLines.length ? (d.witness ? html`<span className="ok-line"><${P.Icon} n="shield" s=${16} />${cdLines.length} controlled ${cdLines.length === 1 ? "line" : "lines"} witnessed by ${d.witness.name}${d.witness.how === "paper" ? " (paper)" : ""}</span>`
            : html`<span className="strong">${cdLines.length} controlled ${cdLines.length === 1 ? "line needs" : "lines need"} one witness for the whole delivery</span>`) : html`<span className="muted">No controlled lines, so no witness needed.</span>`}
        </div>
        ${needWit ? html`<${P.Btn} kind="navy" icon="shield" onClick=${() => setWit(true)}>Ask a witness<//>` : null}
        <${P.Btn} kind="primary" size="lg" disabled=${!canAdd} onClick=${addToStock}>Add ${d.lines.filter((l) => l.recv > 0 && l.cond !== "sendback").length} lines to stock<//>
      </div>`}
      ${wit ? html`<${P.WitnessDialog} what=${cdLines.map((l) => l.recv + " packs " + P.med(l.med).name).join(", ") + " received into the Main store"} onClose=${() => setWit(false)}
        onDone=${(w) => { d.witness = w; if (w.how === "paper") P.db.paperWitness.push({ id: "pw" + P.db.seq++, what: "Delivery " + d.title, name: w.name, at: w.at, checked: false }); P.commit(); setWit(false); }} />` : null}
      ${add ? html`<${P.MedPicker} exclude=${d.lines.map((l) => l.med)} onClose=${() => setAdd(false)} onPick=${(med) => { d.lines.push(newLine(med, 0)); P.commit(); setAdd(false); }} />` : null}
      ${grn ? html`<${GRN} d=${d} onClose=${() => setGrn(false)} />` : null}
    </div>`;
  }

  function Receive({ route }) {
    const db = P.useDb();
    const [start, setStart] = useState(null);
    const d = route.delivery && db.deliveries.find((x) => x.id === route.delivery);
    if (d && d.status !== "expected") return html`<${DeliveryScreen} d=${d} />`;
    const groups = [["expected", "Expected", "From orders sent"], ["receiving", "In progress", "Saved as you go"], ["received", "Received", "Today"]];
    return html`<div className="stack">
      <div className="row"><${P.Btn} kind="navy" icon="plus" onClick=${() => setStart({})}>Receive something not expected<//></div>
      ${groups.map(([st, h, sub]) => {
        const list = db.deliveries.filter((x) => x.status === st);
        if (!list.length) return null;
        return html`<div className="stack-s" key=${st}><div className="section-h"><h2>${h}</h2><span className="muted">${sub}</span></div>
          ${list.map((x) => html`<div className=${P.cx("wi", st === "expected" && route.delivery === x.id && "next")} key=${x.id}>
            <div className="wic"><${P.Icon} n="truck" s=${20} /></div>
            <div><div className="wt">${x.title}</div><div className="wm">${x.lines.length} lines${x.ordered ? " · ordered " + x.ordered : ""}${x.receivedAt ? " · received " + P.time(x.receivedAt) : ""}</div></div>
            ${st === "expected" ? html`<${P.Btn} kind="primary" onClick=${() => setStart({ d: x })}>Receive<//>` : html`<${P.Btn} onClick=${() => P.go({ to: "store", tab: "receive", delivery: x.id })}>${st === "receiving" ? "Continue" : "Open"}<//>`}
          </div>`)}</div>`;
      })}
      ${start ? html`<${StartDelivery} d=${start.d} onClose=${() => setStart(null)} />` : null}
    </div>`;
  }

  /* ───────── Issue ───────── */
  P.confirmTransit = (t) => {
    t.moves.forEach((mv) => P.move({ kind: "confirm", med: mv.med, batch: mv.batch, from: "transit:" + t.dest, to: t.dest, qty: mv.qty, ref: t.id, by: "Nurse in-charge, " + P.place(t.dest).short + " (sample)", witness: mv.witness }));
    t.status = "confirmed"; t.confirmedAt = P.now(); P.commit();
    P.toast(P.place(t.dest).short + " confirmed what arrived");
  };

  function IssueScreen({ dest }) {
    const db = P.useDb();
    const req = db.requests.find((r) => r.ward === dest && r.status === "raised");
    const onway = db.transits.filter((t) => t.dest === dest && t.status === "onway");
    const [lines, setLines] = useState(() => (req ? req.lines.map((l) => ({ med: l.med, qty: l.qty, asked: l.qty })) : P.wardSuggestions(dest).map((s) => ({ med: s.med, qty: Math.min(s.want, P.medAt(s.med, "store")), asked: null }))));
    const [wit, setWit] = useState(null);
    const [add, setAdd] = useState(false);
    const lv = P.LEVELS[dest] || {};
    const cd = lines.filter((l) => l.qty > 0 && P.med(l.med).controlled);
    const short = lines.filter((l) => l.qty > P.qtyAt(l.med, "store", l.brand));
    const can = lines.some((l) => l.qty > 0) && !short.length;
    const doIssue = (witness) => {
      const db = P.db, t = { id: "t" + db.seq++, dest, at: P.now(), status: "onway", moves: [] };
      lines.filter((l) => l.qty > 0).forEach((l) => {
        const a = P.allocate(l.med, "store", l.qty, l.brand);
        a.parts.forEach((p) => { const mv = P.move({ kind: "issue", med: l.med, batch: p.batch, from: "store", to: "transit:" + dest, qty: p.qty, ref: t.id, witness: P.med(l.med).controlled ? witness : undefined }); t.moves.push({ med: mv.med, batch: mv.batch, qty: mv.qty, witness: mv.witness }); });
      });
      db.transits.push(t);
      if (req) req.status = "issued";
      if (witness && witness.how === "paper") db.paperWitness.push({ id: "pw" + db.seq++, what: "Issue to " + P.place(dest).short, name: witness.name, at: witness.at, checked: false });
      P.commit(); P.toast("Issued to " + P.place(dest).short + ". It shows as on the way until they confirm.", "send");
    };
    return html`<div className="stack">
      <button type="button" className="back" onClick=${() => P.go({ to: "store", tab: "issue" })}><${P.Icon} n="left" s=${16} />All places</button>
      <div><h2 style=${{ fontSize: "20px" }}>Issue to ${P.place(dest).name}</h2>
        <div className="muted">${req ? "Request from " + req.by + " at " + P.time(req.at) : "Top-up to the signed stock levels (sample)"} · from the Main store, earliest expiry first</div></div>
      ${onway.map((t) => html`<div className="card pad row" key=${t.id}><${P.Icon} n="send" /><div className="grow"><b>On the way since ${P.time(t.at)}</b><div className="muted small">${t.moves.map((m) => m.qty + " " + P.med(m.med).name).join(" · ")}</div></div>
        <${P.Btn} kind="navy" icon="phone" onClick=${() => P.confirmTransit(t)}>Simulate: ${P.place(dest).kind === "ward" ? "nurse" : P.place(dest).short} confirms on their phone<//></div>`)}
      ${req || P.wardSuggestions(dest).length ? html`<div className="card">
        <div className="tblwrap"><table className="tbl dense">
          <thead><tr><th>Medicine</th><th className="r">${P.place(dest).short} has</th><th className="r">Level</th><th className="r">Main store has</th><th>Issue</th><th>Batch</th></tr></thead>
          <tbody>${lines.map((l, i) => {
            const m = P.med(l.med), st = P.qtyAt(l.med, "store", l.brand), a = P.allocate(l.med, "store", l.qty || 0, l.brand);
            return html`<tr key=${l.med}><td><div className="dn-name"><span className="strong">${m.name}</span><${P.MedTags} med=${l.med} compact=${true} /></div>
              <div className="dn-sub"><span>${m.strength}${l.asked ? " · asked for " + l.asked : ""}</span><${P.BrandPick} med=${l.med} place="store" label="" value=${l.brand} onChange=${(b) => setLines(lines.map((x, j) => (j === i ? { ...x, brand: b } : x)))} /></div></td>
              <td className="r num">${P.medAt(l.med, dest).toLocaleString("en-GB")}</td><td className="r num">${lv[l.med] ? lv[l.med].toLocaleString("en-GB") : "—"}</td><td className="r num">${st.toLocaleString("en-GB")}</td>
              <td><${P.Stepper} value=${l.qty} onChange=${(v) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: v || 0 } : x)))} unit=${m.unit} label=${"issue " + m.name} />
                ${l.qty > st ? html`<div className="err"><${P.Icon} n="alert" s=${14} />Only ${st}${l.brand ? " " + l.brand : ""} in the store</div>` : null}</td>
              <td className="small">${st === 0 ? html`<${P.Tag} icon="ban">None in store<//>` : a.parts.map((p) => html`<div key=${p.batch}><span className="mono">${P.batch(p.batch).no}</span> × ${p.qty} <span className="muted">${P.batchBrand(p.batch)}</span></div>`)}</td></tr>`;
          })}</tbody></table></div>
        <div className="sticky-foot">
          <${P.Btn} kind="ghost" icon="plus" onClick=${() => setAdd(true)}>Add a medicine<//>
          <span className="grow muted small">${cd.length ? "Includes a controlled drug: one witness for the issue." : "Quantities are suggested; change any of them."}</span>
          <${P.Btn} kind="primary" size="lg" disabled=${!can} onClick=${() => (cd.length ? setWit(true) : doIssue(null))}>${req ? "Issue as asked" : "Issue as suggested"}<//>
        </div></div>`
      : html`<div className="card"><${P.Empty} title="Nothing to issue">${P.place(dest).short} is at its stock levels and has no request waiting.<//></div>`}
      ${wit ? html`<${P.WitnessDialog} what=${cd.map((l) => l.qty + " " + P.med(l.med).unit + " " + P.med(l.med).name).join(", ") + " to " + P.place(dest).short} onClose=${() => setWit(null)} onDone=${(w) => { setWit(null); doIssue(w); }} />` : null}
      ${add ? html`<${P.MedPicker} exclude=${lines.map((l) => l.med)} onClose=${() => setAdd(false)} onPick=${(med) => { setLines(lines.concat({ med, qty: 0, asked: null })); setAdd(false); }} />` : null}
    </div>`;
  }

  function Issue({ route }) {
    const db = P.useDb();
    if (route.ward) return html`<${IssueScreen} key=${route.ward + db.transits.length + db.requests.filter((r) => r.status === "raised").length} dest=${route.ward} />`;
    const dests = P.PLACES.filter((p) => p.kind !== "store");
    return html`<div className="list">${dests.map((p) => {
      const req = db.requests.find((r) => r.ward === p.id && r.status === "raised");
      const onway = db.transits.filter((t) => t.dest === p.id && t.status === "onway");
      const sug = P.wardSuggestions(p.id);
      const word = req ? "Request from " + req.by + " · " + P.time(req.at) : onway.length ? "On the way · waiting for them to confirm" : sug.length ? sug.length + " medicines below their level" : "At its stock levels";
      return html`<button type="button" key=${p.id} className="lrow" onClick=${() => P.go({ to: "store", tab: "issue", ward: p.id })}>
        <div className="wic" style=${{ width: "40px", height: "40px", borderRadius: "12px", background: "var(--plum-tint)", color: "var(--plum-text)", display: "grid", placeItems: "center" }}><${P.Icon} n="pin" /></div>
        <div className="grow"><div className="t">${p.name}</div><div className="m">${word}</div></div>
        ${req ? html`<${P.Tag}>Request<//>` : onway.length ? html`<${P.Tag} icon="send">On the way<//>` : null}<${P.Icon} n="right" /></button>`;
    })}</div>`;
  }

  /* ───────── Count ───────── */
  const shelfOf = (b, place) => (P.place(place).kind === "ward" ? "Ward cupboard" : P.med(b.med).shelf[place] || "Other");
  P.startCount = ({ place, scope, shelf, med }) => {
    const db = P.db;
    const key = place + "-" + (shelf || med || "all");
    const open = db.counts.find((c) => c.key === key && c.status === "counting");
    if (open) return open;
    const rows = db.batches.filter((b) => P.bal(b.id, place) > 0 && (scope !== "shelf" || shelfOf(b, place) === shelf) && (scope !== "med" || b.med === med))
      .sort((a, b) => (shelfOf(a, place) + P.med(a.med).name + a.exp < shelfOf(b, place) + P.med(b.med).name + b.exp ? -1 : 1))
      .map((b) => ({ batch: b.id, shelf: shelfOf(b, place), packs: null, loose: null, touched: false }));
    const title = P.place(place).short + (scope === "shelf" ? ", shelf " + shelf : scope === "med" ? ", " + P.med(med).name : ", everything");
    const c = { id: "c" + db.seq++, key, title, place, scope, rows, recorded: {}, expected: {}, reasons: {}, notes: {}, status: "counting", at: P.now(), by: P.who(), saved: P.now() };
    db.counts.push(c); P.commit();
    return c;
  };
  const counted = (r) => (r.packs || 0) * (r.pack || P.med(P.batch(r.batch).med).pack) + (r.loose || 0);
  P.countDiffs = (c) => c.rows.filter((r) => c.recorded[r.shelf]).map((r) => ({ r, exp: c.expected[r.batch] || 0, got: counted(r) })).filter((x) => x.got !== x.exp).map((x) => ({ ...x, diff: x.got - x.exp }));
  P.countProgress = (c) => { const sh = [...new Set(c.rows.map((r) => r.shelf))]; return c.rows.filter((r) => r.touched).length + " of " + c.rows.length + " batches counted · " + sh.filter((s) => c.recorded[s]).length + " of " + sh.length + " shelves recorded"; };

  function StartCount({ onClose }) {
    const db = P.useDb();
    const [place, setPlace] = useState(db.settings.place);
    const [scope, setScope] = useState("shelf");
    const shelves = [...new Set(db.batches.filter((b) => P.bal(b.id, place) > 0).map((b) => shelfOf(b, place)))].sort();
    const [shelf, setShelf] = useState(null);
    const ok = scope === "place" || (scope === "shelf" && shelf && shelves.includes(shelf));
    return html`<${P.Dialog} title="Start a count" sub="Blind: the expected figures stay hidden until a shelf is recorded" onClose=${onClose}
      foot=${html`<${P.Btn} kind="primary" disabled=${!ok} onClick=${() => { const c = P.startCount({ place, scope, shelf }); onClose(); P.go({ to: "store", tab: "count", count: c.id }); }}>Start counting<//>`}>
      <div className="stack-s"><span className="lbl">Where</span><div className="chips">${P.PLACES.map((p) => html`<${P.Chip} key=${p.id} on=${place === p.id} onClick=${() => { setPlace(p.id); setShelf(null); }}>${p.short}<//>`)}</div></div>
      <div className="stack-s"><span className="lbl">What</span><div className="chips"><${P.Chip} on=${scope === "shelf"} onClick=${() => setScope("shelf")}>One shelf<//><${P.Chip} on=${scope === "place"} onClick=${() => setScope("place")}>Everything here (month end)<//></div></div>
      ${scope === "shelf" ? html`<div className="stack-s"><span className="lbl">Shelf</span><div className="chips">${shelves.map((s) => html`<${P.Chip} key=${s} on=${shelf === s} onClick=${() => setShelf(s)}>${s}<//>`)}</div></div>` : null}
    <//>`;
  }

  const FEWER = ["Damaged", "Expired, removed", "Broken in transit", "Given but not recorded", "Miscounted last time", "Other"];
  const MORE = ["Found on another shelf", "Received but not recorded", "Miscounted last time", "Other"];

  function CountScreen({ c }) {
    const db = P.useDb();
    const shelves = [...new Set(c.rows.map((r) => r.shelf))];
    const [active, setActive] = useState(shelves.find((s) => !c.recorded[s]) || shelves[0]);
    const [found, setFound] = useState(false);
    const rows = c.rows.map((r, i) => [r, i]).filter(([r]) => r.shelf === active);
    const save = () => { c.saved = P.now(); P.commit(); };
    const setRow = (i, patch) => { Object.assign(c.rows[i], patch, { touched: true }); save(); };
    const diffs = P.countDiffs(c);
    const allRecorded = shelves.every((s) => c.recorded[s]);
    const reasonsDone = diffs.every((d) => c.reasons[d.r.batch] && (c.reasons[d.r.batch] !== "Other" || (c.notes[d.r.batch] || "").trim().length > 2));
    const role = db.settings.role;
    const recordShelf = () => { rows.forEach(([r]) => { c.expected[r.batch] = P.bal(r.batch, c.place); }); c.recorded[active] = true; save(); const nx = shelves.find((s) => !c.recorded[s]); if (nx) setActive(nx); };
    const approve = () => {
      diffs.forEach((d) => {
        const b = P.batch(d.r.batch);
        P.move({ kind: "count", med: b.med, batch: b.id, from: d.diff < 0 ? c.place : null, to: d.diff > 0 ? c.place : null, qty: Math.abs(d.diff), ref: c.id, note: c.reasons[b.id] + (c.notes[b.id] ? ": " + c.notes[b.id] : "") });
      });
      c.status = "done"; c.doneAt = P.now(); P.commit(); P.toast("Count approved: " + diffs.length + " changes posted to the ledger", "clip");
    };
    const shelfRows = rows.filter(([r]) => !c.recorded[active] || true);
    return html`<div className="stack">
      <button type="button" className="back" onClick=${() => P.go({ to: "store", tab: "count" })}><${P.Icon} n="left" s=${16} />Counts</button>
      <div className="row between"><div><h2 style=${{ fontSize: "20px" }}>Count: ${c.title}</h2><div className="muted">Started ${P.time(c.at)} by ${c.by} · saved on this device at ${P.time(c.saved)}</div></div>
        ${c.status === "approval" ? html`<${P.Tag} icon="clock">Waiting for the in-charge<//>` : c.status === "done" ? html`<${P.Tag} icon="check">Approved<//>` : html`<${P.Btn} icon="printer" onClick=${() => P.toast("Blank count sheets for " + c.title + " sent to the printer (prototype)", "printer")}>Print blank sheets<//>`}</div>
      <div className="split">
        <div className="shelves">
          ${shelves.map((s) => { const rs = c.rows.filter((r) => r.shelf === s); return html`<button type="button" key=${s} className="shelf" aria-current=${s === active ? "true" : "false"} onClick=${() => setActive(s)}>
            <b className="grow">${s}</b><span className="muted small num">${c.recorded[s] ? "✓ recorded" : rs.filter((r) => r.touched).length + " / " + rs.length}</span></button>`; })}
          <p className="hint">Two people can count different shelves at once. The count is saved as you go, so a power cut loses nothing.</p>
        </div>
        <div className="card pad">
          ${shelfRows.map(([r, i]) => {
            const b = P.batch(r.batch), m = P.med(b.med), rec = c.recorded[r.shelf] || c.status !== "counting";
            const d = diffs.find((x) => x.r === r);
            return html`<div className="crow" key=${r.batch}>
              <div><div className="strong">${m.name}<${P.MedTags} med=${m.id} /></div><div className="muted small"><span className="mono">${b.no}</span> · ${P.expWord(b.exp)}${r.found ? " · found on the shelf" : ""}</div></div>
              ${rec ? html`<div className="muted small" style=${{ gridColumn: "span 2" }}>Counted ${P.packsWord(counted(r), b.med, r.pack)}</div>` : html`
                <div className="packrow"><${P.Stepper} value=${r.packs} onChange=${(v) => setRow(i, { packs: v })} label=${"packs of " + m.name + " " + b.no} /><${P.PackPick} med=${m.id} value=${r.pack} onChange=${(n) => setRow(i, { pack: n })} /></div>
                <${P.Stepper} value=${r.loose} onChange=${(v) => setRow(i, { loose: v })} unit="loose" label=${"loose " + m.unit + " of " + b.no} />`}
              <div className="r strong num" style=${{ textAlign: "right" }}>${r.touched ? counted(r) : "—"}</div>
              ${!rec && !r.touched ? html`<div style=${{ gridColumn: "1 / -1" }}><button type="button" className="btn ghost sm" onClick=${() => setRow(i, { packs: 0, loose: 0 })}>None on the shelf</button></div>` : null}
              ${d ? html`<div className="diff"><div><b>${Math.abs(d.diff)} ${m.unit} ${d.diff < 0 ? "fewer" : "more"}</b> than the ledger (${d.exp}). Why?</div>
                <div className="chips">${(d.diff < 0 ? FEWER : MORE).map((w) => html`<${P.Chip} size="sm" key=${w} disabled=${c.status !== "counting"} on=${c.reasons[r.batch] === w} onClick=${() => { c.reasons[r.batch] = w; save(); }}>${w}<//>`)}</div>
                ${c.reasons[r.batch] === "Other" ? html`<input className="input" aria-label="Say what happened" placeholder="Say what happened" value=${c.notes[r.batch] || ""} disabled=${c.status !== "counting"} onChange=${(e) => { c.notes[r.batch] = e.target.value; save(); }} />` : null}</div>` : null}
            </div>`;
          })}
          ${c.status === "counting" ? html`<div className="row" style=${{ marginTop: "12px" }}>
            ${!c.recorded[active] ? html`<${P.Btn} icon="plus" onClick=${() => setFound(true)}>Add a batch found here<//>` : null}
            <span className="grow"></span>
            ${!c.recorded[active] ? html`<${P.Btn} kind="navy" disabled=${!rows.every(([r]) => r.touched)} onClick=${recordShelf}>Record shelf ${active}<//>` : null}
            ${allRecorded ? html`<${P.Btn} kind="primary" disabled=${!reasonsDone} onClick=${() => { c.status = "approval"; P.commit(); P.toast("Sent to the in-charge for approval"); }}>Send for approval<//>` : null}
          </div>` : null}
          ${c.status === "approval" ? html`<div className="row" style=${{ marginTop: "12px" }}>
            <span className="grow muted small">${diffs.length} differences, each with a reason. Nothing changes in the ledger until the in-charge approves.</span>
            ${role === "incharge" ? html`<${P.Btn} kind="primary" onClick=${approve}>Approve and post<//>` : html`<${P.Btn} kind="navy" onClick=${() => { P.db.settings.role = "incharge"; P.commit(); }}>Switch to in-charge to approve<//>`}</div>` : null}
        </div>
      </div>
      ${found ? html`<${P.Dialog} title="A batch found on the shelf" sub="Pick it from batches the hospital already knows. Nothing to type." onClose=${() => setFound(false)}>
        <div className="list">${db.batches.filter((b) => !c.rows.some((r) => r.batch === b.id)).map((b) => html`<button type="button" key=${b.id} className="lrow" onClick=${() => { c.rows.push({ batch: b.id, shelf: active, packs: null, loose: null, touched: false, found: true }); save(); setFound(false); }}>
          <div className="grow"><div className="t">${P.med(b.med).name}</div><div className="m"><span className="mono">${b.no}</span> · ${P.expWord(b.exp)} · ${P.bal(b.id, c.place)} on record here</div></div><${P.Icon} n="plus" /></button>`)}</div>
      <//>` : null}
    </div>`;
  }

  function Count({ route }) {
    const db = P.useDb();
    const [start, setStart] = useState(false);
    const c = route.count && db.counts.find((x) => x.id === route.count);
    if (c) return html`<${CountScreen} key=${c.id} c=${c} />`;
    const groups = [["counting", "In progress"], ["approval", "Waiting for approval"], ["done", "Approved"]];
    return html`<div className="stack">
      <div className="row"><${P.Btn} kind="navy" icon="plus" onClick=${() => setStart(true)}>Start a count<//></div>
      ${!db.counts.some((x) => x.key === "opd-B2") ? html`<div className="wi next"><div className="wic"><${P.Icon} n="clip" s=${20} /></div><div><div className="nextword">Suggested</div><div className="wt">OPD dispensary, shelf B2</div><div className="wm">3 batches · not counted this month (sample)</div></div>
        <${P.Btn} kind="primary" onClick=${() => { const n = P.startCount({ place: "opd", scope: "shelf", shelf: "B2" }); P.go({ to: "store", tab: "count", count: n.id }); }}>Start count<//></div>` : null}
      ${groups.map(([st, h]) => { const list = db.counts.filter((x) => x.status === st); return list.length ? html`<div className="stack-s" key=${st}><div className="section-h"><h2>${h}</h2></div>
        ${list.map((x) => html`<button type="button" key=${x.id} className="lrow" onClick=${() => P.go({ to: "store", tab: "count", count: x.id })}><div className="grow"><div className="t">${x.title}</div><div className="m">${P.countProgress(x)}</div></div><${P.Icon} n="right" /></button>`)}</div>` : null; })}
      ${start ? html`<${StartCount} onClose=${() => setStart(false)} />` : null}
    </div>`;
  }

  /* ───────── Order builder ───────── */
  /* VEN class (sample): Vital never gets trimmed to fit the budget; Necessary goes first */
  P.VEN = { oxy: "V", mgso4: "V", ceft: "V", gent: "V", ns: "V", rl: "V", morph: "V", diaz: "V", peth: "V", ors: "V", bcg: "V", bopv: "V", ipv: "V", penta: "V", pcv: "V", rota: "V", mr: "V", hpv: "V", td: "V",
    amox: "E", metro: "E", ctx: "E", metf: "E", amlo: "E", ferr: "E", omor: "E", pcm: "N" };
  const VENW = { V: "Vital", E: "Essential", N: "Necessary" };
  /* days out of stock in the last 90 days (sample; the real product counts them from the ledger) */
  const OUT_DAYS = { metro: 18, oxy: 4, ors: 6, mgso4: 3 };
  const BUDGET = 7500000;
  P.orderLines = (cycle, buffer) => {
    const db = P.db;
    return P.MEDS.map((m) => {
      const pack = (db.orderPack || {})[m.id] || m.pack;
      const out = OUT_DAYS[m.id] || 0, amcAdj = Math.round(m.amc * 90 / (90 - out));
      const onOrder = db.deliveries.filter((d) => d.status === "expected").flatMap((d) => d.lines).filter((l) => l.med === m.id).reduce((a, l) => a + l.packs * m.pack, 0);
      const have = P.medTotal(m.id), max = amcAdj * (cycle + buffer);
      const need = Math.max(0, max - have - onOrder), sug = Math.ceil(need / pack);
      const v = db.orderDraft[m.id] != null ? db.orderDraft[m.id] : sug;
      return { m, pack, out, amcAdj, onOrder, have, max, need, sug, v, ven: P.VEN[m.id] || "E", price: m.vaccine ? 0 : (P.PRICE || {})[m.id] || 0 };
    });
  };
  function Order() {
    const db = P.useDb();
    const [copied, setCopied] = useState(null);
    const [open, setOpen] = useState(null);
    const cycle = db.orderCycle || 2, buffer = db.orderBuffer != null ? db.orderBuffer : 1;
    const rows = P.orderLines(cycle, buffer);
    const cost = (r) => r.v * r.pack * r.price, total = rows.reduce((a, r) => a + cost(r), 0), over = total - BUDGET;
    const vitalShort = rows.filter((r) => r.ven === "V" && r.v < r.sug);
    const fit = () => {
      let excess = over;
      ["N", "E"].forEach((cls) => {
        if (excess <= 0) return;
        const ls = rows.filter((r) => r.ven === cls && r.v > 0), sub = ls.reduce((a, r) => a + cost(r), 0);
        const keep = Math.max(0, (sub - excess) / (sub || 1));
        ls.forEach((r) => { const nv = Math.floor(r.v * keep); excess -= (r.v - nv) * r.pack * r.price; db.orderDraft[r.m.id] = nv; });
      });
      P.commit(); P.toast("Trimmed Necessary, then Essential lines to fit the budget. Vital lines untouched.", "cart");
    };
    const text = rows.filter((r) => r.v > 0).map((r) => r.m.name + " — " + r.v + " packs of " + r.pack + " " + r.m.unit).join("\n");
    const copy = () => { try { navigator.clipboard.writeText(text).then(() => P.toast("Copied. Paste it into the NMS portal.", "copy"), () => setCopied(text)); } catch (e) { setCopied(text); } };
    const ugx = P.ugx || ((n) => "UGX " + Math.round(n).toLocaleString("en-GB"));
    return html`<div className="stack">
      <div className="ob-bar card pad">
        <div className="stack-s"><span className="lbl">NMS cycle</span><div className="chips">${[1, 2, 3].map((c) => html`<${P.Chip} key=${c} size="sm" on=${cycle === c} onClick=${() => { db.orderCycle = c; db.orderDraft = {}; P.commit(); }}>${c} month${c > 1 ? "s" : ""}<//>`)}</div></div>
        <div className="stack-s"><span className="lbl">Safety buffer</span><div className="chips">${[0.5, 1, 2].map((c) => html`<${P.Chip} key=${c} size="sm" on=${buffer === c} onClick=${() => { db.orderBuffer = c; db.orderDraft = {}; P.commit(); }}>${c} month${c !== 1 ? "s" : ""}<//>`)}</div></div>
        <div className="ob-budget"><div className="row between"><span className="lbl">This order against the NMS credit line</span><b className=${over > 0 ? "bad" : ""}>${ugx(total)} <span className="muted small">of ${ugx(BUDGET)}</span></b></div>
          <span className="lvl-bar ob-track"><i className=${over > 0 ? "refill" : ""} style=${{ width: Math.min(100, (total / BUDGET) * 100) + "%" }}></i></span>
          <div className="row between"><span className=${P.cx("small", over > 0 ? "bad" : "muted")}>${over > 0 ? ugx(over) + " over budget" : ugx(-over) + " left"}</span>${over > 0 ? html`<${P.Btn} size="sm" kind="primary" onClick=${fit}>Fit to budget<//>` : html`<${P.Btn} size="sm" kind="ghost" onClick=${() => { db.orderDraft = {}; P.commit(); }}>Reset to suggested<//>`}</div></div>
      </div>
      ${vitalShort.length ? html`<div className="note warn"><${P.Icon} n="alert" /><span>Vital lines below the suggestion: ${vitalShort.map((r) => r.m.name).join(", ")}. A stock-out of these stops care.</span></div>` : null}
      <div className="card"><div className="tblwrap"><table className="tbl dense ob-tbl">
        <thead><tr><th>Medicine</th><th>VEN</th><th className="r">On hand</th><th className="r">On order</th><th className="r">Use / month</th><th className="r">Suggested</th><th>Order</th><th className="r">Cost</th></tr></thead>
        <tbody>${P.CLASSES.concat("Other").map((c) => [c, rows.filter((x) => x.m.cat === c)]).filter(([, l]) => l.length).map(([c, l]) => html`<${React.Fragment} key=${c}>
          <tr className="grp"><td colSpan="8"><span>${c}</span><span className="muted">${l.filter((x) => x.v > 0).length} of ${l.length} to order · ${ugx(l.reduce((a, r) => a + cost(r), 0))}</span></td></tr>
          ${l.map((r) => html`<${React.Fragment} key=${r.m.id}><tr className=${r.v ? "" : "zero"}>
            <td><div className="dn-name"><span className="strong">${r.m.name}</span><${P.MedTags} med=${r.m.id} compact=${true} /></div><div className="dn-sub">${r.out ? html`<span className="bad">${r.out} days out of stock (last 90)</span>` : r.m.strength}</div></td>
            <td><span className=${P.cx("ob-ven", r.ven)}>${VENW[r.ven]}</span></td>
            <td className="r num">${r.have.toLocaleString("en-GB")}</td><td className="r num">${r.onOrder ? r.onOrder.toLocaleString("en-GB") : "—"}</td>
            <td className="r num">${r.amcAdj.toLocaleString("en-GB")}${r.out ? html`<div className="dn-sub">${r.m.amc.toLocaleString("en-GB")} seen</div>` : null}</td>
            <td className="r"><button type="button" className="clslink" onClick=${() => setOpen(open === r.m.id ? null : r.m.id)}>${r.sug} pack${r.sug === 1 ? "" : "s"}</button></td>
            <td><div className="packrow"><${P.Stepper} value=${r.v} onChange=${(x) => { db.orderDraft[r.m.id] = x || 0; P.commit(); }} label=${"order " + r.m.name} />
              <${P.PackPick} med=${r.m.id} value=${r.pack} onChange=${(n) => { db.orderPack = { ...(db.orderPack || {}), [r.m.id]: n }; delete db.orderDraft[r.m.id]; P.commit(); }} />
              ${r.v !== r.sug ? html`<button type="button" className="sugg" onClick=${() => { db.orderDraft[r.m.id] = r.sug; P.commit(); }}>Suggested ${r.sug}</button>` : null}</div></td>
            <td className="r num strong">${r.m.vaccine ? html`<span className="muted small">UNEPI</span>` : cost(r) ? ugx(cost(r)) : "—"}</td></tr>
            ${open === r.m.id ? html`<tr className="ob-why"><td colSpan="8">
              <b>How ${r.sug} packs was worked out:</b> use per month ${r.m.amc.toLocaleString("en-GB")}${r.out ? " × 90 ÷ (90 − " + r.out + " days out) = " + r.amcAdj.toLocaleString("en-GB") : ""}
              · × ${cycle + buffer} months (${cycle} cycle + ${buffer} buffer) = <b>${r.max.toLocaleString("en-GB")}</b> − on hand ${r.have.toLocaleString("en-GB")}${r.onOrder ? " − on order " + r.onOrder.toLocaleString("en-GB") : ""} = ${r.need.toLocaleString("en-GB")} ${r.m.unit} → ${r.sug} packs of ${r.pack}</td></tr>` : null}<//>`)}<//>`)}</tbody></table></div>
        <div className="sticky-foot"><span className="grow muted small">${rows.filter((r) => r.v > 0).length} lines · ${ugx(total)}</span><${P.Btn} kind="primary" icon="copy" onClick=${copy}>Copy for the NMS portal<//></div></div>
      <p className="hint">Use per month is corrected for days out of stock, so a stock-out doesn't shrink the next order. Vaccines come through UNEPI, outside the NMS credit line. Prices, the credit line and the VEN classes are samples; the real product reads them from NMS and the facility's medicines and therapeutics committee.</p>
      ${copied ? html`<${P.Dialog} title="Copy this list" sub="Your browser blocked copying. Select the text and copy it." onClose=${() => setCopied(null)}><textarea className="input" style=${{ height: "220px", padding: "10px" }} readOnly value=${copied} data-autofocus onFocus=${(e) => e.target.select()}></textarea><//>` : null}
    </div>`;
  }

  P.StoreView = ({ route }) => {
    const db = P.useDb();
    const tab = route.tab || "receive";
    const n = {
      receive: db.deliveries.filter((d) => d.status !== "received").length,
      issue: db.requests.filter((r) => r.status === "raised").length + db.transits.filter((t) => t.status === "onway").length,
      count: db.counts.filter((c) => c.status !== "done").length,
      cold: P.coldOpen().length,
    };
    const inner = route.delivery || route.ward || route.count;
    return html`${inner ? null : html`<${P.Seg} label="Store" value=${tab} onChange=${(t) => P.go({ to: "store", tab: t })} items=${[
      { v: "receive", label: "Receive", n: n.receive || null }, { v: "issue", label: "Issue", n: n.issue || null }, { v: "count", label: "Count", n: n.count || null }, { v: "order", label: "Order" }, { v: "cold", label: "Cold chain", n: n.cold || null }]} />`}
      ${tab === "receive" ? html`<${Receive} route=${route} />` : tab === "issue" ? html`<${Issue} route=${route} />` : tab === "count" ? html`<${Count} route=${route} />` : tab === "cold" ? html`<${P.ColdView} route=${route} />` : html`<${Order} />`}`;
  };
  P.StartCountDialog = StartCount;
  P.StartDeliveryDialog = StartDelivery;
})();
