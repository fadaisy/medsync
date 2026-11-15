"use client";

/** Closures and changes (ADR 0506): the month, what's coming up, public holidays, and the closure dialog. */
import type { Ctx, Modal } from "./shared";
import type { Edit, Exception, Session } from "@/lib/clinics-schedule/model";
import { useState } from "react";

import { CS } from "@/content/clinics-schedule/copy";
import { fill } from "@/content/lab-workspace-v2";
import { daysOf, edit, isoDow, placesOf } from "@/lib/clinics-schedule/model";
import {
  addDays,
  Chip,
  ChipRow,
  dateTxt,
  dayName,
  DeskDialog,
  Field,
  hm,
  k,
  Seg,
  sesTime,
  Step,
} from "./shared";

const ymd = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function spanTxt(x: Pick<Exception, "from" | "to" | "part">) {
  const days = x.from === x.to ? dateTxt(x.from) : `${dateTxt(x.from)} – ${dateTxt(x.to)}`;
  return x.part ? `${days} · ${hm(x.part.start)}–${hm(x.part.end)}` : days;
}

export function exSummary(ctx: Ctx, x: Exception) {
  const { view } = ctx;
  if (x.type === "closed")
    return fill(CS.cx.sum.closed, {
      span: spanTxt(x),
      what:
        x.clinicIds === "all"
          ? CS.cx.every
          : x.clinicIds
              .map((id) => view.clinics[id]?.shortName || view.clinics[id]?.name)
              .join(", "),
    });
  if (x.type === "away")
    return fill(CS.cx.sum.away, {
      who: view.people[x.personId ?? ""]?.name ?? "",
      span: spanTxt(x),
    });
  return fill(CS.cx.sum.extra, {
    clinic: view.clinics[x.extra?.clinicId ?? ""]?.name ?? "",
    span: spanTxt(x),
  });
}

