"use client";

/** Get ready (S7, S22): the launch pipeline, what to do next, every clinic's checks, hospital basics; open/pause. */
import type { Ctx } from "./shared";
import type { Band, Check, Clinic, Status } from "@/lib/clinics-schedule/model";
import { useState } from "react";

import { BANDS_SOURCE } from "@/content/clinics-schedule/bands";
import { CS } from "@/content/clinics-schedule/copy";
import { LEVEL_TEMPLATES, TEMPLATES_STATUS } from "@/content/clinics-schedule/templates";
import { fill } from "@/content/lab-workspace-v2";
import {
  BANDS,
  clashes,
  clashPairs,
  edit,
  needsOffice,
  placesAWeek,
  sessionsOf,
  templateEdits,
} from "@/lib/clinics-schedule/model";
import { dateTxt, DeskDialog, feeTxt, hm, Icon, k, nextOn, OffTetherNote, Txt } from "./shared";

export interface Todo {
  key: string;
  cls: "no" | "warn" | "go";
  icon: string;
  title: string;
  sub: string;
  btn: string;
  go: () => void;
}

const whyOf = (ctx: Ctx, c: Clinic, ch: Check) =>
  ch.k === "people"
    ? fill(CS.ready.why.people, { days: (ch.detail ?? []).map((d) => CS.days[d - 1]).join(", ") })
    : CS.ready.why[ch.k];

/** Where a failed check is fixed: the clinic's editor tab, or the Hub for a department. */
export function fixCheck(ctx: Ctx, c: Clinic, ch: Check) {
  if (ch.k === "dept") return window.open("/hospital-admin/services", "_self");
  const tab = {
    sessions: "sessions",
    people: "sessions",
    fee: "fee",
    desk: "desks",
    screen: "desks",
    words: "basics",
  }[ch.k];
  ctx.go("clinics", `${c.id}#${tab}`);
}

/** "Do next": clashes, stuck clinics, offline devices, offices, ready clinics, unpublished drafts. */
export function todoList(ctx: Ctx): Todo[] {
  const { view } = ctx;
  const out: Todo[] = [];
  for (const p of clashPairs(clashes(view))) {
    const a = view.clinics[p.a];
    const b = view.clinics[p.b];
    const what = p.rooms.length && p.people.length ? "both" : p.rooms.length ? "room" : "person";
    out.push({
      key: `clash-${p.a}-${p.b}`,
      cls: "no",
      icon: "alert",
      title: fill(CS.ready.todo.clash, {
        a: a?.shortName || a?.name || "",
        b: b?.shortName || b?.name || "",
        days: p.days.map((d) => CS.days[d - 1]).join(", "),
      }),
      sub: fill(CS.ready.todo.clashSub, {
        what: CS.week.what[what],
        time: `${hm(p.start)}–${hm(p.end)}`,
      }),
      btn: CS.ready.todo.clashBtn,
      go: () => ctx.go("week"),
    });
  }
  for (const c of Object.values(view.clinics)) {
    const r = ctx.rd(c.id);
    if (r.status !== "setup") continue;
    const b = r.blockers[0];
    if (!b) continue;
    const [tt, tb] = {
      sessions: [CS.ready.todo.ses, CS.ready.todo.btnSes],
      people: [CS.ready.todo.doc, CS.ready.todo.btnDoc],
      fee: [CS.ready.todo.fee, CS.ready.todo.btnFee],
      desk: [CS.ready.todo.desk, CS.ready.todo.btnDesk],
      dept: [CS.ready.todo.dept, CS.ready.todo.btnDept],
      screen: [CS.ready.todo.desk, CS.ready.todo.btnDesk],
      words: [CS.ready.todo.doc, CS.ready.todo.btnDoc],
    }[b.k] as [string, string];
    out.push({
      key: `fix-${c.id}`,
      cls: "warn",
      icon: "tick",
      title: fill(tt, { name: c.name, why: whyOf(ctx, c, b) }),
      sub:
        r.blockers.length === 1
          ? CS.ready.todo.only
          : fill(CS.ready.todo.moreBlockers, { n: r.blockers.length - 1 }),
      btn: tb,
      go: () => fixCheck(ctx, c, b),
    });
  }
  for (const d of Object.values(view.devices).filter((x) => !x.online && x.lastSeen))
    out.push({
      key: `off-${d.id}`,
      cls: "warn",
      icon: "nav",
      title: fill(CS.ready.todo.off, { name: d.name }),
      sub: fill(CS.ready.todo.offSub, {
        place: d.place,
        seen: fill(CS.devices.seen.ago, { t: d.lastSeen ?? "" }),
      }),
      btn: CS.ready.todo.offBtn,
      go: () => ctx.go("devices", d.id),
    });
  const noOff = Object.values(view.people).filter((p) => needsOffice(p) && !p.officeId).length;
  if (noOff)
    out.push({
      key: "office",
      cls: "warn",
      icon: "person",
      title: fill(CS.ready.todo.office, { n: noOff }),
      sub: CS.ready.todo.officeSub,
      btn: CS.ready.todo.officeBtn,
      go: () => ctx.go("people", "filter:attn"),
    });
  const ready = Object.values(view.clinics).filter((c) => ctx.rd(c.id).status === "ready");
  if (ready.length)
    out.push({
      key: "ready",
      cls: "go",
      icon: "tick",
      title: fill(CS.ready.todo.ready, { n: ready.length }),
      sub: fill(CS.ready.todo.readySub, {
        p: ready.reduce((n, c) => n + placesAWeek(view, c.id), 0),
      }),
      btn: CS.ready.todo.readyBtn,
      go: () => ctx.modal({ k: "openAll" }),
    });
  if (ctx.drafts.length)
    out.push({
      key: "drafts",
      cls: "go",
      icon: "swap",
      title: fill(CS.ready.todo.drafts, { n: ctx.drafts.length }),
      sub: CS.ready.todo.draftsSub,
      btn: CS.ready.todo.draftsBtn,
      go: () => ctx.modal({ k: "publish" }),
    });
  return out;
}

