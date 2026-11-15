"use client";

/** Week plan (P10): every clinic's usual week, the clash alert with one-tap fixes, bulk change, print. */
import type { Ctx } from "./shared";
import type { Bulk, Clash, Edit, Session, Weekday } from "@/lib/clinics-schedule/model";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { CS } from "@/content/clinics-schedule/copy";
import { fill } from "@/content/lab-workspace-v2";
import {
  bulkEdits,
  clashes,
  clashPairs,
  edit,
  nearestFree,
  placesOf,
  sessionsOf,
  WEEK,
} from "@/lib/clinics-schedule/model";
import {
  addDays,
  Chip,
  ChipRow,
  dateTxt,
  dayName,
  DeskDialog,
  hm,
  k,
  nextOn,
  placeName,
  Seg,
  sesTime,
} from "./shared";

/** The fix for one clash: move the later session to the nearest free start that day. */
function fixFor(ctx: Ctx, kk: Clash): Edit | null {
  const x = kk.b;
  const t = nearestFree(ctx.view, x, ctx.d.hours ?? { open: 480, close: 1020 });
  if (t == null) return null;
  const d = t - x.start;
  return edit(ctx.view, "sessions", x.id, {
    ...x,
    start: t,
    end: x.end + d,
    brk: x.brk ? { start: x.brk.start + d, end: x.brk.end + d } : null,
  });
}

