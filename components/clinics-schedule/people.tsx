"use client";

/** People (S20, CS8, D-CS-09): leave requests, who runs what, office, fee band, and what booking cards show. */
import type { Ctx } from "./shared";
import type { Band, LeaveRequest, PeopleFilter, Person } from "@/lib/clinics-schedule/model";
import { useState } from "react";

import { WORKLOAD_THRESHOLD_HOURS } from "@/content/clinics-schedule/bands";
import { CS, CS_ERRORS } from "@/content/clinics-schedule/copy";
import { fill } from "@/content/lab-workspace-v2";
import {
  BANDS,
  cardIdentity,
  daysOf,
  edit,
  isoDow,
  needsOffice,
  peopleFilter,
  personWeek,
  WEEK,
} from "@/lib/clinics-schedule/model";
import { WeekMini } from "./clinics";
import {
  Chip,
  ChipRow,
  dateTxt,
  dayName,
  DeskDialog,
  Field,
  hit,
  Icon,
  k,
  Pav,
  placeName,
  Seg,
  sesTime,
  Toggle,
  ugx,
} from "./shared";

type Group = "grade" | "dept" | "office";

const awaySet = (ctx: Ctx) =>
  new Map(
    Object.values(ctx.view.exceptions)
      .filter((e) => e.type === "away" && e.personId && e.to >= ctx.d.today)
      .map((e) => [e.personId!, e]),
  );

export function PeopleView({ ctx }: { ctx: Ctx }) {
  const { view, d } = ctx;
  const preset = ctx.sel?.startsWith("filter:") ? (ctx.sel.slice(7) as PeopleFilter) : null;
  const [filter, setFilter] = useState<PeopleFilter>(preset ?? "all");
  const [group, setGroup] = useState<Group>("grade");
  const sel = ctx.sel && view.people[ctx.sel] ? view.people[ctx.sel] : null;
  const away = awaySet(ctx);
  const ids = new Set(away.keys());
  const base = Object.values(view.people).filter((p) =>
    hit(ctx.q, p.name, p.role, d.departments[p.departmentId ?? ""]?.name),
  );
  const shown = peopleFilter(view, filter, ids)
    .filter((p) => base.includes(p))
    .sort((a, b) => a.name.localeCompare(b.name));
  const keyOf = (p: Person) =>
    group === "grade"
      ? CS.bands.labels[p.band]
      : group === "dept"
        ? (d.departments[p.departmentId ?? ""]?.name ?? "")
        : placeName(view, p.officeId) || CS.people.noOfficeGroup;
  const order = (g: string) =>
    group === "grade" ? BANDS.findIndex((b) => CS.bands.labels[b] === g) : 0;
  const groups = [...new Set(shown.map(keyOf))]
    .sort((a, b) => order(b) - order(a) || a.localeCompare(b))
    .map((g) => ({ g, rows: shown.filter((p) => keyOf(p) === g) }));
  const leave = Object.values(view.leave).filter((l) => l.status === "new");
  const narrow = !!sel;

  return (
    <div className={k("su-wrap", "su-split")}>
      <div className={k("su-page", "su-l")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{CS.people.title}</h1>
            <span className={k("adate")}>
              {fill(CS.people.sub, { n: Object.keys(view.people).length })}
            </span>
          </div>
          <span className={k("grow")} />
          <button
            type="button"
            className={k("btn", "sm")}
            onClick={() => ctx.modal({ k: "addP" })}
            data-tour="wt-addp"
          >
            {CS.people.add}
          </button>
        </div>

        {leave.length ? (
          <div className={k("su-card", "su-lr")} data-tour="wt-lr">
            <div className={k("su-ch")}>
              <b>
                {CS.people.leave} · {leave.length}
              </b>
              <small>{CS.people.leaveSub}</small>
            </div>
            {leave.map((l) => (
              <LeaveRow key={l.id} ctx={ctx} l={l} />
            ))}
          </div>
        ) : null}

        <div className={k("su-ctb", narrow && "narrow")}>
          <div className={k("su-cfs")} role="group" aria-label={CS.people.title}>
            {(["all", "attn", "away", "none", "hidden"] as PeopleFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={k(filter === f && "on", f === "attn" && "warn")}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {CS.people.filters[f]}
                <b>{peopleFilter(view, f, ids).filter((p) => base.includes(p)).length}</b>
              </button>
            ))}
          </div>
          <span className={k("su-grow")} />
          <span className={k("su-cgl")}>{CS.people.groupBy}</span>
          <Seg
            opts={(["grade", "dept", "office"] as Group[]).map(
              (g) => [g, CS.people.groups[g]] as const,
            )}
            value={group}
            onPick={setGroup}
            label={CS.people.groupBy}
          />
        </div>

        <div className={k("su-cls", "su-pls", narrow && "narrow")}>
          {groups.map(({ g, rows }) => (
            <section key={g} className={k("su-cgp")}>
              <div className={k("su-cgh")}>
                <b>{g}</b>
                <small>{rows.length}</small>
              </div>
              <div className={k("su-card", "su-cgc")}>
                {rows.map((p) => (
                  <PersonRow
                    key={p.id}
                    ctx={ctx}
                    p={p}
                    on={sel?.id === p.id}
                    away={away.get(p.id)?.from}
                  />
                ))}
              </div>
            </section>
          ))}
          {!groups.length ? (
            <div className={k("empty")}>
              <b>{CS.people.none}</b>
              <span>{CS.clinics.noneSub}</span>
            </div>
          ) : null}
        </div>
      </div>
      {sel ? <PersonPanel key={sel.id} ctx={ctx} p={sel} away={away.get(sel.id)} /> : null}
    </div>
  );
}