/** The next date any of the clinic's sessions runs. */
export function firstDay(ctx: Ctx, id: string): string | null {
  const ds = sessionsOf(ctx.view, id).map((x) => nextOn(ctx.d.today, x.weekday));
  return ds.sort()[0] ?? null;
}

type Tab = "all" | Status;

export function ReadyView({ ctx }: { ctx: Ctx }) {
  const { view, d } = ctx;
  const [tab, setTab] = useState<Tab>("all");
  const all = Object.values(view.clinics).sort((a, b) => a.name.localeCompare(b.name));
  const by = (s: Status) => all.filter((c) => ctx.rd(c.id).status === s);
  const pw = (list: Clinic[]) => list.reduce((n, c) => n + placesAWeek(view, c.id), 0);
  const live = by("live");
  const ready = by("ready");
  const setup = by("setup");
  const kids = by("kids");
  const total = all.length - kids.length;
  const capAll = pw(live) + pw(ready) + pw(setup) || 1;
  const todo = todoList(ctx);
  const rows = tab === "all" ? all : by(tab);
  const hosp: [string, string, boolean][] = [
    [CS.ready.basicsRows.name[0], CS.ready.basicsRows.name[1], !!d.hospitalName],
    d.hours
      ? [
          CS.ready.basicsRows.hours[0],
          fill(CS.ready.basicsRows.hours[1], { open: hm(d.hours.open), close: hm(d.hours.close) }),
          true,
        ]
      : [CS.ready.basicsRows.hoursUnset[0], CS.ready.basicsRows.hoursUnset[1], false],
    [CS.ready.basicsRows.momo[0], CS.ready.basicsRows.momo[1], false],
    [CS.ready.basicsRows.sms[0], CS.ready.basicsRows.sms[1], false],
    [CS.ready.basicsRows.privacy[0], CS.ready.basicsRows.privacy[1], true],
  ];
  const stages: [Status, Clinic[], string][] = [
    ["setup", setup, CS.ready.stageSub.setup],
    ["ready", ready, fill(CS.ready.stageSub.ready, { p: pw(ready) })],
    ["live", live, fill(CS.ready.stageSub.live, { p: pw(live) })],
  ];

  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{CS.ready.title}</h1>
            <span className={k("adate")}>{fill(CS.ready.sub, { live: live.length, total })}</span>
          </div>
          <span className={k("grow")} />
          <button
            type="button"
            className={k("btn", "sm")}
            onClick={() => ctx.modal({ k: "tpl" })}
            data-tour="wt-tpl"
          >
            {CS.ready.template}
          </button>
          {ready.length ? (
            <button
              type="button"
              className={k("btn", "k")}
              onClick={() => ctx.modal({ k: "openAll" })}
              data-tour="wt-openall"
            >
              {ready.length === 1 ? CS.ready.openOne : fill(CS.ready.openAll, { n: ready.length })}
            </button>
          ) : null}
        </div>
        <OffTetherNote ctx={ctx} />

        <div className={k("su-hero")}>
          <div className={k("su-card", "su-pipe")}>
            <div className={k("su-ch")}>
              <b>{CS.ready.pipeTitle}</b>
              <small>{CS.ready.pipeSub}</small>
            </div>
            <div className={k("su-stages")} data-tour="wt-stages">
              {stages.map(([s, list, subT]) => (
                <button
                  key={s}
                  type="button"
                  className={k("su-stage", s, tab === s && "on")}
                  aria-pressed={tab === s}
                  onClick={() => setTab(tab === s ? "all" : s)}
                >
                  <span className={k("su-sl")}>
                    <i className={k("su-sdot")} aria-hidden="true" />
                    {CS.ready.stages[s as "setup"]}
                  </span>
                  <b>{list.length}</b>
                  <small>{subT}</small>
                </button>
              ))}
            </div>
            <div className={k("su-cap")}>
              <span className={k("cap")}>{CS.ready.capTitle}</span>
              <div className={k("su-capb")} aria-hidden="true">
                {(["live", "ready", "setup"] as const).map((s) => (
                  <i
                    key={s}
                    className={k(s)}
                    style={{ width: `${(pw(by(s)) / capAll) * 100}%` }}
                    title={CS.ready.stages[s]}
                  />
                ))}
              </div>
              <small>{fill(CS.ready.capTxt, { now: pw(live), then: pw(live) + pw(ready) })}</small>
            </div>
            <div className={k("su-pfoot")}>
              {kids.length ? (
                <span>
                  <i className={k("kids")} />
                  {fill(kids.length === 1 ? CS.ready.kids : CS.ready.kidsN, { n: kids.length })}
                </span>
              ) : null}
              <span>
                <i />
                {CS.ready.flow}
              </span>
            </div>
          </div>

          <div className={k("su-card", "su-todo")} data-tour="wt-launch-todo">
            <div className={k("su-ch")}>
              <b>{CS.ready.doNext}</b>
              {todo.length > 5 ? (
                <small>{fill(CS.ready.more, { n: todo.length - 5 })}</small>
              ) : null}
            </div>
            {todo.slice(0, 5).map((t, i) => (
              <div key={t.key} className={k("su-td", t.cls, i === 0 && "first")}>
                <span className={k("su-tdi")} aria-hidden="true">
                  <Icon n={t.icon} size={16} />
                </span>
                <span className={k("su-tdt")}>
                  <b>{t.title}</b>
                  <small>{t.sub}</small>
                </span>
                <button type="button" className={k("btn", "sm")} onClick={t.go}>
                  {t.btn}
                </button>
              </div>
            ))}
            {!todo.length ? <p className={k("su-none")}>{CS.ready.nothing}</p> : null}
          </div>
        </div>

        <div className={k("su-grid")}>
          <div className={k("su-card")}>
            <div
              className={k("ttabs")}
              role="tablist"
              aria-label={CS.ready.pipeTitle}
              data-tour="wt-ltabs"
            >
              {(["all", "setup", "ready", "live", "kids"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={k(tab === t && "on")}
                  onClick={() => setTab(t)}
                >
                  {CS.ready.tabs[t]} <b>{t === "all" ? all.length : by(t).length}</b>
                </button>
              ))}
            </div>
            <div className={k("su-scroll")}>
              <div className={k("su-rl")} role="list">
                {rows.map((c) => (
                  <ReadyRow key={c.id} ctx={ctx} c={c} />
                ))}
                {!rows.length ? <p className={k("su-none")}>{CS.ready.none}</p> : null}
              </div>
            </div>
          </div>

          <aside className={k("su-card", "su-hosp")}>
            <div className={k("su-ch")}>
              <b>{CS.ready.basics}</b>
              <small>
                {fill(CS.ready.basicsSub, { n: hosp.filter((h) => h[2]).length, m: hosp.length })}
              </small>
            </div>
            {hosp.map(([label, subT, ok]) => (
              <div key={label} className={k("su-hi", ok ? "ok" : "warn")}>
                <span className={k("su-hic")} aria-hidden="true">
                  {ok ? "✓" : "!"}
                </span>
                <span className={k("su-hit")}>
                  <b>{label}</b>
                  <small>{subT}</small>
                </span>
              </div>
            ))}
            <button
              type="button"
              className={k("su-hi", "ok")}
              onClick={() => ctx.modal({ k: "bands" })}
            >
              <span className={k("su-hic")} aria-hidden="true">
                ✓
              </span>
              <span className={k("su-hit")}>
                <b>{CS.ready.bands}</b>
                <small>{CS.ready.bandsSub}</small>
              </span>
            </button>
            <p className={k("su-foot")}>{CS.ready.foot}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ReadyRow({ ctx, c }: { ctx: Ctx; c: Clinic }) {
  const r = ctx.rd(c.id);
  const fd = firstDay(ctx, c.id);
  const miss = r.checks.filter((x) => !x.ok);
  return (
    <div className={k("su-rr")} role="listitem" data-tour="wt-lrow">
      <button type="button" className={k("su-ln")} onClick={() => ctx.go("clinics", c.id)}>
        <span>
          <i style={{ background: c.colour }} />
          {c.name}
        </span>
        <small>{ctx.d.departments[c.departmentId]?.name}</small>
      </button>
      <span className={k("su-meter")} title={CS.ready.checks.sessions}>
        <span className={k("su-segs")}>
          {r.checks.map((x) => (
            <i
              key={x.k}
              className={k(x.ok ? "ok" : x.block ? "no" : "warn")}
              title={CS.ready.checks[x.k]}
            />
          ))}
        </span>
        <small>
          {r.checks.filter((x) => x.ok).length}/{r.checks.length}
        </small>
      </span>
      <span className={k("su-miss")}>
        {miss.map((x) => (
          <button
            key={x.k}
            type="button"
            className={k("su-mc", x.block ? "no" : "warn")}
            onClick={() => fixCheck(ctx, c, x)}
            title={whyOf(ctx, c, x)}
          >
            {CS.ready.checks[x.k]}
          </button>
        ))}
        {!miss.length ? <small className={k("su-allok")}>{CS.ready.allSet}</small> : null}
      </span>
      <span className={k("su-rn2")}>
        <b>{placesAWeek(ctx.view, c.id)}</b>
        <small>{CS.ready.aWeek}</small>
      </span>
      <span className={k("su-rn2")}>
        <b>{fd ? dateTxt(fd).slice(0, -4) : "—"}</b>
        <small>{CS.ready.firstDay}</small>
      </span>
      <span className={k("su-st", r.status)}>
        {c.paused ? CS.ed.pausedFoot.split(" · ")[0] : CS.ready.status[r.status]}
      </span>
      <span className={k("su-la")}>
        {r.status === "setup" ? (
          <button
            type="button"
            className={k("btn", "sm")}
            onClick={() => r.blockers[0] && fixCheck(ctx, c, r.blockers[0])}
          >
            {CS.ready.fix}
          </button>
        ) : null}
        {r.status === "ready" ? (
          <button
            type="button"
            className={k("btn", "sm", "su-okb")}
            onClick={() => ctx.modal({ k: "open", id: c.id })}
          >
            {CS.ready.open}
          </button>
        ) : null}
        {r.status === "live" && !c.paused ? (
          <button
            type="button"
            className={k("btn", "sm", "q")}
            onClick={() => ctx.modal({ k: "pause", id: c.id })}
          >
            {CS.ready.pause}
          </button>
        ) : null}
        {r.status === "kids" ? <span className={k("su-kidtxt")}>{CS.ready.deskOnly}</span> : null}
      </span>
    </div>
  );
}

const Swatch = ({ colour }: { colour: string }) => (
  <span className={k("su-sw", "lg")} style={{ background: colour }} aria-hidden="true" />
);

export function OpenDialog({ ctx, id, close }: { ctx: Ctx; id: string; close: () => void }) {
  const c = ctx.view.clinics[id];
  if (!c) return null;
  const r = ctx.rd(id);
  const fd = firstDay(ctx, id);
  const desks = Object.values(ctx.view.devices).filter(
    (d) => d.kind === "desk" && d.clinicIds.includes(id),
  );
  const ahead = CS.ed.ahead.find(([n]) => n === c.rules.aheadDays)?.[1] ?? `${c.rules.aheadDays}`;
  const warn = r.checks.filter((x) => !x.ok && !x.block);
  const go = () => {
    ctx.commit(
      fill(CS.open.change, { name: c.name }),
      [edit(ctx.view, "clinics", id, { ...c, live: true, paused: false })],
      fill(CS.open.change, { name: c.name }),
    );
    close();
  };
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.open.go}
      tile="tick"
      mark={<Swatch colour={c.colour} />}
      title={fill(CS.open.title, { name: c.name })}
      lead={CS.open.sub}
    >
      <div className={k("sumrows", "su-sum2")}>
        {(
          [
            [CS.open.rows.can, fill(CS.open.rows.ahead, { d: ahead })],
            [CS.open.rows.first, fd ? dateTxt(fd) : "—"],
            [CS.open.rows.places, String(placesAWeek(ctx.view, id))],
            [CS.open.rows.fee, feeTxt(c, ctx.view).t],
            [CS.open.rows.desk, desks.map((d) => d.name).join(", ") || "—"],
          ] as const
        ).map(([a, b]) => (
          <div key={a}>
            <span>{a}</span>
            <b>{b}</b>
          </div>
        ))}
      </div>
      {warn.length ? (
        <div className={k("su-info")}>
          <b>{CS.open.warn}</b>
          {warn.map((w) => (
            <span key={w.k}>{CS.ready.why[w.k]}</span>
          ))}
        </div>
      ) : null}
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          onClick={go}
          disabled={r.blockers.length > 0}
        >
          {CS.open.go}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.open.later}
        </button>
      </div>
    </DeskDialog>
  );
}

