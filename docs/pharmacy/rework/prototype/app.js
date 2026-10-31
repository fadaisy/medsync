/* The shell: five doors, + Start, Find or scan, the place chip, the network pill, Emergency, and the dialogs they open. */
(function () {
  const P = window.P, html = P.html;
  const { useState, useEffect } = React;

  const DOORS = [
    { to: "today", label: "Today", icon: "today" },
    { to: "dispense", label: "Dispense", icon: "pill" },
    { to: "inpatients", label: "Inpatients", short: "Wards", icon: "bed" },
    { to: "outpatients", label: "Outpatients", short: "Refills", icon: "history" },
    { to: "epi", label: "Immunisation", short: "EPI", icon: "syringe" },
    { to: "reminders", label: "Reminders", short: "SMS", icon: "bell" },
    { to: "medicines", label: "Medicines", icon: "package" },
    { to: "store", label: "Store", icon: "truck" },
    { to: "cd", label: "Controlled drugs", short: "CDs", icon: "lock" },
    { to: "handover", label: "Shift handover", short: "Handover", icon: "swap" },
    { to: "cases", label: "Investigations", short: "Cases", icon: "search" },
    { to: "records", label: "Records", icon: "book" },
    { to: "team", label: "Team", icon: "user" },
  ];
  /* six sections in the side bar; a section with several pages shows them as tabs above the page */
  const GROUPS = [
    { id: "today", label: "Today", icon: "today", pages: ["today"] },
    { id: "dispense", label: "Dispense", icon: "pill", pages: ["dispense"] },
    { id: "patients", label: "Patients", icon: "bed", pages: ["inpatients", "outpatients", "epi", "reminders"] },
    { id: "stock", label: "Stock", icon: "package", pages: ["medicines", "store"] },
    { id: "controls", label: "Controls", icon: "shield", pages: ["cd", "handover", "cases"] },
    { id: "records", label: "Records", icon: "book", pages: ["records", "team"] },
  ];
  const PAGE_GROUP = {}; GROUPS.forEach((g) => g.pages.forEach((p) => { PAGE_GROUP[p] = g.id; }));
  const DOOR = (to) => DOORS.find((d) => d.to === to);
  const lastIn = {};
  const DOOR_OF = { recall: "medicines", setup: null };
  const TITLES = {
    today: ["Today", () => { const d = new Date(P.now()); return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()] + " " + d.getDate() + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getMonth()] + " · the pharmacy at a glance, and your work in the order to do it"; }],
    dispense: ["Dispense", () => "OPD dispensary · give, owe or hold each line"],
    epi: ["Immunisation", () => "Vaccines at the EPI clinic: stock, use, refills and the fridge, plus the clinic dashboard"],
    outpatients: ["Outpatients", () => "Adherence and refills after the window: chronic medicines, pill counts and antibiotic courses"],
    inpatients: ["Inpatients", () => "What the wards have given, missed or can't give: the nurses' medicine charts, seen from the pharmacy"],
    medicines: ["Medicines", () => "Every medicine in every place, worked out from the ledger"],
    store: ["Store", () => "Receive, issue, count and order"],
    cd: ["Controlled drugs", () => "One register per medicine per place: every ampoule and mL in, given, discarded and counted, with two signatures"],
    handover: ["Shift handover", () => "At 08:00 and 17:00 each place is handed over: a blind count, the keys, the seal and every open item, signed by both shifts"],
    cases: ["Investigations", () => "Every count that didn't match, wherever it was found: an owner, a deadline, a timeline and an in-charge sign-off"],
    records: ["Records", () => "Audit trail, losses in UGX, paper sheets and monthly reports"],
    reminders: ["Reminders", () => "SMS for refills, antibiotic courses and immunisation visits, built from the records every morning"],
    team: ["Team", () => "Workload and quality per person and per shift, to plan staffing and support"],
    recall: ["Recall", () => "One job: find it, take it off the shelves, tell the patients"],
    setup: ["Set-up", () => "Going live, rules and people. Out of the daily doors."],
  };
  const counts = (db) => ({
    today: P.todayItems().mine.length,
    dispense: db.rx.filter((r) => r.status === "waiting").length,
    inpatients: P.marAlerts().length,
    outpatients: P.opAlerts().length,
    epi: P.vaxStock ? P.vaxStock().filter((r) => r.k === "refill").length : 0,
    store: db.deliveries.filter((d) => d.status !== "received").length + db.requests.filter((r) => r.status === "raised").length + db.transits.filter((t) => t.status === "onway").length + db.counts.filter((c) => c.status !== "done").length,
    cd: P.cdFlags ? P.cdFlags().length : 0,
    cases: P.caseFlags ? P.caseFlags().length : 0,
    reminders: P.smsQueue ? P.smsQueue().filter((m) => m.status === "failed").length : 0,
    handover: P.hoMine ? P.hoMine().filter((f) => f.k !== "due" && (f.k !== "diff" || P.isIncharge())).length : 0,
    records: db.sheets.reduce((s, x) => s + x.rows.length - x.entered.length, 0),
  });

  /* ───────── Find or scan ───────── */
  const SCANS = ["AX24117", "MO25012", "CF25031"];
  let scanI = 0;
  function Find({ scan }) {
    const db = P.useDb();
    const [q, setQ] = useState("");
    const doScan = () => {
      const code = SCANS[scanI++ % SCANS.length], b = db.batches.find((x) => x.no === code);
      P.toast("Scanned " + code, "scan");
      if (b) P.go({ to: "medicines", med: b.med, batch: b.id });
    };
    const t = q.trim().toLowerCase();
    const res = t.length < 2 ? [] : [
      ...P.CLASSES.filter((c) => c.toLowerCase().includes(t)).map((c) => ({ k: "c" + c, icon: "book", t: c, m: ((n) => n + (n === 1 ? " medicine" : " medicines") + " in this class")(P.MEDS.filter((m) => m.cat === c).length), go: { to: "medicines", cls: c } })),
      ...P.MEDS.filter((m) => m.name.toLowerCase().includes(t) || m.cat.toLowerCase().includes(t)).map((m) => ({ k: "m" + m.id, icon: "package", t: m.name, m: P.stockWord(m.id) || m.cat, go: { to: "medicines", med: m.id } })),
      ...db.batches.filter((b) => b.no.toLowerCase().includes(t)).map((b) => ({ k: "b" + b.id, icon: "scan", t: "Batch " + b.no, m: P.med(b.med).name + " · " + P.expWord(b.exp), go: { to: "medicines", med: b.med, batch: b.id } })),
      ...db.rx.filter((r) => r.status !== "done" && r.patient.toLowerCase().includes(t)).map((r) => ({ k: "r" + r.id, icon: "user", t: r.patient, m: "Prescription from " + r.from, go: { to: "dispense", tab: r.status === "waiting" ? "waiting" : "ready", rx: r.id } })),
      ...db.owed.filter((o) => !o.done && o.patient.toLowerCase().includes(t)).map((o) => ({ k: "o" + o.id, icon: "bell", t: o.patient, m: "Owed " + P.q(o.qty, o.med) + " " + P.med(o.med).name, go: { to: "dispense", tab: "owed" } })),
      ...P.PLACES.filter((p) => p.name.toLowerCase().includes(t)).map((p) => ({ k: "p" + p.id, icon: "pin", t: p.name, m: p.kind === "store" ? "Main store" : "Issue to this place", go: p.kind === "store" ? { to: "store" } : { to: "store", tab: "issue", ward: p.id } })),
    ].slice(0, 12);
    return html`<${P.Dialog} title="Find or scan" sub="A medicine, a batch number, a patient or a place" onClose=${P.close}>
      <div className="row"><input className="input grow" data-autofocus=${scan ? undefined : true} placeholder="Type 2 letters…" value=${q} onChange=${(e) => setQ(e.target.value)} aria-label="Find" />
        <${P.Btn} kind="navy" icon="scan" data-autofocus=${scan ? true : undefined} onClick=${doScan}>Simulate a scan<//></div>
      ${t.length < 2 ? html`<p className="hint">Scanning a box opens its batch: where it is, when it expires, who got it. Try "amox", "AX24", "patient 07" or "maternity".</p>` : null}
      <div className="list">${res.map((r) => html`<button type="button" key=${r.k} className="lrow" onClick=${() => P.go(r.go)}><${P.Icon} n=${r.icon} /><div className="grow"><div className="t">${r.t}</div><div className="m">${r.m}</div></div><${P.Icon} n="right" /></button>`)}
        ${t.length >= 2 && !res.length ? html`<p className="muted">Nothing matches "${q}".</p>` : null}</div>
    <//>`;
  }

  /* ───────── + Start ───────── */
  function Start() {
    const db = P.useDb();
    const first = db.rx.filter((r) => r.status === "waiting").sort((a, b) => a.since - b.since)[0];
    const tiles = [
      ["pill", "Hand over a prescription", first ? first.patient + " is next" : "Nobody waiting", () => P.go({ to: "dispense", tab: "waiting", rx: first && first.id })],
      ["truck", "Receive a delivery", "Scan the boxes against the order", () => P.go({ to: "store", tab: "receive" })],
      ["send", "Issue to a ward", "Requests and top-ups, suggested", () => P.go({ to: "store", tab: "issue" })],
      ["clip", "Count a shelf", "Blind, saved as you go", () => P.open("startCount")],
      ["undo", "Take back from a ward", "Unused or damaged stock", () => P.open("return")],
      ["ban", "Recall a batch", "Find it, block it, tell patients", () => P.open("recallStart")],
      ["file", "Enter a paper sheet", "After a long network cut", () => P.go({ to: "records", tab: "sheets" })],
      ["cart", "Order from NMS", "Worked out from use", () => P.go({ to: "store", tab: "order" })],
    ];
    return html`<${P.Dialog} size="wide" title="Start" sub="Every job in one place. Each one has a clear end." onClose=${P.close}>
      <div className="tiles">${tiles.map(([i, t, s, f]) => html`<button type="button" key=${t} className="tile" onClick=${f}><span className="ti"><${P.Icon} n=${i} /></span><b>${t}</b><span>${s}</span></button>`)}</div>
      <p className="hint">Emergency supply is the red button at the top, on every screen.</p>
    <//>`;
  }

  /* ───────── Emergency supply ───────── */
  function Emergency() {
    const db = P.useDb();
    const [dest, setDest] = useState(null);
    const [med, setMed] = useState(null);
    const [qty, setQty] = useState(null);
    const [wit, setWit] = useState(false);
    const m = med && P.med(med), max = med ? P.medAt(med, "store") : 0;
    const ok = dest && med && qty > 0 && qty <= max;
    const supply = (witness) => {
      const a = P.allocate(med, "store", qty);
      a.parts.forEach((p) => P.move({ kind: "emergency", med, batch: p.batch, from: "store", to: dest, qty: p.qty, note: "Emergency supply, prescription to follow", witness: m.controlled ? witness : undefined }));
      db.emergencies.push({ id: "e" + db.seq++, at: P.now(), med, qty, to: dest, toName: P.place(dest).name, done: false });
      if (witness && witness.how === "paper") db.paperWitness.push({ id: "pw" + db.seq++, what: "Emergency supply to " + P.place(dest).short, name: witness.name, at: witness.at, checked: false });
      P.commit(); P.close(); P.toast("Supplied to " + P.place(dest).short + ". Add the prescription when it comes: it waits on Today.", "zap");
    };
    return html`<${P.Dialog} title="Emergency supply" sub="Supply now, add the prescription afterwards. Recorded at once." onClose=${P.close}
      foot=${html`<span className="grow muted small">${m && m.controlled ? "Controlled: one witness, on their phone or on paper." : "From the Main store, earliest expiry first."}</span>
        <${P.Btn} kind="primary" size="lg" disabled=${!ok} onClick=${() => (m.controlled ? setWit(true) : supply(null))}>Supply now<//>`}>
      <div className="stack-s"><span className="lbl">To</span><div className="chips">${P.PLACES.filter((p) => p.kind === "ward").map((p) => html`<${P.Chip} key=${p.id} on=${dest === p.id} onClick=${() => setDest(p.id)}>${p.name}<//>`)}</div></div>
      <div className="stack-s"><span className="lbl">Medicine</span><div className="chips">${P.MEDS.filter((x) => P.medAt(x.id, "store") > 0).map((x) => html`<${P.Chip} key=${x.id} on=${med === x.id} onClick=${() => { setMed(x.id); setQty(null); }}>${x.name} · ${x.routes.join("/")}${x.controlled ? " · controlled" : ""}<//>`)}</div></div>
      ${med ? html`<div className="stack-s"><span className="lbl">How many</span><div className="row"><${P.Stepper} value=${qty} onChange=${setQty} unit=${m.unit} label=${"emergency " + m.name} max=${max} /><span className="muted small">${max} in the Main store</span></div></div>` : null}
      ${wit ? html`<${P.WitnessDialog} what=${qty + " " + m.unit + " " + m.name + " to " + P.place(dest).short + " (emergency)"} onClose=${() => setWit(false)} onDone=${(w) => { setWit(false); supply(w); }} />` : null}
    <//>`;
  }

  function EmergencyFinish({ id }) {
    const db = P.useDb();
    const e = db.emergencies.find((x) => x.id === id);
    const [how, setHow] = useState(null);
    if (!e) return null;
    return html`<${P.Dialog} title="Finish the emergency supply" sub=${P.q(e.qty, e.med) + " " + P.med(e.med).name + " to " + e.toName + " at " + P.time(e.at)} onClose=${P.close}
      foot=${html`<${P.Btn} kind="primary" disabled=${!how} onClick=${() => { e.done = true; e.how = how; e.doneAt = P.now(); P.commit(); P.close(); P.toast("Emergency supply finished"); }}>Finish<//>`}>
      <div className="stack-s"><span className="lbl">The prescription</span><div className="chips">
        ${["Paper prescription received", "Written in the patient's record", "Ward returned what wasn't used"].map((w) => html`<${P.Chip} key=${w} on=${how === w} onClick=${() => setHow(w)}>${w}<//>`)}</div></div>
    <//>`;
  }

  /* ───────── Take back from a ward ───────── */
  const BACK = [["Patient discharged", "store"], ["No longer needed", "store"], ["Damaged", "store:q"], ["Expired", "store:q"]];
  function Return() {
    const db = P.useDb();
    const [ward, setWard] = useState(null);
    const [batch, setBatch] = useState(null);
    const [qty, setQty] = useState(null);
    const [why, setWhy] = useState(null);
    const batches = ward ? db.batches.filter((b) => P.bal(b.id, ward) > 0) : [];
    const b = batch && P.batch(batch), max = b ? P.bal(b.id, ward) : 0;
    const ok = b && qty > 0 && qty <= max && why;
    return html`<${P.Dialog} title="Take back from a ward" sub="Into the Main store, or its quarantine if it can't be used" onClose=${P.close}
      foot=${html`<${P.Btn} kind="primary" disabled=${!ok} onClick=${() => { const to = BACK.find((x) => x[0] === why)[1]; P.move({ kind: "returned", med: b.med, batch: b.id, from: ward, to, qty, note: why }); P.commit(); P.close(); P.toast(P.q(qty, b.med) + " taken back" + (to === "store:q" ? " into quarantine" : ""), "undo"); }}>Take back<//>`}>
      <div className="stack-s"><span className="lbl">From</span><div className="chips">${P.PLACES.filter((p) => p.kind === "ward").map((p) => html`<${P.Chip} key=${p.id} on=${ward === p.id} onClick=${() => { setWard(p.id); setBatch(null); setQty(null); }}>${p.name}<//>`)}</div></div>
      ${ward ? html`<div className="stack-s"><span className="lbl">What</span><div className="chips">${batches.map((x) => html`<${P.Chip} key=${x.id} on=${batch === x.id} onClick=${() => { setBatch(x.id); setQty(null); }}>${P.med(x.med).name} · ${x.no} · ${P.bal(x.id, ward)}<//>`)}</div></div>` : null}
      ${b ? html`<div className="stack-s"><span className="lbl">How many</span><${P.Stepper} value=${qty} onChange=${setQty} unit=${P.med(b.med).unit} label="quantity taken back" max=${max} /></div>
        <div className="stack-s"><span className="lbl">Why</span><div className="chips">${BACK.map(([w]) => html`<${P.Chip} key=${w} on=${why === w} onClick=${() => setWhy(w)}>${w}<//>`)}</div></div>` : null}
    <//>`;
  }

  function RecallStart({ batch }) {
    const db = P.useDb();
    const [b, setB] = useState(batch || null);
    if (b) return html`<${P.StartRecall} batch=${b} onClose=${P.close} />`;
    return html`<${P.Dialog} title="Recall a batch" sub="Pick the batch, or scan a box from it" onClose=${P.close}>
      <div className="list">${db.batches.filter((x) => !x.recalled && P.batchTotal(x.id) > 0).map((x) => html`<button type="button" key=${x.id} className="lrow" onClick=${() => setB(x.id)}>
        <div className="grow"><div className="t">${P.med(x.med).name} · <span className="mono">${x.no}</span></div><div className="m">Expires ${P.expWord(x.exp)} · ${P.q(P.batchTotal(x.id), x.med)} held</div></div><${P.Icon} n="right" /></button>`)}</div>
    <//>`;
  }

  /* ───────── Place, network, account, prototype ───────── */
  function Place() {
    const db = P.useDb();
    return html`<${P.Dialog} title="Where are you working?" sub="Sets what Count and Find open first. Your rights don't change." onClose=${P.close}>
      <div className="chips">${P.PLACES.map((p) => html`<${P.Chip} key=${p.id} on=${db.settings.place === p.id} onClick=${() => { db.settings.place = p.id; P.commit(); P.close(); }}>${p.name}<//>`)}</div>
    <//>`;
  }

  const cut = (off) => {
    const db = P.db;
    if (off) { db.settings.offAt = P.now(); P.setOffline(true); P.toast("Network cut (simulated). Keep working: changes stay on this tablet.", "wifioff"); }
    else { const n = P.setOffline(false); P.toast("Network back. " + n + (n === 1 ? " change" : " changes") + " sent to MedSync.", "wifi"); }
  };

  function Net() {
    const db = P.useDb();
    const off = db.settings.offline;
    return html`<${P.Dialog} title=${off ? "No network" : "Connected"} sub=${off ? "Since " + P.time(db.settings.offAt || P.now()) : "Every change reaches MedSync as you make it"} onClose=${P.close}
      foot=${html`<${P.Btn} kind=${off ? "primary" : "navy"} icon=${off ? "wifi" : "wifioff"} onClick=${() => { cut(!off); P.close(); }}>${off ? "Simulate: network back" : "Simulate a network cut"}<//>`}>
      ${off ? html`<div className="stack-s"><p><b>${db.outbox} ${db.outbox === 1 ? "change is" : "changes are"}</b> saved on this tablet. They send by themselves when the network is back, in the order they happened.</p>
        <p className="muted small">Hand-overs, receiving, issuing and counts all keep working. A controlled drug is witnessed on the paper register, and the in-charge checks it later. Paper sheets are only for a dead tablet or a cut of hours.</p></div>`
      : html`<p className="muted">Nothing waiting to send. If the network drops, keep working: the tablet holds every change and sends it later.</p>`}
    <//>`;
  }

  function Account() {
    const db = P.useDb();
    return html`<${P.Dialog} title=${P.ROLES[db.settings.role]} sub="Prototype sign-in · sample hospital" onClose=${P.close}>
      <div className="list">
        <button type="button" className="lrow" onClick=${() => P.go({ to: "setup" })}><${P.Icon} n="sliders" /><div className="grow"><div className="t">Set-up</div><div className="m">Going live, rules, people. Moved out of the daily doors.</div></div><${P.Icon} n="right" /></button>
        <button type="button" className="lrow" onClick=${() => P.open("proto")}><${P.Icon} n="user" /><div className="grow"><div className="t">Switch role (prototype)</div><div className="m">See the store keeper's or the in-charge's day</div></div><${P.Icon} n="right" /></button>
      </div>
    <//>`;
  }

  function Proto() {
    const db = P.useDb();
    const [sure, setSure] = useState(false);
    const tries = [
      ["Hand over a prescription", "Give, owe or hold each line; no typed quantities pre-filled", () => P.go({ to: "dispense", tab: "waiting" })],
      ["Receive the NMS delivery", "Scan boxes; one line has no barcode; morphine needs a witness", () => { const d = P.db.deliveries.find((x) => x.status === "expected"); P.go({ to: "store", tab: "receive", delivery: d && d.id }); }],
      ["Issue Maternity's request", "Suggested from the request; on the way until the ward confirms", () => P.go({ to: "store", tab: "issue", ward: "mat" })],
      ["Count shelf B2, blind", "Differences appear only after the shelf is recorded", () => { const c = P.startCount({ place: "opd", scope: "shelf", shelf: "B2" }); P.go({ to: "store", tab: "count", count: c.id }); }],
      ["Recall batch AX24117", "Block it, take it off shelves, trace the three patients", () => P.open("recallStart", { batch: "amox-1" })],
      ["Cut the network", "Keep working; a controlled drug goes to the paper register", () => { if (!P.db.settings.offline) cut(true); P.close(); }],
    ];
    return html`<${P.Dialog} size="wide" title="Prototype" sub="Sample data only. Nothing here reaches MedSync. Your changes stay in this browser." onClose=${P.close}
      foot=${html`<span className="grow"></span>${sure ? html`<${P.Btn} kind="navy" onClick=${() => { P.reset(); P.close(); P.go({ to: "today" }); P.toast("Sample data reset"); }}>Tap again to reset<//>` : html`<${P.Btn} icon="undo" onClick=${() => setSure(true)}>Reset the sample data<//>`}`}>
      <div className="stack-s"><span className="lbl">View as</span><div className="chips">${Object.keys(P.ROLES).map((r) => html`<${P.Chip} key=${r} on=${db.settings.role === r} onClick=${() => { db.settings.role = r; P.commit(); }}>${P.ROLES[r]}<//>`)}</div>
        <p className="hint">Today re-orders itself for each role. Only the in-charge can approve a count or check a paper-witnessed entry.</p></div>
      <div className="stack-s"><span className="lbl">Try these</span>
        <div className="tiles">${tries.map(([t, s, f]) => html`<button type="button" key=${t} className="tile" onClick=${f}><b>${t}</b><span>${s}</span></button>`)}</div></div>
      <p className="hint">Simulated: scans, the witness's phone, the ward nurse's confirmation, the printer, the network. Directions on labels are placeholders.</p>
    <//>`;
  }

  /* phone: everything beyond the four main doors */
  const More = () => {
    const db = P.useDb(), n = counts(db);
    return html`<${P.Dialog} title="All of the pharmacy" onClose=${P.close}>
      <div className="stack">${GROUPS.filter((g) => g.pages.length > 1 || !["today", "dispense"].includes(g.id)).map((g) => html`<div key=${g.id} className="stack-s"><span className="lbl">${g.label}</span>
        <div className="more-grid">${g.pages.map((to) => { const d = DOOR(to); return html`<button type="button" key=${to} className="more-item" onClick=${() => P.go({ to })}><${P.Icon} n=${d.icon} s=${22} /><span>${d.label}</span>${n[to] ? html`<b>${n[to]}</b>` : null}</button>`; })}</div></div>`)}</div>
    <//>`;
  };
  const MODALS = { more: More, find: Find, start: Start, emergency: Emergency, emergencyFinish: EmergencyFinish, return: Return, recallStart: RecallStart, place: Place, net: Net, account: Account, proto: Proto, startCount: () => html`<${P.StartCountDialog} onClose=${P.close} />` };

  /* ───────── App ───────── */
  function App() {
    const db = P.useDb();
    const [route, setRoute] = useState({ to: "today" });
    const [modal, setModal] = useState(null);
    const [, setTick] = useState(0);
    P.go = (r) => { setModal(null); setRoute(r); try { history.pushState(r, ""); } catch (e) { /* sandboxed: no history */ } window.scrollTo(0, 0); };
    P.open = (kind, props) => setModal({ kind, props: props || {} });
    P.close = () => setModal(null);
    useEffect(() => {
      const t = setInterval(() => setTick((x) => x + 1), 30000);
      const pop = (e) => { setModal(null); setRoute((e.state && e.state.to) ? e.state : { to: "today" }); };
      const key = (e) => {
        const typing = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "");
        if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); P.open("find"); }
      };
      window.addEventListener("popstate", pop); window.addEventListener("keydown", key);
      let seen = false; try { seen = localStorage.getItem("medsync-pharmacy-rework-seen") === "1"; localStorage.setItem("medsync-pharmacy-rework-seen", "1"); } catch (e) { /* fine */ }
      if (!seen) P.open("proto");
      return () => { clearInterval(t); window.removeEventListener("popstate", pop); window.removeEventListener("keydown", key); };
    }, []);
    const door = route.to in DOOR_OF ? DOOR_OF[route.to] : route.to;
    const grp = GROUPS.find((g) => g.id === PAGE_GROUP[door]);
    if (grp && door) lastIn[grp.id] = door;
    const gCount = (g) => g.pages.reduce((a, p) => a + (n[p] || 0), 0);
    const n = counts(db);
    const off = db.settings.offline;
    const [title, sub] = TITLES[route.to] || TITLES.today;
    const View = { today: P.TodayView, dispense: P.DispenseView, inpatients: P.InpatientsView, outpatients: P.OutpatientsView, epi: P.EpiView, medicines: P.MedicinesView, store: P.StoreView, cd: P.CdView, handover: P.HandoverView, cases: P.CasesView, reminders: P.RemindersView, team: P.TeamView, records: P.RecordsView, recall: P.RecallView, setup: P.SetupView }[route.to] || P.TodayView;
    const M = modal && MODALS[modal.kind];
    const groupBtn = (g, cls) => { const c = gCount(g); return html`<button type="button" key=${g.id} className=${cls} aria-current=${grp && grp.id === g.id ? "page" : undefined} onClick=${() => P.go({ to: lastIn[g.id] || g.pages[0] })}>
      <${P.Icon} n=${g.icon} s=${22} />${g.label}${c ? html`<span className=${cls === "rail-item" ? "rail-count" : "bn-count"}>${c}</span>` : null}</button>`; };
    const navBtn = (d, cls) => html`<button type="button" key=${d.to} className=${cls} aria-current=${door === d.to ? "page" : undefined} onClick=${() => P.go({ to: d.to })}>
      <${P.Icon} n=${d.icon} s=${22} />${cls === "bn-item" && d.short ? d.short : d.label}${n[d.to] ? html`<span className=${cls === "rail-item" ? "rail-count" : "bn-count"}>${n[d.to]}</span>` : null}</button>`;
    return html`
      <div className="protostrip"><span>Prototype of the pharmacy rework · sample data · nothing here reaches MedSync</span>
        <button type="button" onClick=${() => P.open("proto")}>Viewing as ${P.ROLES[db.settings.role]} · try things</button></div>
      <div className="app">
        <nav className="rail" aria-label="Pharmacy"><div className="rail-in">
          <button type="button" className="rail-start" aria-label="Start a job" onClick=${() => P.open("start")}><${P.Icon} n="plus" s=${26} /></button>
          ${GROUPS.map((g) => groupBtn(g, "rail-item"))}
          <span className="rail-spacer"></span>
          <button type="button" className="avatar" aria-label="Account and set-up" onClick=${() => P.open("account")}>${P.ROLES[db.settings.role].split(" ").map((w) => w[0]).join("").slice(0, 2)}</button>
        </div></nav>
        <main className="main">
          <div className="top">
            <div className="overline"><span className="dot"></span><span className="word">Pharmacy</span></div>
            <button type="button" className="placechip" onClick=${() => P.open("place")}><${P.Icon} n="pin" s=${14} />${P.place(db.settings.place).short}</button>
            <button type="button" className="findbar" onClick=${() => P.open("find")}><${P.Icon} n="search" /><span>Find or scan: medicine, batch, patient</span><span className="kbd">Ctrl K</span></button>
            <div className="top-right">
              <button type="button" className="iconbtn phone-only" aria-label="Find or scan" onClick=${() => P.open("find")}><${P.Icon} n="search" /></button>
              <button type="button" className="iconbtn phone-only" aria-label="Account and set-up" onClick=${() => P.open("account")}><${P.Icon} n="user" /></button>
              <button type="button" className=${P.cx("netpill", off && "off")} onClick=${() => P.open("net")}><${P.Icon} n=${off ? "wifioff" : "wifi"} s=${15} /><span className="word">${off ? "Offline · " + db.outbox + " to send" : "Online"}</span></button>
              <button type="button" className="emergency" onClick=${() => P.open("emergency")}>Emergency</button>
            </div>
          </div>
          ${off ? html`<div className="offline-band"><${P.Icon} n="wifioff" /><span className="grow">No network. ${db.outbox} ${db.outbox === 1 ? "change" : "changes"} saved on this tablet; they send when it's back. Keep working.</span></div>` : null}
          ${grp && grp.pages.length > 1 ? html`<nav className="subnav" aria-label=${grp.label}>${grp.pages.map((to) => { const d = DOOR(to); return html`<button type="button" key=${to} aria-current=${door === to ? "page" : undefined} onClick=${() => P.go({ to })}><${P.Icon} n=${d.icon} s=${16} />${d.label}${n[to] ? html`<span className="sn-count">${n[to]}</span>` : null}</button>`; })}</nav>` : null}
          <div className="titlerow"><div><h1>${title}</h1><div className="sub">${sub()}</div></div></div>
          <${P.ErrorBoundary} key=${route.to}><${View} route=${route} /><//>
        </main>
      </div>
      <nav className="bottomnav" aria-label="Pharmacy">
        ${DOORS.filter((d) => ["today", "dispense"].includes(d.to)).map((d) => navBtn(d, "bn-item"))}
        <button type="button" className="bn-plus" aria-label="Start a job" onClick=${() => P.open("start")}><${P.Icon} n="plus" s=${26} /></button>
        ${groupBtn(GROUPS.find((g) => g.id === "patients"), "bn-item")}
        <button type="button" className="bn-item" aria-current=${grp && ["stock", "controls", "records"].includes(grp.id) ? "page" : undefined} onClick=${() => P.open("more")}><${P.Icon} n="sliders" s=${22} />More${GROUPS.filter((g) => ["stock", "controls", "records"].includes(g.id)).reduce((a, g) => a + gCount(g), 0) ? html`<span className="bn-count">${GROUPS.filter((g) => ["stock", "controls", "records"].includes(g.id)).reduce((a, g) => a + gCount(g), 0)}</span>` : null}</button>
      </nav>
      ${M ? html`<${P.ErrorBoundary} key=${modal.kind}><${M} ...${modal.props} /><//>` : null}
      <${P.Toaster} />`;
  }

  ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
})();