function LeaveRow({ ctx, l }: { ctx: Ctx; l: LeaveRequest }) {
  const { view, d } = ctx;
  const p = view.people[l.personId];
  const dows = new Set(daysOf(l.from, l.to).map(isoDow));
  const ses = Object.values(view.sessions).filter(
    (s) => s.personIds.includes(l.personId) && dows.has(s.weekday),
  );
  const clinics = [
    ...new Set(
      ses.map((s) => view.clinics[s.clinicId]?.shortName || view.clinics[s.clinicId]?.name),
    ),
  ];
  const booked = ses.reduce((n, s) => n + (d.booked[s.id] ?? 0), 0);
  const cover = Object.values(view.people).find(
    (o) =>
      o.id !== l.personId &&
      o.band === p?.band &&
      Object.values(view.clinics).some((c) => c.team.includes(o.id) && c.team.includes(l.personId)),
  );
  const dates = l.from === l.to ? dateTxt(l.from) : `${dateTxt(l.from)} – ${dateTxt(l.to)}`;
  return (
    <div className={k("su-lri")}>
      <Pav p={p} />
      <span className={k("su-cn")}>
        <b>{fill(CS.people.leaveLine, { who: p?.name ?? "", dates })}</b>
        <small>{fill(CS.people.leaveWhy, { why: l.reason, sent: dateTxt(l.sentAt) })}</small>
      </span>
      <span className={k("su-cn")}>
        <b className={k("su-lrimp")}>
          {fill(CS.people.leaveImpact, { s: ses.length, c: clinics.join(", ") || "—", b: booked })}
        </b>
        <small className={k(!cover && "warn")}>
          {cover ? fill(CS.people.canCover, { name: cover.name }) : CS.people.noCover}
        </small>
      </span>
      <span className={k("su-hola")}>
        <button
          type="button"
          className={k("btn", "sm", "k")}
          onClick={() => ctx.modal({ k: "cx", type: "away", personId: l.personId, leaveId: l.id })}
        >
          {CS.people.approve}
        </button>
        <button
          type="button"
          className={k("btn", "sm", "q")}
          onClick={() =>
            ctx.commit(
              fill(CS.people.declined, { who: p?.name ?? "" }),
              [edit(view, "leave", l.id, { ...l, status: "declined" })],
              fill(CS.people.declined, { who: p?.name ?? "" }),
            )
          }
        >
          {CS.people.decline}
        </button>
      </span>
    </div>
  );
}

const cardState = (p: Person) => {
  const id = cardIdentity(p);
  return id.name && id.photo
    ? (["ok", CS.people.seeName] as const)
    : id.name
      ? (["half", CS.people.seeNameOnly] as const)
      : (["off", CS.people.seeHidden] as const);
};