export function PauseDialog({
  ctx,
  id,
  close,
  pause,
}: {
  ctx: Ctx;
  id: string;
  close: () => void;
  pause: (id: string) => void;
}) {
  const c = ctx.view.clinics[id];
  if (!c) return null;
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.pause.go}
      tile="clock"
      mark={<Swatch colour={c.colour} />}
      title={fill(CS.pause.title, { name: c.name })}
      lead={CS.pause.sub}
    >
      <p className={k("note")}>{CS.pause.body}</p>
      <div className={k("mf")}>
        <button type="button" className={k("btn")} onClick={() => pause(id)}>
          {CS.pause.go}
        </button>
        <button type="button" className={k("btn", "q")} onClick={close}>
          {CS.pause.keep}
        </button>
      </div>
    </DeskDialog>
  );
}

export function OpenAllDialog({ ctx, close }: { ctx: Ctx; close: () => void }) {
  const ready = Object.values(ctx.view.clinics).filter((c) => ctx.rd(c.id).status === "ready");
  const go = () => {
    const t = fill(CS.open.changeN, { n: ready.length });
    ctx.commit(
      t,
      ready.map((c) => edit(ctx.view, "clinics", c.id, { ...c, live: true, paused: false })),
      t,
    );
    close();
  };
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.open.allGo}
      tile="tick"
      title={fill(CS.open.allTitle, { n: ready.length })}
      lead={CS.open.allSub}
    >
      <div className={k("su-rn")}>
        {ready.map((c) => (
          <em key={c.id}>
            <i style={{ background: c.colour }} />
            {c.name}
          </em>
        ))}
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} onClick={go} disabled={!ready.length}>
          {CS.open.allGo}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.open.later}
        </button>
      </div>
    </DeskDialog>
  );
}

