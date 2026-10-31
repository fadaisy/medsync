/* Records (audit trail and losses live in audit.js; paper sheets, reports), the recall job, and Set-up (in the account menu). */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;

  /* ───────── Paper sheets ───────── */
  function Sheets() {
    const db = P.useDb();
    const enter = (s, i) => {
      const r = s.rows[i];
      P.move({ kind: "downtime", med: r.med, batch: r.batch, from: s.place, to: "patient", qty: r.qty, ref: s.id, note: r.who, at: P.NOW0 - 20 * 3600e3, entered: P.now() });
      s.entered.push(i); P.commit();
    };
    return html`<div className="stack">
      <div className="note"><${P.Icon} n="file" /><span>When the network is down for long, or the tablet is dead, the team hands over on a printed sheet. Each row is entered here afterwards, with the time it really happened. Short cuts don't need paper: the tablet keeps working and sends later.</span></div>
      <div className="row"><${P.Btn} kind="navy" icon="printer" onClick=${() => P.toast("Blank hand-over sheets sent to the printer (prototype)", "printer")}>Print blank sheets<//></div>
      ${db.sheets.map((s) => html`<div className="card pad stack-s" key=${s.id}>
        <div className="row between"><div><h3 style=${{ fontSize: "14px" }}>${s.label} · ${P.place(s.place).name}</h3><div className="muted small">${s.when}</div></div>
          ${s.entered.length < s.rows.length ? html`<${P.Btn} kind="primary" onClick=${() => s.rows.forEach((_, i) => { if (!s.entered.includes(i)) enter(s, i); })}>Enter all ${s.rows.length - s.entered.length} rows<//>` : html`<${P.Tag} icon="check">All entered<//>`}</div>
        ${s.rows.map((r, i) => html`<div className="check" key=${i}><${P.Icon} n=${s.entered.includes(i) ? "check" : "file"} />
          <div><b>${r.who}</b><div className="muted small">${P.q(r.qty, r.med)} ${P.med(r.med).name} · batch <span className="mono">${P.batch(r.batch).no}</span></div></div>
          ${s.entered.includes(i) ? html`<${P.Tag} icon="check">Entered<//>` : html`<${P.Btn} size="sm" onClick=${() => enter(s, i)}>Enter row<//>`}</div>`)}
      </div>`)}
    </div>`;
  }

  /* ───────── Reports ───────── */
  const Reports = () => html`<${P.ReportsView} />`;

  P.RecordsView = ({ route }) => {
    const db = P.useDb();
    const tab = route.tab && !["cd", "activity"].includes(route.tab) ? route.tab : "audit";
    const left = db.sheets.reduce((s, x) => s + x.rows.length - x.entered.length, 0);
    return html`<${P.Seg} label="Records" value=${tab} onChange=${(t) => P.go({ to: "records", tab: t })} items=${[
      { v: "audit", label: "Audit trail" }, { v: "losses", label: "Losses (UGX)" },
      { v: "sheets", label: "Paper sheets", n: left || null }, { v: "reports", label: "Reports" }]} />
      ${tab === "audit" ? html`<${P.AuditView} />` : tab === "losses" ? html`<${P.LossView} />` : tab === "sheets" ? html`<${Sheets} />` : html`<${Reports} />`}`;
  };

  /* ───────── Recall ───────── */
  const recallState = (r) => {
    const b = P.batch(r.batch);
    const held = P.REAL.map((p) => ({ p, n: P.bal(b.id, p) + P.bal(b.id, "transit:" + p) })).filter((x) => x.n > 0);
    const pts = P.db.moves.filter((m) => m.batch === b.id && m.to === "patient");
    return { b, held, pts, ptsLeft: pts.filter((m) => !r.contacts[m.id]) };
  };
  P.recallLeft = (r) => {
    const s = recallState(r);
    if (s.held.length) return P.q(s.held.reduce((t, x) => t + x.n, 0), s.b.med) + " still on shelves in " + s.held.map((x) => P.place(x.p).short).join(", ");
    if (s.ptsLeft.length) return s.ptsLeft.length + " of " + s.pts.length + " patients still to contact";
    return "Everything found: ready to close";
  };

  P.RecallView = ({ route }) => {
    const db = P.useDb();
    const r = db.recalls.find((x) => x.id === route.recall);
    if (!r) return html`<div className="card"><${P.Empty} title="No such recall" /></div>`;
    const { b, held, pts, ptsLeft } = recallState(r);
    const m = P.med(b.med);
    const ours = held.filter((x) => P.place(x.p).kind !== "ward");
    const wards = held.filter((x) => P.place(x.p).kind === "ward");
    const q = P.REAL.map((p) => ({ p, n: P.bal(b.id, p + ":q") })).filter((x) => x.n > 0);
    const quarantineOurs = () => { ours.forEach((x) => P.move({ kind: "quarantine", med: b.med, batch: b.id, from: x.p, to: x.p + ":q", qty: P.bal(b.id, x.p), ref: r.id, note: "Recall: " + r.why })); P.commit(); P.toast("Quarantined in " + ours.map((x) => P.place(x.p).short).join(" and "), "ban"); };
    const wardReturned = (p) => { P.move({ kind: "returned", med: b.med, batch: b.id, from: p, to: "store:q", qty: P.bal(b.id, p), ref: r.id, note: "Recall: " + r.why, by: "Nurse in-charge, " + P.place(p).short + " (sample)" }); P.commit(); P.toast(P.place(p).short + " returned it to the store's quarantine", "undo"); };
    const done = !held.length && !ptsLeft.length;
    return html`<div className="stack">
      <div className="row between"><div><h2 style=${{ fontSize: "20px" }}>Recall: ${m.name} <span className="mono">${b.no}</span></h2><div className="row"><${P.MedTags} med=${m.id} /></div>
        <div className="muted">${r.why}${r.ref ? " · reference " + r.ref : ""} · opened ${P.when(r.at)} by ${r.by}</div></div>
        ${r.status === "closed" ? html`<${P.Tag} icon="check">Closed ${P.when(r.closedAt)}<//>` : html`<${P.Tag} icon="ban">Open<//>`}</div>
      <div className="grid2">
        <div className="stack">
          <div className="card pad stack-s">
            <h3 style=${{ fontSize: "14px" }}>1 · Take it off every shelf</h3>
            ${!held.length ? html`<span className="ok-line"><${P.Icon} n="check" s=${16} />Nothing left on any shelf.</span>` : null}
            ${ours.map((x) => html`<div className="check" key=${x.p}><${P.Icon} n="package" /><div><b>${P.place(x.p).name}</b><div className="muted small">${P.q(x.n, b.med)}</div></div><span></span></div>`)}
            ${ours.length ? html`<div className="row"><${P.Btn} kind="primary" icon="ban" onClick=${quarantineOurs}>Quarantine everything we hold<//></div>` : null}
            ${wards.map((x) => html`<div className="check" key=${x.p}><${P.Icon} n="pin" /><div><b>${P.place(x.p).name}</b><div className="muted small">${P.q(x.n, b.med)} on the ward${r.told[x.p] ? " · told " + P.time(r.told[x.p]) : ""}</div></div>
              ${r.told[x.p] ? html`<${P.Btn} size="sm" kind="navy" icon="phone" onClick=${() => wardReturned(x.p)}>Simulate: ward returns it<//>` : html`<${P.Btn} size="sm" icon="send" onClick=${() => { r.told[x.p] = P.now(); P.commit(); P.toast(P.place(x.p).short + " told on their phone and Today", "send"); }}>Tell the ward<//>`}</div>`)}
            ${q.length ? html`<p className="muted small">In quarantine: ${q.map((x) => P.q(x.n, b.med) + " at " + P.place(x.p).short).join(" · ")}. Return to the supplier follows NMS's instructions (outside this prototype).</p>` : null}
          </div>
          <div className="card pad stack-s">
            <h3 style=${{ fontSize: "14px" }}>2 · Tell the patients who got it</h3>
            <p className="muted small">Found from the hand-overs of batch ${b.no}. Pick what happened for each one.</p>
            ${pts.map((mv) => html`<div className="check" key=${mv.id}><${P.Icon} n=${r.contacts[mv.id] ? "check" : "user"} />
              <div><b>${mv.note}</b><div className="muted small">${P.q(mv.qty, b.med)} · handed over ${P.when(mv.at)}</div></div>
              <div className="chips">${["Phoned", "SMS sent", "Not reachable"].map((w) => html`<${P.Chip} key=${w} size="sm" disabled=${r.status === "closed"} on=${r.contacts[mv.id] === w} onClick=${() => { r.contacts[mv.id] = w; P.commit(); }}>${w}<//>`)}</div></div>`)}
            ${pts.length ? null : html`<p className="muted">No patient received this batch.</p>`}
          </div>
        </div>
        <div className="stack">
          <div className="card pad stack-s">
            <h3 style=${{ fontSize: "14px" }}>Where it stands</h3>
            <p>${P.recallLeft(r)}</p>
            ${r.status === "open" ? html`<${P.Btn} kind="primary" disabled=${!done} onClick=${() => { r.status = "closed"; r.closedAt = P.now(); P.commit(); P.toast("Recall closed"); }}>Close the recall<//>` : null}
            <p className="hint">It closes only when nothing is left on a shelf and every patient has an outcome. "Not reachable" counts as an outcome, and stays on the record.</p>
          </div>
          <div className="note"><${P.Icon} n="ban" /><span>The batch is blocked everywhere at once: it can't be handed over, issued or picked as the earliest-expiry batch.</span></div>
        </div>
      </div>
    </div>`;
  };

  /* ───────── Set-up (account menu) ───────── */
  const CHECKS = [
    ["dispense", "Turn dispensing on for this hospital", "Today the pharmacy pages open view-only in production. Owner action."],
    ["demo", "Remove the demo data", "The demo hospital's sample stock must not sit in the production database."],
    ["legal1", "Interim answer to legal question 1", "Who may hand over without a pharmacist present. Until answered, the rule stays strict."],
    ["witness", "Answer the witness question", "Whether a nurse may witness a controlled drug. Until then only pharmacy staff are on the list."],
    ["levels", "Sign the ward stock levels", "The top-up targets the Issue screen suggests from."],
    ["printer", "Choose labels: printer or hand-written", "Hand-written works from day one."],
  ];
  P.SetupView = () => {
    const db = P.useDb();
    db.setupDone = db.setupDone || {};
    const [tab, setTab] = useState("live");
    return html`<${P.Seg} label="Set-up" value=${tab} onChange=${setTab} items=${[{ v: "live", label: "Going live", n: CHECKS.filter(([k]) => !db.setupDone[k]).length || null }, { v: "rules", label: "Rules" }, { v: "people", label: "People" }]} />
      ${tab === "live" ? html`<div className="card pad">
        ${CHECKS.map(([k, t, d]) => html`<div className="check" key=${k}><${P.Icon} n=${db.setupDone[k] ? "check" : "clip"} /><div><b>${t}</b><div className="muted small">${d}</div></div>
          <${P.Chip} size="sm" on=${!!db.setupDone[k]} onClick=${() => { db.setupDone[k] = !db.setupDone[k]; P.commit(); }}>${db.setupDone[k] ? "Done" : "Mark done"}<//></div>`)}
        <p className="hint">Prototype: ticking here changes nothing real. It shows where the go-live steps would live: out of the daily doors, in one list.</p></div>`
      : tab === "rules" ? html`<div className="stack">
        <div className="note"><${P.Icon} n="lock" /><span>Rules are read-only here. Changing one is a signed change, made by the in-charge and recorded.</span></div>
        <div className="card"><div className="tblwrap"><table className="tbl"><thead><tr><th>Place</th><th>Medicine</th><th className="r">Stock level (sample)</th></tr></thead>
          <tbody>${Object.keys(P.LEVELS).flatMap((p) => Object.keys(P.LEVELS[p]).map((m) => html`<tr key=${p + m}><td>${P.place(p).name}</td><td>${P.med(m).name}</td><td className="r">${P.LEVELS[p][m]} ${P.med(m).unit}</td></tr>`))}</tbody></table></div></div>
        <div className="card pad stack-s"><h3 style=${{ fontSize: "14px" }}>Who may witness a controlled drug</h3><div className="chips">${P.WITNESSES.map((w) => html`<${P.Tag} key=${w}>${w}<//>`)}</div></div>
        <div className="card pad stack-s"><h3 style=${{ fontSize: "14px" }}>Labels</h3><div className="chips">
          <${P.Chip} on=${db.printer !== "bt"} onClick=${() => { db.printer = null; P.commit(); }}>Hand-write labels<//><${P.Chip} on=${db.printer === "bt"} onClick=${() => { db.printer = "bt"; P.commit(); }}>Bluetooth label printer (prototype)<//></div></div>
      </div>`
      : html`<div className="card"><div className="tblwrap"><table className="tbl"><thead><tr><th>Role</th><th>Sees first on Today</th></tr></thead><tbody>
        <tr><td>Pharmacist</td><td>Patients waiting, owed medicine, counts</td></tr>
        <tr><td>Store keeper</td><td>Deliveries, ward requests and top-ups, stock running out</td></tr>
        <tr><td>In-charge pharmacist</td><td>Approvals, paper-witnessed entries, recalls</td></tr></tbody></table></div></div>`}`;
  };
})();
