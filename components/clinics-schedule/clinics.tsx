"use client";

/** Clinics: the grouped list and the clinic editor (basics, sessions, booking, fee, desks). Every change a draft. */
import type { Ctx } from "./shared";
import type { Band, Clinic, Person, Status, Weekday } from "@/lib/clinics-schedule/model";
import { useState } from "react";

import { CS } from "@/content/clinics-schedule/copy";
import { CLINIC_PALETTE } from "@/content/clinics-schedule/palette";
import { fill } from "@/content/lab-workspace-v2";
import {
  BANDS,
  colourCheck,
  edit,
  feeFor,
  hueOf,
  placesAWeek,
  placesOf,
  sessionsOf,
  WEEK,
} from "@/lib/clinics-schedule/model";
import {
  Chip,
  ChipRow,
  dayName,
  docsTxt,
  feeTxt,
  Field,
  hit,
  Icon,
  k,
  Pav,
  placeName,
  Seg,
  sesTime,
  Toggle,
  Txt,
  ugx,
} from "./shared";

type Tab = "basics" | "sessions" | "booking" | "fee" | "desks";
const TABS: Tab[] = ["basics", "sessions", "booking", "fee", "desks"];
type Filter = "all" | "setup" | "ready" | "live";
type Group = "dept" | "block" | "state";

export const abbr = (c: Clinic) =>
  (c.shortName || c.name)
    .replace(/[^A-Za-z ]/g, "")
    .slice(0, 2)
    .toUpperCase();

/** Seven little day columns with a bar per session (07:00–19:00). */
export function WeekMini({
  ids,
  colour,
  aria,
}: {
  ids: { weekday: Weekday; start: number; end: number }[];
  colour: string;
  aria: string;
}) {
  const lo = 7 * 60;
  const span = 12 * 60;
  return (
    <span className={k("su-wkm")} aria-label={aria} role="img">
      {WEEK.map((w) => {
        const xs = ids.filter((x) => x.weekday === w);
        return (
          <span
            key={w}
            className={k("su-wd", xs.length > 0 && "on")}
            title={
              xs.length
                ? `${dayName(w)} ${xs.map((x) => `${Math.floor(x.start / 60)}–${Math.floor(x.end / 60)}`).join(", ")}`
                : `${dayName(w)}`
            }
          >
            <span className={k("su-wdt")}>
              {xs.map((x, i) => (
                <i
                  key={i}
                  style={{
                    top: `${(Math.max(0, x.start - lo) / span) * 100}%`,
                    height: `${(Math.max(30, Math.min(x.end, lo + span) - Math.max(x.start, lo)) / span) * 100}%`,
                    background: colour,
                  }}
                />
              ))}
            </span>
            <small>{dayName(w).charAt(0)}</small>
          </span>
        );
      })}
    </span>
  );
}