const pattern = (days: readonly number[], start: number, end: number) =>
  `${days.length === 5 && days.every((d, i) => d === i + 1) ? `${CS.days[0]}–${CS.days[4]}` : days.map((d) => CS.days[d - 1]).join(", ")} · ${hm(start)}–${hm(end)}`;

export function TplDialog({ ctx, close }: { ctx: Ctx; close: () => void }) {
  const [level, setLevel] = useState(
    LEVEL_TEMPLATES.find((l) => l.level === ctx.d.level)?.level ?? LEVEL_TEMPLATES[0].level,
  );
  const t = LEVEL_TEMPLATES.find((l) => l.level === level)!;
  const clinics = Object.values(ctx.view.clinics);
  const fills = (rows: typeof t.rows) =>
    clinics.filter(
      (c) => rows.some((r) => r.code === c.code) && !sessionsOf(ctx.view, c.id).length,
    );
  const n = fills(t.rows).length;
  const rows = clinics.filter((c) => t.rows.some((r) => r.code === c.code));
  const go = () => {
    const edits = templateEdits(ctx.view, t.rows, ctx.newId);
    ctx.commit(fill(CS.tpl.change, { n }), edits, fill(CS.tpl.done, { n }));
    close();
  };
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.tpl.title}
      tile="calendar"
      title={CS.tpl.title}
      lead={CS.tpl.sub}
      cls={k("su-m", "md")}
    >
      <div className={k("su-tlv")}>
        {LEVEL_TEMPLATES.map((l) => (
          <button
            key={l.level}
            type="button"
            className={k(level === l.level && "on")}
            aria-pressed={level === l.level}
            onClick={() => setLevel(l.level)}
          >
            <b>{l.title}</b>
            <small>{l.sub}</small>
            <em>{fill(CS.tpl.fill, { n: fills(l.rows).length })}</em>
          </button>
        ))}
      </div>
      <div className={k("su-info")}>
        <span>{n ? fill(n === 1 ? CS.tpl.fill1 : CS.tpl.fill, { n }) : CS.tpl.none}</span>
        {TEMPLATES_STATUS.status !== "signed" ? <span>{CS.tpl.draftNote}</span> : null}
      </div>
      <div className={k("su-tpl")}>
        {rows.map((c) => {
          const r = t.rows.find((x) => x.code === c.code)!;
          const on = !sessionsOf(ctx.view, c.id).length;
          return (
            <div key={c.id} className={k("su-tplr", on && "on")}>
              <i style={{ background: c.colour }} />
              <b>{c.name}</b>
              <span>{pattern(r.days, r.start, r.end)}</span>
              <em>{on ? CS.tpl.fills : CS.tpl.keeps}</em>
            </div>
          );
        })}
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} onClick={go} disabled={!n}>
          {n === 1 ? CS.tpl.fill1 : fill(CS.tpl.fill, { n })}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}

