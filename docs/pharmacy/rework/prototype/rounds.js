/* Round pick lists: the next drug round for every ward, worked out from the medicine charts.
   For each patient: doses due in the window × dose, minus what is already on the ward for them.
   One pick list per ward, picked in one pass, sent in one hand-over; the ward confirms on receipt. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const WIN = [["12", "Next 12 h", 12], ["24", "Next 24 h", 24], ["48", "Next 48 h", 48]];

  P.roundLines = (ward, hours) => {
    const now = P.now(), to = now + hours * HOUR, out = {};
    P.INPATIENTS.filter((p) => p.ward === ward).forEach((p) => P.regsOf(p.id).forEach((r) => {
      if (r.prn) return;
      const slots = P.slots(r, now - 30 * MIN, to).filter((t) => !P.doseAt(r, t));
      if (!slots.length) return;
      const j = P.journey(r), need = slots.length * r.qty, have = j.left + Math.max(0, j.onway), pick = Math.max(0, need - have);
      (out[r.med] = out[r.med] || { med: r.med, pts: [], need: 0, have: 0, pick: 0 });
      out[r.med].pts.push({ p, r, n: slots.length, need, have, pick, times: slots.map((t) => P.time(t)) });
      out[r.med].need += need; out[r.med].have += have; out[r.med].pick += pick;
    }));
    return Object.values(out).map((l) => ({ ...l, store: P.medAt(l.med, "store"), batch: (P.fefo(l.med, "store")[0] || null) })).sort((a, b) => b.pick - a.pick);
  };
  const qw = (n, med) => { const m = P.med(med); return m.unit === "mL" ? n + " mL" : n + " " + (n === 1 ? m.unit.replace(/s$/, "") : m.unit); };
  const lastRound = (ward) => (P.db.rounds || []).filter((x) => x.ward === ward).sort((a, b) => b.at - a.at)[0];

  const WardList = ({ ward, hours }) => {
    const db = P.useDb();
    const lines = P.roundLines(ward, hours), todo = lines.filter((l) => l.pick > 0);
    const [tick, setTick] = useState({});
    const last = lastRound(ward), lt = last && db.transits.find((t) => t.id === last.tid);
    const allTicked = todo.length && todo.every((l) => tick[l.med]);
    const send = () => {
      const t = { id: "t" + db.seq++, dest: ward, at: P.now(), status: "onway", moves: [], patient: "Round pick list" };
      const sent = [];
      todo.forEach((l) => l.pts.filter((x) => x.pick > 0).forEach((x) => {
        const q = Math.min(x.pick, P.medAt(l.med, "store")); if (!q) return;
        const a = P.allocate(l.med, "store", q);
        a.parts.forEach((pp) => { const mv = P.move({ kind: "issue", med: l.med, batch: pp.batch, from: "store", to: "transit:" + ward, qty: pp.qty, ref: t.id, note: "Round · " + x.p.name + " · " + x.p.bed }); t.moves.push({ med: mv.med, batch: mv.batch, qty: mv.qty }); });
        db.ipSupply = db.ipSupply || {}; (db.ipSupply[x.r.id] = db.ipSupply[x.r.id] || []).push({ at: P.now(), qty: q, parts: a.parts, by: P.who(), tid: t.id, round: true });
        sent.push({ med: l.med, pt: x.p.name, bed: x.p.bed, qty: q });
      }));
      if (!sent.length) { P.toast("Nothing in the store to send", "alert"); return; }
      db.transits.push(t); (db.rounds = db.rounds || []).push({ id: "rd" + db.seq++, ward, at: P.now(), tid: t.id, hours, lines: sent, by: P.who() });
      P.commit(); setTick({}); P.toast(sent.length + " patient bags sent to " + P.place(ward).short + " · waiting for the ward to confirm", "send");
    };
    return html`<div className="card">
      <div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>${P.place(ward).name}</h3>
        <span className="muted small">${P.INPATIENTS.filter((p) => p.ward === ward).length} patients · ${todo.length} of ${lines.length} medicines to pick</span><span className="grow"></span>
        ${last ? html`<span className=${P.cx("small", lt && lt.status !== "confirmed" ? "bad" : "muted")}>Last round ${P.when(last.at)}${lt ? (lt.status === "confirmed" ? " · confirmed" : " · not yet confirmed by the ward") : ""}</span>` : null}</div>
      ${lines.length ? html`<div className="tblwrap"><table className="tbl dense rd-tbl">
        <thead><tr><th></th><th>Medicine</th><th>Patients (doses in the window)</th><th className="r">Needed</th><th className="r">On the ward</th><th className="r">To pick</th><th>Batch</th></tr></thead>
        <tbody>${lines.map((l) => { const m = P.med(l.med), short = l.pick > l.store; return html`<tr key=${l.med} className=${l.pick ? (tick[l.med] ? "rd-on" : "") : "zero"}>
          <td>${l.pick ? html`<button type="button" className=${P.cx("rd-tick", tick[l.med] && "on")} aria-pressed=${tick[l.med] ? "true" : "false"} aria-label=${"Picked " + m.name} onClick=${() => setTick({ ...tick, [l.med]: !tick[l.med] })}>${tick[l.med] ? html`<${P.Icon} n="check" s=${14} />` : null}</button>` : null}</td>
          <td><div className="dn-name"><span className="strong">${m.name}</span><${P.MedTags} med=${l.med} compact=${true} /></div><div className="dn-sub">${P.place("store").short}: ${P.med(l.med).shelf && P.med(l.med).shelf.store ? "shelf " + P.med(l.med).shelf.store : ""}</div></td>
          <td className="small">${l.pts.map((x) => html`<div key=${x.r.id}><b>${x.p.bed}</b> ${x.p.name} · ${x.r.dose} × ${x.n} (${x.times.slice(0, 4).join(", ")}${x.times.length > 4 ? "…" : ""})${x.have ? html` <span className="muted">· ${x.have} already there</span>` : null}</div>`)}</td>
          <td className="r num">${l.need}</td><td className="r num">${l.have}</td>
          <td className="r num strong">${l.pick ? qw(l.pick, l.med) : "—"}${short ? html`<div className="bad small">store has ${l.store}</div>` : null}</td>
          <td className="small mono">${l.pick && l.batch ? l.batch.no : ""}${l.pick && l.batch ? html`<div className="dn-sub">exp ${P.expWord(l.batch.exp)}</div>` : null}</td></tr>`; })}</tbody></table></div>
        <div className="rd-foot"><span className="grow muted small">${todo.length ? (allTicked ? "All picked. One bag per patient, labelled with bed and name." : todo.filter((l) => tick[l.med]).length + " of " + todo.length + " picked") : "Nothing to pick: the ward has enough for this window."}</span>
          ${todo.length ? html`<${P.Btn} size="sm" kind="ghost" onClick=${() => setTick(Object.fromEntries(todo.map((l) => [l.med, true])))}>Tick all<//><${P.Btn} size="sm" kind="ghost" icon="printer" onClick=${() => P.toast("Pick list and bag labels for " + P.place(ward).short + " sent to the printer (prototype)", "printer")}>Print<//>
            <${P.Btn} kind="primary" icon="send" disabled=${!allTicked} onClick=${send}>Send to ${P.place(ward).short}<//>` : null}</div>`
      : html`<p className="muted small" style=${{ padding: "0 16px 14px" }}>No scheduled doses in this window.</p>`}
    </div>`;
  };

  P.RoundView = () => {
    const db = P.useDb();
    const [w, setW] = useState("24");
    const hours = WIN.find((x) => x[0] === w)[2];
    const wards = P.PLACES.filter((p) => p.kind === "ward");
    const all = wards.map((x) => P.roundLines(x.id, hours));
    const lines = all.reduce((a, l) => a + l.filter((x) => x.pick > 0).length, 0), units = all.reduce((a, l) => a + l.reduce((b, x) => b + x.pick, 0), 0);
    const shortL = all.flat().filter((l) => l.pick > l.store);
    return html`<div className="stack">
      <div className="row between"><div className="chips">${WIN.map(([k, label]) => html`<${P.Chip} key=${k} on=${w === k} onClick=${() => setW(k)}>${label}<//>`)}</div>
        <span className="muted small">${lines} medicine lines · ${units.toLocaleString("en-GB")} units across ${wards.length} wards</span></div>
      ${shortL.length ? html`<div className="note warn"><${P.Icon} n="alert" /><span>Not enough in the store for: ${[...new Set(shortL.map((l) => P.med(l.med).name))].join(", ")}. Send what there is and tell the prescriber.</span></div>` : null}
      ${wards.map((x) => html`<${WardList} key=${x.id + w} ward=${x.id} hours=${hours} />`)}
      <p className="hint">Worked out from the medicine charts: doses due in the window, minus what was already picked for each patient and is still on the ward. Sending creates one hand-over per ward; each patient's track shows it, and the ward confirms on receipt.</p>
    </div>`;
  };
})();