export function ClinicsView({ ctx }: { ctx: Ctx }) {
  const { view, d } = ctx;
  const [filter, setFilter] = useState<Filter>("all");
  const [group, setGroup] = useState<Group>("dept");
  const [selId, tabSel] = (ctx.sel ?? "").split("#") as [string, Tab | undefined];
  const sel = selId && view.clinics[selId] ? view.clinics[selId] : null;
  const st = (c: Clinic): Status => ctx.rd(c.id).status;
  const all = Object.values(view.clinics)
    .filter((c) =>
      hit(
        ctx.q,
        c.name,
        c.shortName,
        d.departments[c.departmentId]?.name,
        placeName(view, c.blockId),
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const shown = all.filter((c) => filter === "all" || st(c) === filter);
  const keyOf = (c: Clinic) =>
    group === "dept"
      ? (d.departments[c.departmentId]?.name ?? "")
      : group === "block"
        ? placeName(view, c.blockId) || CS.clinics.noBlock
        : CS.ready.status[st(c)];
  const groups = [...new Set(shown.map(keyOf))]
    .sort()
    .map((g) => ({ g, rows: shown.filter((c) => keyOf(c) === g) }));

  const add = () => {
    const id = ctx.newId();
    const used = new Set(Object.values(view.clinics).map((c) => c.colour));
    const dept =
      Object.entries(d.departments).find(([, x]) => x.live)?.[0] ??
      Object.keys(d.departments)[0] ??
      "";
    const name = fill(CS.clinics.newName, { n: Object.keys(view.clinics).length + 1 });
    const c: Clinic = {
      id,
      name,
      shortName: "",
      colour: CLINIC_PALETTE.find((p) => !used.has(p)) ?? CLINIC_PALETTE[0],
      departmentId: dept,
      blockId: null,
      roomIds: [],
      tier: "general",
      ages: "all",
      words: "",
      referral: false,
      confidential: false,
      feeMode: null,
      feeUgx: null,
      feePrivateUgx: null,
      feeOverrides: {},
      rules: {
        aheadDays: 30,
        closes: "start",
        sameDay: true,
        walkins: true,
        reminder: true,
        followUpSkipTriage: false,
      },
      pay: { cash: true, mtn: true, airtel: false },
      payWhen: "arrive",
      team: [],
      live: false,
      paused: false,
      code: null,
    };
    ctx.commit(name, [edit(view, "clinics", id, c)], CS.clinics.added);
    ctx.setSel(id);
  };

  const narrow = !!sel;
  return (
    <div className={k("su-wrap", "su-split")}>
      <div className={k("su-page", "su-l")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{CS.clinics.title}</h1>
            <span className={k("adate")}>
              {fill(CS.clinics.count, { n: Object.keys(view.clinics).length })}
            </span>
          </div>
          <span className={k("grow")} />
          <button type="button" className={k("btn", "sm")} onClick={add}>
            {CS.clinics.add}
          </button>
        </div>
        <div className={k("su-ctb", narrow && "narrow")}>
          <div className={k("su-cfs")} role="group" aria-label={CS.clinics.title}>
            {(["all", "setup", "ready", "live"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={k(filter === f && "on", f === "setup" && "warn")}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {CS.clinics.filters[f]}
                <b>{f === "all" ? all.length : all.filter((c) => st(c) === f).length}</b>
              </button>
            ))}
          </div>
          <span className={k("su-grow")} />
          <span className={k("su-cgl")}>{CS.clinics.groupBy}</span>
          <Seg
            opts={(["dept", "block", "state"] as Group[]).map(
              (g) => [g, CS.clinics.groups[g]] as const,
            )}
            value={group}
            onPick={setGroup}
            label={CS.clinics.groupBy}
          />
        </div>
        <div className={k("su-cls", narrow && "narrow")}>
          {groups.map(({ g, rows }) => (
            <section key={g} className={k("su-cgp")}>
              <div className={k("su-cgh")}>
                <b>{g}</b>
                <small>
                  {fill(CS.clinics.groupMeta, {
                    n: rows.length,
                    p: rows.reduce((n, c) => n + placesAWeek(view, c.id), 0),
                  })}
                </small>
              </div>
              <div className={k("su-card", "su-cgc")}>
                {rows.map((c) => (
                  <ClinicRow key={c.id} ctx={ctx} c={c} on={sel?.id === c.id} />
                ))}
              </div>
            </section>
          ))}
          {!groups.length ? (
            <div className={k("empty")}>
              <b>{CS.clinics.none}</b>
              <span>{CS.clinics.noneSub}</span>
            </div>
          ) : null}
        </div>
      </div>
      {sel ? <Editor key={sel.id} ctx={ctx} c={sel} tab0={tabSel} /> : null}
    </div>
  );
}

function ClinicRow({ ctx, c, on }: { ctx: Ctx; c: Clinic; on: boolean }) {
  const { view } = ctx;
  const r = ctx.rd(c.id);
  const team = c.team.map((p) => view.people[p]).filter(Boolean) as Person[];
  const f = feeTxt(c, view);
  const rooms = c.roomIds
    .map((id) => placeName(view, id))
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      className={k("su-cr2", on && "sel")}
      onClick={() => ctx.setSel(on ? null : c.id)}
      aria-pressed={on}
    >
      <span className={k("su-ctile")} style={{ background: c.colour }} aria-hidden="true">
        {abbr(c)}
      </span>
      <span className={k("su-cn")}>
        <b>
          {c.name}
          {c.tier !== "general" ? (
            <em className={k("su-tag")}>{CS.clinics.tiers[c.tier]}</em>
          ) : null}
          {c.ages === "children" ? <em className={k("su-ctag")}>{CS.clinics.children}</em> : null}
          {c.referral ? <em className={k("su-ctag")}>{CS.clinics.referral}</em> : null}
        </b>
        <small>
          {[placeName(view, c.blockId), rooms].filter(Boolean).join(" · ") || CS.clinics.noBlock}
        </small>
      </span>
      <WeekMini ids={sessionsOf(view, c.id)} colour={c.colour} aria={CS.week.title} />
      <span className={k("su-avs2")}>
        {team.slice(0, 3).map((p) => (
          <Pav key={p.id} p={p} />
        ))}
        {team.length > 3 ? <em>+{team.length - 3}</em> : null}
        {!team.length ? <small className={k("su-noteam")}>{CS.clinics.noOne}</small> : null}
      </span>
      <span className={k("su-cfee", f.unset && "unset")}>
        <b>{f.t}</b>
        <small>{c.feeMode ? CS.ed.feeModes.find((m) => m[0] === c.feeMode)?.[1] : ""}</small>
      </span>
      <span className={k("su-cfee")}>
        <b>{placesAWeek(view, c.id)}</b>
        <small>{CS.ready.aWeek}</small>
      </span>
      <span className={k("su-st", r.status)}>{CS.ready.status[r.status]}</span>
    </button>
  );
}

function Editor({ ctx, c, tab0 }: { ctx: Ctx; c: Clinic; tab0?: Tab }) {
  const { view } = ctx;
  const [tab, setTab] = useState<Tab>(tab0 && TABS.includes(tab0) ? tab0 : "basics");
  const r = ctx.rd(c.id);
  const bad = (t: Tab) =>
    r.blockers.some(
      (b) =>
        ({
          sessions: "sessions",
          people: "sessions",
          fee: "fee",
          desk: "desks",
          screen: "desks",
          words: "basics",
          dept: "basics",
        })[b.k] === t,
    );
  const set = (what: string, patch: Partial<Clinic>) =>
    ctx.commit(fill(CS.ed.changed, { name: c.name, what }), [
      edit(view, "clinics", c.id, { ...c, ...patch }),
    ]);

  const dup = () => {
    const id = ctx.newId();
    const copy: Clinic = {
      ...c,
      id,
      name: fill(CS.ed.copy, { name: c.name }),
      live: false,
      paused: false,
      code: null,
      confidential: false,
    };
    const edits = [edit(view, "clinics", id, copy)];
    for (const x of sessionsOf(view, c.id)) {
      const sid = ctx.newId();
      edits.push(edit(view, "sessions", sid, { ...x, id: sid, clinicId: id }));
    }
    ctx.commit(copy.name, edits, CS.ed.copied);
    ctx.setSel(id);
  };
  const archive = () => {
    const edits = [
      edit(view, "clinics", c.id, null),
      ...sessionsOf(view, c.id).map((x) => edit(view, "sessions", x.id, null)),
    ];
    ctx.commit(
      fill(CS.ed.archived, { name: c.name }),
      edits,
      fill(CS.ed.archived, { name: c.name }),
    );
    ctx.setSel(null);
  };

  return (
    <aside className={k("det", "su-det")} aria-label={c.name}>
      <div className={k("su-dh")}>
        <span className={k("su-sw")} style={{ background: c.colour }} aria-hidden="true" />
        <div>
          <h2>{c.name}</h2>
          <p>
            <span className={k("su-st", r.status)}>
              {c.paused ? CS.ed.pausedFoot : CS.ready.status[r.status]}
            </span>
          </p>
        </div>
        <button type="button" className={k("btn", "sm", "q", "x")} onClick={() => ctx.setSel(null)}>
          {CS.ed.close}
        </button>
      </div>
      <div className={k("su-edact")}>
        <button
          type="button"
          className={k("btn", "sm")}
          onClick={() => ctx.modal({ k: "ppv", id: c.id })}
        >
          {CS.ed.preview}
        </button>
        <button type="button" className={k("btn", "sm")} onClick={dup}>
          {CS.ed.duplicate}
        </button>
        {!c.live ? (
          <button type="button" className={k("btn", "sm", "q")} onClick={archive}>
            {CS.ed.archive}
          </button>
        ) : null}
      </div>
      {r.status === "setup" ? (
        <div className={k("su-blk")}>
          <b>{CS.ed.before}</b>
          {r.blockers.map((b) => (
            <button
              key={b.k}
              type="button"
              className={k("su-blki")}
              onClick={() =>
                b.k === "dept"
                  ? window.open("/hospital-admin/services", "_self")
                  : setTab(
                      (
                        {
                          sessions: "sessions",
                          people: "sessions",
                          fee: "fee",
                          desk: "desks",
                        } as Record<string, Tab>
                      )[b.k] ?? "basics",
                    )
              }
            >
              <span>{CS.ready.checks[b.k]}</span>
              <small>
                {b.k === "people"
                  ? fill(CS.ready.why.people, { days: (b.detail ?? []).map(dayName).join(", ") })
                  : CS.ready.why[b.k]}
              </small>
            </button>
          ))}
        </div>
      ) : null}
      <div className={k("ttabs", "su-etabs")} role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={k(tab === t && "on", bad(t) && "bad")}
            onClick={() => setTab(t)}
          >
            {CS.ed.tabs[t]}
          </button>
        ))}
      </div>
      {tab === "basics" ? <Basics ctx={ctx} c={c} set={set} /> : null}
      {tab === "sessions" ? <Sessions ctx={ctx} c={c} /> : null}
      {tab === "booking" ? <Booking c={c} set={set} /> : null}
      {tab === "fee" ? <Fee ctx={ctx} c={c} set={set} /> : null}
      {tab === "desks" ? <Desks ctx={ctx} c={c} /> : null}
      <div className={k("su-dfoot")}>
        {r.status === "ready" ? (
          <button
            type="button"
            className={k("btn", "k")}
            onClick={() => ctx.modal({ k: "open", id: c.id })}
          >
            {CS.ed.openBtn}
          </button>
        ) : null}
        {r.status === "kids" ? <span className={k("su-livetxt")}>{CS.ed.kidsFoot}</span> : null}
        {r.status === "live" && !c.paused ? (
          <>
            <span className={k("su-livetxt")}>{CS.ed.liveFoot}</span>
            <button
              type="button"
              className={k("btn", "sm", "q")}
              onClick={() => ctx.modal({ k: "pause", id: c.id })}
            >
              {CS.ed.pauseBtn}
            </button>
          </>
        ) : null}
        {c.paused ? (
          <>
            <span className={k("su-livetxt")}>{CS.ed.pausedFoot}</span>
            <button
              type="button"
              className={k("btn", "sm")}
              onClick={() =>
                ctx.commit(fill(CS.pause.resume, { name: c.name }), [
                  edit(view, "clinics", c.id, { ...c, paused: false }),
                ])
              }
            >
              {CS.ed.resume}
            </button>
          </>
        ) : null}
        {r.status === "setup" ? <span className={k("su-livetxt")}>{CS.ed.fixFirst}</span> : null}
      </div>
    </aside>
  );
}