/** CS9: the hospital's bands; a change is a draft a second admin publishes. */
export function BandsDialog({ ctx, close }: { ctx: Ctx; close: () => void }) {
  const people = Object.values(ctx.view.people);
  const set = (b: Band, kind: "general" | "private", v: string) => {
    const cur = ctx.view.bands[b] ?? { id: b, general: 0, private: 0 };
    const fee = Number(v || 0);
    ctx.commit(
      fill(CS.bands.changed, {
        band: CS.bands.labels[b],
        kind: kind === "general" ? CS.ed.bandCols.gen : CS.ed.bandCols.priv,
        fee: fee.toLocaleString("en-US"),
      }),
      [edit(ctx.view, "bands", b, { ...cur, [kind]: fee, approved: false })],
    );
  };
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.bands.title}
      tile="card"
      title={CS.bands.title}
      lead={CS.bands.sub}
      cls={k("su-m", "md")}
    >
      <div className={k("su-gt")}>
        <div className={k("su-gr", "su-gr3", "su-grh")}>
          <span>{CS.ed.bandCols.band}</span>
          <span>{CS.ed.bandCols.gen}</span>
          <span>{CS.ed.bandCols.priv}</span>
        </div>
        {BANDS.map((b) => {
          const v = ctx.view.bands[b];
          const n = people.filter((p) => p.band === b).length;
          return (
            <div key={b} className={k("su-gr", "su-gr3")}>
              <span className={k("su-gl")}>
                <b>{CS.bands.labels[b]}</b>
                <small>
                  {n} · {v?.approved === false ? CS.bands.unapproved : CS.ugx.replace(" {n}", "")}
                </small>
              </span>
              <Txt
                numeric
                className={k("su-gi")}
                value={String(v?.general ?? "")}
                onCommit={(x) => set(b, "general", x)}
                aria-label={`${CS.bands.labels[b]} ${CS.ed.bandCols.gen}`}
              />
              <Txt
                numeric
                className={k("su-gi")}
                value={String(v?.private ?? "")}
                onCommit={(x) => set(b, "private", x)}
                aria-label={`${CS.bands.labels[b]} ${CS.ed.bandCols.priv}`}
              />
            </div>
          );
        })}
      </div>
      <p className={k("su-note")}>{CS.bands.fourEyes}</p>
      <div className={k("su-info")}>
        <b>{CS.bands.where}</b>
        <span>{BANDS_SOURCE}</span>
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} onClick={close}>
          {CS.ed.done}
        </button>
      </div>
    </DeskDialog>
  );
}
