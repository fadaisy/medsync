"use client";

import type { MenuRow } from "../_lib/model";
import type { Act, Prices } from "./shared";
import type { MenuOffering, SectionKey, Where } from "@/lib/lab/test-menu";
import type { TestMenuData } from "@/lib/lab/test-menu-read";
import { useState } from "react";

import { k, Seg } from "@/components/clinics-schedule/shared";
import { hoursWords, rowItem } from "@/components/lab/test-menu/test-menu";
import { newKey } from "@/components/lab/test-menu/use-menu-action";
import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import { minutesWords, rankTests, sectionName, SECTIONS } from "@/lib/lab/test-menu";
import { saveOfferingsAction } from "@/lib/lab/test-menu-actions";
import { offered, sectionHours } from "../_lib/model";
import v from "./lab.module.css";
import { chargeWords, sectionHoursWords } from "./shared";

type WhereFilter = "all" | "in_house" | "referred";

/**
 * The test menu (the prototype's Test menu tab): sections on the left with their hours, a search and an In-house or
 * Referred filter, and the tests. Ticking tests opens the bulk bar; it saves them in one call, one audit row per
 * test (TM-13), as the lab's own menu does.
 */
export function MenuTab({
  data,
  rows,
  sel,
  onOpen,
  act,
  prices,
}: {
  data: TestMenuData;
  rows: MenuRow[];
  sel: string | null;
  onOpen: (code: string) => void;
  act: Act;
  prices: Prices;
}) {
  const M = LAB_ADMIN.menu;
  const [section, setSection] = useState<SectionKey | "all">("all");
  const [where, setWhere] = useState<WhereFilter>("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const on = offered(rows);
  const hidden = new Set(data.hidden);
  const matched = q.trim()
    ? new Set(
        rankTests(
          on.map((r) => r.t),
          q,
        ).map((t) => t.code),
      )
    : null;
  const shown = on
    .filter(
      (r) =>
        (section === "all" || r.section === section) &&
        (where === "all" || r.o.where === where) &&
        (!matched || matched.has(r.t.code)),
    )
    .sort((a, b) =>
      a.section === b.section
        ? a.t.display.localeCompare(b.t.display)
        : SECTIONS.findIndex((s) => s.key === a.section) -
          SECTIONS.findIndex((s) => s.key === b.section),
    );
  const toggle = (code: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  const chosen = rows.filter((r) => picked.has(r.t.code));

  return (
    <div className={v.lab}>
      <nav className={v.secs} aria-label={M.sections} data-tour="wt-lab-secs">
        {[{ key: "all" as const, display: M.all }, ...SECTIONS]
          .map((s) => ({
            ...s,
            n: s.key === "all" ? on.length : on.filter((r) => r.section === s.key).length,
          }))
          .filter((s) => s.key === "all" || s.n > 0 || section === s.key)
          .map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={section === s.key}
              className={`${v.sec} ${section === s.key ? v.on : ""}`}
              onClick={() => {
                setSection(s.key);
                setPicked(new Set());
              }}
            >
              <span>
                <b>{s.display}</b>
                {s.key !== "all" ? (
                  <small>
                    {sectionHoursWords(sectionHours(rows, s.key))}
                    {hidden.has(s.key) ? ` · ${M.hidden}` : ""}
                  </small>
                ) : null}
              </span>
              <em>{s.n}</em>
            </button>
          ))}
      </nav>

      <div className={v.main}>
        <div className={v.filt}>
          <input
            className={`${k("in")} ${v.find}`}
            type="search"
            placeholder={M.find}
            aria-label={M.find}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Seg
            opts={[
              ["all", M.where.all],
              ["in_house", M.where.in_house],
              ["referred", M.where.referred],
            ]}
            value={where}
            onPick={setWhere}
            label={M.whereLabel}
          />
        </div>

        {chosen.length ? (
          <BulkBar
            rows={chosen}
            pending={act.pending}
            onClear={() => setPicked(new Set())}
            onApply={(patch) =>
              act.run(
                () =>
                  saveOfferingsAction({
                    surface: data.surface,
                    clientKey: newKey(),
                    items: chosen.map((r) => rowItem({ ...r.o, ...patch })),
                  }),
                C.applied(chosen.length),
                () => setPicked(new Set()),
              )
            }
          />
        ) : null}

        {prices ? (
          <p className={k("su-note")}>
            {LAB_ADMIN.price.priced(
              on.filter((r) => chargeWords(prices.charges[r.t.code])).length,
              on.length,
            )}
          </p>
        ) : null}
        <div className={`${k("su-card")} ${v.scx}`} data-tour="wt-lab-table">
          <div className={`${v.r} ${v.hd}`} aria-hidden="true">
            <span />
            <span>{M.cols.test}</span>
            <span>{M.cols.where}</span>
            <span>{M.cols.hours}</span>
            <span>{M.cols.turnaround}</span>
            <span>{M.cols.last}</span>
          </div>
          {shown.map((r) => {
            const name = r.t.masked ? C.restrictedTest : r.t.display;
            const problem = data.problems[r.t.code];
            return (
              <div
                key={r.t.code}
                className={`${v.r} ${sel === r.t.code ? v.sel : ""}`}
                data-guide-list="lab-test"
                data-guide-id={r.t.code}
              >
                <input
                  type="checkbox"
                  className={v.chk}
                  checked={picked.has(r.t.code)}
                  onChange={() => toggle(r.t.code)}
                  aria-label={M.select(name)}
                />
                <button
                  type="button"
                  className={v.name}
                  aria-expanded={sel === r.t.code}
                  onClick={() => onOpen(r.t.code)}
                >
                  <b>{name}</b>
                  <small>
                    {[
                      sectionName(r.section),
                      r.t.specimen,
                      r.t.tube,
                      prices ? chargeWords(prices.charges[r.t.code]) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </button>
                <span className={`${v.tag} ${r.o.where === "in_house" ? v.tagIn : ""}`}>
                  {C.where[r.o.where]}
                </span>
                <span className={v.w}>{hoursWords(r.o) ?? C.notSet}</span>
                <span className={`${v.w} ${r.o.statedTurnaroundMinutes == null ? v.muted : ""}`}>
                  {minutesWords(r.o.statedTurnaroundMinutes) ?? C.notSet}
                </span>
                <span className={v.w}>
                  {r.o.where === "referred"
                    ? r.o.referredTo || M.chooseLab
                    : problem
                      ? problem
                      : C.available}
                </span>
              </div>
            );
          })}
          {!shown.length ? <p className={k("su-none")}>{on.length ? M.none : C.empty}</p> : null}
        </div>
      </div>
    </div>
  );
}

type Patch = Partial<
  Pick<MenuOffering, "where" | "hours" | "hoursNote" | "statedTurnaroundMinutes" | "referredTo">
>;

/** The bulk bar: Where, Hours, Stated turnaround, Referred to; only what is set is applied. */
function BulkBar({
  rows,
  pending,
  onClear,
  onApply,
}: {
  rows: MenuRow[];
  pending: boolean;
  onClear: () => void;
  onApply: (p: Patch) => void;
}) {
  const B = LAB_ADMIN.bulk;
  const [where, setWhere] = useState<Where | null>(null);
  const [hours, setHours] = useState<"24h" | "scheduled" | null>(null);
  const [tat, setTat] = useState("");
  const [to, setTo] = useState("");
  const patch: Patch = {
    ...(where ? { where } : {}),
    ...(hours ? { hours, hoursNote: hours === "scheduled" ? C.hours.scheduled : null } : {}),
    ...(tat ? { statedTurnaroundMinutes: Number(tat) } : {}),
    ...(to.trim() ? { referredTo: to.trim() } : {}),
  };
  const sections = [...new Set(rows.map((r) => sectionName(r.section)))].slice(0, 2).join(", ");
  return (
    <div className={v.bulk} role="group" aria-label={B.label}>
      <b>{B.picked(rows.length, sections)}</b>
      <span className={k("cap")}>{B.where}</span>
      <Seg
        opts={(["in_house", "referred", "not_offered"] as const).map(
          (w) => [w, C.where[w]] as const,
        )}
        value={where}
        onPick={(w) => setWhere(where === w ? null : w)}
        label={B.where}
      />
      <span className={k("cap")}>{B.hours}</span>
      <Seg
        opts={[
          ["24h", C.hours["24h"]],
          ["scheduled", C.hours.scheduled],
        ]}
        value={hours}
        onPick={(h) => setHours(hours === h ? null : h)}
        label={B.hours}
      />
      <input
        className={`${k("in")} ${v.bulkIn}`}
        inputMode="numeric"
        placeholder={B.tat}
        aria-label={B.tat}
        value={tat}
        onChange={(e) => setTat(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <input
        className={`${k("in")} ${v.bulkIn}`}
        placeholder={B.to}
        aria-label={B.to}
        maxLength={120}
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <span className={k("grow")} />
      <button
        type="button"
        className={k("btn", "sm", "k")}
        disabled={pending || !Object.keys(patch).length}
        title={Object.keys(patch).length ? undefined : B.keep}
        onClick={() => onApply(patch)}
      >
        {B.apply}
      </button>
      <button type="button" className={k("btn", "sm", "q")} onClick={onClear}>
        {B.clear}
      </button>
    </div>
  );
}