type Set = (what: string, patch: Partial<Clinic>) => void;

function Basics({ ctx, c, set }: { ctx: Ctx; c: Clinic; set: Set }) {
  const { view, d } = ctx;
  const [pick, setPick] = useState(false);
  const [nb, setNb] = useState<{ name: string; tier: "general" | "private" } | null>(null);
  const [room, setRoom] = useState("");
  const blocks = Object.values(view.places).filter((p) => p.kind === "block");
  const block = c.blockId ? view.places[c.blockId] : null;
  const rooms = Object.values(view.places).filter(
    (p) => p.kind === "room" && p.parentId === c.blockId,
  );
  const xs = sessionsOf(view, c.id);
  const docs = [...new Set(xs.flatMap((x) => x.personIds))]
    .map((p) => view.people[p]?.name)
    .filter(Boolean);
  const addBlock = () => {
    if (!nb?.name.trim()) return;
    const id = ctx.newId();
    ctx.commit(nb.name.trim(), [
      edit(view, "places", id, {
        id,
        kind: "block",
        name: nb.name.trim(),
        parentId: null,
        tier: nb.tier,
      }),
      edit(view, "clinics", c.id, { ...c, blockId: id, roomIds: [] }),
    ]);
    setNb(null);
  };
  const addRoom = () => {
    const name = room.trim();
    if (!name || !c.blockId) return;
    if (rooms.some((x) => x.name.toLowerCase() === name.toLowerCase()))
      return ctx.say(fill(CS.ed.roomExists, { name, block: block?.name ?? "" }));
    const id = ctx.newId();
    ctx.commit(name, [
      edit(view, "places", id, { id, kind: "room", name, parentId: c.blockId, tier: null }),
      edit(view, "clinics", c.id, { ...c, roomIds: [...c.roomIds, id] }),
    ]);
    setRoom("");
  };
  const over = c.words.length > 140;
  return (
    <div className={k("su-sec")}>
      <Field as="label" label={CS.ed.name}>
        <Txt value={c.name} onCommit={(v) => v.trim() && set(CS.ed.name, { name: v.trim() })} />
      </Field>
      <Field as="label" label={CS.ed.short} hint={CS.ed.shortH}>
        <Txt
          value={c.shortName}
          maxLength={16}
          onCommit={(v) => set(CS.ed.short, { shortName: v.trim() })}
        />
      </Field>
      <Field label={CS.ed.colour} hint={CS.ed.colourH}>
        <div className={k("su-pal")}>
          {CLINIC_PALETTE.map((p) => (
            <button
              key={p}
              type="button"
              className={k(c.colour === p && "on")}
              style={{ background: p }}
              aria-pressed={c.colour === p}
              aria-label={`${CS.ed.colour} ${p}`}
              onClick={() => set(CS.ed.colour, { colour: p })}
            />
          ))}
          <button
            type="button"
            className={k("su-palc")}
            onClick={() => setPick((x) => !x)}
            aria-label={CS.ed.custom}
            title={CS.ed.custom}
            aria-expanded={pick}
          >
            <Icon n="eye" size={14} />
          </button>
        </div>
        {pick ? (
          <ColourPicker
            value={c.colour}
            close={() => setPick(false)}
            use={(hex) => {
              set(CS.ed.colour, { colour: hex });
              setPick(false);
            }}
          />
        ) : null}
      </Field>
      <Field label={CS.ed.dept}>
        <ChipRow label={CS.ed.dept}>
          {Object.entries(d.departments).map(([id, x]) => (
            <Chip
              key={id}
              on={c.departmentId === id}
              onClick={() => set(CS.ed.dept, { departmentId: id })}
            >
              {x.name}
            </Chip>
          ))}
        </ChipRow>
      </Field>
      <Field label={CS.ed.where} hint={CS.ed.whereH}>
        <ChipRow label={CS.ed.where}>
          {blocks.map((b) => (
            <Chip
              key={b.id}
              on={c.blockId === b.id}
              onClick={() => {
                set(CS.ed.where, { blockId: b.id, roomIds: [] });
                if (c.live) ctx.say(fill(CS.ed.moved, { name: c.name, block: b.name }));
              }}
            >
              {b.name}
              {b.tier === "private" ? <em className={k("su-tag")}>{CS.ed.privateWing}</em> : null}
            </Chip>
          ))}
          {!nb ? (
            <Chip cls="su-chipadd" onClick={() => setNb({ name: "", tier: "general" })}>
              {CS.ed.newBlock}
            </Chip>
          ) : null}
        </ChipRow>
        {nb ? (
          <div className={k("su-nb")}>
            <input
              className={k("in")}
              value={nb.name}
              onChange={(e) => setNb({ ...nb, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addBlock()}
              placeholder={CS.ed.newBlockPh}
              aria-label={CS.ed.where}
              autoFocus
            />
            <Seg
              opts={
                [
                  ["general", CS.clinics.tiers.general],
                  ["private", CS.ed.privateWing],
                ] as const
              }
              value={nb.tier}
              onPick={(t) => setNb({ ...nb, tier: t })}
            />
            {nb.name.trim() ? (
              <button type="button" className={k("btn", "sm")} onClick={addBlock}>
                {CS.ed.add}
              </button>
            ) : null}
            <button type="button" className={k("btn", "sm", "q")} onClick={() => setNb(null)}>
              {CS.ed.cancel}
            </button>
          </div>
        ) : null}
      </Field>
      {block ? (
        <Field label={fill(CS.ed.rooms, { block: block.name })}>
          <ChipRow>
            {rooms.map((x) => (
              <Chip
                key={x.id}
                on={c.roomIds.includes(x.id)}
                onClick={() =>
                  set(CS.ed.rooms.replace(" in {block}", ""), {
                    roomIds: c.roomIds.includes(x.id)
                      ? c.roomIds.filter((y) => y !== x.id)
                      : [...c.roomIds, x.id],
                  })
                }
              >
                {x.name}
              </Chip>
            ))}
          </ChipRow>
          <div className={k("su-addr")}>
            <input
              className={k("in")}
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRoom()}
              placeholder={CS.ed.roomPh}
              aria-label={CS.ed.roomPh}
            />
            {room.trim() ? (
              <button type="button" className={k("btn", "sm")} onClick={addRoom}>
                {CS.ed.addRoom}
              </button>
            ) : null}
          </div>
        </Field>
      ) : null}
      <Field label={CS.ed.serves}>
        <div className={k("su-kinds", "three")}>
          {CS.ed.tiers.map(([v, l, sub]) => (
            <button
              key={v}
              type="button"
              className={k("su-kind", c.tier === v && "on")}
              aria-pressed={c.tier === v}
              onClick={() => set(CS.ed.serves, { tier: v })}
            >
              <b>{l}</b>
              <small>{sub}</small>
            </button>
          ))}
        </div>
      </Field>
      <Field label={CS.ed.ages}>
        <Seg
          opts={CS.ed.agesOpts}
          value={c.ages}
          onPick={(v) => set(CS.ed.ages, { ages: v })}
          label={CS.ed.ages}
        />
      </Field>
      {c.ages === "children" ? (
        <div className={k("su-locks")}>
          <div>
            <span className={k("su-lock")} aria-hidden="true">
              <Icon n="keys" size={12} />
            </span>
            <span>
              <b>{CS.ed.kidsTitle}</b>
              <small>{CS.ed.kidsBody}</small>
            </span>
          </div>
        </div>
      ) : null}
      <Words c={c} set={set} over={over} />
      <Toggle
        on={c.referral}
        flip={() => set(CS.ed.toggles.referral[0], { referral: !c.referral })}
        t={CS.ed.toggles.referral}
      />
      <div className={k("su-prev")}>
        <span className={k("cap")}>{CS.ed.howSee}</span>
        <div className={k("su-pc")}>
          <span className={k("su-pcd")} style={{ background: c.colour }} aria-hidden="true" />
          <div>
            <b>{c.name}</b>
            {c.words ? <p>{c.words}</p> : null}
            <small>
              {[placeName(view, c.blockId), c.roomIds.map((x) => placeName(view, x)).join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </small>
            <small>
              {fill(CS.ed.prevLine, {
                days:
                  [...new Set(xs.map((x) => dayName(x.weekday)))].join(", ") || CS.ed.noSessions,
                fee: feeTxt(c, view).t,
              })}
            </small>
            {docs.length ? <small>{docs.join(", ")}</small> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Words({ c, set, over }: { c: Clinic; set: Set; over: boolean }) {
  const [v, setV] = useState(c.words);
  return (
    <label className={k("su-f")}>
      <span>
        {CS.ed.words}
        <small className={k(v.length > 140 && "over")}>{fill(CS.ed.wordsN, { n: v.length })}</small>
      </span>
      <textarea
        className={k("in", "su-ta")}
        rows={2}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== c.words && set(CS.ed.words, { words: v })}
        aria-invalid={over || v.length > 140}
      />
    </label>
  );
}

function Sessions({ ctx, c }: { ctx: Ctx; c: Clinic }) {
  const { view, d } = ctx;
  const xs = sessionsOf(view, c.id);
  const days = [...new Set(xs.map((x) => x.weekday))];
  return (
    <div className={k("su-sec")}>
      <p className={k("su-sum")}>
        <b>{days.map(dayName).join(", ") || CS.ed.noSessions}</b> · <b>{placesAWeek(view, c.id)}</b>{" "}
        {CS.ready.capTitle.toLowerCase()}
      </p>
      {WEEK.map((w) => {
        const list = xs.filter((x) => x.weekday === w);
        return (
          <div key={w} className={k("su-day")}>
            <span className={k("su-dl")}>{dayName(w)}</span>
            <div className={k("su-dss")}>
              {list.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={k("su-ses")}
                  onClick={() => ctx.modal({ k: "ses", clinicId: c.id, id: x.id })}
                >
                  <b>{sesTime(x)}</b>
                  <span>
                    {fill(CS.ed.sesLine, {
                      kind: CS.week.kinds[x.kind],
                      room: x.roomIds.map((r) => placeName(view, r)).join(", ") || CS.ses.noRoom,
                    })}
                  </span>
                  <span className={k(!x.personIds.length && "su-nodoc")}>{docsTxt(view, x)}</span>
                  <small>
                    {placesOf(x)} {CS.ses.nums.places}
                    {d.booked[x.id] ? ` ${fill(CS.ed.booked, { n: d.booked[x.id] ?? 0 })}` : ""}
                  </small>
                </button>
              ))}
              {!list.length ? <span className={k("su-closed")}>{CS.ed.closed}</span> : null}
            </div>
            <button
              type="button"
              className={k("su-add")}
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
}

function Booking({ c, set }: { c: Clinic; set: Set }) {
  const rule = (what: string, p: Partial<Clinic["rules"]>) =>
    set(what, { rules: { ...c.rules, ...p } });
  return (
    <div className={k("su-sec")}>
      <Field label={CS.ed.bookingOpens}>
        <Seg
          opts={CS.ed.ahead}
          value={c.rules.aheadDays}
          onPick={(v) => rule(CS.ed.bookingOpens, { aheadDays: v })}
          label={CS.ed.bookingOpens}
        />
        <small className={k("su-h")}>{CS.ed.bookingOpensH}</small>
      </Field>
      <Field label={CS.ed.bookingCloses}>
        <Seg
          opts={CS.ed.closes}
          value={c.rules.closes}
          onPick={(v) => rule(CS.ed.bookingCloses, { closes: v })}
          label={CS.ed.bookingCloses}
        />
      </Field>
      <Toggle
        on={c.rules.sameDay}
        flip={() => rule(CS.ed.toggles.sameDay[0], { sameDay: !c.rules.sameDay })}
        t={CS.ed.toggles.sameDay}
      />
      <Toggle
        on={c.rules.walkins}
        flip={() => rule(CS.ed.toggles.walkins[0], { walkins: !c.rules.walkins })}
        t={CS.ed.toggles.walkins}
      />
      <Toggle
        on={c.rules.reminder}
        flip={() => rule(CS.ed.toggles.reminder[0], { reminder: !c.rules.reminder })}
        t={CS.ed.toggles.reminder}
      />
      {/* D-CS-19: off until the CSO signs it per clinic; the switch only turns it off. */}
      <Toggle
        on={c.rules.followUpSkipTriage}
        disabled={!c.rules.followUpSkipTriage}
        flip={() => rule(CS.ed.toggles.followUpSkipTriage[0], { followUpSkipTriage: false })}
        t={CS.ed.toggles.followUpSkipTriage}
      />
      {!c.rules.followUpSkipTriage ? <small className={k("su-h")}>{CS.ed.fuSigned}</small> : null}
      <div className={k("su-locks")}>
        {CS.ed.locked.map(([b, s]) => (
          <div key={b}>
            <span className={k("su-lock")} aria-hidden="true">
              <Icon n="keys" size={12} />
            </span>
            <span>
              <b>{b}</b>
              <small>{s}</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fee({ ctx, c, set }: { ctx: Ctx; c: Clinic; set: Set }) {
  const { view } = ctx;
  const [adding, setAdding] = useState(false);
  const team = c.team.map((p) => view.people[p]).filter(Boolean) as Person[];
  const bands = BANDS.filter((b) => team.some((p) => p.band === b));
  const priv = c.tier !== "general";
  const own = (b: Band, kind: "gen" | "priv", v: string) => {
    const o = {
      ...c.feeOverrides,
      [b]: { ...c.feeOverrides[b], [kind]: v === "" ? undefined : Number(v) },
    };
    set(CS.ed.fee, { feeOverrides: o });
  };
  const cands = Object.values(view.people)
    .filter((p) => !c.team.includes(p.id))
    .sort(
      (a, b) =>
        Number(b.departmentId === c.departmentId) - Number(a.departmentId === c.departmentId) ||
        a.name.localeCompare(b.name),
    );
  return (
    <div className={k("su-sec")}>
      <div className={k("su-kinds", "three")}>
        {CS.ed.feeModes.map(([v, l, sub]) => (
          <button
            key={v}
            type="button"
            className={k("su-kind", c.feeMode === v && "on")}
            aria-pressed={c.feeMode === v}
            onClick={() => set(l, { feeMode: v })}
          >
            <b>{l}</b>
            <small>{sub}</small>
          </button>
        ))}
      </div>
      {c.feeMode === "band" ? (
        <>
          <div className={k("su-gt")}>
            <div className={k("su-gr", "su-grh")}>
              <span>{CS.ed.bandCols.band}</span>
              <span>{CS.ed.bandCols.gen}</span>
              <span>{CS.ed.bandCols.priv}</span>
            </div>
            {bands.map((b) => {
              const o = c.feeOverrides[b];
              return (
                <div key={b} className={k("su-gr")}>
                  <span className={k("su-gl")}>
                    <b>{CS.bands.labels[b]}</b>
                    <small>
                      {team
                        .filter((p) => p.band === b)
                        .map((p) => p.name)
                        .join(", ")}
                    </small>
                    {o ? (
                      <button
                        type="button"
                        className={k("su-lnk")}
                        onClick={() =>
                          set(CS.ed.fee, { feeOverrides: { ...c.feeOverrides, [b]: undefined } })
                        }
                      >
                        {CS.ed.setHere}
                      </button>
                    ) : null}
                  </span>
                  <Txt
                    numeric
                    className={k("su-gi", o?.gen != null && "own")}
                    value={String(feeFor(c, b, false, view.bands) ?? "")}
                    onCommit={(v) => own(b, "gen", v)}
                    aria-label={`${CS.bands.labels[b]} ${CS.ed.bandCols.gen}`}
                  />
                  <Txt
                    numeric
                    className={k("su-gi", o?.priv != null && "own")}
                    value={String(feeFor(c, b, true, view.bands) ?? "")}
                    onCommit={(v) => own(b, "priv", v)}
                    aria-label={`${CS.bands.labels[b]} ${CS.ed.bandCols.priv}`}
                  />
                </div>
              );
            })}
            {!bands.length ? <p className={k("su-note", "su-gpad")}>{CS.ed.feeFirst}</p> : null}
          </div>
          <div className={k("su-team")}>
            <div className={k("su-teamh")}>
              <b>{CS.ed.team}</b>
              {!adding ? (
                <button type="button" className={k("btn", "sm")} onClick={() => setAdding(true)}>
                  {CS.ed.addDoc}
                </button>
              ) : null}
            </div>
            {team.map((p) => (
              <div key={p.id} className={k("su-tm2")}>
                <Pav p={p} />
                <span className={k("su-tmn")}>
                  <b>{p.name}</b>
                  <small>
                    {CS.bands.labels[p.band]}
                    {p.officeId ? (
                      <small className={k("su-off")}>{placeName(view, p.officeId)}</small>
                    ) : null}
                    {!p.officeId && (p.band === "specialist" || p.band === "consultant") ? (
                      <button
                        type="button"
                        className={k("su-lnk")}
                        onClick={() => ctx.go("people", p.id)}
                      >
                        {CS.ed.noOffice}
                      </button>
                    ) : null}
                  </small>
                </span>
                <span className={k("su-tmf")}>
                  {ugx(feeFor(c, p.band, false, view.bands) ?? 0)}
                  <button
                    type="button"
                    className={k("su-x")}
                    onClick={() => set(CS.ed.team, { team: c.team.filter((x) => x !== p.id) })}
                    aria-label={`${CS.ed.cancel} ${p.name}`}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))}
            {adding ? (
              <div className={k("su-addp")}>
                <div className={k("su-teamh")}>
                  <small>{CS.ed.pickH}</small>
                  <button
                    type="button"
                    className={k("btn", "sm", "q")}
                    onClick={() => setAdding(false)}
                  >
                    {CS.ed.done}
                  </button>
                </div>
                <ChipRow>
                  {cands.map((p) => (
                    <Chip
                      key={p.id}
                      cls="su-nchip"
                      onClick={() => {
                        set(CS.ed.team, { team: [...c.team, p.id] });
                        ctx.say(fill(CS.ed.teamAdded, { name: p.name }));
                      }}
                    >
                      <span>+ {p.name}</span>
                      <small>{p.role}</small>
                    </Chip>
                  ))}
                </ChipRow>
                <button
                  type="button"
                  className={k("btn", "sm", "q", "su-lft")}
                  onClick={() => ctx.modal({ k: "addP" })}
                >
                  {CS.ed.someoneNew}
                </button>
              </div>
            ) : null}
          </div>
          <p className={k("su-note")}>{CS.ed.feeHow}</p>
          <button
            type="button"
            className={k("btn", "sm", "q", "su-lft")}
            onClick={() => ctx.modal({ k: "bands" })}
          >
            {CS.ready.bands}
          </button>
        </>
      ) : null}
      {c.feeMode === "flat" ? (
        <>
          <Field as="label" label={priv ? CS.ed.feeGen : CS.ed.fee}>
            <span className={k("su-ugx")}>
              <em>UGX</em>
              <Txt
                numeric
                value={c.feeUgx == null ? "" : String(c.feeUgx)}
                onCommit={(v) => set(CS.ed.fee, { feeUgx: v === "" ? null : Number(v) })}
                placeholder={CS.ed.feePh}
              />
            </span>
          </Field>
          <ChipRow>
            {[10000, 20000, 30000, 50000].map((n) => (
              <Chip key={n} on={c.feeUgx === n} onClick={() => set(CS.ed.fee, { feeUgx: n })}>
                {n.toLocaleString("en-US")}
              </Chip>
            ))}
          </ChipRow>
          {priv ? (
            <Field as="label" label={CS.ed.feePriv} hint={CS.ed.feePrivH}>
              <span className={k("su-ugx")}>
                <em>UGX</em>
                <Txt
                  numeric
                  value={c.feePrivateUgx == null ? "" : String(c.feePrivateUgx)}
                  onCommit={(v) =>
                    set(CS.ed.feePriv, { feePrivateUgx: v === "" ? null : Number(v) })
                  }
                  placeholder={CS.ed.feePh}
                />
              </span>
            </Field>
          ) : null}
        </>
      ) : null}
      {c.feeMode && c.feeMode !== "free" ? (
        <>
          <p className={k("su-note")}>{CS.ed.feeNew}</p>
          <Field label={CS.ed.pay}>
            <ChipRow label={CS.ed.pay}>
              {(["cash", "mtn", "airtel"] as const).map((p) => (
                <Chip
                  key={p}
                  on={c.pay[p]}
                  onClick={() => set(CS.ed.pay, { pay: { ...c.pay, [p]: !c.pay[p] } })}
                >
                  {CS.ed.payOpts[p]}
                </Chip>
              ))}
            </ChipRow>
          </Field>
          <Field label={CS.ed.payWhen}>
            <Seg
              opts={CS.ed.payWhenOpts}
              value={c.payWhen}
              onPick={(v) => set(CS.ed.payWhen, { payWhen: v })}
              label={CS.ed.payWhen}
            />
          </Field>
        </>
      ) : null}
      <p className={k("su-note")}>{CS.ed.payNote}</p>
    </div>
  );
}

function Desks({ ctx, c }: { ctx: Ctx; c: Clinic }) {
  const { view } = ctx;
  return (
    <div className={k("su-sec")}>
      <p className={k("su-note")}>{CS.ed.desksH}</p>
      {Object.values(view.devices)
        .filter((d) => d.kind !== "tablet")
        .map((d) => {
          const on = d.clinicIds.includes(c.id);
          return (
            <button
              key={d.id}
              type="button"
              className={k("su-dk", on && "on")}
              aria-pressed={on}
              onClick={() =>
                ctx.commit(
                  fill(on ? CS.devices.uncovers : CS.devices.covers, {
                    name: d.name,
                    clinic: c.name,
                  }),
                  [
                    edit(view, "devices", d.id, {
                      ...d,
                      clinicIds: on
                        ? d.clinicIds.filter((x) => x !== c.id)
                        : [...d.clinicIds, c.id],
                    }),
                  ],
                )
              }
            >
              <span className={k("box")} aria-hidden="true">
                {on ? <Icon n="tick" size={12} w={3} /> : null}
              </span>
              <span>
                <b>{d.name}</b>
                <small>
                  {fill(CS.ed.devLine, { kind: CS.devices.kinds[d.kind], place: d.place })}
                </small>
              </span>
            </button>
          );
        })}
    </div>
  );
}

/* ─── colour picker (CS5): shade square, hue, formats, swatches, screen picker; red and too-light refused ─── */

const hsvHex = (h: number, s: number, v: number) => {
  const f = (n: number) => {
    const kk = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1))));
  };
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};
const hexHsv = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r = 0, g = 0, b = 0] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const v = Math.max(r, g, b);
  const dd = v - Math.min(r, g, b);
  return { h: hueOf(hex).h, s: v ? dd / v : 0, v };
};
const rgbOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hslOf = (hex: string) => {
  const [r = 0, g = 0, b = 0] = rgbOf(hex).map((x) => x / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  return [Math.round(hueOf(hex).h), Math.round(s * 100), Math.round(l * 100)];
};
const hslHex = (h: number, s: number, l: number) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const kk = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(kk - 3, 9 - kk, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};
type Fmt = "hex" | "rgb" | "hsl" | "hsb";

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

function ColourPicker({
  value,
  close,
  use,
}: {
  value: string;
  close: () => void;
  use: (hex: string) => void;
}) {
  const [hsv, setHsv] = useState(() =>
    hexHsv(/^#[0-9a-f]{6}$/i.test(value) ? value : CLINIC_PALETTE[0]),
  );
  const [fmt, setFmt] = useState<Fmt>("hex");
  const [hexIn, setHexIn] = useState<string | null>(null);
  const hex = hsvHex(hsv.h, hsv.s, hsv.v);
  const chk = colourCheck(hex);
  const pass = !chk.ok ? CS.ed.pass.fail : chk.ratio >= 4.5 ? CS.ed.pass.aa : CS.ed.pass.ok;
  const setHex = (h: string) =>
    /^#?[0-9a-f]{6}$/i.test(h) && setHsv(hexHsv(`#${h.replace("#", "")}`.toUpperCase()));
  // the brightness at which this hue/saturation first reaches 3:1 on white (the line to stay below)
  let line = 1;
  for (let v = 1; v >= 0; v -= 0.02)
    if (colourCheck(hsvHex(hsv.h, hsv.s, v)).ratio >= 3) {
      line = v;
      break;
    }
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHsv((x) => ({
      ...x,
      s: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      v: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
    }));
  };
  const key = (e: React.KeyboardEvent) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const m: Record<string, [number, number]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, d],
      ArrowDown: [0, -d],
    };
    const mv = m[e.key];
    if (!mv) return;
    e.preventDefault();
    setHsv((x) => ({
      ...x,
      s: Math.min(1, Math.max(0, x.s + mv[0])),
      v: Math.min(1, Math.max(0, x.v + mv[1])),
    }));
  };
  const fields: [string, number, (n: number) => void][] =
    fmt === "rgb"
      ? rgbOf(hex).map(
          (n, i) =>
            [
              ["R", "G", "B"][i],
              n,
              (x: number) => {
                const c = rgbOf(hex);
                c[i] = Math.min(255, x);
                setHex(c.map((y) => y.toString(16).padStart(2, "0")).join(""));
              },
            ] as [string, number, (n: number) => void],
        )
      : fmt === "hsl"
        ? hslOf(hex).map(
            (n, i) =>
              [
                ["H", "S", "L"][i] ?? "",
                n,
                (x: number) => {
                  const c = hslOf(hex);
                  c[i] = Math.min(i ? 100 : 359, x);
                  setHex(hslHex(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0));
                },
              ] as [string, number, (n: number) => void],
          )
        : [
            ["H", Math.round(hsv.h), (x: number) => setHsv({ ...hsv, h: Math.min(359, x) })],
            [
              "S",
              Math.round(hsv.s * 100),
              (x: number) => setHsv({ ...hsv, s: Math.min(100, x) / 100 }),
            ],
            [
              "B",
              Math.round(hsv.v * 100),
              (x: number) => setHsv({ ...hsv, v: Math.min(100, x) / 100 }),
            ],
          ];
  const msg =
    chk.why === "red"
      ? CS.ed.red
      : chk.why === "light"
        ? CS.ed.light
        : chk.why === "bad"
          ? CS.ed.bad
          : null;
  return (
    <div className={k("su-cpk")} role="dialog" aria-label={CS.ed.custom}>
      <div className={k("su-cpt")}>
        <span className={k("su-cpsw")} style={{ background: hex }} aria-hidden="true" />
        <b className={k("mono")}>{hex}</b>
        <span
          className={k("su-cpc", chk.ok ? "ok" : "no")}
          title={fill(CS.ed.contrast, { pass, r: chk.ratio.toFixed(1) })}
        >
          {pass} · {chk.ratio.toFixed(1)} : 1
        </span>
        <button type="button" className={k("su-x")} onClick={close} aria-label={CS.close}>
          ×
        </button>
      </div>
      <div
        className={k("su-sv")}
        style={{ background: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          at(e);
        }}
        onPointerMove={(e) => e.buttons && at(e)}
        onKeyDown={key}
        tabIndex={0}
        role="slider"
        aria-label={CS.ed.shade}
        aria-valuetext={fill(CS.ed.shadeAria, {
          s: Math.round(hsv.s * 100),
          v: Math.round(hsv.v * 100),
        })}
        aria-valuenow={Math.round(hsv.v * 100)}
      >
        <span
          className={k("su-svw")}
          style={{ background: "linear-gradient(to right, #fff, rgba(255,255,255,0))" }}
        />
        <span
          className={k("su-svb")}
          style={{ background: "linear-gradient(to top, #000, rgba(0,0,0,0))" }}
        />
        <span
          className={k("su-svline")}
          style={{ top: `${(1 - line) * 100}%` }}
          aria-hidden="true"
        />
        <span
          className={k("su-knob")}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>
      <div className={k("su-cpr2")}>
        <input
          className={k("su-hue")}
          type="range"
          min={0}
          max={359}
          value={Math.round(hsv.h)}
          onChange={(e) => setHsv({ ...hsv, h: Number(e.target.value) })}
          aria-label={CS.ed.hue}
          style={{
            background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          }}
        />
        {typeof window !== "undefined" && window.EyeDropper ? (
          <button
            type="button"
            className={k("su-drop")}
            onClick={() =>
              void new window.EyeDropper!()
                .open()
                .then((r) => setHex(r.sRGBHex))
                .catch(() => undefined)
            }
            aria-label={CS.ed.eyedrop}
            title={CS.ed.eyedrop}
          >
            <Icon n="eye" size={15} />
          </button>
        ) : null}
      </div>
      <div className={k("su-cpf")}>
        {fmt === "hex" ? (
          <span className={k("su-cpfi")}>
            <input
              className={k("in")}
              value={hexIn ?? hex}
              onChange={(e) => {
                setHexIn(e.target.value);
                setHex(e.target.value.trim());
              }}
              onBlur={() => setHexIn(null)}
              aria-label={CS.ed.formats.hex}
            />
            <small>{CS.ed.formats.hex}</small>
          </span>
        ) : (
          fields.map(([l, n, setN]) => (
            <span key={l} className={k("su-cpfi")}>
              <input
                className={k("in")}
                inputMode="numeric"
                value={n}
                onChange={(e) => setN(Number(e.target.value.replace(/\D/g, "") || 0))}
                aria-label={l}
              />
              <small>{l}</small>
            </span>
          ))
        )}
      </div>
      {msg ? <p className={k("su-cpm", "no")}>{msg}</p> : null}
      <div className={k("su-cpg")}>
        {CLINIC_PALETTE.slice(0, 9).map((p) => (
          <button
            key={p}
            type="button"
            className={k(p === hex && "on")}
            style={{ background: p }}
            title={p}
            aria-label={p}
            onClick={() => setHex(p)}
          />
        ))}
      </div>
      <div className={k("su-cpmode")} role="group" aria-label={CS.ed.custom}>
        {(["hex", "rgb", "hsl", "hsb"] as Fmt[]).map((f) => (
          <button
            key={f}
            type="button"
            className={k(fmt === f && "on")}
            aria-pressed={fmt === f}
            onClick={() => setFmt(f)}
          >
            {CS.ed.formats[f]}
          </button>
        ))}
      </div>
      {chk.ok ? (
        <button type="button" className={k("btn", "sm", "k", "su-cpok")} onClick={() => use(hex)}>
          {CS.ed.use}
        </button>
      ) : null}
    </div>
  );
}