export function WeekView({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const list = clashes(view);
  const pairs = clashPairs(list);
  const inClash = new Set(list.flatMap((x) => [x.a.id, x.b.id]));
  const clinics = Object.values(view.clinics).sort((a, b) => a.name.localeCompare(b.name));
  const short = (id: string) => view.clinics[id]?.shortName || view.clinics[id]?.name || "";

  const fixAll = () => {
    const edits: Edit[] = [];
    for (const p of pairs) {
      const e = p.clashes[0] && fixFor(ctx, p.clashes[0]);
      if (e) edits.push(e);
    }
    if (edits.length)
      ctx.commit(
        fill(CS.week.fixed, { n: edits.length }),
        edits,
        fill(CS.week.fixed, { n: edits.length }),
      );
  };

  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{CS.week.title}</h1>
            <span className={k("adate")}>{CS.week.sub}</span>
          </div>
          <span className={k("grow")} />
          <button type="button" className={k("btn", "sm")} onClick={() => ctx.modal({ k: "bulk" })}>
            {CS.week.many}
          </button>
          <button
            type="button"
            className={k("btn", "sm")}
            onClick={() => ctx.modal({ k: "print" })}
          >
            {CS.week.print}
          </button>
        </div>

        {pairs.length ? (
          <div className={k("su-alert")} role="alert">
            <div className={k("su-ah")}>
              <span className={k("su-ai")} aria-hidden="true">
                !
              </span>
              <span className={k("su-at")}>
                <b>
                  {pairs.length === 1
                    ? CS.week.clashOne
                    : fill(CS.week.clashN, { n: pairs.length })}
                </b>
                <small>{CS.week.clashSub}</small>
              </span>
              <span className={k("grow")} />
              {pairs.length > 1 ? (
                <button type="button" className={k("btn", "sm")} onClick={fixAll}>
                  {CS.week.fixAll}
                </button>
              ) : null}
            </div>
            {pairs.map((p) => {
              const first = p.clashes[0];
              if (!first) return null;
              const e = fixFor(ctx, first);
              const after = e?.after as Session | undefined;
              return (
                <div key={`${p.a}|${p.b}`} className={k("su-ar")}>
                  <span className={k("su-ard")}>
                    {p.days.map(dayName).join(", ")}
                    <small>
                      {hm(p.start)}–{hm(p.end)}
                    </small>
                  </span>
                  <span className={k("su-arw")}>
                    <span className={k("su-arp")}>
                      <em>
                        <i style={{ background: view.clinics[p.a]?.colour }} />
                        {view.clinics[p.a]?.name}
                      </em>
                      +
                      <em>
                        <i style={{ background: view.clinics[p.b]?.colour }} />
                        {view.clinics[p.b]?.name}
                      </em>
                    </span>
                    <span className={k("su-art")}>
                      {p.rooms.map((r) => (
                        <em key={r}>
                          <small>{CS.week.tagRoom}</small>
                          {placeName(view, r)}
                        </em>
                      ))}
                      {p.people.map((x) => (
                        <em key={x}>
                          <small>{CS.week.tagWho}</small>
                          {view.people[x]?.name}
                        </em>
                      ))}
                    </span>
                  </span>
                  <span className={k("su-ara")}>
                    <button
                      type="button"
                      className={k("su-afix")}
                      disabled={!e}
                      onClick={() =>
                        e &&
                        ctx.commit(
                          fill(CS.week.fix, {
                            who: short(first.b.clinicId),
                            t: after ? hm(after.start) : "",
                          }),
                          [e],
                        )
                      }
                    >
                      <b>
                        {e && after
                          ? fill(CS.week.fix, {
                              who: short(first.b.clinicId),
                              t: `${hm(after.start)}–${hm(after.end)}`,
                            })
                          : CS.week.noFix}
                      </b>
                      <small>
                        {fill(CS.week.pairLine, {
                          what: CS.week.what[
                            p.rooms.length && p.people.length
                              ? "both"
                              : p.rooms.length
                                ? "room"
                                : "person"
                          ],
                          days: p.days.map(dayName).join(", "),
                          time: "",
                        }).trim()}
                      </small>
                    </button>
                    <button
                      type="button"
                      className={k("btn", "sm", "q")}
                      onClick={() =>
                        ctx.modal({ k: "ses", clinicId: first.b.clinicId, id: first.b.id })
                      }
                    >
                      {CS.week.edit}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className={k("su-card", "su-wk")} role="table" aria-label={CS.week.gridAria}>
          <div className={k("su-wr", "su-wh")} role="row">
            <span className={k("su-wn")} role="columnheader">
              {CS.week.clinic}
            </span>
            {WEEK.map((w) => {
              const xs = Object.values(view.sessions).filter((x) => x.weekday === w);
              return (
                <span key={w} className={k("su-whd")} role="columnheader">
                  <b>{dayName(w)}</b>
                  <small>
                    {fill(CS.week.dayTotal, {
                      p: xs.reduce((n, x) => n + placesOf(x), 0),
                      s: new Set(xs.flatMap((x) => x.personIds)).size,
                    })}
                  </small>
                </span>
              );
            })}
          </div>
          {clinics.map((c) => {
            const r = ctx.rd(c.id);
            return (
              <div key={c.id} className={k("su-wr")} role="row">
                <span className={k("su-rh")} role="rowheader">
                  <button
                    type="button"
                    className={k("su-wn", "su-ln")}
                    onClick={() => ctx.go("clinics", c.id)}
                  >
                    <span>
                      <i style={{ background: c.colour }} />
                      {c.name}
                    </span>
                    <small className={k("su-st", r.status)}>{CS.ready.status[r.status]}</small>
                  </button>
                </span>
                {WEEK.map((w) => {
                  const xs = sessionsOf(view, c.id).filter((x) => x.weekday === w);
                  return (
                    <div
                      key={w}
                      className={k(
                        "su-wc",
                        !xs.length && "zero",
                        xs.some((x) => inClash.has(x.id)) && "clash",
                        xs.some((x) => !x.personIds.length) && "nodoc",
                      )}
                      role="cell"
                    >
                      {xs.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className={k("su-wsx")}
                          onClick={() => ctx.modal({ k: "ses", clinicId: c.id, id: x.id })}
                        >
                          <b>{sesTime(x)}</b>
                          <span>
                            {x.personIds.length
                              ? x.personIds.map((p) => view.people[p]?.name).join(", ")
                              : CS.week.cellNoDoc}
                          </span>
                          <small>
                            {placesOf(x)} · {CS.week.kinds[x.kind]}
                            {inClash.has(x.id) ? ` · ${CS.week.cellClash}` : ""}
                          </small>
                        </button>
                      ))}
                      <button
                        type="button"
                        className={k("su-wadd")}
                        onClick={() => ctx.modal({ k: "ses", clinicId: c.id, weekday: w })}
                        aria-label={fill(CS.week.addIn, { day: dayName(w), clinic: c.name })}
                        title={fill(CS.week.addIn, { day: dayName(w), clinic: c.name })}
                      >
                        +
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function BulkDialog({ ctx, close }: { ctx: Ctx; close: () => void }) {
  const { view, d } = ctx;
  const all = Object.values(view.clinics)
    .filter((c) => sessionsOf(view, c.id).length)
    .sort((a, b) => a.name.localeCompare(b.name));
  const [b, setB] = useState<Bulk>({
    clinicIds: all.map((c) => c.id),
    days: [1, 2, 3, 4, 5],
    act: "time",
    amt: 30,
  });
  const hours = d.hours ?? { open: 480, close: 1020 };
  const edits = bulkEdits(view, b, hours);
  const n = edits.length;
  const nc = new Set(edits.map((e) => (e.after as Session).clinicId)).size;
  const booked = edits.reduce((s, e) => s + (d.booked[e.key] ?? 0), 0);
  const ex = edits[0];
  const exB = ex?.before as Session | undefined;
  const exA = ex?.after as Session | undefined;
  const amtLabel = CS.bulk.amounts[b.act].find(([v]) => v === b.amt)?.[1] ?? "";
  const go = () => {
    ctx.commit(
      fill(b.act === "time" ? CS.bulk.summaryTime : CS.bulk.summaryPlaces, { n, amt: amtLabel }),
      edits,
    );
    close();
  };
  const flip = <T,>(xs: T[], v: T) => (xs.includes(v) ? xs.filter((y) => y !== v) : [...xs, v]);
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.bulk.title}
      tile="clock"
      title={CS.bulk.title}
      lead={CS.bulk.sub}
      cls={k("su-m", "md")}
    >
      <div className={k("su-sec")}>
        <span className={k("cap")}>
          {CS.bulk.clinics}
          <span className={k("su-qk")}>
            <button type="button" onClick={() => setB({ ...b, clinicIds: all.map((c) => c.id) })}>
              {CS.bulk.quick.all}
            </button>
            <button
              type="button"
              onClick={() => setB({ ...b, clinicIds: all.filter((c) => c.live).map((c) => c.id) })}
            >
              {CS.bulk.quick.live}
            </button>
            <button type="button" onClick={() => setB({ ...b, clinicIds: [] })}>
              {CS.bulk.quick.none}
            </button>
          </span>
        </span>
        <ChipRow label={CS.bulk.clinics}>
          {all.map((c) => (
            <Chip
              key={c.id}
              on={b.clinicIds.includes(c.id)}
              onClick={() => setB({ ...b, clinicIds: flip(b.clinicIds, c.id) })}
            >
              <i className={k("su-cdot")} style={{ background: c.colour }} />
              {c.name}
            </Chip>
          ))}
        </ChipRow>
        <span className={k("cap")}>{CS.bulk.days}</span>
        <ChipRow label={CS.bulk.days}>
          {WEEK.map((w) => (
            <Chip
              key={w}
              on={b.days.includes(w)}
              onClick={() => setB({ ...b, days: flip<Weekday>(b.days, w) })}
            >
              {dayName(w)}
            </Chip>
          ))}
        </ChipRow>
        <span className={k("cap")}>{CS.bulk.change}</span>
        <div className={k("su-bkr")}>
          <Seg
            opts={CS.bulk.acts}
            value={b.act}
            onPick={(a) => setB({ ...b, act: a, amt: CS.bulk.amounts[a][2][0] })}
            label={CS.bulk.change}
          />
          <ChipRow>
            {CS.bulk.amounts[b.act].map(([v, l]) => (
              <Chip key={v} on={b.amt === v} onClick={() => setB({ ...b, amt: v })}>
                {l}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <div className={k("su-bkp")}>
          <b>{nc === 1 ? fill(CS.bulk.count1, { s: n }) : fill(CS.bulk.count, { s: n, c: nc })}</b>
          {exB && exA ? (
            <span>
              {fill(CS.bulk.example, {
                day: dayName(exB.weekday),
                clinic: view.clinics[exB.clinicId]?.name ?? "",
                from: b.act === "time" ? sesTime(exB) : String(placesOf(exB)),
                to: b.act === "time" ? sesTime(exA) : String(placesOf(exA)),
              })}
            </span>
          ) : null}
          <small>
            {booked ? fill(CS.bulk.booked, { n: booked }) : CS.bulk.noBooked}{" "}
            {b.act === "places"
              ? CS.bulk.keepSlots
              : fill(CS.bulk.hours, { open: hm(hours.open), close: hm(hours.close) })}
          </small>
        </div>
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} onClick={go} disabled={!n}>
          {n ? fill(CS.bulk.go, { n }) : CS.bulk.none}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}

export function PrintDialog({ ctx, close }: { ctx: Ctx; close: () => void }) {
  const { view, d } = ctx;
  const [blockId, setBlockId] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  useEffect(() => {
    void QRCode.toString(d.bookingUrl, { type: "svg", margin: 0 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [d.bookingUrl]);
  const blocks = Object.values(view.places).filter(
    (p) => p.kind === "block" && Object.values(view.clinics).some((c) => c.blockId === p.id),
  );
  const rows = Object.values(view.clinics)
    .filter((c) => (blockId == null || c.blockId === blockId) && sessionsOf(view, c.id).length)
    .sort((a, b) => a.name.localeCompare(b.name));
  const monday = nextOn(addDays(d.today, 1), 1);
  const days = WEEK.filter((w) =>
    rows.some((c) => sessionsOf(view, c.id).some((x) => x.weekday === w)),
  );
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.print.title}
      tile="print"
      title={CS.print.title}
      lead={CS.print.sub}
      cls={k("su-m")}
    >
      <ChipRow>
        <Chip on={blockId == null} onClick={() => setBlockId(null)}>
          {CS.print.whole}
        </Chip>
        {blocks.map((b) => (
          <Chip key={b.id} on={blockId === b.id} onClick={() => setBlockId(b.id)}>
            {b.name}
          </Chip>
        ))}
      </ChipRow>
      <div className={k("su-paper")}>
        <div className={k("su-pph")}>
          <div>
            <small>{d.hospitalName}</small>
            <h3>{blockId ? placeName(view, blockId) : CS.print.outpatients}</h3>
            <span>{fill(CS.print.sheet, { date: dateTxt(monday) })}</span>
          </div>
          <span className={k("su-ppb")}>Tether</span>
        </div>
        {rows.length ? (
          <table className={k("su-ppt")}>
            <thead>
              <tr>
                <th>{CS.week.clinic}</th>
                {days.map((w) => (
                  <th key={w}>{dayName(w)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <th>
                    <i style={{ background: c.colour }} />
                    {c.name}
                    <small>
                      {[c.referral && CS.print.referral, c.ages === "children" && CS.print.kids]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </th>
                  {days.map((w) => {
                    const xs = sessionsOf(view, c.id).filter((x) => x.weekday === w);
                    return (
                      <td key={w}>
                        {xs.length ? (
                          xs.map((x) => (
                            <span key={x.id}>
                              <b>{sesTime(x)}</b>
                              <small>{x.roomIds.map((r) => placeName(view, r)).join(", ")}</small>
                            </span>
                          ))
                        ) : (
                          <em>·</em>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={k("su-none")}>{CS.print.none}</p>
        )}
        <div className={k("su-ppf")}>
          {/* The SVG is generated locally by `qrcode` from the hospital's booking URL. */}
          <span
            className={k("su-qr")}
            role="img"
            aria-label={fill(CS.print.qrAria, { url: d.bookingUrl })}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div>
            <b>{CS.print.book}</b>
            <span>{CS.print.scan}</span>
            <span>{CS.print.holidays}</span>
            <b>{CS.print.emergency}</b>
          </div>
        </div>
      </div>
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          onClick={() => {
            window.print();
            ctx.say(CS.print.sent);
          }}
        >
          {CS.print.go}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.close}
        </button>
      </div>
    </DeskDialog>
  );
}