function PersonRow({ ctx, p, on, away }: { ctx: Ctx; p: Person; on: boolean; away?: string }) {
  const { view, d } = ctx;
  const w = personWeek(view, p.id);
  const clinics = [...new Set(w.sessions.map((s) => s.clinicId))].flatMap(
    (id) => view.clinics[id] ?? [],
  );
  const band = view.bands[p.band];
  const [cls, label] = cardState(p);
  return (
    <button
      type="button"
      className={k("su-pr2", on && "sel")}
      onClick={() => ctx.setSel(on ? null : p.id)}
      aria-pressed={on}
    >
      <Pav p={p} />
      <span className={k("su-cn")}>
        <b>
          {p.name}
          {away ? (
            <em className={k("su-wtag")}>{fill(CS.people.away, { d: dateTxt(away) })}</em>
          ) : null}
          {w.double.length ? <em className={k("su-wtag")}>{CS.people.double}</em> : null}
        </b>
        <small>
          {p.role} · {d.departments[p.departmentId ?? ""]?.name}
        </small>
        {needsOffice(p) || p.officeId ? (
          <small className={k("su-poff")}>
            {p.officeId ? (
              <span>{placeName(view, p.officeId)}</span>
            ) : (
              <span className={k("su-nooff2")}>{CS.people.noOffice}</span>
            )}
          </small>
        ) : null}
      </span>
      <WeekMini ids={w.sessions} colour="var(--ink3)" aria={CS.people.panel.week} />
      <span className={k("su-pcl2")}>
        {clinics.slice(0, 2).map((c) => (
          <em key={c.id}>
            <i style={{ background: c.colour }} />
            {c.shortName || c.name}
          </em>
        ))}
        {clinics.length > 2 ? <em>+{clinics.length - 2}</em> : null}
        {!clinics.length ? <small>{CS.people.notOn}</small> : null}
      </span>
      <span
        className={k("su-pld")}
        aria-label={fill(CS.people.loadAria, { h: Math.round(w.hours) })}
      >
        <b>{fill(CS.people.hours, { h: Math.round(w.hours) })}</b>
        <span className={k("su-plm")}>
          <i
            className={k(w.hours > WORKLOAD_THRESHOLD_HOURS && "hi")}
            style={{ width: `${Math.min(100, (w.hours / 40) * 100)}%` }}
          />
        </span>
        <small>{w.sessions.length}</small>
      </span>
      <span className={k("su-cfee")} title={CS.people.feeLine}>
        <b>
          {band
            ? `${(band.general / 1000).toFixed(0)}k · ${(band.private / 1000).toFixed(0)}k`
            : "—"}
        </b>
        <small>{CS.bands.labels[p.band]}</small>
      </span>
      <span className={k("su-card2", cls)}>{label}</span>
    </button>
  );
}

