/* Today: one work list, ranked for the person's role. Each item has one action. Replaces Today, Needs you and the flow strips. */
(function () {
  const P = window.P, html = P.html;

  const ORDER = {
    pharmacist: ["emerg", "rxq", "cold", "handover", "case", "cd", "mar", "rx", "op", "owed", "recall", "countdue", "countrun", "req", "transit", "exp", "out", "delivery", "approve", "paper", "sheet"],
    storekeeper: ["emerg", "cold", "handover", "case", "delivery", "cd", "mar", "op", "req", "due", "transit", "countdue", "countrun", "out", "exp", "recall", "owed", "rx", "approve", "paper", "sheet"],
    incharge: ["emerg", "cold", "handover", "case", "cd", "mar", "approve", "op", "paper", "recall", "rx", "req", "delivery", "out", "exp", "transit", "owed", "countrun", "countdue", "due", "sheet"],
  };
  const FOR = {
    rx: ["pharmacist", "incharge"], owed: ["pharmacist"], req: ["storekeeper"], due: ["storekeeper"], delivery: ["storekeeper"],
    transit: ["storekeeper"], countdue: ["pharmacist", "storekeeper"], countrun: ["pharmacist", "storekeeper"], approve: ["incharge"],
    exp: ["storekeeper", "incharge"], out: ["storekeeper", "incharge"], paper: ["incharge"], recall: ["pharmacist", "storekeeper", "incharge"],
    emerg: ["pharmacist", "storekeeper", "incharge"], cold: ["pharmacist", "storekeeper", "incharge"], mar: ["pharmacist", "incharge"], cd: ["pharmacist", "incharge"], handover: ["pharmacist", "storekeeper", "incharge"], case: ["pharmacist", "storekeeper", "incharge"], rxq: ["pharmacist", "incharge"], op: ["pharmacist"], sheet: ["pharmacist"],
  };

  P.wardSuggestions = (ward) => {
    const lv = P.LEVELS[ward] || {};
    return Object.keys(lv).map((med) => {
      const has = P.medAt(med, ward) + P.medAt(med, "transit:" + ward);
      const want = Math.max(0, lv[med] - has);
      return { med, has, level: lv[med], want, store: P.medAt(med, "store") };
    }).filter((s) => s.want > 0);
  };

  P.todayItems = () => {
    const db = P.db, it = [];
    const waiting = db.rx.filter((r) => r.status === "waiting").sort((a, b) => a.since - b.since);
    if (waiting.length) it.push({ k: "rx", icon: "pill", title: waiting.length + (waiting.length === 1 ? " patient is" : " patients are") + " waiting at the OPD dispensary", meta: "Longest wait " + P.ago(waiting[0].since) + " · " + waiting[0].patient, act: "Start dispensing", go: { to: "dispense", tab: "waiting", rx: waiting[0].id } });
    const owedNow = db.owed.filter((o) => !o.done && o.kind === "owed" && P.medAt(o.med, "opd") + P.medAt(o.med, "store") >= o.qty);
    if (owedNow.length) {
      const meds = [...new Set(owedNow.map((o) => P.med(o.med).name))].join(", ");
      it.push({ k: "owed", icon: "bell", title: owedNow.length + (owedNow.length === 1 ? " patient owed medicine: now in stock" : " patients owed medicine: now in stock"), meta: meds + " · tell them to come back", act: "See who to call", go: { to: "dispense", tab: "owed" } });
    }
    db.requests.filter((r) => r.status === "raised").forEach((r) => it.push({ k: "req", icon: "send", title: P.place(r.ward).short + " asked for " + r.lines.length + " medicines", meta: "Raised " + P.time(r.at) + " by " + r.by, act: "Issue", go: { to: "store", tab: "issue", ward: r.ward } }));
    ["w3", "peds"].forEach((w) => {
      const s = P.wardSuggestions(w), recent = db.transits.some((t) => t.dest === w);
      if (s.length && !recent && !db.requests.some((r) => r.ward === w && r.status === "raised")) it.push({ k: "due", icon: "clock", title: P.place(w).short + " weekly top-up is due", meta: s.length + " medicines below their level", act: "Top up", go: { to: "store", tab: "issue", ward: w } });
    });
    db.deliveries.filter((d) => d.status === "expected").forEach((d) => it.push({ k: "delivery", icon: "truck", title: "Delivery expected: " + d.title, meta: d.lines.length + " lines ordered " + d.ordered + " · receive it against the order", act: "Receive", go: { to: "store", tab: "receive", delivery: d.id } }));
    db.deliveries.filter((d) => d.status === "receiving").forEach((d) => {
      const ready = d.lines.filter(P.lineReady).length;
      it.push({ k: "delivery", icon: "truck", title: "Finish receiving: " + d.title, meta: ready + " of " + d.lines.length + " lines ready · saved as you go", act: "Continue", go: { to: "store", tab: "receive", delivery: d.id } });
    });
    db.transits.filter((t) => t.status === "onway").forEach((t) => it.push({ k: "transit", icon: "send", title: P.place(t.dest).short + " hasn't confirmed what you issued", meta: "Issued " + P.time(t.at) + " · stock shows as on the way until they confirm", act: "Open", go: { to: "store", tab: "issue", ward: t.dest } }));
    db.counts.filter((c) => c.status === "approval").forEach((c) => it.push({ k: "approve", icon: "clip", title: "Approve the count: " + c.title, meta: P.countDiffs(c).length + " differences, each with a reason", act: "Review", go: { to: "store", tab: "count", count: c.id } }));
    db.counts.filter((c) => c.status === "counting").forEach((c) => it.push({ k: "countrun", icon: "clip", title: "Continue the count: " + c.title, meta: P.countProgress(c), act: "Continue", go: { to: "store", tab: "count", count: c.id } }));
    if (!db.counts.some((c) => c.key === "opd-B2")) it.push({ k: "countdue", icon: "clip", title: "Count due: OPD dispensary, shelf B2", meta: "3 batches · suggested because it hasn't been counted this month (sample)", act: "Start count", run: () => { const c = P.startCount({ place: "opd", scope: "shelf", shelf: "B2" }); P.go({ to: "store", tab: "count", count: c.id }); } });
    const expiring = db.batches.filter((b) => P.usable(b) && P.monthsTo(b.exp) <= 3 && P.batchTotal(b.id) > 0);
    if (expiring.length) it.push({ k: "exp", icon: "clock", title: expiring.length + " batches expire within 90 days", meta: expiring.map((b) => P.med(b.med).name.split(" ")[0] + " " + b.no + " (" + P.expWord(b.exp) + ")").join(" · "), act: "Review", go: { to: "medicines", filter: "expiring" } });
    const out = P.MEDS.filter((m) => P.medTotal(m.id) === 0), low = P.MEDS.filter((m) => P.medTotal(m.id) > 0 && P.months(m.id) < 1);
    if (out.length || low.length) it.push({ k: "out", icon: "package", title: (out.length ? out.length + " out of stock" : "") + (out.length && low.length ? ", " : "") + (low.length ? low.length + " under a month left" : ""), meta: out.concat(low).map((m) => m.name).join(" · "), act: "See them", go: { to: "medicines", filter: out.length ? "out" : "low" } });
    const paper = db.paperWitness.filter((p) => !p.checked);
    if (paper.length) it.push({ k: "paper", icon: "shield", title: paper.length + " controlled-drug " + (paper.length === 1 ? "entry" : "entries") + " witnessed on paper", meta: "Check each against the paper register and confirm", act: "Check", go: { to: "cd", tab: "paper" } });
    (db.rxQueries || []).filter((q) => q.status === "open").forEach((q) => it.push({ k: "rxq", icon: "phone", title: "Waiting for the prescriber: " + q.patient + " · " + P.med(q.med).name, meta: q.flag + " · " + q.ask.toLowerCase() + " · sent " + P.time(q.at) + " to " + q.from, act: "Got an answer", run: () => { q.status = "answered"; q.answeredAt = P.now(); P.commit(); P.toast("Marked as answered. Open the prescription to finish it."); P.go({ to: "dispense", rx: q.rx }); } }));
    if (P.caseFlags) P.caseFlags().forEach(({ c, why }) => it.push({ k: "case", icon: "search", title: "Investigation: " + P.med(c.med).name + " at " + P.place(c.place).short, meta: why, act: "Open", go: { to: "cases" } }));
    if (P.hoMine) P.hoMine().forEach((f) => { if (f.k === "due" && f.place !== P.myStation()) return;
      it.push({ k: "handover", icon: "swap", title: f.title, meta: f.meta, act: f.k === "due" ? "Start" : "Review", go: { to: "handover" } }); });
    if (P.cdSummary) { const cs = P.cdSummary(), pn = paper.length; if (cs.n - pn > 0) it.push({ k: "cd", icon: "lock", title: "Controlled drugs: " + (cs.n - pn) + " to fix", meta: cs.words.replace(/ · \d+ paper witness(es)?$/, ""), act: "Review", go: { to: "cd", tab: "flags" } }); }
    db.recalls.filter((r) => r.status === "open").forEach((r) => { const b = P.batch(r.batch); it.push({ k: "recall", icon: "ban", title: "Recall open: " + P.med(b.med).name + " " + b.no, meta: P.recallLeft(r), act: "Continue", go: { to: "recall", recall: r.id } }); });
    db.emergencies.filter((e) => !e.done).forEach((e) => it.push({ k: "emerg", icon: "zap", title: "Finish the emergency supply of " + P.time(e.at), meta: P.q(e.qty, e.med) + " " + P.med(e.med).name + " to " + e.toName + " · add the prescription when it comes", act: "Finish", run: () => P.open("emergencyFinish", { id: e.id }) }));
    if (P.opAlerts) P.opAlerts().forEach((a) => it.push(a));
    if (P.marAlerts) P.marAlerts().forEach((a) => it.push({ k: "mar", icon: a.kind === "stock" ? "package" : a.kind === "short" ? "alert" : "clock", title: a.title, meta: a.meta + (a.kind === "stock" ? " · issue or talk to the prescriber" : ""), act: "Review", go: { to: "inpatients", ward: a.ward } }));
    if (P.coldOpen) P.coldOpen().forEach((e) => it.push({ k: "cold", icon: "snow", title: "Cold chain: " + e.f.name + " went " + (e.kind === "high" ? "up to +" : "down to ") + e.peak.toFixed(1) + " °C for " + e.mins + " min", meta: P.when(e.start) + " · say what was done with the stock", act: "Review", go: { to: "store", tab: "cold", fridge: e.f.id } }));
    db.sheets.filter((s) => s.entered.length < s.rows.length).forEach((s) => it.push({ k: "sheet", icon: "file", title: "Enter the paper sheet from the network cut", meta: s.label + " · " + s.when + " · " + (s.rows.length - s.entered.length) + " rows left", act: "Enter", go: { to: "records", tab: "sheets" } }));

    const role = db.settings.role, order = ORDER[role];
    it.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
    const mine = it.filter((x) => (FOR[x.k] || []).includes(role)), others = it.filter((x) => !(FOR[x.k] || []).includes(role));
    return { mine, others };
  };

  const Item = ({ it, next, minor }) => html`
    <div className=${P.cx("wi", next && "next", minor && "minor")}>
      <div className="wic"><${P.Icon} n=${it.icon} s=${20} /></div>
      <div style=${{ minWidth: 0 }}>
        ${next ? html`<div className="nextword">Next up</div>` : null}
        <div className="wt">${it.title}</div>
        <div className="wm">${it.meta}</div>
      </div>
      <${P.Btn} kind=${next ? "primary" : minor ? "ghost" : "outline"} onClick=${() => (it.run ? it.run() : P.go(it.go))}>${it.act}<//>
    </div>`;

  /* ── dashboard pieces ── */
  const Tile = ({ icon, label, value, sub, tone, go }) => html`<button type="button" className="dk" onClick=${() => P.go(go)}>
    <div className="dk-h"><span className="dk-ic"><${P.Icon} n=${icon} s=${16} /></span><span>${label}</span></div>
    <b className=${P.cx("dk-v", tone)}>${value}</b><span className="dk-s">${sub}</span></button>`;

  const Spark = ({ f }) => {
    const now = P.now(), pts = P.series(f, now - 24 * 3600e3, now, 30 * 60e3), W = 120, H = 30, lo = 0, hi = 12;
    const x = (i) => (i / (pts.length - 1)) * W, y = (v) => H - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * H;
    return html`<svg className="spark" width=${W} height=${H} viewBox=${"0 0 " + W + " " + H} aria-hidden="true">
      <rect x="0" y=${y(8)} width=${W} height=${y(2) - y(8)} className="spark-band" />
      <path d=${pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1)).join("")} className="spark-line" /></svg>`;
  };

  const MeterRow = ({ label, sub, pct, value, tone, go }) => html`<button type="button" className="mrow" onClick=${go ? () => P.go(go) : null}>
    <span className="mrow-l"><b>${label}</b>${sub ? html`<span>${sub}</span>` : null}</span>
    <span className="mrow-bar"><i className=${tone || ""} style=${{ width: Math.max(2, Math.min(100, pct)) + "%" }}></i></span>
    <span className=${P.cx("mrow-v", tone)}>${value}</span></button>`;

  P.TodayView = () => {
    const db = P.useDb();
    const [showOthers, setShowOthers] = React.useState(false);
    const [showAll, setShowAll] = React.useState(false);
    const { mine, others } = P.todayItems();
    const t0 = new Date(P.now()); t0.setHours(0, 0, 0, 0);
    const today = db.moves.filter((m) => m.at >= t0.getTime() && m.kind !== "opening");
    const cnt = (k) => today.filter((m) => m.kind === k).length;
    const handed = new Set(today.filter((m) => m.kind === "handover").map((m) => m.ref + m.note)).size;

    /* tiles */
    const waiting = db.rx.filter((r) => r.status === "waiting").sort((a, b) => a.since - b.since);
    const out = P.MEDS.filter((m) => P.medTotal(m.id) === 0), low = P.MEDS.filter((m) => P.medTotal(m.id) > 0 && P.months(m.id) < 1);
    const expiring = db.batches.filter((b) => P.usable(b) && P.monthsTo(b.exp) <= 3 && P.batchTotal(b.id) > 0);
    const ip = P.INPATIENTS ? P.INPATIENTS.map((p) => P.ptStats(p.id)) : [];
    const ipStock = ip.reduce((a, x) => a + x.stock, 0), ipDue = ip.reduce((a, x) => a + x.dueNow + x.overdue, 0);
    const ref = P.OP_REGS ? P.OP_REGS.filter((r) => r.kind === "chronic").map((r) => P.opRefill(r)) : [];
    const refOver = ref.filter((s) => s.k === "overdue").length, refDue = ref.filter((s) => s.k === "due").length;
    const coldOpen = P.coldOpen ? P.coldOpen().length : 0;
    const fr = P.FRIDGES || [], outNow = fr.filter((f) => P.coldStatus(P.temp(f, P.now())) !== "ok").length;
    const epiAll = P.epiClients ? P.epiClients().map((c) => P.epiStatus(c)) : [];
    const vxRefill = P.vaxStock ? P.vaxStock().filter((r) => r.k === "refill").length : 0, epiDue = epiAll.filter((s) => s.k === "due" || s.k === "overdue").length, epiDef = epiAll.filter((s) => s.k === "overdue").length;

    /* panels */
    const stockWatch = P.MEDS.filter((m) => !m.vaccine).map((m) => ({ m, mo: P.months(m.id) })).sort((a, b) => a.mo - b.mo).slice(0, 6);
    const wards = P.PLACES.filter((p) => p.kind === "ward").map((w) => { const st = (P.INPATIENTS || []).filter((p) => p.ward === w.id).map((p) => P.ptStats(p.id)); const g = st.reduce((a, x) => a + x.given, 0), d = st.reduce((a, x) => a + x.due, 0); return { w, pct: d ? Math.round((g / d) * 100) : null, stock: st.reduce((a, x) => a + x.stock, 0), n: st.length }; });
    const act = [["Prescriptions handed over", handed, "dispense"], ["Refills given", cnt("handover") - today.filter((m) => m.kind === "handover" && !/refill/.test(m.note || "")).length, "outpatients"], ["Doses given on wards", cnt("administer"), "inpatients"], ["Vaccine doses given", cnt("vaccinate"), "epi"], ["Lines issued to wards", cnt("issue"), "store"], ["Lines received", cnt("receive"), "store"]];
    const actMax = Math.max(1, ...act.map((a) => a[1]));

    return html`<div className="dash">
      <div className="dash-kpis">
        <${Tile} icon="pill" label="OPD queue" value=${waiting.length} sub=${waiting.length ? "longest wait " + P.ago(waiting[0].since) : "nobody waiting"} tone=${waiting.length > 4 ? "warn" : ""} go=${{ to: "dispense" }} />
        <${Tile} icon="package" label="Stock" value=${out.length + low.length} sub=${out.length + " out · " + low.length + " under a month"} tone=${out.length ? "bad" : low.length ? "warn" : "ok"} go=${{ to: "medicines", filter: out.length ? "out" : "low" }} />
        <${Tile} icon="clock" label="Expiring ≤ 90 days" value=${expiring.length} sub=${expiring.length ? "batches to use first" : "nothing close"} tone=${expiring.length ? "warn" : "ok"} go=${{ to: "medicines", filter: "expiring" }} />
        <${Tile} icon="bed" label="Inpatients" value=${ipStock} sub=${"doses not given: no stock · " + ipDue + " due now"} tone=${ipStock ? "bad" : "ok"} go=${{ to: "inpatients" }} />
        <${Tile} icon="history" label="Refills" value=${refOver} sub=${"missed · " + refDue + " due within 5 days"} tone=${refOver ? "bad" : refDue ? "warn" : "ok"} go=${{ to: "outpatients" }} />
        <${Tile} icon="snow" label="Cold chain" value=${outNow ? outNow + " out" : "In range"} sub=${coldOpen ? coldOpen + " excursions to act on" : fr.length + " fridges, all fine"} tone=${outNow ? "bad" : coldOpen ? "warn" : "ok"} go=${{ to: "store", tab: "cold" }} />
        <${Tile} icon="syringe" label="Vaccines to refill" value=${vxRefill} sub=${epiDue + " clients due at EPI · " + epiDef + " defaulters"} tone=${vxRefill ? "warn" : ""} go=${{ to: "epi" }} />
      </div>

      <div className="dash-main">
        <div className="card dash-work">
          <div className="dash-h"><h2>Your work</h2><span className="muted small">${mine.length} for ${P.ROLES[db.settings.role].toLowerCase()} · in the order to do it</span>
            <span className="grow"></span><${P.Btn} size="sm" kind="navy" icon="plus" onClick=${() => P.open("start")}>Start<//><${P.Btn} size="sm" icon="scan" onClick=${() => P.open("find", { scan: true })}>Scan<//></div>
          ${mine.length ? html`<div className="dw-list">${(showAll ? mine : mine.slice(0, 6)).map((it, i) => html`<div key=${it.k + i} className=${P.cx("dw", i === 0 && "next")}>
              <span className="dw-ic"><${P.Icon} n=${it.icon} s=${17} /></span>
              <div className="dw-t">${i === 0 ? html`<span className="nextword">Next up</span>` : null}<b>${it.title}</b><span>${it.meta}</span></div>
              <${P.Btn} size="sm" kind=${i === 0 ? "primary" : "outline"} onClick=${() => (it.run ? it.run() : P.go(it.go))}>${it.act}<//></div>`)}</div>`
            : html`<${P.Empty} title="Nothing waiting for you">New work appears here as it comes in.<//>`}
          <div className="row" style=${{ gap: "4px 16px" }}>
            ${mine.length > 6 ? html`<button type="button" className="dw-more" onClick=${() => setShowAll(!showAll)}>${showAll ? "Show the first 6" : "Show all " + mine.length}<//>` : null}
            ${others.length ? html`<button type="button" className="dw-more" onClick=${() => setShowOthers(!showOthers)}>${showOthers ? "Hide" : "Show"} ${others.length} for other roles on shift<//>` : null}
          </div>
          ${showOthers ? html`<div className="dw-list minor">${others.map((it, i) => html`<div key=${"o" + it.k + i} className="dw"><span className="dw-ic"><${P.Icon} n=${it.icon} s=${17} /></span><div className="dw-t"><b>${it.title}</b><span>${it.meta}</span></div><${P.Btn} size="sm" kind="ghost" onClick=${() => (it.run ? it.run() : P.go(it.go))}>${it.act}<//></div>`)}</div>` : null}
        </div>
        <div className="dash-side">
          <div className="card pad stack-s">
            <div className="dash-h"><h3>OPD queue</h3><span className="grow"></span><button type="button" className="clslink" onClick=${() => P.go({ to: "dispense" })}>Open</button></div>
            ${waiting.length ? waiting.slice(0, 6).map((r) => { const mins = Math.round((P.now() - r.since) / 60e3); return html`<${MeterRow} key=${r.id} label=${r.patient} sub=${r.from + " · " + r.lines.length + " items"} pct=${(mins / 30) * 100} value=${mins + " min"} tone=${mins > 20 ? "bad" : mins > 10 ? "warn" : ""} go=${{ to: "dispense", tab: "waiting", rx: r.id }} />`; }) : html`<p className="muted small">Nobody waiting.</p>`}
          </div>
          <div className="card pad stack-s">
            <div className="dash-h"><h3>Today so far</h3><span className="muted small">since 00:00</span></div>
            ${act.map(([l, v, to]) => html`<${MeterRow} key=${l} label=${l} pct=${(v / actMax) * 100} value=${v} go=${{ to }} />`)}
          </div>
        </div>
      </div>

      <div className="dash-row">
        <div className="card pad stack-s">
          <div className="dash-h"><h3>Stock watch</h3><span className="muted small">months of stock left, lowest first</span><span className="grow"></span><button type="button" className="clslink" onClick=${() => P.go({ to: "store", tab: "order" })}>Order</button></div>
          ${stockWatch.map(({ m, mo }) => html`<${MeterRow} key=${m.id} label=${m.name} sub=${P.q(P.medTotal(m.id), m.id)} pct=${(mo / 3) * 100} value=${P.monthsWord(m.id)} tone=${mo === 0 ? "bad" : mo < 1 ? "warn" : ""} go=${{ to: "medicines", med: m.id }} />`)}
        </div>
        <div className="card pad stack-s">
          <div className="dash-h"><h3>Cold chain now</h3><span className="grow"></span><button type="button" className="clslink" onClick=${() => P.go({ to: "store", tab: "cold" })}>Open</button></div>
          ${fr.map((f) => { const v = P.temp(f, P.now()), st = P.coldStatus(v); return html`<button type="button" key=${f.id} className="cold-row" onClick=${() => P.go({ to: "store", tab: "cold", fridge: f.id })}>
            <span className="mrow-l"><b>${f.name}</b><span>${f.no} · 24 h trend</span></span><${Spark} f=${f} /><span className=${P.cx("mrow-v", st !== "ok" && "bad")}>${(v > 0 ? "+" : "") + v.toFixed(1)} °C</span></button>`; })}
          <p className="hint">Shaded band: 2–8 °C. Sensor values are simulated.</p>
        </div>
        <div className="card pad stack-s">
          <div className="dash-h"><h3>Wards</h3><span className="muted small">due doses given</span><span className="grow"></span><button type="button" className="clslink" onClick=${() => P.go({ to: "inpatients" })}>Open</button></div>
          ${wards.map((x) => html`<${MeterRow} key=${x.w.id} label=${x.w.short} sub=${x.n + " patients" + (x.stock ? " · " + x.stock + " not given: no stock" : "")} pct=${x.pct || 0} value=${x.pct == null ? "—" : x.pct + "%"} tone=${x.pct != null && x.pct < 80 ? "warn" : ""} go=${{ to: "inpatients", ward: x.w.id }} />`)}
          <div className="dash-h" style=${{ marginTop: "6px" }}><h3>Expiring soon</h3></div>
          ${expiring.length ? expiring.slice(0, 4).map((b) => html`<${MeterRow} key=${b.id} label=${P.med(b.med).name} sub=${b.no + " · " + P.q(P.batchTotal(b.id), b.med)} pct=${(P.monthsTo(b.exp) / 3) * 100} value=${P.expWord(b.exp)} tone="warn" go=${{ to: "medicines", med: b.med, batch: b.id }} />`) : html`<p className="muted small">Nothing within 90 days.</p>`}
        </div>
      </div>
    </div>`;
  };
})();
