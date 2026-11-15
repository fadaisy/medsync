"use client";

/** The session dialog (P10, D-CS-07): when, how patients come, where and who; the day at a glance and checks. */
import type { Ctx, Modal } from "./shared";
import type { Edit, Session, Weekday } from "@/lib/clinics-schedule/model";
import { useState } from "react";

import { CS } from "@/content/clinics-schedule/copy";
import { fill } from "@/content/lab-workspace-v2";
import {
  applyChanges,
  bookableOf,
  clashes,
  edit,
  nearestFree,
  placesOf,
  suggestedPlaces,
  WEEK,
  workMin,
} from "@/lib/clinics-schedule/model";
import {
  Chip,
  ChipRow,
  dateTxt,
  dayLong,
  dayName,
  DeskDialog,
  Field,
  hm,
  k,
  Seg,
  sesTime,
  Step,
  Toggle,
} from "./shared";

const H_LO = 6 * 60;
const H_HI = 20 * 60;
const pct = (m: number) => `${((Math.min(H_HI, Math.max(H_LO, m)) - H_LO) / (H_HI - H_LO)) * 100}%`;

export function SessionDialog({
  ctx,
  m,
  close,
}: {
  ctx: Ctx;
  m: Extract<Modal, { k: "ses" }>;
  close: () => void;
}) {
  const { view, d } = ctx;
  const c = view.clinics[m.clinicId];
  const old = m.id ? view.sessions[m.id] : null;
  const [x, setX] = useState<Session>(
    () =>
      old ?? {
        id: ctx.newId(),
        clinicId: m.clinicId,
        weekday: m.weekday ?? 1,
        start: 8 * 60,
        end: 12 * 60,
        kind: "day",
        slotMin: 20,
        visitMin: 15,
        places: null,
        holdPct: 10,
        brk: null,
        every: 1,
        nth: null,
        roomIds: c?.roomIds.slice(0, 1) ?? [],
        personIds: c?.team.slice(0, 1) ?? [],
      },
  );
  const [days, setDays] = useState<Weekday[]>([x.weekday]);
  const [otherRooms, setOtherRooms] = useState(false);
  const [everyone, setEveryone] = useState(false);
  if (!c) return null;
  const hours = d.hours ?? { open: 8 * 60, close: 17 * 60 };
  const put = (p: Partial<Session>) => setX((s) => ({ ...s, ...p }));
  const step = (k2: "start" | "end", by: number) => {
    const v = Math.max(H_LO, Math.min(H_HI, x[k2] + by));
    if (k2 === "start" ? v >= x.end : v <= x.start) return;
    put({ [k2]: v });
  };

  // The draft with this session in it, for clashes and the timeline.
  const edits = (): Edit[] => {
    const out: Edit[] = [edit(view, "sessions", x.id, x)];
    for (const w of days.filter((w) => w !== x.weekday)) {
      const id = ctx.newId();
      out.push(edit(view, "sessions", id, { ...x, id, weekday: w }));
    }
    const add = x.personIds.filter((p) => !c.team.includes(p));
    if (add.length) out.push(edit(view, "clinics", c.id, { ...c, team: [...c.team, ...add] }));
    return out;
  };
  const trial = applyChanges(view, [
    { id: "t", summary: "", author: "", at: "", edits: [edit(view, "sessions", x.id, x)] },
  ]);
  const mine = clashes(trial).filter((k2) => k2.a.id === x.id || k2.b.id === x.id);
  const free = mine.length ? nearestFree(trial, x, hours) : null;
  const sameDay = Object.values(view.sessions).filter(
    (o) =>
      o.id !== x.id &&
      o.weekday === x.weekday &&
      (o.roomIds.some((r) => x.roomIds.includes(r)) ||
        o.personIds.some((p) => x.personIds.includes(p))),
  );
  const outside = x.start < hours.open || x.end > hours.close;
  const total = placesOf(x);
  // Engine defaults (session_templates) until set here.
  const il = x.interleave ?? { booked: 2, walkIn: 1 };
  const ob = x.overbook ?? 1;
  const ahead = bookableOf(x);
  const block = c.blockId ? view.places[c.blockId] : null;
  const rooms = Object.values(view.places).filter(
    (p) =>
      p.kind === "room" && (otherRooms || p.parentId === c.blockId || x.roomIds.includes(p.id)),
  );
  const people = Object.values(view.people)
    .filter(
      (p) =>
        everyone ||
        c.team.includes(p.id) ||
        x.personIds.includes(p.id) ||
        p.departmentId === c.departmentId,
    )
    .sort(
      (a, b) =>
        Number(c.team.includes(b.id)) - Number(c.team.includes(a.id)) ||
        a.name.localeCompare(b.name),
    );
  const busy = (pred: (o: Session) => boolean) =>
    Object.values(view.sessions).find(
      (o) =>
        o.id !== x.id && o.weekday === x.weekday && o.start < x.end && x.start < o.end && pred(o),
    );
  const away = (pid: string) =>
    Object.values(view.exceptions).find(
      (e) => e.type === "away" && e.personId === pid && e.to >= d.today,
    );
  const booked = old ? (d.booked[old.id] ?? 0) : 0;
  const issues = [
    ...mine.map((k2) => {
      const o = k2.a.id === x.id ? k2.b : k2.a;
      return {
        t: CS.ses.clash,
        s: fill(CS.ses.clashSub, { c: view.clinics[o.clinicId]?.name ?? "", t: sesTime(o) }),
      };
    }),
    ...(x.personIds.length ? [] : [{ t: CS.ses.noDoc, s: "" }]),
    ...(x.roomIds.length ? [] : [{ t: CS.ses.noRoom, s: "" }]),
    ...(outside
      ? [
          {
            t: CS.ses.outside,
            s: fill(CS.ses.inside, { open: hm(hours.open), close: hm(hours.close) }),
          },
        ]
      : []),
  ];
  const oks = [
    ...(mine.length ? [] : [CS.ses.noClash]),
    ...(outside ? [] : [fill(CS.ses.inside, { open: hm(hours.open), close: hm(hours.close) })]),
  ];
  const times: string[] = [];
  if (x.kind === "times")
    for (let t = x.start; t + x.slotMin <= x.end; t += x.slotMin)
      if (!x.brk || t + x.slotMin <= x.brk.start || t >= x.brk.end) times.push(hm(t));

  const save = () => {
    ctx.commit(
      fill(old ? CS.ses.changedS : CS.ses.added, { day: `${c.name} · ${dayName(x.weekday)}` }),
      edits(),
      fill(old ? CS.ses.changedS : CS.ses.added, { day: dayLong(x.weekday) }),
    );
    close();
  };
  const remove = () => {
    if (!old) return close();
    ctx.commit(
      fill(CS.ses.removed, { day: `${c.name} · ${dayName(old.weekday)}` }),
      [edit(view, "sessions", old.id, null)],
      fill(CS.ses.removed, { day: dayLong(old.weekday) }),
    );
    close();
  };

  return (
    <DeskDialog
      open
      onClose={close}
      label={
        old ? fill(CS.ses.titleEdit, { clinic: c.name }) : fill(CS.ses.titleNew, { clinic: c.name })
      }
      tile="clock"
      mark={
        <span className={k("su-sw", "lg")} style={{ background: c.colour }} aria-hidden="true" />
      }
      title={
        old ? fill(CS.ses.titleEdit, { clinic: c.name }) : fill(CS.ses.titleNew, { clinic: c.name })
      }
      lead={fill(CS.ses.title, {
        day: dayLong(x.weekday),
        start: hm(x.start),
        end: hm(x.end),
        places: total,
      })}
      cls={k("su-m", "su-se")}
    >
      <div className={k("su-seg2")}>
        <div className={k("su-sec", "su-sel2")}>
          <section className={k("su-blk2")}>
            <h3>{CS.ses.when}</h3>
            <div className={k("su-presets")}>
              {CS.ses.presets.map(([l, s, e]) => (
                <button
                  key={l}
                  type="button"
                  className={k("su-pre2", x.start === s && x.end === e && "on")}
                  aria-pressed={x.start === s && x.end === e}
                  onClick={() => put({ start: s, end: e, brk: null })}
                >
                  <b>{l}</b>
                  <small>
                    {hm(s)}–{hm(e)}
                  </small>
                </button>
              ))}
            </div>
            <div className={k("su-tm")}>
              <Step
                value={hm(x.start)}
                dn={() => step("start", -15)}
                up={() => step("start", 15)}
                dnLabel={CS.ses.earlier}
                upLabel={CS.ses.later}
              />
              <span className={k("su-to")}>{CS.ses.to}</span>
              <Step
                value={hm(x.end)}
                dn={() => step("end", -15)}
                up={() => step("end", 15)}
                dnLabel={CS.ses.earlier}
                upLabel={CS.ses.later}
              />
            </div>
            <Toggle
              on={!!x.brk}
              flip={() => {
                const mid = Math.round((x.start + x.end) / 2 / 30) * 30;
                put({ brk: x.brk ? null : { start: mid, end: Math.min(x.end - 15, mid + 60) } });
              }}
              t={[
                CS.ses.brk,
                x.brk
                  ? fill(CS.ses.brkLine, { s: hm(x.brk.start), e: hm(x.brk.end) })
                  : CS.ses.brkH,
                CS.ses.brkH,
              ]}
            />
            <Field label={CS.ses.repeats}>
              <Seg
                opts={CS.ses.every}
                value={x.nth ? "nth" : String(x.every)}
                onPick={(v) =>
                  put(v === "nth" ? { nth: 1, every: 1 } : { nth: null, every: Number(v) as 1 | 2 })
                }
                label={CS.ses.repeats}
              />
            </Field>
            <Field label={CS.ses.same}>
              <ChipRow label={CS.ses.same}>
                {WEEK.map((w) => (
                  <Chip
                    key={w}
                    on={days.includes(w)}
                    onClick={() =>
                      w !== x.weekday &&
                      setDays(days.includes(w) ? days.filter((y) => y !== w) : [...days, w])
                    }
                  >
                    {dayName(w)}
                  </Chip>
                ))}
              </ChipRow>
            </Field>
          </section>

          <section className={k("su-blk2")}>
            <h3>{CS.ses.how}</h3>
            <div className={k("su-kinds")}>
              {CS.ses.kinds.map(([v, l, s]) => (
                <button
                  key={v}
                  type="button"
                  className={k("su-kind", x.kind === v && "on")}
                  aria-pressed={x.kind === v}
                  onClick={() => put({ kind: v, holdPct: v === "times" ? 0 : x.holdPct })}
                >
                  <b>{l}</b>
                  <small>{s}</small>
                </button>
              ))}
            </div>
            {x.kind === "times" ? (
              <Field label={CS.ses.slot} hint={CS.ses.about}>
                <Seg
                  opts={CS.ses.slotOpts.map((n) => [n, fill(CS.ses.min, { n })] as const)}
                  value={x.slotMin}
                  onPick={(n) => put({ slotMin: n, visitMin: n, places: null })}
                  label={CS.ses.slot}
                />
              </Field>
            ) : (
              <>
                <Field label={CS.ses.places}>
                  <span className={k("su-step")}>
                    <Step
                      value={total}
                      dn={() => put({ places: Math.max(1, total - 1) })}
                      up={() => put({ places: total + 1 })}
                      dnLabel={CS.ses.fewer}
                      upLabel={CS.ses.more}
                    />
                    <small>
                      {fill(CS.ses.fit, {
                        n: suggestedPlaces(x),
                        h: `${Math.round((workMin(x) / 60) * 10) / 10} h`,
                        v: x.visitMin,
                        p: `${Math.max(1, x.personIds.length)} ${x.personIds.length === 1 ? CS.ses.person : CS.ses.persons}`,
                      })}
                    </small>
                  </span>
                  {x.places != null && x.places !== suggestedPlaces(x) ? (
                    <button
                      type="button"
                      className={k("btn", "sm", "q", "su-lft")}
                      onClick={() => put({ places: null })}
                    >
                      {CS.ses.useFit}
                    </button>
                  ) : null}
                </Field>
                <Field label={CS.ses.visit}>
                  <Seg
                    opts={CS.ses.slotOpts.map((n) => [n, fill(CS.ses.min, { n })] as const)}
                    value={x.visitMin}
                    onPick={(n) => put({ visitMin: n })}
                    label={CS.ses.visit}
                  />
                </Field>
                <Field label={CS.ses.hold} hint={CS.ses.holdH}>
                  <Seg
                    opts={([0, 10, 20, 30] as const).map((n) => [n, `${n}%`] as const)}
                    value={x.holdPct}
                    onPick={(n) => put({ holdPct: n })}
                    label={CS.ses.hold}
                  />
                </Field>
              </>
            )}
            <Field label={CS.ses.interleave} hint={CS.ses.interleaveH}>
              <span className={k("su-step")}>
                <Step
                  value={il.booked}
                  dn={() => put({ interleave: { ...il, booked: Math.max(1, il.booked - 1) } })}
                  up={() => put({ interleave: { ...il, booked: Math.min(20, il.booked + 1) } })}
                  dnLabel={`${CS.ses.ib} −`}
                  upLabel={`${CS.ses.ib} +`}
                />
                <b aria-hidden="true">:</b>
                <Step
                  value={il.walkIn}
                  dn={() => put({ interleave: { ...il, walkIn: Math.max(1, il.walkIn - 1) } })}
                  up={() => put({ interleave: { ...il, walkIn: Math.min(20, il.walkIn + 1) } })}
                  dnLabel={`${CS.ses.iw} −`}
                  upLabel={`${CS.ses.iw} +`}
                />
              </span>
            </Field>
            <Field label={CS.ses.overbook} hint={CS.ses.overbookH}>
              <Step
                value={ob.toFixed(2)}
                dn={() => put({ overbook: Math.max(100, Math.round(ob * 100) - 5) / 100 })}
                up={() => put({ overbook: Math.min(200, Math.round(ob * 100) + 5) / 100 })}
                dnLabel={`${CS.ses.overbook} −`}
                upLabel={`${CS.ses.overbook} +`}
              />
            </Field>
            <Toggle
              on={!!x.holidays}
              flip={() => put({ holidays: !x.holidays })}
              t={CS.ses.holidays}
            />
          </section>

          <section className={k("su-blk2")}>
            <h3>{CS.ses.whereWho}</h3>
            <Field label={CS.ses.room} hint={block?.name}>
              <ChipRow label={CS.ses.room}>
                {rooms.map((r) => {
                  const b = busy((o) => o.roomIds.includes(r.id));
                  const off = Object.values(view.people).find((p) => p.officeId === r.id);
                  return (
                    <Chip
                      key={r.id}
                      on={x.roomIds.includes(r.id)}
                      cls={`su-nchip ${b ? k("busy") : ""}`}
                      onClick={() =>
                        put({
                          roomIds: x.roomIds.includes(r.id)
                            ? x.roomIds.filter((y) => y !== r.id)
                            : [...x.roomIds, r.id],
                        })
                      }
                    >
                      <span>{r.name}</span>
                      <small>
                        {b
                          ? fill(CS.ses.taken, {
                              t: sesTime(b),
                              c: view.clinics[b.clinicId]?.shortName ?? "",
                            })
                          : off
                            ? fill(CS.ses.office, { name: off.name })
                            : " "}
                      </small>
                    </Chip>
                  );
                })}
              </ChipRow>
              {!otherRooms ? (
                <button
                  type="button"
                  className={k("btn", "sm", "q", "su-lft")}
                  onClick={() => setOtherRooms(true)}
                >
                  {CS.ses.otherRooms}
                </button>
              ) : null}
            </Field>
            <Field label={CS.ses.who}>
              <ChipRow label={CS.ses.who}>
                {people.map((p) => {
                  const b = busy((o) => o.personIds.includes(p.id));
                  const a = away(p.id);
                  return (
                    <Chip
                      key={p.id}
                      on={x.personIds.includes(p.id)}
                      cls={`su-nchip ${b || a ? k("busy") : ""}`}
                      onClick={() =>
                        put({
                          personIds: x.personIds.includes(p.id)
                            ? x.personIds.filter((y) => y !== p.id)
                            : [...x.personIds, p.id],
                        })
                      }
                    >
                      <span>{p.name}</span>
                      <small>
                        {b
                          ? fill(CS.ses.busy, {
                              t: sesTime(b),
                              c: view.clinics[b.clinicId]?.shortName ?? "",
                            })
                          : a
                            ? fill(CS.ses.away, { d: dateTxt(a.from) })
                            : p.role}
                      </small>
                    </Chip>
                  );
                })}
              </ChipRow>
              {!everyone ? (
                <button
                  type="button"
                  className={k("btn", "sm", "q", "su-lft")}
                  onClick={() => setEveryone(true)}
                >
                  {CS.ses.everyone}
                </button>
              ) : null}
            </Field>
          </section>
        </div>

        <aside className={k("su-sep2")}>
          <div className={k("su-pv")}>
            <span className={k("cap")}>{fill(CS.ses.glance, { day: dayLong(x.weekday) })}</span>
            <div className={k("su-tlw")}>
              <div className={k("su-tlr", "me")}>
                <span className={k("su-tll")}>{CS.ses.thisOne}</span>
                <span className={k("su-tlt")}>
                  <i
                    className={k("su-hrs")}
                    style={{ left: pct(hours.open), right: `calc(100% - ${pct(hours.close)})` }}
                  />
                  <i
                    className={k("su-tb", "me")}
                    style={{ left: pct(x.start), right: `calc(100% - ${pct(x.end)})` }}
                  />
                  {x.brk ? (
                    <i
                      className={k("su-tb", "brk")}
                      style={{ left: pct(x.brk.start), right: `calc(100% - ${pct(x.brk.end)})` }}
                    />
                  ) : null}
                </span>
              </div>
              {sameDay.map((o) => {
                const cl = o.start < x.end && x.start < o.end;
                return (
                  <div key={o.id} className={k("su-tlr", cl && "clash")}>
                    <span className={k("su-tll")}>
                      <b>{view.clinics[o.clinicId]?.name}</b>
                      <small>{sesTime(o)}</small>
                    </span>
                    <span className={k("su-tlt")}>
                      <i
                        className={k("su-hrs")}
                        style={{ left: pct(hours.open), right: `calc(100% - ${pct(hours.close)})` }}
                      />
                      <i
                        className={k("su-tb", cl && "clash")}
                        style={{ left: pct(o.start), right: `calc(100% - ${pct(o.end)})` }}
                      />
                    </span>
                  </div>
                );
              })}
              <div className={k("su-tlr", "su-tlax")} aria-hidden="true">
                <span className={k("su-tll")} />
                <span className={k("su-tlt")}>
                  {[8, 10, 12, 14, 16, 18].map((h) => (
                    <em key={h} style={{ left: pct(h * 60) }}>
                      {h}
                    </em>
                  ))}
                </span>
              </div>
              {!sameDay.length ? <small className={k("su-tln")}>{CS.ses.clear}</small> : null}
            </div>
          </div>
          <div className={k("su-pv", "su-nums")}>
            <div>
              <b>{total}</b>
              <small>{CS.ses.nums.places}</small>
            </div>
            <div>
              <b>{ahead}</b>
              <small>{CS.ses.nums.ahead}</small>
            </div>
            <div>
              <b>{total - ahead}</b>
              <small>{CS.ses.nums.held}</small>
            </div>
          </div>
          <div className={k("su-pv")}>
            <span className={k("cap")}>{CS.ses.patientReads}</span>
            <p className={k("su-pl")}>
              {x.kind === "day"
                ? fill(CS.ses.readDay, { s: hm(x.start), e: hm(x.end) })
                : CS.ses.readTimes}
            </p>
            {times.length ? (
              <div className={k("su-times")}>
                {times.slice(0, 8).map((t) => (
                  <em key={t}>{t}</em>
                ))}
                {times.length > 8 ? <small>+{times.length - 8}</small> : null}
              </div>
            ) : null}
          </div>
          <div className={k("su-pv")}>
            <div className={k("su-ckh")}>
              <span className={k("cap")}>{CS.ses.checks}</span>
              {issues.length ? (
                <em className={k("warn")}>{issues.length}</em>
              ) : (
                <em className={k("ok")}>{CS.ses.allClear}</em>
              )}
            </div>
            {issues.map((z, i) => (
              <div key={i} className={k("su-iss")}>
                <span className={k("su-ici", "warn")} aria-hidden="true">
                  !
                </span>
                <div className={k("su-isb")}>
                  <b>{z.t}</b>
                  {z.s ? <small>{z.s}</small> : null}
                  {i === 0 && mine.length ? (
                    free != null ? (
                      <button
                        type="button"
                        className={k("su-fix")}
                        onClick={() =>
                          put({
                            start: free,
                            end: free + (x.end - x.start),
                            brk: x.brk
                              ? {
                                  start: x.brk.start + free - x.start,
                                  end: x.brk.end + free - x.start,
                                }
                              : null,
                          })
                        }
                      >
                        <b>
                          {fill(CS.ses.move, { t: `${hm(free)}–${hm(free + x.end - x.start)}` })}
                        </b>
                      </button>
                    ) : (
                      <small>{CS.ses.noFree}</small>
                    )
                  ) : null}
                </div>
              </div>
            ))}
            <div className={k("su-oks")}>
              {oks.map((t) => (
                <span key={t} className={k("su-ok")}>
                  <span className={k("su-ici", "ok")} aria-hidden="true">
                    ✓
                  </span>
                  {t}
                </span>
              ))}
            </div>
            {outside ? <small className={k("su-h")}>{CS.ses.insideH}</small> : null}
          </div>
          {booked ? (
            <div className={k("su-info")}>
              <b>{CS.ses.impact}</b>
              <span>{fill(CS.ses.impactTxt, { n: booked, day: dayLong(x.weekday) })}</span>
            </div>
          ) : null}
        </aside>
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} onClick={save} disabled={!days.length}>
          {CS.ses.save}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.cancel}
        </button>
        <span className={k("grow")} />
        {old ? (
          <button type="button" className={k("btn", "sm", "q")} onClick={remove}>
            {CS.ses.remove}
          </button>
        ) : null}
      </div>
    </DeskDialog>
  );
}
