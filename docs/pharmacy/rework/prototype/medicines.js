/* Medicines: one list, one page per medicine (where it is, batches, history, owed patients, actions). Replaces Shelf, Stock,
   Store › Every place, Expiry and quarantine. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;

  const FILTERS = [
    ["all", "All"], ["low", "Under a month left"], ["out", "Out of stock"], ["expiring", "Expiring in 90 days"], ["controlled", "Controlled"], ["cold", "Cold chain"],
  ];
  const pass = (m, f) => {
    if (f === "low") return P.medTotal(m.id) > 0 && P.months(m.id) < 1;
    if (f === "out") return P.medTotal(m.id) === 0;
    if (f === "expiring") return P.batchesOf(m.id).some((b) => P.usable(b) && P.monthsTo(b.exp) <= 3 && P.batchTotal(b.id) > 0);
    if (f === "controlled") return !!m.controlled;
    if (f === "cold") return !!m.cold;
    return true;
  };
  P.stockWord = (med) => {
    const t = P.medTotal(med);
    if (t === 0) return html`<${P.Tag} icon="ban">Out of stock<//>`;
    if (P.months(med) < 1) return html`<${P.Tag} icon="alert">Under a month left<//>`;
    return null;
  };
  P.monthsWord = (med) => { const mo = P.months(med); return mo === 0 ? "0 months" : mo < 0.1 ? "under 3 days" : mo.toFixed(1) + " months"; };

  function List({ route }) {
    P.useDb();
    const [f, setF] = useState(route.filter || "all");
    const [where, setWhere] = useState("all");
    const [q, setQ] = useState("");
    const [cls, setCls] = useState(route.cls || "all");
    const qq = q.trim().toLowerCase();
    const base = P.MEDS.filter((m) => pass(m, f) && (m.name.toLowerCase().includes(qq) || m.cat.toLowerCase().includes(qq)));
    const rows = base.filter((m) => cls === "all" || m.cat === cls);
    const groups = P.CLASSES.concat("Other").map((c) => [c, rows.filter((m) => m.cat === c)]).filter(([, l]) => l.length);
    const qty = (m) => (where === "all" ? P.medTotal(m.id) : P.medAt(m.id, where));
    return html`<div className="stack">
      <div className="row">
        <input className="input" style=${{ maxWidth: "320px" }} placeholder="Filter by name" value=${q} onChange=${(e) => setQ(e.target.value)} aria-label="Filter medicines by name" />
        <div className="chips">${[["all", "Everywhere"]].concat(P.PLACES.map((p) => [p.id, p.short])).map(([v, w]) => html`<${P.Chip} key=${v} size="sm" on=${where === v} onClick=${() => setWhere(v)}>${w}<//>`)}</div>
      </div>
      <div className="chips">${FILTERS.map(([v, w]) => html`<${P.Chip} key=${v} on=${f === v} onClick=${() => setF(v)}>${w}<//>`)}</div>
      <div className="clsbar" role="group" aria-label="Therapeutic class">
        <span className="lbl">Class</span>
        <${P.Chip} size="sm" on=${cls === "all"} onClick=${() => setCls("all")}>All classes <span className="cn">${base.length}</span><//>
        ${P.CLASSES.map((c) => { const n = base.filter((m) => m.cat === c).length; return html`<${P.Chip} key=${c} size="sm" on=${cls === c} disabled=${!n && cls !== c} onClick=${() => setCls(cls === c ? "all" : c)}>${c} <span className="cn">${n}</span><//>`; })}
      </div>
      <div className="card"><div className="tblwrap"><table className="tbl">
        <thead><tr><th>Medicine</th><th className="r">${where === "all" ? "On hand, everywhere" : "On hand at " + P.place(where).short}</th><th className="r">Lasts</th><th>Next expiry</th><th></th></tr></thead>
        <tbody>${groups.map(([c, list]) => html`<${React.Fragment} key=${c}>
          <tr className="grp"><td colSpan="5"><span>${c}</span><span className="muted">${list.length} ${list.length === 1 ? "medicine" : "medicines"}</span></td></tr>
          ${list.map((m) => {
          const nb = P.batchesOf(m.id).find((b) => P.usable(b) && P.batchTotal(b.id) > 0);
          return html`<tr key=${m.id} className="click" onClick=${() => P.go({ to: "medicines", med: m.id })}>
            <td><span className="strong">${m.name}</span><${P.MedTags} med=${m.id} /><${P.MedFacts} med=${m.id} /></td>
            <td className="r">${P.q(qty(m), m.id)}</td>
            <td className="r">${P.monthsWord(m.id)}</td>
            <td>${nb ? html`${P.expWord(nb.exp)}${P.monthsTo(nb.exp) <= 3 ? html` <${P.Tag} kind="caution" icon="clock">Within 90 days<//>` : null}` : html`<span className="muted">—</span>`}</td>
            <td>${P.stockWord(m.id)}</td></tr>`;
        })}<//>`)}</tbody></table></div>
        ${rows.length ? null : html`<${P.Empty} title="No medicine matches">Change the filter above.<//>`}
      </div>
      <p className="hint">"Lasts" is stock everywhere divided by the sample monthly use. The real figure would come from the ledger, adjusted for days out of stock.</p>
    </div>`;
  }

  function StockCard({ med, onClose }) {
    P.useDb();
    const [place, setPlace] = useState("store");
    const moves = P.db.moves.filter((m) => m.med === med && (m.from === place || m.to === place)).sort((a, b) => a.at - b.at);
    let bal = 0;
    const rows = moves.map((m) => { const inn = m.to === place ? m.qty : 0, out = m.from === place ? m.qty : 0; bal += inn - out; return { m, inn, out, bal }; });
    return html`<${P.Dialog} size="wide" title=${"Stock card: " + P.med(med).name} sub="The same columns as the paper stock card. Printed from the ledger, never typed." onClose=${onClose}
      foot=${html`<${P.Btn} kind="navy" icon="printer" onClick=${() => P.toast("Stock card sent to the printer (prototype)", "printer")}>Print<//>`}>
      <div className="chips">${P.PLACES.map((p) => html`<${P.Chip} key=${p.id} size="sm" on=${place === p.id} onClick=${() => setPlace(p.id)}>${p.short}<//>`)}</div>
      <div className="tblwrap"><table className="tbl">
        <thead><tr><th>Date</th><th>From / to</th><th>Batch</th><th className="r">Received</th><th className="r">Issued</th><th className="r">Balance</th><th>Initials</th></tr></thead>
        <tbody>${rows.map(({ m, inn, out, bal }) => html`<tr key=${m.id}><td>${P.when(m.at)}</td><td>${P.KIND[m.kind]} · ${P.placeName(m.to === place ? m.from : m.to)}</td><td className="mono">${(P.batch(m.batch) || {}).no}</td>
          <td className="r">${inn || ""}</td><td className="r">${out || ""}</td><td className="r strong">${bal}</td><td className="muted">${m.by.split(" ")[0]}</td></tr>`)}</tbody></table></div>
    <//>`;
  }

  function Quarantine({ batch, onClose }) {
    P.useDb();
    const b = P.batch(batch);
    const held = P.PLACES.filter((p) => p.kind !== "ward").map((p) => [p, P.bal(b.id, p.id)]).filter(([, q]) => q > 0);
    const [place, setPlace] = useState(held[0] ? held[0][0].id : null);
    const [qty, setQty] = useState(null);
    const [why, setWhy] = useState(null);
    const max = place ? P.bal(b.id, place) : 0;
    return html`<${P.Dialog} title=${"Quarantine " + b.no} sub=${P.med(b.med).name + " · expires " + P.expWord(b.exp)} onClose=${onClose}
      foot=${html`<${P.Btn} kind="primary" disabled=${!place || !qty || qty > max || !why} onClick=${() => { P.move({ kind: "quarantine", med: b.med, batch: b.id, from: place, to: place + ":q", qty, note: why }); P.commit(); P.toast(P.q(qty, b.med) + " moved to quarantine"); onClose(); }}>Move to quarantine<//>`}>
      <div className="stack-s"><span className="lbl">From</span><div className="chips">${held.map(([p, q]) => html`<${P.Chip} key=${p.id} on=${place === p.id} onClick=${() => setPlace(p.id)}>${p.short} · ${q}<//>`)}</div></div>
      <div className="stack-s"><span className="lbl">How many</span><div className="row"><${P.Stepper} value=${qty} onChange=${setQty} max=${max} unit=${P.med(b.med).unit} label="quantity" /><${P.Btn} size="sm" kind="ghost" onClick=${() => setQty(max)}>All ${max}<//></div></div>
      <div className="stack-s"><span className="lbl">Why</span><div className="chips">${["Damaged", "Expired", "Returned by a patient", "Suspected quality problem"].map((w) => html`<${P.Chip} size="sm" key=${w} on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div></div>
    <//>`;
  }

  P.StartRecall = ({ batch, onClose }) => {
    const b = P.batch(batch);
    const [why, setWhy] = useState(null);
    const [ref, setRef] = useState("");
    return html`<${P.Dialog} title=${"Recall batch " + b.no} sub=${P.med(b.med).name + " · expires " + P.expWord(b.exp)} onClose=${onClose}
      foot=${html`<${P.Btn} kind="primary" disabled=${!why} onClick=${() => {
        const db = P.db, id = "rc" + db.seq++;
        db.recalls.push({ id, batch, why, ref: ref.trim(), status: "open", at: P.now(), by: P.who(), contacts: {}, told: {} });
        b.recalled = true; P.commit(); onClose(); P.go({ to: "recall", recall: id });
      }}>Start the recall<//>`}>
      <div className="stack-s"><span className="lbl">Why</span><div className="chips">${["NDA recall notice", "Manufacturer recall", "Quality complaint here", "NMS instruction"].map((w) => html`<${P.Chip} key=${w} on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div></div>
      <div className="field"><label htmlFor="rref">Notice reference (optional)</label><input id="rref" className="input" value=${ref} onChange=${(e) => setRef(e.target.value)} /></div>
      <div className="note"><${P.Icon} n="ban" /><span>Starting a recall stops the batch from being picked anywhere straight away. Store keepers can start one; the in-charge closes it.</span></div>
    <//>`;
  };

  function MedPage({ route }) {
    const db = P.useDb();
    const m = P.med(route.med);
    const [range, setRange] = useState("all");
    const [kind, setKind] = useState("all");
    const [card, setCard] = useState(false);
    const [quar, setQuar] = useState(null);
    const [recall, setRecall] = useState(null);
    const batches = P.batchesOf(m.id);
    const total = P.medTotal(m.id);
    const nb = batches.find((b) => P.usable(b) && P.batchTotal(b.id) > 0);
    const owed = db.owed.filter((o) => !o.done && o.med === m.id);
    let moves = db.moves.filter((x) => x.med === m.id).sort((a, b) => b.at - a.at);
    if (kind === "in") moves = moves.filter((x) => ["receive", "opening", "returned"].includes(x.kind));
    if (kind === "out") moves = moves.filter((x) => ["handover", "issue", "emergency", "downtime", "confirm"].includes(x.kind));
    if (kind === "count") moves = moves.filter((x) => ["count", "quarantine"].includes(x.kind));
    if (range === "today") moves = moves.filter((x) => x.at > P.NOW0 - 11 * 3600e3 && x.kind !== "opening");
    const places = P.PLACES.map((p) => ({ p, qty: P.medAt(m.id, p.id), tr: P.medAt(m.id, "transit:" + p.id), q: P.medAt(m.id, p.id + ":q", true) })).filter((x) => x.qty || x.tr || x.q);
    return html`<div className="stack">
      <button type="button" className="back" onClick=${() => P.go({ to: "medicines" })}><${P.Icon} n="left" s=${16} />All medicines</button>
      <div className="row between">
        <div><h2 style=${{ fontSize: "20px" }}>${m.name}<${P.MedTags} med=${m.id} info=${false} /></h2><div className="muted"><button type="button" className="clslink" onClick=${() => P.go({ to: "medicines", cls: m.cat })}>${m.cat}</button> · ${m.strength} · pack of ${m.pack} ${m.unit} · Store shelf ${m.shelf.store}${m.shelf.opd ? " · OPD shelf " + m.shelf.opd : ""}</div></div>
        <div className="row">
          <${P.Btn} icon="clip" onClick=${() => { const c = P.startCount({ place: "store", scope: "med", med: m.id }); P.go({ to: "store", tab: "count", count: c.id }); }}>Count it<//>
          <${P.Btn} icon="send" onClick=${() => P.go({ to: "store", tab: "issue" })}>Issue<//>
          <${P.Btn} icon="printer" onClick=${() => setCard(true)}>Stock card<//>
        </div>
      </div>
      <div className="card pad stack-s"><h3 style=${{ fontSize: "15px" }}>Clinical information</h3><${P.MedInfoBody} med=${m.id} /></div>
      <div className="kpis">
        <div className="kpi"><b>${P.q(total, m.id)}</b><span>on hand, everywhere</span></div>
        <div className="kpi"><b>${P.monthsWord(m.id)}</b><span>lasts at ${P.q(m.amc, m.id)} a month (sample)</span></div>
        <div className="kpi"><b>${nb ? P.expWord(nb.exp) : "—"}</b><span>next expiry with stock</span></div>
        <div className="kpi"><b>${owed.length}</b><span>${owed.length === 1 ? "patient owed it" : "patients owed it"}</span></div>
      </div>
      <div className="grid2">
        <div className="stack">
          <div className="section-h"><h2>Batches</h2><span className="muted">earliest expiry first</span></div>
          ${batches.length ? batches.map((b) => {
            const at = P.REAL.map((p) => [p, P.bal(b.id, p) + P.bal(b.id, "transit:" + p)]).filter(([, q]) => q > 0);
            const q = P.REAL.map((p) => [p, P.bal(b.id, p + ":q")]).filter(([, x]) => x > 0);
            const sum = at.reduce((s, [, x]) => s + x, 0);
            return html`<div key=${b.id} className=${P.cx("batch", route.batch === b.id && "hl")}>
              <div className="row between"><div className="row"><b className="mono">${b.no}</b><span className="strong ink2">${P.batchBrand(b)}</span><span className="muted">expires ${P.expWord(b.exp)}</span>
                ${b.recalled ? html`<${P.Tag} kind="caution" icon="ban">Recalled · held<//>` : P.expired(b) ? html`<${P.Tag} kind="caution" icon="clock">Expired<//>` : P.monthsTo(b.exp) <= 3 ? html`<${P.Tag} kind="caution" icon="clock">Within 90 days<//>` : null}</div>
                <b className="num">${P.q(sum, m.id)}</b></div>
              ${sum ? html`<div className="bar" aria-hidden="true">${at.map(([p, x]) => html`<i key=${p} style=${{ width: (100 * x) / sum + "%", opacity: 0.35 + 0.65 * (x / sum) }}></i>`)}</div>` : null}
              <div className="chips">${at.map(([p, x]) => html`<${P.Tag} key=${p} kind="place">${P.place(p).short} ${x}<//>`)}${q.map(([p, x]) => html`<${P.Tag} key=${p + "q"} kind="caution" icon="alert">${P.place(p).short} quarantine ${x}<//>`)}${!at.length && !q.length ? html`<span className="muted small">None left anywhere</span>` : null}</div>
              ${!b.recalled && sum ? html`<div className="row"><${P.Btn} size="sm" kind="ghost" icon="alert" onClick=${() => setQuar(b.id)}>Quarantine some<//><${P.Btn} size="sm" kind="ghost" icon="ban" onClick=${() => setRecall(b.id)}>Recall this batch<//></div>` : null}
              ${b.recalled ? html`<div className="row"><${P.Btn} size="sm" kind="ghost" onClick=${() => { const r = db.recalls.find((x) => x.batch === b.id); if (r) P.go({ to: "recall", recall: r.id }); }}>Open the recall<//></div>` : null}
            </div>`;
          }) : html`<div className="card"><${P.Empty} icon="package" title="No batches yet">The first delivery creates them.<//></div>`}
          ${owed.length ? html`<div className="section-h"><h2>Owed to patients</h2></div>
            <div className="list">${owed.map((o) => html`<button type="button" key=${o.id} className="lrow" onClick=${() => P.go({ to: "dispense", tab: "owed" })}><div className="grow"><div className="t">${o.patient}</div><div className="m">${P.q(o.qty, o.med)} · since ${P.when(o.since)}${o.kind === "hold" ? " · held: " + o.reason : ""}</div></div><${P.Icon} n="right" /></button>`)}</div>` : null}
        </div>
        <div className="stack">
          <div className="section-h"><h2>Where it is</h2></div>
          <div className="card"><table className="tbl"><tbody>
            ${places.length ? places.map(({ p, qty, tr, q }) => html`<tr key=${p.id}><td>${p.name}</td><td className="r strong">${P.q(qty, m.id)}</td><td className="muted small">${tr ? tr + " on the way" : ""}${q ? (tr ? " · " : "") + q + " in quarantine" : ""}</td></tr>`)
              : html`<tr><td className="muted">Nowhere: out of stock</td></tr>`}
          </tbody></table></div>
          <div className="section-h"><h2>What happened</h2></div>
          <div className="chips">${[["all", "All"], ["in", "In"], ["out", "Out"], ["count", "Counts and quarantine"]].map(([v, w]) => html`<${P.Chip} key=${v} size="sm" on=${kind === v} onClick=${() => setKind(v)}>${w}<//>`)}
            <span style=${{ width: "8px" }}></span>${[["today", "Today"], ["all", "Everything"]].map(([v, w]) => html`<${P.Chip} key=${"r" + v} size="sm" on=${range === v} onClick=${() => setRange(v)}>${w}<//>`)}</div>
          <div className="card"><table className="tbl"><tbody>
            ${moves.slice(0, 40).map((x) => html`<tr key=${x.id}><td className="muted num" style=${{ whiteSpace: "nowrap" }}>${P.when(x.at)}</td>
              <td><span className="strong">${P.KIND[x.kind]}</span> ${x.kind === "handover" ? "to " + x.note : x.kind === "opening" ? "at " + P.placeName(x.to) : P.placeName(x.from) + " → " + P.placeName(x.to)}
                <div className="muted small"><span className="mono">${(P.batch(x.batch) || {}).no}</span> · ${x.by}${x.witness ? " · witness " + x.witness.name + (x.witness.how === "paper" ? " (paper)" : "") : ""}${x.note && x.kind !== "handover" ? " · " + x.note : ""}</div></td>
              <td className="r strong">${x.qty}${x.pending ? html`<div><${P.Tag} kind="pending" icon="wifioff">On this tablet<//></div>` : null}</td></tr>`)}
            ${moves.length ? null : html`<tr><td className="muted">Nothing yet for this filter.</td></tr>`}
          </tbody></table></div>
        </div>
      </div>
      ${card ? html`<${StockCard} med=${m.id} onClose=${() => setCard(false)} />` : null}
      ${quar ? html`<${Quarantine} batch=${quar} onClose=${() => setQuar(null)} />` : null}
      ${recall ? html`<${P.StartRecall} batch=${recall} onClose=${() => setRecall(null)} />` : null}
    </div>`;
  }

  P.MedicinesView = ({ route }) => (route.med ? html`<${MedPage} key=${route.med} route=${route} />` : html`<${List} route=${route} key=${(route.filter || "all") + (route.cls || "")} />`);
})();
