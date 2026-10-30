/* Immunisation: who has had which vaccine, who is due or overdue, when they come back, the open vials in today's session,
   and coverage, dropout and wastage for the month. Schedule follows the usual UNEPI pattern (sample: confirm against the current schedule). */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const D = (y, m, d) => new Date(y, m - 1, d).getTime();
  const today0 = () => { const t = new Date(P.now()); return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); };
  const addM = (ts, m) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth() + m, d.getDate()).getTime(); };
  const fmtD = (ts) => { const d = new Date(ts); return d.getDate() + " " + P.MON[d.getMonth()] + (d.getFullYear() !== 2026 ? " " + d.getFullYear() : ""); };
  const rel = (ts) => { const k = Math.round((ts - today0()) / DAY); return k === 0 ? "today" : k === 1 ? "tomorrow" : k === -1 ? "yesterday" : k < 0 ? -k + " days ago" : "in " + k + " days"; };
  const ageWord = (dob) => { const days = Math.floor((today0() - dob) / DAY); if (days < 7 * 8) return Math.floor(days / 7) + " wk" + (days < 14 ? " (" + days + " d)" : ""); const mo = Math.floor(days / 30.44); return mo < 24 ? mo + " mo" : Math.floor(mo / 12) + " y"; };

  /* ── schedules ── */
  const CHILD = [
    { c: "Birth", at: (dob) => dob, items: [["bcg", "BCG", "Right upper arm, intradermal"], ["bopv", "OPV0", "Oral"]] },
    { c: "6 weeks", at: (dob) => dob + 42 * DAY, items: [["bopv", "OPV1", "Oral"], ["penta", "Penta1", "Left thigh, IM"], ["pcv", "PCV1", "Right thigh, IM"], ["rota", "Rota1", "Oral"]] },
    { c: "10 weeks", at: (dob) => dob + 70 * DAY, items: [["bopv", "OPV2", "Oral"], ["penta", "Penta2", "Left thigh, IM"], ["pcv", "PCV2", "Right thigh, IM"], ["rota", "Rota2", "Oral"]] },
    { c: "14 weeks", at: (dob) => dob + 98 * DAY, items: [["bopv", "OPV3", "Oral"], ["penta", "Penta3", "Left thigh, IM"], ["pcv", "PCV3", "Right thigh, IM"], ["ipv", "IPV", "Right thigh, IM (2.5 cm from PCV)"]] },
    { c: "9 months", at: (dob) => addM(dob, 9), items: [["mr", "MR1", "Left upper arm, SC"]] },
    { c: "18 months", at: (dob) => addM(dob, 18), items: [["mr", "MR2", "Left upper arm, SC"]] },
  ];
  const PREV = { OPV2: "OPV1", OPV3: "OPV2", Penta2: "Penta1", Penta3: "Penta2", PCV2: "PCV1", PCV3: "PCV2", Rota2: "Rota1", MR2: "MR1" };
  const TD = [["Td1", 0], ["Td2", 28], ["Td3", 182], ["Td4", 365], ["Td5", 365]];

  /* ── sample register ── */
  const CLIENTS = [
    { id: "c01", kind: "child", name: "Sample child 01", sex: "F", dob: D(2026, 10, 27), card: "EPI/26/0412", carer: "Sample mother 01", phone: "0772 ··· 101", village: "Kisugu", upTo: [] },
    { id: "c02", kind: "child", name: "Sample child 02", sex: "M", dob: D(2026, 9, 17), card: "EPI/26/0371", carer: "Sample mother 02", phone: "0701 ··· 233", village: "Kabalagala", upTo: ["BCG", "OPV0"] },
    { id: "c03", kind: "child", name: "Sample child 03", sex: "F", dob: D(2026, 8, 6), card: "EPI/26/0322", carer: "Sample father 03", phone: "0752 ··· 318", village: "Nsambya", upTo: ["BCG", "OPV0", "OPV1", "Penta1", "PCV1", "Rota1"] },
    { id: "c04", kind: "child", name: "Sample child 04", sex: "M", dob: D(2026, 6, 20), card: "EPI/26/0255", carer: "Sample mother 04", phone: "0789 ··· 442", village: "Kansanga", upTo: ["BCG", "OPV0", "OPV1", "Penta1", "PCV1", "Rota1", "OPV2", "Penta2", "PCV2", "Rota2"] },
    { id: "c05", kind: "child", name: "Sample child 05", sex: "F", dob: D(2026, 1, 25), card: "EPI/26/0043", carer: "Sample mother 05", phone: "0774 ··· 590", village: "Kisugu", upTo: ["BCG", "OPV0", "OPV1", "Penta1", "PCV1", "Rota1", "OPV2", "Penta2", "PCV2", "Rota2", "OPV3", "Penta3", "PCV3", "IPV"] },
    { id: "c06", kind: "child", name: "Sample child 06", sex: "M", dob: D(2026, 7, 2), card: "EPI/26/0268", carer: "Sample mother 06", phone: "0706 ··· 671", village: "Muyenga", upTo: ["BCG", "OPV0", "OPV1", "Penta1", "PCV1", "Rota1", "OPV2", "Penta2", "PCV2", "Rota2", "OPV3", "Penta3", "PCV3", "IPV"] },
    { id: "c07", kind: "child", name: "Sample child 07", sex: "F", dob: D(2025, 4, 28), card: "EPI/25/0198", carer: "Sample grandmother 07", phone: "0757 ··· 712", village: "Nsambya", upTo: ["BCG", "OPV0", "OPV1", "Penta1", "PCV1", "Rota1", "OPV2", "Penta2", "PCV2", "Rota2", "OPV3", "Penta3", "PCV3", "IPV", "MR1"], appt: D(2026, 10, 30) },
    { id: "c08", kind: "child", name: "Sample child 08", sex: "M", dob: D(2026, 5, 8), card: "EPI/26/0177", carer: "Sample mother 08", phone: "0782 ··· 805", village: "Kabalagala", upTo: ["BCG", "OPV0", "OPV1", "Penta1", "PCV1", "Rota1"] },
    { id: "w01", kind: "woman", name: "Sample woman 01", sex: "F", dob: D(2002, 3, 4), card: "ANC/26/0911", carer: "Self", phone: "0771 ··· 920", village: "Kansanga", note: "Pregnant, 20 weeks (G2)", tdGiven: [["Td1", D(2026, 10, 1)]] },
    { id: "w02", kind: "woman", name: "Sample woman 02", sex: "F", dob: D(1997, 7, 19), card: "ANC/26/0640", carer: "Self", phone: "0703 ··· 064", village: "Muyenga", note: "Woman of childbearing age", tdGiven: [["Td1", D(2026, 2, 2)], ["Td2", D(2026, 3, 9)]] },
    { id: "g01", kind: "girl", name: "Sample girl 01", sex: "F", dob: D(2016, 5, 14), card: "SCH/26/0033", carer: "Sample mother 11", phone: "0790 ··· 113", village: "Kisugu", note: "P.5, school outreach" },
  ];
  const BATCH = { bcg: "bcg-1", bopv: "bopv-1", ipv: "ipv-1", penta: "penta-1", pcv: "pcv-1", rota: "rota-1", mr: "mr-2", hpv: "hpv-1", td: "td-1" };
  const NURSES = ["Nurse AK (sample)", "Nurse JN (sample)"];

  P.epiClients = () => CLIENTS.concat(P.db.epiNew || []);
  P.epiClient = (id) => P.epiClients().find((c) => c.id === id);

  /* doses: sample history computed from the schedule, plus what is recorded in this browser */
  P.epiGiven = (c) => {
    const out = {};
    if (c.kind === "child") CHILD.forEach((g, gi) => g.items.forEach(([med, lab, site]) => { if ((c.upTo || []).includes(lab)) out[lab] = { at: g.at(c.dob) + ((gi * 3 + lab.length) % 5) * DAY, batch: BATCH[med], site, by: NURSES[gi % 2], sample: true }; }));
    (c.tdGiven || []).forEach(([lab, t]) => { out[lab] = { at: t, batch: BATCH.td, site: "Left upper arm, IM", by: NURSES[0], sample: true }; });
    return Object.assign(out, ((P.db.epiDoses || {})[c.id]) || {});
  };

  /* every dose this client should have, with its due date and state */
  P.epiPlan = (c) => {
    const g = P.epiGiven(c), t0 = today0(), out = [];
    const st = (due, lab, extra) => {
      const rec = g[lab];
      if (rec) return { lab, due, rec, s: "given", ...extra };
      if (due == null) return { lab, due, s: "wait", ...extra };
      const late = Math.round((t0 - due) / DAY);
      return { lab, due, s: due > t0 ? "next" : late <= 7 ? "due" : "overdue", late, ...extra };
    };
    if (c.kind === "child") CHILD.forEach((grp) => grp.items.forEach(([med, lab, site]) => {
      let due = grp.at(c.dob);
      if (lab === "OPV0" && !g.OPV0 && t0 - c.dob > 14 * DAY) { out.push({ lab, med, site, contact: grp.c, s: "window", due }); return; }
      const pv = PREV[lab]; if (pv) { if (!g[pv]) due = null; else due = Math.max(due, g[pv].at + 28 * DAY); }
      out.push(st(due, lab, { med, site, contact: grp.c, after: pv }));
    }));
    if (c.kind === "woman") { let prev = null; TD.forEach(([lab, gap], i) => { const due = i === 0 ? c.dob + 15 * 365 * DAY : prev ? prev + gap * DAY : null; out.push(st(due, lab, { med: "td", site: "Left upper arm, IM", contact: lab, after: i ? TD[i - 1][0] : null })); prev = g[lab] ? g[lab].at : null; }); }
    if (c.kind === "girl") out.push(st(addM(c.dob, 120), "HPV", { med: "hpv", site: "Left upper arm (deltoid), IM", contact: "10 years" }));
    return out;
  };
  P.epiStatus = (c) => {
    const plan = P.epiPlan(c), open = plan.filter((x) => x.s === "due" || x.s === "overdue");
    const next = plan.filter((x) => x.s === "next").sort((a, b) => a.due - b.due)[0];
    const worst = open.reduce((a, x) => Math.max(a, x.late || 0), 0);
    const appt = ((P.db.epiAppt || {})[c.id]) || c.appt || null;
    if (open.length) return { k: worst > 7 ? "overdue" : "due", late: worst, due: open, next, appt };
    if (next) return { k: "ok", next, appt: appt || next.due };
    return { k: "complete" };
  };
  P.epiDefaulters = () => P.epiClients().map((c) => ({ c, s: P.epiStatus(c) })).filter((x) => x.s.k === "overdue");

  /* open multi-dose vials in today's session */
  const vialRule = (m) => (/6 hours/.test(m.vac.open) ? { h: 6, word: "Discard 6 h after opening or at session end" } : /28 days/.test(m.vac.open) ? { h: 24 * 28, word: "Keep up to 28 days (multi-dose vial policy)" } : null);

  const giveDoses = (c, picks, info) => {
    const db = P.db, now = P.now();
    db.epiDoses = db.epiDoses || {}; db.epiDoses[c.id] = db.epiDoses[c.id] || {};
    db.epiVials = db.epiVials || {};
    picks.forEach((p) => {
      const m = P.med(p.med), b = P.fefo(p.med, "epi").find((x) => (x.vvm || 1) < 3);
      if (!b) return;
      P.move({ kind: "vaccinate", med: p.med, batch: b.id, from: "epi", to: "patient", qty: 1, ref: c.id, note: c.name + " · " + p.lab, by: "EPI nurse (sample)" });
      db.epiDoses[c.id][p.lab] = { at: now, batch: b.id, site: p.site, by: P.who(), aefi: info.aefi };
      if (m.pack > 1) {
        let v = db.epiVials[p.med];
        if (!v || v.used >= v.pack || v.batch !== b.id) v = db.epiVials[p.med] = { batch: b.id, opened: now, used: 0, pack: m.pack };
        v.used++;
        if (v.used >= v.pack) delete db.epiVials[p.med];
      }
    });
    if (info.appt) { db.epiAppt = db.epiAppt || {}; db.epiAppt[c.id] = info.appt; }
    if (info.aefi && info.aefi !== "None") { db.epiAefi = db.epiAefi || []; db.epiAefi.push({ client: c.id, at: now, what: info.aefi, labs: picks.map((p) => p.lab) }); }
    P.commit();
  };


  /* ── vaccinate dialog ── */
  const Vaccinate = ({ c, onClose }) => {
    P.useDb();
    const plan = P.epiPlan(c), open = plan.filter((x) => x.s === "due" || x.s === "overdue");
    const [pick, setPick] = useState(open.map((x) => x.lab));
    const [vvm, setVvm] = useState(false);
    const [aefi, setAefi] = useState(null);
    const chosen = open.filter((x) => pick.includes(x.lab));
    const nextAfter = (() => {
      const rest = plan.filter((x) => !pick.includes(x.lab) && x.s !== "given" && x.s !== "window");
      let best = null;
      rest.forEach((x) => { let d = x.due; if (x.after && pick.includes(x.after)) d = Math.max(x.due || 0, today0() + 28 * DAY); if (d == null) return; if (d <= today0()) d = today0() + 28 * DAY; if (!best || d < best.d) best = { d, lab: x.lab }; });
      return best;
    })();
    const [appt, setAppt] = useState(null);
    const apptD = appt || (nextAfter ? nextAfter.d : null);
    const stockOk = (med) => P.fefo(med, "epi").some((b) => (b.vvm || 1) < 3);
    const can = chosen.length && vvm && aefi && chosen.every((x) => stockOk(x.med));
    return html`<${P.Dialog} size="wide" title=${"Vaccinate " + c.name} sub=${c.card + " · " + ageWord(c.dob) + (c.note ? " · " + c.note : "") + " · " + c.carer + ", " + c.phone} onClose=${onClose}
      foot=${html`<span className="grow">Doses come off EPI clinic stock (FEFO, VVM below stage 3). Prototype: the nurse records this at the session.</span>
        <${P.Btn} kind="primary" icon="check" disabled=${!can} onClick=${() => { giveDoses(c, chosen, { aefi, appt: apptD }); P.toast(chosen.map((x) => x.lab).join(", ") + " given to " + c.name + (apptD ? " · back " + fmtD(apptD) : "")); onClose(); }}>Record ${chosen.length} ${chosen.length === 1 ? "dose" : "doses"}<//>`}>
      <div className="stack-s"><span className="lbl">Due today</span>
        <div className="vx-picks">${open.map((x) => {
          const m = P.med(x.med), b = P.fefo(x.med, "epi").find((y) => (y.vvm || 1) < 3), on = pick.includes(x.lab);
          return html`<button type="button" key=${x.lab} className=${P.cx("vx-pick", on && "on", !b && "none")} aria-pressed=${on ? "true" : "false"} disabled=${!b} onClick=${() => setPick(on ? pick.filter((l) => l !== x.lab) : pick.concat(x.lab))}>
            <span className="vx-chk">${on ? html`<${P.Icon} n="check" s=${14} />` : null}</span>
            <span className="grow"><b>${x.lab}</b> <span className="muted">${m.name}</span><br /><span className="small">${x.site}</span></span>
            <span className="small" style=${{ textAlign: "right" }}>${b ? html`<span className="mono">${b.no}</span> · VVM ${b.vvm || 1}<br />${P.medAt(x.med, "epi")} doses at EPI` : html`<span className="err">None usable at EPI</span>`}${x.s === "overdue" ? html`<br /><span className="vx-late">${x.late} days late</span>` : null}</span>
          </button>`;
        })}</div></div>
      <div className="row"><${P.Chip} on=${vvm} onClick=${() => setVvm(!vvm)} icon="check">VVM, expiry and diluent checked<//></div>
      <div className="stack-s"><span className="lbl">After 30 minutes' observation</span>
        <div className="chips">${["None", "Mild: fever / local swelling", "Serious: report AEFI now"].map((a) => html`<${P.Chip} key=${a} size="sm" on=${aefi === a} onClick=${() => setAefi(a)}>${a}<//>`)}</div>
        ${aefi && /Serious/.test(aefi) ? html`<div className="err"><${P.Icon} n="alert" s=${14} />Manage the child now, then fill the AEFI reporting form. The batch is flagged for review.</div>` : null}</div>
      <div className="stack-s"><span className="lbl">Come back on</span>
        ${apptD ? html`<div className="row"><b>${fmtD(apptD)}</b><span className="muted small">${rel(apptD)} · for ${nextAfter ? nextAfter.lab : ""} and the rest of that visit</span>
          ${[-7, 7].map((k) => html`<${P.Chip} key=${k} size="sm" onClick=${() => setAppt(apptD + k * DAY)}>${k > 0 ? "+1 week" : "−1 week"}<//>`)}</div>
          <p className="hint">Written on the child health card. An SMS reminder goes to ${c.phone} two days before (sample).</p>` : html`<p className="muted small">Nothing else due in this schedule.</p>`}</div>
    <//>`;
  };

  /* ── a client's card ── */
  const ClientCard = ({ c }) => {
    const db = P.useDb();
    const [vx, setVx] = useState(false);
    const plan = P.epiPlan(c), s = P.epiStatus(c);
    const contacts = [...new Set(plan.map((x) => x.contact))];
    const log = ((db.epiContact || {})[c.id]) || [];
    const aefi = (db.epiAefi || []).filter((a) => a.client === c.id);
    return html`<div className="stack">
      <div className=${P.cx("card ip-hero", s.k === "overdue" ? "bad" : s.k === "due" ? "warn" : "ok")}>
        <div className="ip-hero-main">
          <div className="ip-badge"><span>${c.kind === "child" ? "Child" : c.kind === "woman" ? "Td" : "HPV"}</span><b>${c.sex}</b></div>
          <div className="grow" style=${{ minWidth: 0 }}>
            <div className="ip-ward">${c.card} · ${c.village}</div>
            <h2>${c.name}</h2>
            <div className="ip-meta"><span>Born ${fmtD(c.dob)}${new Date(c.dob).getFullYear() !== 2026 ? "" : ""}</span><span>${ageWord(c.dob)}</span><span>${c.carer}</span><span>${c.phone}</span>${c.note ? html`<span>${c.note}</span>` : null}</div>
          </div>
        </div>
        <div className="ip-hero-stats">
          <div className="ip-mini"><b>${plan.filter((x) => x.s === "given").length}<small>/${plan.filter((x) => x.s !== "window").length}</small></b><span>doses given</span></div>
          <div className="ip-mini"><b className=${s.k === "overdue" ? "bad" : s.k === "due" ? "due" : ""}>${s.k === "overdue" ? s.late + " d" : s.k === "due" ? "Today" : s.k === "complete" ? "Done" : fmtD(s.appt)}</b><span>${s.k === "overdue" ? "overdue" : s.k === "due" ? "due" : s.k === "complete" ? "schedule" : "next visit"}</span></div>
          ${s.k === "due" || s.k === "overdue" ? html`<${P.Btn} kind="primary" icon="plus" onClick=${() => setVx(true)}>Vaccinate<//>` : null}
        </div>
      </div>
      <div className="card pad stack-s">
        <h3 style=${{ fontSize: "14px" }}>Immunisation card</h3>
        <div className="vx-card">${contacts.map((ct) => html`<div key=${ct} className="vx-row"><div className="vx-ct">${ct}</div><div className="vx-doses">${plan.filter((x) => x.contact === ct).map((x) => html`<div key=${x.lab} className=${"vx-dose " + x.s}>
          <b>${x.lab}</b>
          <span>${x.s === "given" ? fmtD(x.rec.at) : x.s === "wait" ? "after " + x.after : x.s === "window" ? "window passed" : x.s === "next" ? "due " + fmtD(x.due) : x.s === "overdue" ? x.late + " days late" : "due " + (x.late > 0 ? x.late + " d ago" : "today")}</span>
          ${x.s === "given" ? html`<span className="vx-b">${(P.batch(x.rec.batch) || {}).no || ""}${x.rec.sample ? "" : " · " + x.rec.by}</span>` : null}
        </div>`)}</div></div>`)}</div>
        <div className="mar-key"><span className="vx-dose given"><b>Given</b></span><span className="vx-dose due"><b>Due</b></span><span className="vx-dose overdue"><b>Overdue</b></span><span className="vx-dose next"><b>Upcoming</b></span><span className="vx-dose wait"><b>Waiting on earlier dose</b></span><span className="muted small">At least 4 weeks between doses of the same vaccine.</span></div>
      </div>
      <div className="cc-bottom">
        <div className="card pad stack-s">
          <h3 style=${{ fontSize: "14px" }}>Follow-up</h3>
          <div className="row"><span className="lbl">Next visit</span><b>${s.appt ? fmtD(s.appt) + " (" + rel(s.appt) + ")" : s.k === "complete" ? "Schedule complete" : "Now"}</b></div>
          <div className="chips">${["Called carer", "SMS reminder sent", "VHT home visit", "Carer says will come"].map((a) => html`<${P.Chip} key=${a} size="sm" onClick=${() => { db.epiContact = db.epiContact || {}; (db.epiContact[c.id] = db.epiContact[c.id] || []).push({ a, at: P.now(), by: P.who() }); P.commit(); P.toast(a + ": " + c.name); }}>${a}<//>`)}</div>
          ${log.length ? html`<div className="ip-notes">${log.slice().reverse().map((l, i) => html`<div key=${i}><b>${l.a}</b><span className="muted small">${P.when(l.at)} · ${l.by}</span></div>`)}</div>` : html`<p className="muted small">No follow-up recorded yet.</p>`}
        </div>
        <div className="card pad stack-s">
          <h3 style=${{ fontSize: "14px" }}>Adverse events (AEFI)</h3>
          ${aefi.length ? aefi.map((a, i) => html`<div key=${i} className=${/Serious/.test(a.what) ? "err" : "small"}>${P.when(a.at)} · ${a.labs.join(", ")}: ${a.what}</div>`) : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />None recorded.</p>`}
        </div>
      </div>
      ${vx ? html`<${Vaccinate} c=${c} onClose=${() => setVx(false)} />` : null}
    </div>`;
  };

  const RegisterDialog = ({ onClose }) => {
    const [f, setF] = useState({ kind: "child", sex: null, name: "", dob: "", carer: "", phone: "", village: "" });
    const set = (k, v) => setF({ ...f, [k]: v });
    const m = f.dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const dob = m ? D(+m[3], +m[2], +m[1]) : null;
    const ok = f.name.trim().length > 2 && f.sex && dob && dob <= today0() && f.carer.trim() && f.phone.replace(/\D/g, "").length >= 9;
    const save = () => {
      const db = P.db; db.epiNew = db.epiNew || [];
      const id = "n" + db.seq++, c = { id, kind: f.kind, name: f.name.trim(), sex: f.sex, dob, card: "EPI/26/" + String(500 + db.epiNew.length).padStart(4, "0"), carer: f.carer.trim(), phone: f.phone.trim(), village: f.village.trim() || "—", upTo: [] };
      db.epiNew.push(c); P.commit(); onClose(); P.go({ to: "epi", client: id });
    };
    const fld = (k, label, ph) => html`<div className="field"><label htmlFor=${"r" + k}>${label}</label><input id=${"r" + k} className="input" placeholder=${ph || ""} value=${f[k]} onChange=${(e) => set(k, e.target.value)} /></div>`;
    return html`<${P.Dialog} title="Register a client" sub="Child health card or Td / HPV register (sample)" onClose=${onClose} foot=${html`<${P.Btn} kind="primary" disabled=${!ok} onClick=${save}>Register and open the card<//>`}>
      <div className="chips">${[["child", "Child (routine schedule)"], ["woman", "Woman (Td)"], ["girl", "Girl (HPV)"]].map(([k, w]) => html`<${P.Chip} key=${k} on=${f.kind === k} onClick=${() => set("kind", k)}>${w}<//>`)}</div>
      ${fld("name", "Name")}
      <div className="row"><span className="lbl">Sex</span>${["F", "M"].map((s) => html`<${P.Chip} key=${s} size="sm" on=${f.sex === s} onClick=${() => set("sex", s)}>${s === "F" ? "Female" : "Male"}<//>`)}</div>
      ${fld("dob", "Date of birth", "DD/MM/YYYY")}
      ${fld("carer", f.kind === "child" ? "Caregiver" : "Next of kin")}
      ${fld("phone", "Phone for reminders", "07…")}
      ${fld("village", "Village / parish")}
    <//>`;
  };

  /* ── tabs ── */
  /* square tile for the session lists */
  const Tile = ({ c, s }) => html`<button type="button" className="vx-tile" onClick=${() => P.go({ to: "epi", client: c.id })}>
    <div className="vx-tile-top"><div className=${P.cx("vx-av", s.k)}>${c.kind === "child" ? c.sex : c.kind === "woman" ? "Td" : "HPV"}</div>
      <span className=${P.cx("vx-st", s.k)}>${s.k === "overdue" ? s.late + " d late" : s.k === "due" ? "Due" : s.k === "ok" ? fmtD(s.appt) : "Done"}</span></div>
    <div className="vx-tile-name"><b>${c.name}</b><span>${ageWord(c.dob)} · ${c.card}</span></div>
    <div className="vx-tile-doses">${s.due ? s.due.map((x) => html`<span key=${x.lab} className=${"vx-chip " + x.s}>${x.lab}</span>`) : s.next ? html`<span className="vx-chip next">${s.next.lab}</span>` : null}</div>
    <div className="vx-tile-foot"><span>${c.carer}</span><span>${c.phone} · ${c.village}</span></div>
  </button>`;

  const Row = ({ c, s }) => html`<button type="button" className="lrow" onClick=${() => P.go({ to: "epi", client: c.id })}>
    <div className=${P.cx("vx-av", s.k)}>${c.kind === "child" ? c.sex : c.kind === "woman" ? "Td" : "HPV"}</div>
    <div className="grow"><div className="t">${c.name} <span className="muted small">${ageWord(c.dob)} · ${c.card}</span></div>
      <div className="m">${s.due ? s.due.map((x) => x.lab).join(", ") + " due" : s.next ? "Next: " + s.next.lab + " " + fmtD(s.next.due) : "Schedule complete"} · ${c.carer}, ${c.phone} · ${c.village}</div></div>
    <span className=${P.cx("vx-st", s.k)}>${s.k === "overdue" ? s.late + " days late" : s.k === "due" ? "Due" : s.k === "ok" ? "Back " + fmtD(s.appt) : "Complete"}</span></button>`;

  /* open multi-dose vials right now */
  const OpenVials = () => {
    const db = P.useDb();
    const vials = Object.entries(db.epiVials || {});
    return html`<div className="card pad stack-s">
      <h3 style=${{ fontSize: "14px" }}>Open vials now</h3>
      ${vials.length ? vials.map(([med, v]) => {
        const m = P.med(med), r = vialRule(m), until = v.opened + (r ? r.h : 6) * HOUR, left = v.pack - v.used;
        return html`<div key=${med} className="vial"><div className="grow"><b>${m.name.split(" (")[0]}</b><div className="muted small"><span className="mono">${P.batch(v.batch).no}</span> · opened ${P.time(v.opened)} · ${v.used} of ${v.pack} doses used</div>
          <div className="small">${r ? r.word : ""}${r && r.h <= 6 ? " · by " + P.time(until) : r ? " · until " + fmtD(until) : ""}</div></div>
          <${P.Btn} size="sm" kind="ghost" icon="ban" onClick=${() => { P.move({ kind: "wastage", med, batch: v.batch, from: "epi", to: "waste", qty: left, note: "Opened vial discarded", by: P.who() }); delete db.epiVials[med]; P.commit(); P.toast(left + " doses of " + m.name.split(" (")[0] + " recorded as wasted"); }}>Discard ${left} left<//></div>`;
      }) : html`<p className="muted small">None open. A multi-dose vial opens when its first dose is recorded.</p>`}
    </div>`;
  };

  /* ── vaccine stock at the immunisation clinic: what's there, what's been used, what needs refilling ── */
  const USED_MONTH = { bcg: 96, bopv: 372, ipv: 88, penta: 294, pcv: 290, rota: 196, mr: 145, hpv: 21, td: 130 };
  const SESSION_DAYS = 21;
  const dayUse = (med, ts) => { const d = new Date(ts), wd = d.getDay(); if (wd === 0) return 0; const base = USED_MONTH[med] / SESSION_DAYS; const f = wd === 6 ? 0.25 : wd === 2 || wd === 4 ? 1.25 : 0.9; return Math.round(base * f * (0.85 + ((d.getDate() * 7 + med.length * 3) % 10) / 33)); };
  P.vaxStock = () => {
    const t0 = today0(), lv = P.LEVELS.epi || {};
    return P.MEDS.filter((m) => m.vaccine).map((m) => {
      const at = P.medAt(m.id, "epi"), cold = P.medAt(m.id, "store"), max = lv[m.id] || 0, min = Math.round(max / 2);
      const todayUsed = P.db.moves.filter((x) => x.kind === "vaccinate" && x.med === m.id && x.at >= t0).length;
      const week = Array.from({ length: 7 }, (_, k) => dayUse(m.id, t0 - (k + 1) * DAY)).reduce((a, x) => a + x, 0) + todayUsed;
      const perDay = USED_MONTH[m.id] / SESSION_DAYS * (6 / 7);
      const daysLeft = perDay ? Math.floor(at / perDay) : 99;
      const wasted = P.db.moves.filter((x) => x.kind === "wastage" && x.med === m.id && x.at >= t0).reduce((a, x) => a + x.qty, 0);
      const b = P.fefo(m.id, "epi").find((x) => (x.vvm || 1) < 3);
      const k = at < min || daysLeft < 7 ? "refill" : at < max * 0.75 ? "watch" : "ok";
      return { m, at, cold, max, min, todayUsed, week, perDay, daysLeft, wasted, b, k, top: Math.max(0, Math.min(cold, max - at)) };
    });
  };

  const VaccineStock = () => {
    const db = P.useDb();
    const rows = P.vaxStock(), refill = rows.filter((r) => r.k === "refill");
    const t0 = today0(), days14 = Array.from({ length: 14 }, (_, k) => t0 - (13 - k) * DAY);
    const totals = days14.map((d) => d === t0 ? db.moves.filter((x) => x.kind === "vaccinate" && x.at >= t0).length : P.MEDS.filter((m) => m.vaccine).reduce((a, m) => a + dayUse(m.id, d), 0));
    const maxT = Math.max(1, ...totals);
    const epiFr = (P.FRIDGES || []).find((f) => f.place === "epi"), v = epiFr ? P.temp(epiFr, P.now()) : null;
    const usedMonth = Object.values(USED_MONTH).reduce((a, x) => a + x, 0) + db.moves.filter((x) => x.kind === "vaccinate" && x.at >= t0).length;
    return html`<div className="stack">
      <div className="kpis">
        <div className="kpi"><b className=${refill.length ? "bad" : "ok"}>${refill.length}</b><span>vaccines to refill from the cold room</span></div>
        <div className="kpi"><b>${usedMonth.toLocaleString("en-GB")}</b><span>doses used this month</span></div>
        <div className="kpi"><b>${Object.keys(db.epiVials || {}).length}</b><span>vials open now</span></div>
        <div className="kpi"><b className=${v != null && P.coldStatus(v) !== "ok" ? "bad" : ""}>${v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(1) + " °C"}</b><span>EPI fridge now · <button type="button" className="clslink" onClick=${() => P.go({ to: "epi", tab: "cold" })}>cold chain</button></span></div>
      </div>
      <div className="card">
        <div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>Vaccines at the EPI clinic</h3><span className="muted small">min = half the stock level · days left at the usual daily use</span><span className="grow"></span>
          <${P.Btn} size="sm" kind=${refill.length ? "primary" : "outline"} icon="send" onClick=${() => P.go({ to: "store", tab: "issue", ward: "epi" })}>Refill from the cold room${refill.length ? " (" + refill.length + ")" : ""}<//></div>
        <div className="tblwrap"><table className="tbl dense">
          <thead><tr><th>Vaccine</th><th>Batch in use</th><th className="r">At EPI</th><th>Level</th><th className="r">Used today</th><th className="r">Last 7 days</th><th className="r">Days left</th><th className="r">Cold room</th><th>Status</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr key=${r.m.id}>
            <td><div className="dn-name"><button type="button" className="clslink" onClick=${() => P.go({ to: "medicines", med: r.m.id })}>${r.m.name.split(" (")[0].replace(" vaccine", "")}</button><${P.MedTags} med=${r.m.id} compact=${true} /></div><div className="dn-sub">${r.m.vac.vial} vials${r.m.vac.freeze ? " · freeze-sensitive" : ""}</div></td>
            <td className="small">${r.b ? html`<span className="mono">${r.b.no}</span> · exp ${P.expWord(r.b.exp)}<br /><span className=${(r.b.vvm || 1) >= 2 ? "vvm-use" : "muted"}>VVM ${r.b.vvm || 1}${(r.b.vvm || 1) >= 2 ? ": use first" : ""}</span>` : html`<span className="err">None usable</span>`}</td>
            <td className="r num strong">${r.at}</td>
            <td><div className="lvl"><span className="lvl-bar"><i className=${r.k} style=${{ width: Math.min(100, (r.at / (r.max || 1)) * 100) + "%" }}></i><em style=${{ left: "50%" }}></em></span><span className="dn-sub">min ${r.min} · max ${r.max}</span></div></td>
            <td className="r num">${r.todayUsed}</td><td className="r num">${r.week}</td>
            <td className=${P.cx("r num", r.daysLeft < 7 ? "bad" : r.daysLeft < 14 ? "mid" : "")}>${r.daysLeft}</td>
            <td className="r num">${r.cold}</td>
            <td>${r.k === "refill" ? html`<span className="vx-st overdue">Refill ${r.top}</span>` : r.k === "watch" ? html`<span className="vx-st">Watch</span>` : html`<span className="vx-st ok">OK</span>`}</td>
          </tr>`)}</tbody></table></div>
      </div>
      <div className="cc-bottom even">
        <div className="card pad stack-s">
          <div className="dash-h"><h3>Doses used per day</h3><span className="muted small">last 14 days, all vaccines (sample + today's)</span></div>
          <div className="use-chart">${days14.map((d, k) => { const dd = new Date(d); return html`<div key=${d} className=${P.cx("uc", d === t0 && "today")} title=${dd.getDate() + " " + P.MON[dd.getMonth()] + ": " + totals[k] + " doses"}><span className="uc-v">${totals[k] || ""}</span><i style=${{ height: Math.max(2, (totals[k] / maxT) * 100) + "%" }}></i><span className="uc-l">${["S", "M", "T", "W", "T", "F", "S"][dd.getDay()]}<br />${dd.getDate()}</span></div>`; })}</div>
          <p className="hint">Sundays: no session. Tuesdays and Thursdays are the busiest (sample pattern). Today counts only what has been recorded so far.</p>
        </div>
        <div className="stack-s">
          <${OpenVials} />
          <div className="card pad stack-s">
            <h3 style=${{ fontSize: "14px" }}>Monthly vaccine control (October, sample)</h3>
            <div className="tblwrap"><table className="tbl dense">
              <thead><tr><th>Vaccine</th><th className="r">Opening</th><th className="r">Received</th><th className="r">Given</th><th className="r">Wasted</th><th className="r">Balance</th></tr></thead>
              <tbody>${rows.map((r) => { const w = { bcg: 38, bopv: 14, ipv: 9, penta: 6, pcv: 5, rota: 1, mr: 24, hpv: 0, td: 11 }[r.m.id], used = USED_MONTH[r.m.id], wasted = Math.round(used * w / (100 - w)) + r.wasted; const rec = Math.ceil((used + wasted) / r.m.pack) * r.m.pack; return html`<tr key=${r.m.id}><td>${r.m.name.split(" (")[0].replace(" vaccine", "")}</td><td className="r num">${r.at + used + r.todayUsed + wasted - rec}</td><td className="r num">${rec}</td><td className="r num">${used + r.todayUsed}</td><td className="r num">${wasted}</td><td className="r num strong">${r.at}</td></tr>`; })}</tbody></table></div>
            <p className="hint">Opening + received − given − wasted = balance (the ledger now). A month-end physical count should match it.</p>
          </div>
        </div>
      </div>
    </div>`;
  };

  /* ── the immunisation clinic dashboard: today's clients, follow-up and indicators ── */
  const ClinicDashboard = () => {
    const db = P.useDb();
    const [reg, setReg] = useState(false);
    const all = P.epiClients().map((c) => ({ c, s: P.epiStatus(c) }));
    const due = all.filter((x) => x.s.k === "due" || x.s.k === "overdue").sort((a, b) => (b.s.late || 0) - (a.s.late || 0));
    const back = all.filter((x) => x.s.k === "ok" && x.s.appt && x.s.appt - today0() <= 7 * DAY && x.s.appt >= today0());
    const t0 = today0(), givenToday = db.moves.filter((m) => m.kind === "vaccinate" && m.at >= t0).length;
    const defs = P.epiDefaulters().sort((a, b) => b.s.late - a.s.late);
    return html`<div className="stack">
      <div className="kpis">
        <div className="kpi"><b>${due.length}</b><span>due or overdue, can be vaccinated today</span></div>
        <div className="kpi"><b>${givenToday}</b><span>doses given today</span></div>
        <div className="kpi"><b>${back.length}</b><span>coming back this week</span></div>
        <div className="kpi"><b className=${defs.length ? "bad" : ""}>${defs.length}</b><span>defaulters to trace</span></div>
      </div>
      <div className="cc-bottom">
        <div className="stack-s">
          <div className="row between"><div className="section-h"><h2>Due today</h2><span className="muted">most overdue first</span></div>
            <div className="row"><${P.Btn} size="sm" onClick=${() => P.go({ to: "epi", tab: "clients" })}>Register (${all.length})<//><${P.Btn} size="sm" icon="plus" onClick=${() => setReg(true)}>New client<//></div></div>
          ${due.length ? html`<div className="vx-tiles">${due.map(({ c, s }) => html`<${Tile} key=${c.id} c=${c} s=${s} />`)}</div>` : html`<div className="card"><${P.Empty} title="Nobody due">Clients due appear here.<//></div>`}
          ${back.length ? html`<div className="section-h"><h2>Coming back this week</h2></div><div className="vx-tiles">${back.map(({ c, s }) => html`<${Tile} key=${c.id} c=${c} s=${s} />`)}</div>` : null}
        </div>
        <div className="stack-s">
          <div className="card pad stack-s">
            <div className="dash-h"><h3>Defaulters to trace</h3><span className="grow"></span><button type="button" className="clslink" onClick=${() => P.go({ to: "epi", tab: "defaulters" })}>All</button></div>
            ${defs.slice(0, 5).map(({ c, s }) => html`<button type="button" key=${c.id} className="mrow" onClick=${() => P.go({ to: "epi", client: c.id })}><span className="mrow-l"><b>${c.name}</b><span>${s.due.map((x) => x.lab).join(", ")} · ${c.phone}</span></span><span></span><span className="mrow-v bad">${s.late} d</span></button>`)}
            ${defs.length ? null : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />Nobody to trace.</p>`}
          </div>
          <${OpenVials} />
        </div>
      </div>
      <${Coverage} />
      ${reg ? html`<${RegisterDialog} onClose=${() => setReg(false)} />` : null}
    </div>`;
  };

  const Clients = () => {
    P.useDb();
    const [q, setQ] = useState(""), [k, setK] = useState("all");
    const list = P.epiClients().map((c) => ({ c, s: P.epiStatus(c) })).filter(({ c, s }) => (k === "all" || s.k === k || (k === "due" && s.k === "overdue")) && (c.name + c.card + c.carer + c.phone + c.village).toLowerCase().includes(q.trim().toLowerCase()));
    return html`<div className="stack">
      <div className="row"><input className="input" style=${{ maxWidth: "340px" }} placeholder="Name, card number, caregiver, phone or village" value=${q} onChange=${(e) => setQ(e.target.value)} />
        <div className="chips">${[["all", "All"], ["due", "Due or overdue"], ["ok", "Up to date"], ["complete", "Complete"]].map(([v, w]) => html`<${P.Chip} key=${v} size="sm" on=${k === v} onClick=${() => setK(v)}>${w}<//>`)}</div></div>
      <div className="list">${list.map(({ c, s }) => html`<${Row} key=${c.id} c=${c} s=${s} />`)}</div>
    </div>`;
  };

  const Defaulters = () => {
    const db = P.useDb();
    const list = P.epiDefaulters().sort((a, b) => b.s.late - a.s.late);
    const bands = [["Over 4 weeks late", (x) => x.s.late > 28], ["2–4 weeks late", (x) => x.s.late > 14 && x.s.late <= 28], ["1–2 weeks late", (x) => x.s.late <= 14]];
    return html`<div className="stack">
      <div className="note"><${P.Icon} n="phone" /><span>A defaulter is more than a week past a due dose. Call or SMS the caregiver, or ask the village health team (VHT) to visit. Each attempt is recorded on the client's card.</span></div>
      ${bands.map(([w, f]) => { const l = list.filter(f); return l.length ? html`<section key=${w} className="stack-s"><div className="section-h"><h2>${w}</h2><span className="muted">${l.length}</span></div>
        <div className="card"><div className="tblwrap"><table className="tbl dense">
          <thead><tr><th>Client</th><th>Missed</th><th>Caregiver</th><th>Village</th><th>Last contact</th><th>Trace</th></tr></thead>
          <tbody>${l.map(({ c, s }) => { const log = ((db.epiContact || {})[c.id]) || [], last = log[log.length - 1];
            return html`<tr key=${c.id}><td><button type="button" className="clslink" onClick=${() => P.go({ to: "epi", client: c.id })}>${c.name}</button><div className="dn-sub">${ageWord(c.dob)} · ${c.card}</div></td>
              <td><b>${s.due.map((x) => x.lab).join(", ")}</b><div className="dn-sub">${s.late} days late</div></td><td>${c.carer}<div className="dn-sub">${c.phone}</div></td><td>${c.village}</td>
              <td className="small">${last ? last.a + " · " + P.when(last.at) : html`<span className="muted">None yet</span>`}</td>
              <td><div className="chips">${["Called", "SMS sent", "VHT visit"].map((a) => html`<${P.Chip} key=${a} size="sm" onClick=${() => { db.epiContact = db.epiContact || {}; (db.epiContact[c.id] = db.epiContact[c.id] || []).push({ a, at: P.now(), by: P.who() }); P.commit(); }}>${a}<//>`)}</div></td></tr>`; })}</tbody></table></div></div></section>` : null; })}
      ${list.length ? null : html`<div className="card"><${P.Empty} title="No defaulters">Everyone is up to date.<//></div>`}
    </div>`;
  };

  /* month-to-date figures: sample totals plus what is recorded here */
  const SAMPLE_MONTH = { BCG: 96, OPV0: 80, OPV1: 104, Penta1: 104, PCV1: 103, Rota1: 101, OPV3: 91, Penta3: 92, PCV3: 90, Rota2: 95, IPV: 88, MR1: 85, MR2: 60, Td1: 58, Td2: 44, HPV: 21 };
  const SAMPLE_PROG = { fic: 81, zeroDose: 9, ancNew: 96, girls10: 30, sessionsStatic: [21, 22], sessionsOutreach: [6, 8], aefiReported: 2, defaulterTraced: [14, 19], stockOutDays: { bcg: 0, bopv: 0, ipv: 3, penta: 0, pcv: 0, rota: 0, mr: 0, hpv: 0, td: 2 }, lastYearPenta3: 88 };
  const WASTE = { bcg: 38, bopv: 14, ipv: 9, penta: 6, pcv: 5, rota: 1, mr: 24, hpv: 0, td: 11 };
  const Ind = ({ label, value, sub, tone }) => html`<div className="kpi"><b className=${tone || ""}>${value}</b><span>${label}</span>${sub ? html`<small className="kpi-sub">${sub}</small>` : null}</div>`;
  const Coverage = () => {
    const db = P.useDb();
    const t0 = new Date(2026, 9, 1).getTime(), mine = {};
    Object.values(db.epiDoses || {}).forEach((m) => Object.entries(m).forEach(([lab, r]) => { if (r.at >= t0) mine[lab] = (mine[lab] || 0) + 1; }));
    const n = (lab) => (SAMPLE_MONTH[lab] || 0) + (mine[lab] || 0);
    const target = 110, pct = (x, d) => (d ? Math.round((x / d) * 100) : 0);
    const rows = ["BCG", "OPV0", "Penta1", "Penta3", "PCV3", "Rota2", "IPV", "MR1", "MR2"];
    const drop = (a, b) => Math.round(((n(a) - n(b)) / n(a)) * 1000) / 10;
    const bar = (lab) => { const pc = pct(n(lab), target); return html`<div key=${lab} className="cv-row"><span className="cv-l">${lab}</span><div className="cv-bar"><i style=${{ width: Math.min(100, pc) + "%" }}></i><em style=${{ left: "90%" }}></em></div><span className="cv-v num">${n(lab)}<small> · ${pc}%</small></span>${pc < 90 ? html`<span className="cv-flag">below 90%</span>` : html`<span></span>`}</div>`; };

    /* access (Penta1) and utilisation (dropout) → RED/REC problem category */
    const access = pct(n("Penta1"), target), dropout = drop("Penta1", "Penta3");
    const cat = access >= 80 ? (dropout <= 10 ? [1, "No problem", "High access, low dropout"] : [2, "Utilisation problem", "People reach the service but don't come back"]) : dropout <= 10 ? [3, "Access problem", "Those who come return, but too few start"] : [4, "Access and utilisation problem", "Too few start and many drop out"];

    /* timeliness from the register: given within 4 weeks of the due date */
    const timely = (lab) => {
      let on = 0, all = 0;
      P.epiClients().filter((c) => c.kind === "child").forEach((c) => { const x = P.epiPlan(c).find((y) => y.lab === lab); if (x && x.s === "given" && x.due) { all++; if (x.rec.at - x.due <= 28 * 864e5) on++; } });
      return all ? [pct(on, all), on, all] : [null, 0, 0];
    };
    const mrBy12 = (() => { let on = 0, all = 0; P.epiClients().filter((c) => c.kind === "child").forEach((c) => { const x = P.epiPlan(c).find((y) => y.lab === "MR1"); if (x && x.s === "given") { all++; if (x.rec.at <= addM(c.dob, 12)) on++; } }); return all ? pct(on, all) : null; })();

    /* programme */
    const epiFr = (P.FRIDGES || []).find((f) => f.place === "epi"), s30 = epiFr ? P.series(epiFr, P.now() - 30 * 864e5, P.now(), 20 * 60e3) : [];
    const inRange = s30.length ? Math.round((s30.filter((x) => x.v >= 2 && x.v <= 8).length / s30.length) * 1000) / 10 : null;
    const totalDoses = Object.values(SAMPLE_MONTH).reduce((a, x) => a + x, 0) + Object.values(mine).reduce((a, x) => a + x, 0);
    const aefi = SAMPLE_PROG.aefiReported + (db.epiAefi || []).length;
    const defs = P.epiDefaulters(), traced = defs.filter(({ c }) => ((db.epiContact || {})[c.id] || []).length).length;
    const vacs = P.MEDS.filter((m) => m.vaccine);

    return html`<div className="stack">
      <div className="ind-group"><h3>Coverage and dropout <span className="muted small">October to date · monthly target ${target} infants (sample)</span></h3>
        <div className="kpis">
          <${Ind} label="Penta3 coverage" value=${pct(n("Penta3"), target) + "%"} sub=${"last year " + SAMPLE_PROG.lastYearPenta3 + "%"} tone=${pct(n("Penta3"), target) < 90 ? "warn" : "ok"} />
          <${Ind} label="MR1 coverage" value=${pct(n("MR1"), target) + "%"} tone=${pct(n("MR1"), target) < 90 ? "warn" : "ok"} />
          <${Ind} label="Fully immunised under 1" value=${pct(SAMPLE_PROG.fic, target) + "%"} sub=${SAMPLE_PROG.fic + " children (BCG, OPV3, Penta3, PCV3, Rota2, IPV, MR1)"} tone=${pct(SAMPLE_PROG.fic, target) < 90 ? "warn" : "ok"} />
          <${Ind} label="MR2 coverage (second year)" value=${pct(n("MR2"), target) + "%"} tone=${pct(n("MR2"), target) < 80 ? "bad" : ""} />
        </div>
        <div className="kpis">
          <${Ind} label="Dropout Penta1 → Penta3" value=${dropout + "%"} sub="aim under 10%" tone=${dropout > 10 ? "bad" : "ok"} />
          <${Ind} label="Dropout Penta1 → MR1" value=${drop("Penta1", "MR1") + "%"} sub="aim under 10%" tone=${drop("Penta1", "MR1") > 10 ? "bad" : "ok"} />
          <${Ind} label="Dropout BCG → MR1" value=${drop("BCG", "MR1") + "%"} tone=${drop("BCG", "MR1") > 10 ? "bad" : "ok"} />
          <${Ind} label="Dropout MR1 → MR2" value=${drop("MR1", "MR2") + "%"} tone=${drop("MR1", "MR2") > 10 ? "bad" : "ok"} />
        </div>
        <div className=${"redrec c" + cat[0]}><b>Category ${cat[0]}: ${cat[1]}</b><span>${cat[2]}. Access (Penta1) ${access}% · dropout ${dropout}%. ${cat[0] === 2 ? "Focus on defaulter tracing, reminders and giving every due dose at each visit." : cat[0] === 3 ? "Focus on outreach and finding zero-dose children." : cat[0] === 4 ? "Both: outreach and defaulter tracing." : "Keep it up."}</span></div>
      </div>

      <div className="cc-bottom">
        <div className="card pad stack-s">
          <h3 style=${{ fontSize: "14px" }}>Doses given this month, against target</h3>
          <div className="cv">${rows.map(bar)}</div>
          <p className="hint">The line marks 90% of target. Sample totals for October, plus doses recorded in this prototype.</p>
        </div>
        <div className="card pad stack-s">
          <h3 style=${{ fontSize: "14px" }}>Equity and protection</h3>
          <div className="ind-list">
            <div><span>Zero-dose children found (no Penta1 by 1 year)</span><b className=${SAMPLE_PROG.zeroDose ? "bad" : ""}>${SAMPLE_PROG.zeroDose}</b></div>
            <div><span>Protected at birth: mothers with Td2+</span><b>${pct(n("Td2"), SAMPLE_PROG.ancNew)}%</b></div>
            <div><span>Td1 among new antenatal mothers</span><b>${pct(n("Td1"), SAMPLE_PROG.ancNew)}%</b></div>
            <div><span>HPV coverage, girls aged 10</span><b className=${pct(n("HPV"), SAMPLE_PROG.girls10) < 80 ? "warn" : ""}>${pct(n("HPV"), SAMPLE_PROG.girls10)}%</b></div>
          </div>
          <h3 style=${{ fontSize: "14px", marginTop: "6px" }}>Timeliness <span className="muted small">from the client register</span></h3>
          <div className="ind-list">
            ${["Penta1", "Penta3", "PCV3"].map((l) => { const [p, on, all] = timely(l); return html`<div key=${l}><span>${l} given within 4 weeks of due (${on} of ${all})</span><b className=${p != null && p < 80 ? "warn" : ""}>${p == null ? "—" : p + "%"}</b></div>`; })}
            <div><span>MR1 given before the first birthday</span><b>${mrBy12 == null ? "—" : mrBy12 + "%"}</b></div>
          </div>
        </div>
      </div>

      <div className="cc-bottom even">
        <div className="card pad stack-s">
          <h3 style=${{ fontSize: "14px" }}>Service delivery</h3>
          <div className="ind-list">
            <div><span>Static sessions held / planned</span><b>${SAMPLE_PROG.sessionsStatic[0]} / ${SAMPLE_PROG.sessionsStatic[1]}</b></div>
            <div><span>Outreach sessions held / planned</span><b className=${SAMPLE_PROG.sessionsOutreach[0] / SAMPLE_PROG.sessionsOutreach[1] < 0.9 ? "warn" : ""}>${SAMPLE_PROG.sessionsOutreach[0]} / ${SAMPLE_PROG.sessionsOutreach[1]}</b></div>
            <div><span>Defaulters traced this month</span><b>${SAMPLE_PROG.defaulterTraced[0] + traced} of ${SAMPLE_PROG.defaulterTraced[1] + defs.length}</b></div>
            <div><span>AEFI reported (per 100,000 doses)</span><b>${aefi} (${Math.round((aefi / totalDoses) * 1e5)})</b></div>
            <div><span>EPI fridge time in 2–8 °C, last 30 days</span><b className=${inRange != null && inRange < 99 ? "warn" : ""}>${inRange == null ? "—" : inRange + "%"}</b></div>
          </div>
        </div>
        <div className="card pad stack-s">
          <h3 style=${{ fontSize: "14px" }}>Vaccine availability and wastage</h3>
          <div className="tblwrap"><table className="tbl dense">
            <thead><tr><th>Vaccine</th><th className="r">At EPI</th><th className="r">Months left</th><th className="r">Days out</th><th className="r">Wasted</th></tr></thead>
            <tbody>${vacs.map((m) => html`<tr key=${m.id}><td>${m.name.split(" (")[0].replace(" vaccine", "")}</td><td className="r num">${P.medAt(m.id, "epi")}</td><td className=${P.cx("r num", P.months(m.id) < 1 && "bad")}>${P.months(m.id).toFixed(1)}</td><td className=${P.cx("r num", SAMPLE_PROG.stockOutDays[m.id] && "bad")}>${SAMPLE_PROG.stockOutDays[m.id] || 0}</td><td className="r num">${WASTE[m.id]}%</td></tr>`)}</tbody></table></div>
          <p className="hint">BCG and MR waste more: their reconstituted vials are discarded after 6 hours. Compare wastage with the national indicative rates.</p>
        </div>
      </div>
      <p className="hint">Sample figures for the prototype. In the real product these come from the register and the ledger, and feed the monthly HMIS 105 immunisation report.</p>
    </div>`;
  };

  P.EpiView = ({ route }) => {
    P.useDb();
    if (route.client) { const c = P.epiClient(route.client); return html`<div className="stack"><button type="button" className="back" onClick=${() => P.go({ to: "epi", tab: "clinic" })}><${P.Icon} n="left" s=${16} />Clinic dashboard</button><${ClientCard} key=${c.id} c=${c} /></div>`; }
    const tab = route.tab || "stock";
    if (tab === "clients" || tab === "defaulters") return html`<div className="stack"><button type="button" className="back" onClick=${() => P.go({ to: "epi", tab: "clinic" })}><${P.Icon} n="left" s=${16} />Clinic dashboard</button>
      <div className="section-h"><h2>${tab === "clients" ? "Client register" : "Defaulters"}</h2></div>${tab === "clients" ? html`<${Clients} />` : html`<${Defaulters} />`}</div>`;
    const refill = P.vaxStock().filter((r) => r.k === "refill").length;
    const coldOpen = (P.coldOpen ? P.coldOpen() : []).filter((e) => e.f.place === "epi").length;
    return html`<${P.Seg} label="Immunisation" value=${tab} onChange=${(t) => P.go({ to: "epi", tab: t })} items=${[{ v: "stock", label: "Vaccine stock", n: refill || null }, { v: "cold", label: "Cold chain", n: coldOpen || null }, { v: "clinic", label: "Clinic dashboard" }]} />
      ${tab === "stock" ? html`<${VaccineStock} />` : tab === "cold" ? html`<${P.ColdView} route=${{ fridge: "rf3", only: "rf3" }} />` : html`<${ClinicDashboard} />`}`;
  };
})();