function PersonPanel({
  ctx,
  p,
  away,
}: {
  ctx: Ctx;
  p: Person;
  away?: { from: string; to: string };
}) {
  const { view, d } = ctx;
  const [off, setOff] = useState("");
  const w = personWeek(view, p.id);
  const set = (t: string, patch: Partial<Person>) =>
    ctx.commit(t, [edit(view, "people", p.id, { ...p, ...patch })]);
  const rooms = Object.values(view.places).filter((x) => x.kind === "room");
  const homeBlock =
    Object.values(view.clinics).find((c) => c.team.includes(p.id))?.blockId ??
    rooms[0]?.parentId ??
    null;
  const consent = !!p.consentOn && !!p.consentBy;
  const id = cardIdentity(p);
  const band = view.bands[p.band];
  const addOffice = () => {
    const name = off.trim();
    if (!name || !homeBlock) return;
    const rid = ctx.newId();
    ctx.commit(fill(CS.people.panel.officeSet, { name: p.name, office: name }), [
      edit(view, "places", rid, { id: rid, kind: "room", name, parentId: homeBlock, tier: null }),
      edit(view, "people", p.id, { ...p, officeId: rid }),
    ]);
    setOff("");
  };
  return (
    <aside className={k("det", "su-det")} aria-label={p.name}>
      <div className={k("su-dh")}>
        <Pav p={p} />
        <div>
          <h2>{p.name}</h2>
          <p>
            {p.role} · {d.departments[p.departmentId ?? ""]?.name}
          </p>
        </div>
        <button type="button" className={k("btn", "sm", "q", "x")} onClick={() => ctx.setSel(null)}>
          {CS.close}
        </button>
      </div>
      {away ? (
        <div className={k("su-awb")}>
          {fill(CS.people.panel.awayNote, { d: dateTxt(away.from) })}
        </div>
      ) : null}
      {!p.userId ? <div className={k("su-awb")}>{CS_ERRORS.notLinked}</div> : null}

      <div className={k("su-sec")}>
        <span className={k("cap")}>{CS.people.panel.week}</span>
        {WEEK.map((wd) => {
          const xs = w.sessions.filter((s) => s.weekday === wd).sort((a, b) => a.start - b.start);
          return (
            <div key={wd} className={k("su-pw")}>
              <span className={k("su-dl")}>{dayName(wd)}</span>
              <span>
                {xs.map((s) => (
                  <em key={s.id}>
                    <i style={{ background: view.clinics[s.clinicId]?.colour }} />
                    {sesTime(s)} · {view.clinics[s.clinicId]?.name}
                  </em>
                ))}
                {!xs.length ? <small>{CS.people.panel.off}</small> : null}
              </span>
            </div>
          );
        })}
        <button
          type="button"
          className={k("btn", "sm", "su-lft")}
          onClick={() => ctx.modal({ k: "cx", type: "away", personId: p.id })}
        >
          {CS.people.panel.addLeave}
        </button>
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>
          {CS.people.panel.office}
          <small className={k("su-capn")}>
            {placeName(view, p.officeId) || CS.people.noOffice}
          </small>
        </span>
        {needsOffice(p) && !p.officeId ? (
          <div className={k("su-warn")}>
            <span>{CS.people.panel.officeH}</span>
          </div>
        ) : null}
        <ChipRow label={CS.people.panel.office}>
          {rooms.map((r) => {
            const other = Object.values(view.people).find(
              (o) => o.id !== p.id && o.officeId === r.id,
            );
            const priv = view.places[r.parentId ?? ""]?.tier === "private";
            return (
              <Chip
                key={r.id}
                cls="su-nchip"
                on={p.officeId === r.id}
                onClick={() =>
                  set(fill(CS.people.panel.officeSet, { name: p.name, office: r.name }), {
                    officeId: p.officeId === r.id ? null : r.id,
                  })
                }
              >
                <span>
                  {r.name}
                  {priv ? <em className={k("su-tag")}>{CS.ed.privateWing}</em> : null}
                </span>
                <small>
                  {other
                    ? fill(CS.people.panel.someoneElse, { name: other.name })
                    : placeName(view, r.parentId)}
                </small>
              </Chip>
            );
          })}
        </ChipRow>
        <div className={k("su-addr")}>
          <input
            className={k("in")}
            value={off}
            onChange={(e) => setOff(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOffice()}
            placeholder={CS.people.panel.officePh}
            aria-label={CS.people.panel.officePh}
          />
          {off.trim() ? (
            <button type="button" className={k("btn", "sm")} onClick={addOffice}>
              {CS.people.panel.officeAdd}
            </button>
          ) : null}
        </div>
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{CS.people.panel.grade}</span>
        <ChipRow label={CS.people.panel.grade}>
          {BANDS.map((b: Band) => (
            <Chip
              key={b}
              on={p.band === b}
              onClick={() =>
                set(fill(CS.people.panel.gradeSet, { name: p.name, band: CS.bands.labels[b] }), {
                  band: b,
                })
              }
            >
              {CS.bands.labels[b]}
            </Chip>
          ))}
        </ChipRow>
        <p className={k("su-note")}>
          {fill(CS.people.panel.gradeH, {
            fee: band
              ? fill(CS.people.feeLine, { gen: ugx(band.general), priv: ugx(band.private) })
              : CS.clinics.notSet,
          })}
        </p>
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{CS.people.panel.cards}</span>
        <Toggle
          on={consent && p.showName}
          disabled={!consent}
          flip={() =>
            set(
              fill(CS.people.panel.changedName, {
                name: p.name,
                state: p.showName ? CS.people.panel.hidden : CS.people.panel.shown,
              }),
              { showName: !p.showName },
            )
          }
          t={[
            CS.people.panel.showName,
            consent
              ? fill(CS.people.panel.consentOn, { date: dateTxt(p.consentOn!) })
              : CS.people.panel.consentNone,
          ]}
        />
        <Toggle
          on={consent && p.showPhoto}
          disabled={!consent}
          flip={() => set(CS.people.panel.showPhoto, { showPhoto: !p.showPhoto })}
          t={[CS.people.panel.showPhoto, CS.people.panel.consentNeeded]}
        />
        {!consent ? (
          <button
            type="button"
            className={k("btn", "sm", "su-lft")}
            onClick={() =>
              set(CS.people.panel.recordConsent, { consentOn: d.today, consentBy: d.user.id })
            }
          >
            {CS.people.panel.recordConsent}
          </button>
        ) : null}
        <div className={k("su-locks")}>
          <div>
            <span className={k("su-lock")} aria-hidden="true">
              <Icon n="keys" size={12} />
            </span>
            <span>
              <b>{CS.people.panel.ratings}</b>
              <small>{CS.people.panel.ratingsOff}</small>
            </span>
          </div>
        </div>
        <div className={k("su-prev")}>
          <span className={k("cap")}>{CS.people.panel.sees}</span>
          <div className={k("su-dcard")}>
            <Pav p={id.name ? p : undefined} />
            <span>
              <b>{id.name ?? fill(CS.people.panel.cadreCard, { cadre: p.cadre })}</b>
              <small>{p.role}</small>
              {p.officeId ? (
                <small className={k("su-off")}>
                  {fill(CS.people.panel.findAt, { office: placeName(view, p.officeId) })}
                </small>
              ) : null}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AddPersonDialog({ ctx, close }: { ctx: Ctx; close: () => void }) {
  const [f, setF] = useState({ name: "", role: "", email: "", band: "mo" as Band });
  const [busy, setBusy] = useState(false);
  const ok = f.name.trim() && f.role.trim() && /^\S+@\S+\.\S+$/.test(f.email.trim());
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const r = await ctx.port.invitePerson({
      name: f.name.trim(),
      role: f.role.trim(),
      band: f.band,
      email: f.email.trim(),
    });
    setBusy(false);
    if (!r.ok) return ctx.say(r.error);
    ctx.say(fill(CS.people.new.sent, { name: f.name.trim() }));
    close();
  };
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.people.new.title}
      tile="person"
      title={CS.people.new.title}
      lead={CS.people.new.sub}
    >
      <div className={k("su-sec")}>
        <Field as="label" label={CS.people.new.name}>
          <input
            className={k("in")}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder={CS.people.new.namePh}
            autoFocus
          />
        </Field>
        <Field as="label" label={CS.people.new.role}>
          <input
            className={k("in")}
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value })}
            placeholder={CS.people.new.rolePh}
          />
        </Field>
        <Field as="label" label={CS.people.new.email}>
          <input
            className={k("in")}
            type="email"
            autoComplete="off"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </Field>
        <span className={k("cap")}>
          {CS.people.new.grade}
          <small className={k("su-capn")}>{CS.people.new.gradeH}</small>
        </span>
        <div className={k("su-gpk")} role="group" aria-label={CS.people.new.grade}>
          {BANDS.map((b) => {
            const band = ctx.view.bands[b];
            return (
              <button
                key={b}
                type="button"
                className={k(f.band === b && "on")}
                aria-pressed={f.band === b}
                onClick={() => setF({ ...f, band: b })}
              >
                <b>{CS.bands.labels[b]}</b>
                <small>
                  {band
                    ? fill(CS.people.feeLine, { gen: ugx(band.general), priv: ugx(band.private) })
                    : CS.clinics.notSet}
                </small>
              </button>
            );
          })}
        </div>
        <p className={k("su-note")}>{CS.people.new.note}</p>
      </div>
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          onClick={() => void go()}
          disabled={!ok || busy || ctx.offline}
        >
          {CS.people.new.go}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