export function ClosuresView({ ctx }: { ctx: Ctx }) {
  const { view, d, published } = ctx;
  const [month, setMonth] = useState(() => d.today.slice(0, 7));
  const [y = 2026, m = 1] = month.split("-").map(Number);
  const first = ymd(y, m - 1, 1);
  const lead = isoDow(first) - 1;
  const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const exs = Object.values(view.exceptions);
  const holByDate = new Map(d.holidays.map((h) => [h.date, h]));
  const marks = (date: string) => {
    const out: { cls: string; t: string }[] = [];
    const h = holByDate.get(date);
    if (h && view.holidays[h.id]?.decision === "closed")
      out.push({ cls: "closed", t: CS.cx.every });
    for (const x of exs.filter((e) => e.from <= date && e.to >= date))
      out.push({
        cls: x.type,
        t:
          x.type === "closed"
            ? x.clinicIds === "all"
              ? CS.cx.every
              : x.clinicIds
                  .map((id) => view.clinics[id]?.shortName || view.clinics[id]?.name)
                  .join(", ")
            : x.type === "away"
              ? (view.people[x.personId ?? ""]?.name ?? "")
              : (view.clinics[x.extra?.clinicId ?? ""]?.shortName ?? ""),
      });
    return out;
  };
  const shift = (n: number) => setMonth(ymd(y, m - 1 + n, 1).slice(0, 7));
  const coming = exs.filter((e) => e.to >= d.today).sort((a, b) => a.from.localeCompare(b.from));
  const yearOn = addDays(d.today, 365);
  const hols = d.holidays
    .filter((h) => h.date >= d.today && h.date < yearOn)
    .sort((a, b) => a.date.localeCompare(b.date));
  const left = hols.filter((h) => !view.holidays[h.id]);
  const runs = (date: string) =>
    new Set(
      Object.values(view.sessions)
        .filter((s) => s.weekday === isoDow(date))
        .map((s) => s.clinicId),
    ).size;
  const decide = (ids: string[], decision: "closed" | "open" | null, t: string) =>
    ctx.commit(
      t,
      ids.map((id) =>
        edit(
          view,
          "holidays",
          id,
          decision ? { id, decision, rowId: view.holidays[id]?.rowId } : null,
        ),
      ),
      t,
    );

  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{CS.closures.title}</h1>
            <span className={k("adate")}>{CS.closures.sub}</span>
          </div>
          <span className={k("grow")} />
          <button type="button" className={k("btn", "sm")} onClick={() => ctx.modal({ k: "cx" })}>
            {CS.closures.add}
          </button>
        </div>

        <div className={k("su-cxg")}>
          <div className={k("su-card", "su-cal")}>
            <div className={k("su-calh")}>
              <button
                type="button"
                className={k("btn", "sm", "q")}
                onClick={() => shift(-1)}
                aria-label={CS.closures.prev}
              >
                ‹
              </button>
              <b>
                {CS.monthsLong[m - 1]} {y}
              </b>
              <button
                type="button"
                className={k("btn", "sm", "q")}
                onClick={() => shift(1)}
                aria-label={CS.closures.nextM}
              >
                ›
              </button>
            </div>
            <div className={k("su-cg")}>
              {CS.days.map((t) => (
                <span key={t} className={k("su-cdh")}>
                  {t}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`b${i}`} className={k("su-cc", "blank")} />
              ))}
              {Array.from({ length: len }, (_, i) => {
                const date = ymd(y, m - 1, i + 1);
                const mk = marks(date);
                const h = holByDate.get(date);
                const past = date < d.today;
                return (
                  <button
                    key={date}
                    type="button"
                    className={k(
                      "su-cc",
                      date === d.today && "today",
                      past && "past",
                      mk.some((x) => x.cls === "closed" && x.t === CS.cx.every) && "closed",
                    )}
                    onClick={() => !past && ctx.modal({ k: "cx", date })}
                    disabled={past}
                    aria-label={fill(CS.closures.dayAria, {
                      date: dateTxt(date),
                      marks: [h?.name, ...mk.map((x) => x.t)]
                        .filter(Boolean)
                        .map((x) => `, ${x}`)
                        .join(""),
                    })}
                  >
                    <b>{i + 1}</b>
                    {h ? <small>{h.name}</small> : null}
                    <span className={k("su-mk")}>
                      {mk.slice(0, 2).map((x, j) => (
                        <em key={j} className={k(x.cls)}>
                          {x.t}
                        </em>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={k("su-leg2")}>
              {(["closed", "away", "extra"] as const).map((x) => (
                <span key={x}>
                  <i className={k(x)} />
                  {CS.closures.legend[x]}
                </span>
              ))}
              <span>{CS.closures.tapDay}</span>
            </div>
          </div>

          <div className={k("su-card", "su-xl")}>
            <div className={k("su-ch")}>
              <b>{CS.closures.coming}</b>
              <small>{CS.closures.comingNote}</small>
            </div>
            {coming.map((x) => (
              <div key={x.id} className={k("su-xi", x.type)}>
                <span className={k("su-xk")}>{CS.closures.legend[x.type]}</span>
                <span className={k("su-xt")}>
                  <b>
                    {x.type === "closed"
                      ? x.clinicIds === "all"
                        ? CS.cx.every
                        : x.clinicIds.map((id) => view.clinics[id]?.name).join(", ")
                      : x.type === "away"
                        ? view.people[x.personId ?? ""]?.name
                        : view.clinics[x.extra?.clinicId ?? ""]?.name}
                    {!published.exceptions[x.id] ? (
                      <em className={k("su-dr")}>{CS.closures.draft}</em>
                    ) : null}
                  </b>
                  <small>
                    {spanTxt(x)}
                    {x.reason ? ` · ${x.reason}` : ""}
                  </small>
                </span>
                <button
                  type="button"
                  className={k("btn", "sm", "q")}
                  onClick={() =>
                    ctx.commit(
                      fill(CS.closures.removed, { what: exSummary(ctx, x) }),
                      [edit(view, "exceptions", x.id, null)],
                      fill(CS.closures.removed, { what: exSummary(ctx, x) }),
                    )
                  }
                >
                  {CS.closures.remove}
                </button>
              </div>
            ))}
            {!coming.length ? <p className={k("su-none")}>{CS.closures.noneComing}</p> : null}
          </div>
        </div>

        <div className={k("su-card", "su-hol")}>
          <div className={k("su-ch")}>
            <b>{CS.closures.holTitle}</b>
            <small>
              {left.length ? fill(CS.closures.holLeft, { n: left.length }) : CS.closures.holAll}
            </small>
            <span className={k("grow")} />
            {left.length ? (
              <button
                type="button"
                className={k("btn", "sm")}
                onClick={() =>
                  decide(
                    left.map((h) => h.id),
                    "closed",
                    fill(CS.closures.holEvery, { n: left.length }),
                  )
                }
              >
                {fill(CS.closures.closeEvery, { n: left.length })}
              </button>
            ) : null}
          </div>
          <div className={k("su-holl")}>
            {hols.map((h) => {
              const dec = view.holidays[h.id]?.decision;
              const n = runs(h.date);
              return (
                <div key={h.id} className={k("su-holr")}>
                  <span className={k("su-hold")}>{dateTxt(h.date)}</span>
                  <span className={k("su-holn")}>
                    <b>
                      {h.name}
                      {h.provisional ? (
                        <em className={k("su-ctag")}>{CS.closures.expected}</em>
                      ) : null}
                    </b>
                    <small>
                      {n
                        ? fill(n === 1 ? CS.closures.run : CS.closures.runN, { n })
                        : fill(CS.closures.runNone, { day: dayName(isoDow(h.date)) })}
                    </small>
                  </span>
                  <span
                    className={k("su-hst", dec === "closed" ? "cl" : dec === "open" ? "op" : "nd")}
                  >
                    {CS.closures.states[dec ?? "undecided"]}
                  </span>
                  <span className={k("su-hola")}>
                    {dec ? (
                      <button
                        type="button"
                        className={k("btn", "sm", "q")}
                        onClick={() => decide([h.id], null, h.name)}
                      >
                        {CS.closures.change}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={k("btn", "sm")}
                          onClick={() =>
                            decide([h.id], "closed", fill(CS.closures.holClosed, { name: h.name }))
                          }
                        >
                          {CS.closures.closeAll}
                        </button>
                        <button
                          type="button"
                          className={k("btn", "sm", "q")}
                          onClick={() =>
                            decide([h.id], "open", fill(CS.closures.holOpen, { name: h.name }))
                          }
                        >
                          {CS.closures.keepOpen}
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className={k("su-note", "su-holnote")}>
            {CS.closures.holNote}
            {!hols.some((h) => /eid/i.test(h.name)) ? ` ${CS.closures.noEid}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

type Row = { s: Session; date: string; what: "closed" | "cover" | "fewer"; booked: number };

export function CxDialog({
  ctx,
  m,
  close,
}: {
  ctx: Ctx;
  m: Extract<Modal, { k: "cx" }>;
  close: () => void;
}) {
  const { view, d } = ctx;
  const leave = m.leaveId ? view.leave[m.leaveId] : null;
  const start = leave?.from ?? m.date ?? addDays(d.today, 1);
  const [type, setType] = useState<Exception["type"]>(leave ? "away" : (m.type ?? "closed"));
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(leave?.to ?? start);
  const [part, setPart] = useState<{ start: number; end: number } | null>(
    leave?.am ? { start: 480, end: 780 } : null,
  );
  const [clinicIds, setClinicIds] = useState<string[] | "all">("all");
  const [personId, setPersonId] = useState<string | null>(leave?.personId ?? m.personId ?? null);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Exception["policy"]>("offer");
  const [reason, setReason] = useState(leave?.reason ?? "");
  const clinics = Object.values(view.clinics).sort((a, b) => a.name.localeCompare(b.name));
  const [ex, setEx] = useState({
    clinicId: clinics[0]?.id ?? "",
    start: 540,
    end: 780,
    places: 30,
    personIds: [] as string[],
    roomId: "" as string,
  });
  const days = daysOf(from, to);
  const dows = new Set(days.map(isoDow));
  const person = personId ? view.people[personId] : null;
  const shiftDay = (which: "from" | "to", n: number) => {
    if (which === "from") {
      const v = addDays(from, n);
      if (v < d.today) return;
      setFrom(v);
      if (v > to) setTo(v);
    } else {
      const v = addDays(to, n);
      if (v < from) return;
      setTo(v);
    }
  };
  const overlap = (s: Session) => !part || (s.start < part.end && part.start < s.end);

  const rows: Row[] = [];
  if (type !== "extra")
    for (const date of days)
      for (const s of Object.values(view.sessions)) {
        if (s.weekday !== isoDow(date) || !overlap(s)) continue;
        if (type === "closed" && clinicIds !== "all" && !clinicIds.includes(s.clinicId)) continue;
        if (type === "away" && !(personId && s.personIds.includes(personId))) continue;
        const what =
          type === "closed"
            ? "closed"
            : coverId
              ? "cover"
              : s.personIds.length === 1
                ? "closed"
                : "fewer";
        rows.push({ s, date, what, booked: d.booked[s.id] ?? 0 });
      }
  const hit = rows.reduce((n, r) => n + r.booked, 0);
  const moveN = rows.filter((r) => r.what === "closed").reduce((n, r) => n + r.booked, 0);
  const short = from <= addDays(d.today, 2);
  const runsThen = (id: string) =>
    Object.values(view.sessions).some((s) => s.clinicId === id && dows.has(s.weekday));
  const blocks = Object.values(view.places).filter(
    (p) => p.kind === "block" && clinics.some((c) => c.blockId === p.id),
  );
  const exClinic = view.clinics[ex.clinicId];
  const covers = person
    ? Object.values(view.people)
        .filter((p) => p.id !== person.id && p.band === person.band)
        .map((p) => ({
          p,
          same: clinics.some((c) => c.team.includes(p.id) && c.team.includes(person.id)),
          dept: p.departmentId === person.departmentId,
        }))
        .filter((x) => x.same || x.dept)
        .sort((a, b) => Number(b.same) - Number(a.same))
    : [];

  const ok =
    type === "closed"
      ? clinicIds === "all" || clinicIds.length > 0
      : type === "away"
        ? !!personId
        : !!ex.clinicId && ex.places > 0;
  const save = () => {
    const id = ctx.newId();
    const x: Exception = {
      id,
      type,
      from,
      to: type === "extra" ? from : to,
      part: type === "extra" ? { start: ex.start, end: ex.end } : part,
      clinicIds: type === "closed" ? clinicIds : [],
      personId: type === "away" ? personId : null,
      coverId: type === "away" ? coverId : null,
      policy,
      reason,
      extra:
        type === "extra"
          ? {
              clinicId: ex.clinicId,
              start: ex.start,
              end: ex.end,
              places: ex.places,
              personIds: ex.personIds,
              roomIds: ex.roomId ? [ex.roomId] : [],
            }
          : null,
    };
    const edits: Edit[] = [edit(view, "exceptions", id, x)];
    if (leave) edits.push(edit(view, "leave", leave.id, { ...leave, status: "approved" }));
    ctx.commit(exSummary(ctx, x), edits, CS.cx.added);
    close();
  };

  const stepPart = (
    k2: "start" | "end",
    n: number,
    cur: { start: number; end: number },
    set: (v: { start: number; end: number }) => void,
  ) => {
    const v = { ...cur, [k2]: cur[k2] + n };
    if (v.start >= v.end || v.start < 360 || v.end > 1320) return;
    set(v);
  };

  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.cx.title}
      tile="calendar"
      title={CS.cx.title}
      lead={type === "extra" ? dateTxt(from) : spanTxt({ from, to, part })}
      cls={k("su-m", "su-se")}
    >
      <Seg
        opts={CS.cx.types}
        value={type}
        onPick={setType}
        className={k("su-cxt")}
        sm={false}
        label={CS.cx.title}
      />
      <div className={k("su-seg2")}>
        <div className={k("su-sec", "su-sel2")}>
          <section className={k("su-blk2")}>
            <h3>{CS.ses.when}</h3>
            <div className={k("su-tm")}>
              <span className={k("su-dlb")}>{CS.cx.from}</span>
              <Step
                value={dateTxt(from)}
                dn={() => shiftDay("from", -1)}
                up={() => shiftDay("from", 1)}
                dnLabel={CS.ses.earlier}
                upLabel={CS.ses.later}
              />
              {type !== "extra" ? (
                <>
                  <span className={k("su-dlb")}>{CS.cx.to}</span>
                  <Step
                    value={dateTxt(to)}
                    dn={() => shiftDay("to", -1)}
                    up={() => shiftDay("to", 1)}
                    dnLabel={CS.ses.earlier}
                    upLabel={CS.ses.later}
                  />
                </>
              ) : null}
            </div>
            {type !== "extra" ? (
              <>
                <Seg
                  opts={CS.cx.part}
                  value={part ? "part" : "whole"}
                  onPick={(v) => setPart(v === "part" ? { start: 480, end: 780 } : null)}
                />
                {part ? (
                  <div className={k("su-tm")}>
                    <Step
                      value={hm(part.start)}
                      dn={() => stepPart("start", -30, part, setPart)}
                      up={() => stepPart("start", 30, part, setPart)}
                      dnLabel={CS.ses.earlier}
                      upLabel={CS.ses.later}
                    />
                    <span className={k("su-dlb")}>{CS.cx.to}</span>
                    <Step
                      value={hm(part.end)}
                      dn={() => stepPart("end", -30, part, setPart)}
                      up={() => stepPart("end", 30, part, setPart)}
                      dnLabel={CS.ses.earlier}
                      upLabel={CS.ses.later}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className={k("su-tm")}>
                <Step
                  value={hm(ex.start)}
                  dn={() => stepPart("start", -30, ex, (v) => setEx({ ...ex, ...v }))}
                  up={() => stepPart("start", 30, ex, (v) => setEx({ ...ex, ...v }))}
                  dnLabel={CS.ses.earlier}
                  upLabel={CS.ses.later}
                />
                <span className={k("su-dlb")}>{CS.cx.to}</span>
                <Step
                  value={hm(ex.end)}
                  dn={() => stepPart("end", -30, ex, (v) => setEx({ ...ex, ...v }))}
                  up={() => stepPart("end", 30, ex, (v) => setEx({ ...ex, ...v }))}
                  dnLabel={CS.ses.earlier}
                  upLabel={CS.ses.later}
                />
              </div>
            )}
          </section>

          {type === "closed" ? (
            <section className={k("su-blk2")}>
              <h3>{CS.cx.which}</h3>
              <ChipRow>
                <Chip on={clinicIds === "all"} onClick={() => setClinicIds("all")}>
                  {CS.cx.every}
                </Chip>
                {blocks.map((b) => (
                  <Chip
                    key={b.id}
                    cls="su-blkchip"
                    onClick={() =>
                      setClinicIds(clinics.filter((c) => c.blockId === b.id).map((c) => c.id))
                    }
                  >
                    {b.name}
                  </Chip>
                ))}
              </ChipRow>
              <ChipRow>
                {clinics.map((c) => {
                  const on = clinicIds === "all" || clinicIds.includes(c.id);
                  return (
                    <Chip
                      key={c.id}
                      on={on}
                      cls={!runsThen(c.id) && "dim"}
                      onClick={() => {
                        const cur = clinicIds === "all" ? clinics.map((x) => x.id) : clinicIds;
                        setClinicIds(
                          cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id],
                        );
                      }}
                    >
                      <i className={k("su-cdot")} style={{ background: c.colour }} />
                      {c.name}
                    </Chip>
                  );
                })}
              </ChipRow>
              <small className={k("su-h")}>{CS.cx.faded}</small>
            </section>
          ) : null}

          {type === "away" ? (
            <section className={k("su-blk2")}>
              <h3>{CS.cx.who}</h3>
              <ChipRow>
                {(person
                  ? [person]
                  : Object.values(view.people).sort((a, b) => a.name.localeCompare(b.name))
                ).map((p) => (
                  <Chip
                    key={p.id}
                    cls="su-nchip"
                    on={personId === p.id}
                    onClick={() => setPersonId(personId === p.id ? null : p.id)}
                  >
                    <span>{p.name}</span>
                    <small>{p.role}</small>
                  </Chip>
                ))}
              </ChipRow>
              {person && !leave ? (
                <button
                  type="button"
                  className={k("btn", "sm", "q", "su-lft")}
                  onClick={() => setPersonId(null)}
                >
                  {CS.closures.change}
                </button>
              ) : null}
              {person ? (
                <Field label={CS.cx.cover} hint={CS.cx.coverH}>
                  {covers.length ? (
                    <ChipRow>
                      {covers.map(({ p, same }) => (
                        <Chip
                          key={p.id}
                          cls="su-nchip"
                          on={coverId === p.id}
                          onClick={() => setCoverId(coverId === p.id ? null : p.id)}
                        >
                          <span>{p.name}</span>
                          <small>
                            {p.role}
                            {same ? CS.cx.sameClinic : CS.cx.sameDept}
                          </small>
                        </Chip>
                      ))}
                    </ChipRow>
                  ) : (
                    <small className={k("su-h")}>{CS.cx.noCover}</small>
                  )}
                </Field>
              ) : null}
            </section>
          ) : null}

          {type === "extra" ? (
            <section className={k("su-blk2")}>
              <h3>{CS.cx.session}</h3>
              <Field label={CS.week.clinic}>
                <ChipRow>
                  {clinics.map((c) => (
                    <Chip
                      key={c.id}
                      on={ex.clinicId === c.id}
                      onClick={() => setEx({ ...ex, clinicId: c.id, personIds: [], roomId: "" })}
                    >
                      <i className={k("su-cdot")} style={{ background: c.colour }} />
                      {c.name}
                    </Chip>
                  ))}
                </ChipRow>
              </Field>
              {exClinic ? (
                <>
                  <Field label={CS.ses.room}>
                    <ChipRow>
                      {Object.values(view.places)
                        .filter((p) => p.kind === "room" && p.parentId === exClinic.blockId)
                        .map((r) => (
                          <Chip
                            key={r.id}
                            on={ex.roomId === r.id}
                            onClick={() => setEx({ ...ex, roomId: r.id })}
                          >
                            {r.name}
                          </Chip>
                        ))}
                    </ChipRow>
                  </Field>
                  <Field label={CS.ses.who}>
                    <ChipRow>
                      {exClinic.team.map((p) => (
                        <Chip
                          key={p}
                          on={ex.personIds.includes(p)}
                          onClick={() =>
                            setEx({
                              ...ex,
                              personIds: ex.personIds.includes(p)
                                ? ex.personIds.filter((y) => y !== p)
                                : [...ex.personIds, p],
                            })
                          }
                        >
                          {view.people[p]?.name}
                        </Chip>
                      ))}
                    </ChipRow>
                  </Field>
                </>
              ) : null}
              <Field label={CS.ses.places}>
                <Step
                  value={ex.places}
                  dn={() => setEx({ ...ex, places: Math.max(1, ex.places - 5) })}
                  up={() => setEx({ ...ex, places: ex.places + 5 })}
                  dnLabel={CS.ses.fewer}
                  upLabel={CS.ses.more}
                />
              </Field>
            </section>
          ) : null}

          <section className={k("su-blk2")}>
            <h3>{CS.cx.reason}</h3>
            <ChipRow>
              {CS.cx.reasons.map((r) => (
                <Chip key={r} on={reason === r} onClick={() => setReason(reason === r ? "" : r)}>
                  {r}
                </Chip>
              ))}
            </ChipRow>
          </section>
        </div>

        <aside className={k("su-sep2")}>
          {type !== "extra" ? (
            <>
              <div className={k("su-pv", "su-nums")}>
                <div>
                  <b>{rows.length}</b>
                  <small>{CS.cx.nums.ses}</small>
                </div>
                <div>
                  <b>{hit}</b>
                  <small>{CS.cx.nums.booked}</small>
                </div>
                <div>
                  <b>{moveN}</b>
                  <small>{CS.cx.nums.move}</small>
                </div>
              </div>
              <div className={k("su-pv")}>
                <span className={k("cap")}>{CS.cx.rows}</span>
                {rows.slice(0, 6).map((r) => (
                  <div key={`${r.date}-${r.s.id}`} className={k("su-ir", r.what)}>
                    <i style={{ background: view.clinics[r.s.clinicId]?.colour }} />
                    <span>
                      <b>
                        {dateTxt(r.date)} · {view.clinics[r.s.clinicId]?.name}
                      </b>
                      <small>
                        {sesTime(r.s)} ·{" "}
                        {r.what === "closed"
                          ? CS.closures.states.closed
                          : r.what === "cover"
                            ? view.people[coverId ?? ""]?.name
                            : `${placesOf(r.s)} → ${Math.max(0, placesOf(r.s) - Math.round(placesOf(r.s) / Math.max(1, r.s.personIds.length)))}`}
                      </small>
                    </span>
                    {r.booked ? <em>{r.booked}</em> : null}
                  </div>
                ))}
                {rows.length > 6 ? <small className={k("su-h")}>+ {rows.length - 6}</small> : null}
                {!rows.length ? (
                  <small className={k("su-h")}>
                    {type === "away" && !personId ? CS.cx.chooseWho : CS.cx.none}
                  </small>
                ) : null}
              </div>
              <div className={k("su-pv")}>
                <span className={k("cap")}>{CS.cx.bookings}</span>
                {moveN ? (
                  <>
                    <ChipRow>
                      {CS.cx.policy.map(([v, l]) => (
                        <Chip key={v} on={policy === v} onClick={() => setPolicy(v)}>
                          {l}
                        </Chip>
                      ))}
                    </ChipRow>
                    <div className={k("su-sms")}>
                      <span>{CS.cx.sms}</span>
                      <p>{policy === "offer" ? CS.cx.smsOffer : CS.cx.smsCall}</p>
                    </div>
                    {short ? (
                      <div className={k("su-warn")}>
                        <span>{CS.cx.short}</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className={k("su-pl")}>{CS.cx.nobody}</p>
                )}
              </div>
            </>
          ) : (
            <div className={k("su-pv")}>
              <span className={k("cap")}>{CS.cx.extraAdds}</span>
              <p className={k("su-pl")}>
                {exClinic?.name} · {dateTxt(from)} · {hm(ex.start)}–{hm(ex.end)} · {ex.places}{" "}
                {CS.ses.nums.places}
              </p>
              <small className={k("su-h")}>{CS.cx.extraNote}</small>
            </div>
          )}
        </aside>
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} onClick={save} disabled={!ok}>
          {CS.cx.go[type]}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
