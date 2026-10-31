/* Shift handover: at 08:00 and 17:00 the outgoing person hands each place to the incoming one.
   The incoming person counts the controlled and high-risk items blind, takes the keys and the emergency-tray seal,
   and acknowledges every open item. Both sign. A difference is flagged at once; a missed handover is flagged too. */
(function () {
  const P = window.P, html = P.html;
  const { useState } = React;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  P.HIGHRISK = ["oxy", "mgso4", "ceft", "gent"];
  P.HO_PLACES = ["opd", "store", "w3", "mat", "peds"];
  const SLOTS = [8, 17];
  const wl = (ms) => P.when(ms).replace(/^(Today|Yesterday)/, (x) => x.toLowerCase());
  const day0 = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const slotsBetween = (a, b) => { const out = []; for (let d = day0(a); d <= b; d += DAY) SLOTS.forEach((h) => { const t = d + h * HOUR; if (t >= a && t <= b) out.push(t); }); return out; };
  const shiftOf = (t) => { const h = new Date(t).getHours(); return h >= 8 && h < 17 ? "day" : "night"; };
  const other = (s) => (s === "day" ? "night" : "day");
  const SHIFT = { day: "day shift (08:00–17:00)", night: "night shift (17:00–08:00)" };
  const rk = (place) => (P.ROSTER[place] ? place : "pharmacy");
  const short = (id) => ({ morph: "Morphine inj", peth: "Pethidine inj", diaz: "Diazepam inj", omor: "Oral morphine", oxy: "Oxytocin", mgso4: "Magnesium sulphate", ceft: "Ceftriaxone", gent: "Gentamicin" }[id] || P.med(id).name);
  const initials = (n) => n.replace(/^(Nurse in-charge|Midwife in-charge|Nurse|Midwife|Dr) /, "").split(/[ .]+/).filter(Boolean).map((t) => t[0]).join("").slice(0, 2);

  /* the people of one shift at a place: nurses and midwives on a ward, pharmacy staff elsewhere */
  const people = (place, shift) => {
    const r = P.ROSTER[rk(place)], out = [];
    Object.keys(r).forEach((role) => { if (role === "Doctor on duty") return; r[role].forEach((x) => { if (x.shift === shift && !out.some((o) => o.name === x.name)) out.push({ ...x, role }); }); });
    return out;
  };
  /* what is counted at a handover: controlled drugs held there, plus high-risk ward stock */
  P.hoItems = (place, t) => {
    const at = t || P.now();
    const cds = P.CDS().filter((m) => P.db.moves.some((x) => x.med === m.id && x.at <= at && (x.from === place || x.to === place))).map((m) => m.id);
    const hr = P.place(place).kind === "ward" ? P.HIGHRISK.filter((id) => balAt(id, place, at) > 0 && !cds.includes(id)) : [];
    return cds.concat(hr);
  };
  /* balance at a time; sample opening balances count as always there */
  const balAt = (med, place, t) => P.db.moves.reduce((a, m) => (m.med === med && (m.kind === "opening" || m.at <= t) ? a + (m.to === place ? m.qty : 0) - (m.from === place ? m.qty : 0) : a), 0);
  const unitWord2 = (med, n) => { const m = P.med(med); return m.unit === "mL" ? n + " mL" : n + " " + (n === 1 ? m.unit.replace(/s$/, "") : m.unit); };
  const fridgeOf = (place) => (P.FRIDGES || []).find((f) => f.place === place);
  const lastSeal = (place) => { const h = (P.db.handovers || []).filter((x) => x.place === place && x.seal).sort((a, b) => b.at - a.at)[0]; return h ? h.seal : null; };

  /* ── sample history: the last three handovers at each place; Ward 3 missed this morning's; Maternity is one oxytocin short ── */
  const seedHo = (db) => {
    db.handovers = [];
    const slots = [new Date(2026, 9, 28, 8, 0).getTime(), new Date(2026, 9, 28, 17, 0).getTime(), new Date(2026, 9, 29, 8, 0).getTime()];
    let k = 0;
    P.HO_PLACES.forEach((place) => slots.forEach((slot) => {
      if (place === "w3" && slot === slots[2]) return;
      k++;
      const at = slot + ((k * 7) % 25) * MIN, inc = shiftOf(slot), out = other(inc);
      const from = people(place, out)[0], to = people(place, inc)[(k % 2) && people(place, inc)[1] ? 1 : 0];
      const lines = P.hoItems(place, at).map((med) => { const e = balAt(med, place, at); let c = e, known = false;
        if (place === "mat" && med === "oxy" && slot === slots[2]) c = e - 1;
        if (place === "peds" && med === "diaz" && slot >= slots[0] && at > new Date(2026, 9, 28, 8, 0).getTime() - 1) { c = e - 1; known = true; }
        return { med, expected: e, counted: c, known }; });
      const items = place === "w3" ? [{ t: "Metronidazole out at the pharmacy: Bed 12 doses not given", seen: true }] : place === "opd" ? [{ t: "2 patients owed metronidazole", seen: true }] : place === "mat" ? [{ t: "Bed 1 on magnesium sulphate: next dose due 12:00", seen: true }] : [];
      const f = fridgeOf(place);
      db.handovers.push({ id: "h" + db.seq++, slot, at, place, from: { name: from.name, role: from.role, cadre: from.cadre }, to: { name: to.name, role: to.role, cadre: to.cadre }, lines,
        keys: true, seal: P.place(place).kind === "ward" ? "ET-" + (4100 + ["w3", "mat", "peds"].indexOf(place) * 37 + (slot === slots[2] ? 1 : 0)) : null, temp: f && P.temp ? Math.round(P.temp(f, at) * 10) / 10 : null,
        items, notes: "", status: lines.some((l) => l.counted !== l.expected && !l.known) ? "open" : "ok", sample: true });
    }));
    db.hoMiss = {};
    db.hoSeeded = 1;
  };
  if (!P.db.hoSeeded) { seedHo(P.db); P.commit(); }
  const reset0 = P.reset;
  P.reset = () => { reset0(); seedHo(P.db); P.commit(); };

  /* ── state ── */
  const hoAt = (place, slot) => (P.db.handovers || []).find((h) => h.place === place && Math.abs(h.slot - slot) < MIN);
  P.hoLast = (place) => (P.db.handovers || []).filter((h) => h.place === place).sort((a, b) => b.at - a.at)[0];
  P.hoNext = () => slotsBetween(P.now() - 2 * HOUR, P.now() + DAY).find((s) => P.HO_PLACES.some((p) => !hoAt(p, s)) || s > P.now());
  const nextFor = (place) => slotsBetween(P.now() - 2 * HOUR, P.now() + DAY).find((s) => !hoAt(place, s) && !(P.db.hoMiss || {})[place + "|" + s]);
  P.hoFlags = () => {
    const now = P.now(), f = [], miss = P.db.hoMiss || {};
    P.HO_PLACES.forEach((place) => slotsBetween(now - 36 * HOUR, now - 2 * HOUR).forEach((s) => {
      if (!hoAt(place, s) && !miss[place + "|" + s]) f.push({ k: "miss", id: "m" + place + s, place, slot: s, title: "No handover recorded: " + P.place(place).name + " at " + wl(s), meta: "Nobody signed the " + SHIFT[shiftOf(s - 1)].split(" (")[0] + " over to the " + SHIFT[shiftOf(s)].split(" (")[0] + ": the count, the keys and the seal are unaccounted for", act: "Explain" });
    }));
    (P.db.handovers || []).filter((h) => h.status === "open").forEach((h) => h.lines.filter((l) => l.counted !== l.expected && !l.known && !(h.resolved || {})[l.med]).forEach((l) => f.push({ k: "diff", id: "d" + h.id + l.med, h, l, place: h.place,
      title: short(l.med) + " at " + P.place(h.place).short + ": counted " + l.counted + ", ledger " + l.expected, meta: "Handover " + wl(h.at) + " · " + h.from.name + " → " + h.to.name + (P.med(l.med).controlled ? " · also in Controlled drugs" : "") + (P.caseWord ? P.caseWord("ho:" + h.id + ":" + l.med) : ""), act: P.med(l.med).controlled ? "Open in Controlled drugs" : "Resolve" })));
    P.HO_PLACES.forEach((place) => { const s = nextFor(place); if (s && s - now <= HOUR && s - now > -2 * HOUR) f.push({ k: "due", id: "n" + place + s, place, slot: s, title: "Handover " + (s < now ? "now, " + Math.round((now - s) / MIN) + " min late" : "at " + P.time(s)) + ": " + P.place(place).name, meta: "Count, keys and open items, signed by both shifts", act: "Start" }); });
    return f;
  };

  /* where the signed-in person works: a pharmacy station (OPD dispensary or main store). Wards hand over on their own tablets. */
  P.PHARM_STATIONS = ["opd", "store"];
  P.myStation = () => { const s = P.db.settings; return P.PHARM_STATIONS.includes(s.place) ? s.place : s.role === "storekeeper" ? "store" : "opd"; };
  P.isIncharge = () => P.db.settings.role === "incharge";
  /* flags this person should see: their own station, or everything for the in-charge */
  P.hoMine = () => { const all = P.hoFlags(); return P.isIncharge() ? all : all.filter((f) => f.place === P.myStation()); };
  const dutyWord = (x, sh) => (x.shift === "call" ? "on call, 24 h" : sh === "day" ? "on duty 08:00–17:00" : "on duty 17:00–08:00");

  /* open items the incoming shift must acknowledge */
  const openItems = (place) => {
    const out = [], db = P.db;
    if (P.cdFlags) P.cdFlags().filter((f) => f.place === place && f.k !== "due").forEach((f) => out.push("Controlled drugs: " + f.title));
    if (P.marAlerts && P.place(place).kind === "ward") P.marAlerts().filter((a) => a.ward === place).forEach((a) => out.push(a.title + (a.meta ? " · " + a.meta : "")));
    if (place === "opd") {
      const w = db.rx.filter((r) => r.status === "waiting").length, o = db.owed.filter((x) => !x.done && x.kind === "owed").length;
      if (w) out.push(w + " patients waiting at the window"); if (o) out.push(o + " patients owed medicine, to call when it comes in");
    }
    if (place === "store") {
      db.deliveries.filter((d) => d.status !== "received").forEach((d) => out.push("Delivery not yet received: " + d.title));
      db.requests.filter((r) => r.status === "raised").forEach((r) => out.push(P.place(r.ward).short + " asked for " + r.lines.length + " medicines"));
    }
    if (P.coldOpen) P.coldOpen().filter((e) => e.f.place === place).forEach((e) => out.push("Cold chain: " + e.f.name + " went " + (e.kind === "high" ? "up to +" : "down to ") + e.peak.toFixed(1) + " °C, action not yet recorded"));
    (db.handovers || []).filter((h) => h.place === place && h.status === "open").forEach((h) => h.lines.filter((l) => l.counted !== l.expected && !l.known && !(h.resolved || {})[l.med]).forEach((l) => out.push("Unresolved difference from " + wl(h.at) + ": " + short(l.med) + " " + (l.counted - l.expected))));
    return out;
  };

  /* ── doing a handover ── */
  const HandoverDialog = ({ place, onClose }) => {
    const db = P.useDb();
    /* a handover within 2 h of 08:00 or 17:00 is that shift change; otherwise it is mid-shift (someone leaving early) */
    const near = slotsBetween(P.now() - 2 * HOUR, P.now() + 2 * HOUR).find((s) => !hoAt(place, s));
    const slot = near || null, mid = !slot;
    const outShift = mid ? shiftOf(P.now()) : shiftOf(slot - 1), inShift = mid ? outShift : shiftOf(slot);
    const outs = people(place, outShift), ins0 = people(place, inShift);
    const fromN = "you";
    const ins = ins0;
    const [toN, setToN] = useState(ins.length === 1 ? ins[0].name : null);
    const items = P.hoItems(place);
    const [n, setN] = useState({});
    const [shown, setShown] = useState(false);
    const [keys, setKeys] = useState(false);
    const prevSeal = lastSeal(place);
    const [sealMode, setSealMode] = useState(null);
    const [seal, setSeal] = useState("");
    const opens = openItems(place);
    const [seen, setSeen] = useState({});
    const [notes, setNotes] = useState("");
    const [sent, setSent] = useState(false);
    const f = fridgeOf(place), temp = f && P.temp ? Math.round(P.temp(f, P.now()) * 10) / 10 : null;
    const ward = P.place(place).kind === "ward";
    const counted = items.every((m) => n[m] != null);
    const diffs = items.filter((m) => n[m] !== P.medAt(m, place));
    const sealOk = !ward || sealMode === "same" || (sealMode === "new" && seal.trim().length > 2);
    const missing = !toN ? "Choose who is taking over" : !counted ? "Count every item" : !shown ? "Compare the count" : !keys ? "Hand over the keys" : !sealOk ? "Check the emergency tray seal" : opens.some((_, i) => !seen[i]) ? "Go through every open item" : null;
    const fromP = { name: P.who(), role: "Outgoing", cadre: "" };
    const toP = ins.find((x) => x.name === toN);
    const save = () => {
      const lines = items.map((m) => ({ med: m, expected: P.medAt(m, place), counted: n[m] }));
      const h = { id: "h" + db.seq++, slot, mid, at: P.now(), place, from: { name: fromP.name, role: fromP.role, cadre: fromP.cadre }, to: { name: toP.name, role: toP.role, cadre: toP.cadre }, lines, keys, seal: ward ? (sealMode === "same" ? prevSeal : seal.trim()) : null, sealNew: ward && sealMode === "new", temp, items: opens.map((t) => ({ t, seen: true })), notes: notes.trim(), status: lines.some((l) => l.counted !== l.expected) ? "open" : "ok" };
      (db.handovers = db.handovers || []).push(h);
      const cdl = lines.filter((l) => P.med(l.med).controlled);
      if (cdl.length) (db.cdChecks = db.cdChecks || []).push({ id: "c" + db.seq++, at: h.at, place, by: fromP.name, witness: { name: toP.name, role: "Incoming, " + SHIFT[inShift].split(" (")[0], how: "phone", at: h.at }, lines: cdl, status: cdl.some((l) => l.counted !== l.expected) ? "open" : "ok", handover: h.id });
      P.commit();
      P.toast(h.status === "ok" ? P.place(place).short + " handed over to " + toP.name + ": everything matches" : P.place(place).short + " handed over with " + diffs.length + " difference" + (diffs.length > 1 ? "s" : "") + ", flagged for the in-charge", h.status === "ok" ? "check" : "alert");
      onClose();
    };
    return html`<${P.Dialog} size="wide" title=${"Shift handover · " + P.place(place).name} sub=${mid ? "Mid-shift handover, " + SHIFT[outShift] + ": someone is leaving early or handing the keys to a colleague. The next shift change is " + P.time(slotsBetween(P.now(), P.now() + DAY)[0]) + "." : "The " + SHIFT[outShift] + " hands over to the " + SHIFT[inShift] + " · " + (slot < P.now() ? "due " + P.time(slot) + ", " + Math.round((P.now() - slot) / MIN) + " min ago" : "due " + P.time(slot))} onClose=${onClose}
      foot=${sent ? html`<span className="grow muted small">Prototype only: in the real app ${toP.name} accepts on their own phone, after counting.</span><${P.Btn} kind="primary" icon="phone" onClick=${save}>Simulate: ${toP.name} accepts<//>`
        : html`<span className="grow muted small">${missing || (diffs.length ? diffs.length + " not matching: you can still hand over, and the difference is flagged." : "Everything matches.")}</span><${P.Btn} kind="primary" icon="send" disabled=${!!missing} onClick=${() => setSent(true)}>${toP ? "Sign and send to " + toP.name : "Sign and send"}<//>`}>
      ${sent ? html`<div className="note"><${P.Icon} n="phone" /><span><b>Waiting for ${toP.name}</b> to accept the handover on their own phone. They see the count, the keys, the seal and every open item you handed over.</span></div>` : html`
      <div className="ho-sec"><h4>1 · Who</h4>
        <div className="ho-who">
          <div className="stack-s"><span className="lbl">Handing over</span>
            <div className="wit-p on" style=${{ cursor: "default" }}><span className="wit-av">You</span><span className="wit-t"><b>${P.who()}</b><span>${P.place(place).name} · ${SHIFT[outShift].split(" (")[0]}</span></span></div>
            <span className="hint">You can only hand over the station you are working at.</span></div>
          <span className="ho-arrow"><${P.Icon} n="right" s=${18} /></span>
          <div className="stack-s"><span className="lbl">Taking over: staff on duty ${mid ? "now" : "from " + P.time(slot)} (${SHIFT[inShift].split(" (")[0]})</span>
            <div className="wit-ppl">${ins.map((x) => html`<button type="button" key=${x.name} className=${P.cx("wit-p", toN === x.name && "on")} aria-pressed=${toN === x.name ? "true" : "false"} onClick=${() => setToN(x.name)}>
              <span className="wit-av">${initials(x.name)}</span><span className="wit-t"><b>${x.name}</b><span>${x.cadre} · ${dutyWord(x, inShift)}</span></span></button>`)}</div>
            <span className="hint">From the duty roster. Someone not on duty at that time can't take over.</span></div>
        </div></div>
      <div className="ho-sec"><h4>2 · Count together</h4><p className="hint">The person taking over counts; the ledger's figure shows only after every item is counted.</p>
        <div className="cd-count">${items.map((m) => html`<div className="cd-crow" key=${m}>
          <div className="grow"><b>${P.med(m).name}</b><div className="muted small">${P.med(m).controlled ? "Controlled" : "High-risk"} · in ${P.med(m).unit}</div></div>
          <${P.Stepper} value=${n[m]} onChange=${(v) => { setN({ ...n, [m]: v }); setShown(false); }} step=${P.med(m).unit === "mL" ? 5 : 1} unit=${P.med(m).unit} label=${"count of " + P.med(m).name} />
          <span className=${P.cx("cd-reg", shown && (n[m] === P.medAt(m, place) ? "ok" : "bad"))}>${shown ? (n[m] === P.medAt(m, place) ? "Matches" : "Ledger " + P.medAt(m, place)) : "Ledger hidden"}</span></div>`)}</div>
        ${shown ? null : html`<div className="row"><${P.Btn} kind="navy" size="sm" disabled=${!counted} onClick=${() => setShown(true)}>Compare with the ledger<//></div>`}</div>
      <div className="ho-sec"><h4>3 · Keys${ward ? ", seal" : ""}${f ? " and fridge" : ""}</h4>
        <label className="cd-tick"><input type="checkbox" checked=${keys} onChange=${(e) => setKeys(e.target.checked)} /><span>${place === "store" ? "Store and CD cupboard keys handed over" : "CD cupboard key handed over"}</span></label>
        ${ward ? html`<div className="stack-s"><span className="lbl">Emergency tray</span><div className="chips">
          ${prevSeal ? html`<${P.Chip} size="sm" on=${sealMode === "same"} onClick=${() => setSealMode("same")}>Seal intact: ${prevSeal}<//>` : null}
          <${P.Chip} size="sm" on=${sealMode === "new"} onClick=${() => setSealMode("new")}>Opened and resealed<//></div>
          ${sealMode === "new" ? html`<input className="input" placeholder="New seal number" value=${seal} onChange=${(e) => setSeal(e.target.value)} style=${{ maxWidth: "240px" }} />` : null}</div>` : null}
        ${f ? html`<div className="muted small">${f.name} now: <b className=${P.coldStatus(temp) === "ok" ? "" : "bad"}>${(temp > 0 ? "+" : "") + temp} °C</b> (from the sensor, saved with the handover)</div>` : null}</div>
      <div className="ho-sec"><h4>4 · Open items (${opens.length})</h4>
        ${opens.length ? html`<p className="hint">Tap each one as it is explained.</p><div className="ho-items">${opens.map((t, i) => html`<button type="button" key=${i} className=${P.cx("ho-item", seen[i] && "on")} aria-pressed=${seen[i] ? "true" : "false"} onClick=${() => setSeen({ ...seen, [i]: !seen[i] })}>
          <${P.Icon} n=${seen[i] ? "check" : "clock"} s=${15} /><span>${t}</span><em>${seen[i] ? "Seen" : "Tap when explained"}</em></button>`)}</div>
          <div className="row"><${P.Btn} size="sm" kind="ghost" onClick=${() => setSeen(Object.fromEntries(opens.map((_, i) => [i, true])))}>Mark all seen<//></div>`
        : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />Nothing open at ${P.place(place).short}.</p>`}</div>
      <div className="ho-sec"><h4>5 · Notes for the next shift</h4><textarea className="input" style=${{ height: "70px", padding: "8px 12px" }} placeholder="Anything else they need to know" value=${notes} onChange=${(e) => setNotes(e.target.value)}></textarea></div>`}
    <//>`;
  };

  /* ── explaining a missed handover ── */
  const MissDialog = ({ fl, onClose }) => {
    const db = P.useDb();
    const [why, setWhy] = useState(null);
    const [note, setNote] = useState("");
    const save = () => { db.hoMiss = db.hoMiss || {}; db.hoMiss[fl.place + "|" + fl.slot] = { why, note: note.trim(), by: P.who(), at: P.now() }; P.commit(); P.toast("Recorded: " + why.toLowerCase()); onClose(); };
    return html`<${P.Dialog} title="Missed handover" sub=${fl.title} onClose=${onClose} foot=${html`<${P.Btn} kind="primary" disabled=${!why || (why.startsWith("Not done") && note.trim().length < 3)} onClick=${save}>Save<//>`}>
      <div className="stack-s"><span className="lbl">What happened</span><div className="chips">${["Done on paper: paper sheet attached", "Same person covered both shifts", "Not done: reported to the in-charge"].map((w) => html`<${P.Chip} key=${w} on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div></div>
      <div className="field"><label htmlFor="mn">Note${why && why.startsWith("Not done") ? " (required)" : ""}</label><input id="mn" className="input" value=${note} onChange=${(e) => setNote(e.target.value)} /></div>
      <p className="hint">The missed slot stays in the history with this explanation and your name. The next handover's count shows whether anything went missing in between.</p>
    <//>`;
  };

  /* ── resolving a difference in a high-risk (not controlled) item ── */
  const DiffDialog = ({ fl, onClose }) => {
    const db = P.useDb();
    const { h, l } = fl, diff = l.counted - l.expected, incharge = db.settings.role === "incharge";
    const m = P.med(l.med);
    const [how, setHow] = useState(null);
    const [why, setWhy] = useState(null);
    const [ref, setRef] = useState("");
    const [pt, setPt] = useState(null);
    const [other, setOther] = useState(false);
    const [otherName, setOtherName] = useState("");
    const [by, setBy] = useState(null);
    const [when, setWhen] = useState(null);
    /* the window: from the handover before this one at the same place, to this one */
    const prev = (db.handovers || []).filter((x) => x.place === h.place && x.at < h.at).sort((a, b) => b.at - a.at)[0];
    const from = prev ? prev.at : h.at - DAY;
    const pts = (P.INPATIENTS || []).filter((x) => x.ward === h.place).map((x) => ({ ...x, regs: (P.regsOf ? P.regsOf(x.id) : []).filter((r) => r.med === l.med) })).sort((a, b) => b.regs.length - a.regs.length);
    const sel = pts.find((x) => x.id === pt);
    const slotTimes = sel && sel.regs.length && P.slots ? sel.regs.flatMap((r) => P.slots(r, from, h.at)) : [];
    const shifts = []; for (let t = day0(from) - DAY; t < h.at; t += DAY) [[8, 17, "day"], [17, 32, "night"]].forEach(([a, b, nm]) => { const s0 = t + a * HOUR, s1 = t + b * HOUR; if (Math.min(s1, h.at) - Math.max(s0, from) >= 30 * MIN) shifts.push({ at: Math.max(s0, from) + (Math.min(s1, h.at) - Math.max(s0, from)) / 2, label: (nm === "day" ? "Day shift " : "Night shift ") + new Date(s0).getDate() + " " + P.MON[new Date(s0).getMonth()], approx: true }); });
    const whenOpts = slotTimes.length ? slotTimes.map((t) => ({ at: t, label: P.when(t) + " (scheduled dose)" })) : shifts;
    const nurses = (P.NURSES || {})[h.place] || [];
    const ptName = other ? otherName.trim() : sel ? sel.name : "";
    const okGiven = diff < 0 && ptName.length > 2 && by && when != null;
    const ok = (how === "recount" && why) || (how === "given" && okGiven) || (how === "loss" && incharge && why && ref.trim().length > 2);
    const save = () => {
      const w = whenOpts[when];
      if (how === "given") P.allocate(l.med, h.place, -diff).parts.forEach((x) => P.move({ kind: "administer", med: l.med, batch: x.batch, from: h.place, to: "patient", qty: x.qty, at: w.at, entered: P.now(), enteredBy: P.who(), by,
        note: ptName + (sel ? " (" + sel.bed + ")" : "") + " · late entry from the " + wl(h.at) + " handover" + (w.approx ? " · time approximate: " + w.label.toLowerCase() : ""), late: true }));
      if (how === "loss") { if (diff < 0) P.allocate(l.med, h.place, -diff).parts.forEach((x) => P.move({ kind: "count", med: l.med, batch: x.batch, from: h.place, to: "loss", qty: x.qty, note: "Handover difference, confirmed loss: " + why.toLowerCase() + " · incident " + ref.trim() })); else P.move({ kind: "count", med: l.med, batch: l.med + "-1", from: "found", to: h.place, qty: diff, note: "Handover difference, confirmed excess: " + why.toLowerCase() + " · incident " + ref.trim() }); }
      h.resolved = h.resolved || {}; h.resolved[l.med] = { how, why, pt: ptName, givenBy: by, when: how === "given" ? whenOpts[when].at : null, ref: ref.trim(), by: P.who(), at: P.now() };
      if (h.lines.every((x) => x.counted === x.expected || x.known || h.resolved[x.med])) h.status = "resolved";
      P.commit(); P.toast("Resolved: " + short(l.med) + " at " + P.place(h.place).short, "check"); onClose();
    };
    const pick = (k) => { setHow(k); setWhy(null); };
    const missing = how === "given" && !okGiven ? (!ptName ? "Tap the patient" : !by ? "Tap who gave it" : "Tap when it was given") : null;
    return html`<${P.Dialog} size="wide" title=${"Resolve: " + short(l.med) + " at " + P.place(h.place).short} sub=${"Counted " + l.counted + ", ledger " + l.expected + " · handover " + P.when(h.at) + " · " + h.from.name + " → " + h.to.name} onClose=${onClose}
      foot=${html`${missing ? html`<span className="grow muted small">${missing}</span>` : null}<${P.Btn} kind="primary" disabled=${!ok} onClick=${save}>Save<//>`}>
      <div className="stack-s"><span className="lbl">What was found</span>
        <div className="chips"><${P.Chip} on=${how === "recount"} onClick=${() => pick("recount")}>Recounted: it matches<//>${diff < 0 ? html`<${P.Chip} on=${how === "given"} onClick=${() => pick("given")}>Given to a patient, not recorded<//>` : null}<${P.Chip} on=${how === "loss"} onClick=${() => pick("loss")}>Confirmed ${diff < 0 ? "loss" : "excess"}<//></div></div>
      ${how === "recount" ? html`<div className="stack-s"><span className="lbl">Where it was</span><div className="chips">${["Found in the emergency tray", "In another drawer or the fridge door", "Miscounted at handover"].map((w) => html`<${P.Chip} key=${w} size="sm" on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div></div>` : null}
      ${how === "given" ? html`
        <div className="cd-win"><${P.Icon} n="clock" s=${16} /><span>${unitWord2(l.med, -diff)} unaccounted for between <b>${P.when(from)}</b> (${prev ? "the handover before" : "a day before"}) and <b>${P.when(h.at)}</b> (this handover).</span></div>
        <div className="stack-s"><span className="lbl">Patient</span>
          <div className="cd-pts">${pts.map((x) => html`<button type="button" key=${x.id} className=${P.cx("cd-pt", pt === x.id && !other && "on")} aria-pressed=${pt === x.id && !other ? "true" : "false"} onClick=${() => { setPt(x.id); setOther(false); setWhen(null); }}>
            <b>${x.name}</b><span>${x.bed} · ${x.regs.length ? "prescribed " + short(l.med).toLowerCase() + ": " + x.regs.map((r) => r.dose + ", " + r.freq.toLowerCase()).join("; ") : x.dx}</span></button>`)}
            <button type="button" className=${P.cx("cd-pt", other && "on")} aria-pressed=${other ? "true" : "false"} onClick=${() => { setOther(true); setPt(null); setWhen(null); }}><b>Someone not on the list</b><span>discharged, delivered or transferred since</span></button></div>
          ${other ? html`<input className="input" placeholder="Their name and IP number" value=${otherName} onChange=${(e) => setOtherName(e.target.value)} />` : null}</div>
        <div className="stack-s"><span className="lbl">Given by</span><div className="chips">${nurses.map((n) => html`<${P.Chip} key=${n} size="sm" on=${by === n} onClick=${() => setBy(n)}>${n}<//>`)}</div></div>
        ${ptName ? html`<div className="stack-s"><span className="lbl">When${slotTimes.length ? ": scheduled doses in the window" : ""}</span><div className="chips">${whenOpts.map((w, i) => html`<${P.Chip} key=${i} size="sm" on=${when === i} onClick=${() => setWhen(i)}>${w.label}<//>`)}</div>
          ${whenOpts[when] && whenOpts[when].approx ? html`<span className="hint">Saved as approximate, with the shift named on the line.</span>` : null}</div>` : null}
        <p className="hint">Saved at the time it was given, marked as a late entry with who entered it and when.</p>` : null}
      ${how === "loss" ? html`${incharge ? null : html`<div className="note warn"><${P.Icon} n="lock" /><span>Only the in-charge pharmacist can sign a loss. Switch roles in the top banner ("try things").</span></div>`}
        <div className="stack-s"><span className="lbl">What happened</span><div className="chips">${(diff < 0 ? ["Broken ampoule, not recorded", "Expired, discarded without a record", "Taken to theatre or another ward", "Unexplained"] : ["Returned by a patient or ward", "Received but not entered", "Unexplained"]).map((w) => html`<${P.Chip} key=${w} size="sm" on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div></div>
        <div className="field"><label htmlFor="dr">Incident report number</label><input id="dr" className="input" placeholder="e.g. IR-2026-042" value=${ref} onChange=${(e) => setRef(e.target.value)} /><span className="hint">The one thing typed: it links this line to the incident report.</span></div>` : null}
    <//>`;
  };

  const resultTag = (h) => {
    const open = h.lines.filter((l) => l.counted !== l.expected && !l.known && !(h.resolved || {})[l.med]).length, known = h.lines.some((l) => l.known);
    return open ? html`<span className="vx-st overdue">${open} not matching</span>` : h.status === "resolved" ? html`<span className="vx-st">Resolved</span>` : known ? html`<span className="vx-st">Known difference</span>` : html`<span className="vx-st ok">Matches</span>`;
  };

  const Log = ({ places, onlyMine }) => {
    const db = P.useDb(), now = P.now();
    const hist = (db.handovers || []).filter((h) => places.includes(h.place));
    const rows = places.flatMap((p) => slotsBetween(now - 36 * HOUR, now - 2 * HOUR).filter((s) => !hoAt(p, s)).map((s) => ({ miss: true, p, s, at: s }))).concat(hist).sort((a, b) => b.at - a.at);
    return html`<div className="card">
      <div className="dash-h" style=${{ padding: "14px 16px 4px" }}><h3>${onlyMine ? "Handover log · " + P.place(places[0]).name : "Handover log"}</h3><span className="muted small">${hist.length} handovers · missed slots shown in red</span></div>
      <div className="tblwrap"><table className="tbl dense">
        <thead><tr><th>When</th>${onlyMine ? null : html`<th>Place</th>`}<th>Handed over → taken over</th><th>Counted</th><th>Keys · seal · fridge</th><th className="r">Open items</th><th>Result</th></tr></thead>
        <tbody>${rows.map((r) => r.miss ? html`<tr key=${"m" + r.p + r.s} className="cd-flag"><td className="num">${P.when(r.s)}</td>${onlyMine ? null : html`<td>${P.place(r.p).short}</td>`}<td colSpan="4" className="bad">No handover recorded${(db.hoMiss || {})[r.p + "|" + r.s] ? html` <span className="muted">· explained: ${db.hoMiss[r.p + "|" + r.s].why}</span>` : null}</td><td><span className="vx-st overdue">Missed</span></td></tr>`
          : html`<tr key=${r.id} className=${r.status === "open" ? "cd-flag" : ""}><td className="num">${P.when(r.at)}${r.mid ? html`<div className="dn-sub">mid-shift</div>` : null}</td>${onlyMine ? null : html`<td>${P.place(r.place).short}</td>`}
            <td className="small"><b>${r.from.name}</b> → <b>${r.to.name}</b><div className="dn-sub">${r.to.cadre || ""}</div></td>
            <td className="small">${r.lines.map((l) => html`<span key=${l.med} className=${P.cx("ho-l", l.counted !== l.expected && !l.known && "bad")}>${short(l.med)} ${l.counted}${l.counted !== l.expected ? " (ledger " + l.expected + ")" : ""}</span>`)}</td>
            <td className="small">${r.keys ? "Keys ✓" : "No keys"}${r.seal ? " · " + (r.sealNew ? "new seal " : "seal ") + r.seal : ""}${r.temp != null ? " · " + (r.temp > 0 ? "+" : "") + r.temp + " °C" : ""}</td>
            <td className="r num">${r.items.length}</td><td>${resultTag(r)}</td></tr>`)}</tbody></table></div>
    </div>`;
  };

  const FlagList = ({ flags, act, incharge, title, empty }) => html`<div className="card pad stack-s">
    <div className="dash-h"><h3>${title}</h3><span className="muted small">closed by a signed explanation, never deleted${incharge ? "" : " · counts that don't match are resolved by the in-charge"}</span></div>
    ${flags.length ? flags.map((f) => html`<div className="cd-frow" key=${f.id}><span className=${P.cx("cd-fk", f.k === "miss" ? "wit" : "disc")}>${f.k === "miss" ? "Missed" : "Count"}</span>
      <div className="grow"><b>${f.title}</b><div className="muted small">${f.meta}</div></div>
      ${f.k === "diff" && !incharge ? html`<span className="vx-st">With the in-charge</span>` : html`<${P.Btn} size="sm" kind=${f.k === "diff" ? "primary" : "outline"} onClick=${() => act(f)}>${f.act}<//>`}</div>`)
    : html`<p className="ok-line"><${P.Icon} n="check" s=${14} />${empty}</p>`}
  </div>`;

  /* the signed-in person's own station: the only one they can hand over */
  const MyStation = ({ onStart }) => {
    const db = P.useDb();
    const st = P.myStation(), now = P.now(), last = P.hoLast(st), s = nextFor(st) || slotsBetween(now, now + DAY)[0];
    const sh = shiftOf(now), nextSh = s ? shiftOf(s) : other(sh), due = s && s - now <= HOUR;
    const coming = s ? people(st, nextSh) : [];
    return html`<div className="card pad ho-mine">
      <div className="ho-mine-l">
        <span className="lbl">Your station</span>
        <div className="row"><h3 style=${{ fontSize: "18px" }}>${P.place(st).name}</h3><button type="button" className="clslink" onClick=${() => P.open("place")}>Change</button></div>
        <div className="muted small">${P.who()} · ${SHIFT[sh]} · ${P.hoItems(st).map(short).join(" · ") || "keys only"}</div>
        ${last ? html`<div className="ho-pair"><span className="wit-av">${initials(last.from.name)}</span><${P.Icon} n="right" s=${14} /><span className="wit-av">${initials(last.to.name)}</span><span className="small">Last: <b>${last.from.name}</b> → <b>${last.to.name}</b>, ${wl(last.at)} · ${resultTag(last)}</span></div>` : null}
      </div>
      <div className="ho-mine-r">
        <div><span className="lbl">Next handover</span><div className="ho-next"><b>${s ? P.time(s) : "—"}</b><span className="muted small">${s ? (s < now ? Math.round((now - s) / MIN) + " min late" : "in " + P.ago(now - (s - now))) : ""}</span></div></div>
        <div><span className="lbl">On duty ${s ? "from " + P.time(s) : "next"}</span><div className="ho-coming">${coming.map((x) => html`<span key=${x.name} className="ho-chip" title=${x.cadre}><span className="wit-av sm">${initials(x.name)}</span>${x.name}</span>`)}</div></div>
        <${P.Btn} kind=${due ? "primary" : "navy"} icon="swap" onClick=${() => onStart(st)}>${due ? "Start the " + P.time(s) + " handover" : "Hand over now"}<//>
      </div>
    </div>`;
  };

  P.HandoverView = ({ route }) => {
    const db = P.useDb();
    const [dlg, setDlg] = useState(null);
    const [filt, setFilt] = useState("all");
    const incharge = P.isIncharge(), st = P.myStation();
    const flags = P.hoFlags().filter((f) => f.k !== "due"), now = P.now();
    const mine = flags.filter((f) => f.place === st);
    const t0 = day0(now);
    const act = (f) => {
      if (f.k === "miss") setDlg({ t: "miss", f });
      else if (f.k === "diff") { if (P.med(f.l.med).controlled) P.go({ to: "cd", tab: "flags" }); else setDlg({ t: "diff", f }); }
    };
    const start = (place) => setDlg({ t: "do", place });
    const others = P.HO_PLACES.filter((p) => p !== st);
    return html`<div className="stack">
      <${MyStation} onStart=${start} />
      ${incharge ? html`
        <div className="section-h"><h2>Oversight · every station</h2><span className="muted">you see all handovers, including the wards'</span></div>
        <div className="kpis">
          <div className="kpi"><b>${P.HO_PLACES.filter((p) => hoAt(p, t0 + 8 * HOUR)).length} of ${P.HO_PLACES.length}</b><span>stations handed over at 08:00${now > t0 + 17 * HOUR ? " · " + P.HO_PLACES.filter((p) => hoAt(p, t0 + 17 * HOUR)).length + " at 17:00" : ""}</span></div>
          <div className="kpi"><b className=${flags.some((f) => f.k === "miss") ? "bad" : "ok"}>${flags.filter((f) => f.k === "miss").length}</b><span>missed in the last 36 h</span></div>
          <div className="kpi"><b className=${flags.some((f) => f.k === "diff") ? "bad" : "ok"}>${flags.filter((f) => f.k === "diff").length}</b><span>counts not matching</span></div>
          <div className="kpi"><b>${(db.handovers || []).filter((h) => h.at >= t0).length}</b><span>handovers signed today</span></div>
        </div>
        <div className="ho-cards">${others.map((p) => {
          const last = P.hoLast(p), s = nextFor(p), pf = flags.filter((f) => f.place === p);
          return html`<button type="button" className=${P.cx("ho-card", "ho-cardbtn", filt === p && "on")} key=${p} aria-pressed=${filt === p ? "true" : "false"} onClick=${() => setFilt(filt === p ? "all" : p)}>
            <div className="row between"><b>${P.place(p).name}</b>${pf.some((f) => f.k === "miss") ? html`<span className="vx-st overdue">Missed</span>` : pf.length ? html`<span className="vx-st overdue">Not matching</span>` : html`<span className="vx-st ok">Handed over</span>`}</div>
            ${last ? html`<div className="ho-pair"><span className="wit-av">${initials(last.from.name)}</span><${P.Icon} n="right" s=${14} /><span className="wit-av">${initials(last.to.name)}</span><span className="small"><b>${last.to.name}</b><br /><span className="muted">took over ${wl(last.at)}</span></span></div>` : null}
            <div className="muted small">${P.hoItems(p).map(short).join(" · ") || "Keys only"}</div>
            <div className="small">${s ? "Next " + P.time(s) + (s < now ? " (late)" : "") : ""} · ${P.PHARM_STATIONS.includes(p) ? "pharmacy station" : "ward tablet"}</div>
          </button>`;
        })}</div>
        <${FlagList} flags=${filt === "all" ? flags : flags.filter((f) => f.place === filt)} act=${act} incharge=${true} title=${"To act on" + (filt === "all" ? ", all stations" : " · " + P.place(filt).name)} empty="Every handover done and every count matched." />
        <${Log} places=${filt === "all" ? P.HO_PLACES : [filt]} onlyMine=${false} />`
      : html`
        <${FlagList} flags=${mine} act=${act} incharge=${false} title="To act on at your station" empty=${"Nothing open at " + P.place(st).short + "."} />
        <${Log} places=${[st]} onlyMine=${true} />
        <p className="hint">Handovers at other stations and on the wards are overseen by the in-charge pharmacist.</p>`}
      ${dlg && dlg.t === "do" ? html`<${HandoverDialog} place=${dlg.place} onClose=${() => setDlg(null)} />` : null}
      ${dlg && dlg.t === "miss" ? html`<${MissDialog} fl=${dlg.f} onClose=${() => setDlg(null)} />` : null}
      ${dlg && dlg.t === "diff" ? html`<${DiffDialog} fl=${dlg.f} onClose=${() => setDlg(null)} />` : null}
    </div>`;
  };
})();
