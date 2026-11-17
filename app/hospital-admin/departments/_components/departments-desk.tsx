"use client";

import type { DepartmentsData, View } from "../_lib/model";
import type { DepartmentRow } from "@/lib/services/data";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { k, Seg } from "@/components/clinics-schedule/shared";
import { useUrlState } from "@/components/hospital-admin/use-url-state";
import { DEPTS } from "@/content/hospital-admin/departments";
import { fill } from "@/content/lab-workspace-v2";
import { abbr, idsOf, plural } from "../_lib/model";
import { useOp } from "../_lib/use-op";
import { AddDepartmentsDialog, LegacyDialog, PresetDialog } from "./add-departments";
import { DepartmentDetail } from "./department-detail";
import d from "./departments.module.css";
import { HoursPlaces } from "./hours-places";
import { UnavailableNow } from "./unavailable-now";

type Filter = "all" | "live" | "off" | "archived";
const PATH = "/hospital-admin/departments";

/**
 * Departments (ADR 0520 phase 2), in the Tether desk look of the approved prototype: four counts, the department
 * cards with All / Live / Not on Tether yet, one department's panel beside them, and the page's two other views,
 * "Unavailable now" and "Hours and places". Every change goes through ha-services-hub (or the booking-rules
 * function) and the page refreshes from the database.
 */
export function DepartmentsDesk({
  view: initialView,
  openId,
  assign,
  adding,
  reporting,
  data,
}: {
  view: View;
  openId: string | null;
  assign: boolean;
  adding: boolean;
  reporting: boolean;
  data: DepartmentsData;
}) {
  const router = useRouter();
  // The view and the open department follow the URL (back button, the guide's walkthroughs: ADR 0522).
  const [view, setView] = useUrlState<View>(initialView);
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useUrlState<string | null>(openId);
  const [modal, setModal] = useState<"add" | "preset" | "legacy" | null>(adding ? "add" : null);

  const { departments, heads, counts, wards, clinics } = data;
  const top = departments.filter((x) => x.parentId === null);
  const current = top.filter((x) => !x.archived);
  const liveN = current.filter((x) => x.live).length;
  const headOf = (id: string) => heads.current.filter((h) => h.departmentId === id);
  const noHead = current.filter((x) => headOf(x.id).length === 0).length;
  const unavailable = data.problems.length + data.closedWards.length + data.closures.length;
  const offList = current.filter((x) => !x.live);

  const sum = (m: Record<string, number>, ids: string[]) =>
    ids.reduce((n, id) => n + (m[id] ?? 0), 0);
  const bedsOf = (ids: string[]) =>
    wards
      .filter((w) => !w.archived && w.departmentId && ids.includes(w.departmentId))
      .reduce((n, w) => n + w.bedCount, 0);
  /** What is down in this department now: its own problems, its units', clinics' and wards', closed wards, closures. */
  const downIn = (x: DepartmentRow) => {
    const ids = idsOf(x, departments);
    const clinicIds = clinics.filter((c) => ids.includes(c.departmentId)).map((c) => c.id);
    const wardIds = wards
      .filter((w) => w.departmentId && ids.includes(w.departmentId))
      .map((w) => w.id);
    return (
      data.problems.filter(
        (p) =>
          ((p.subjectKind === "department" || p.subjectKind === "lab_section") &&
            ids.includes(p.subjectRef)) ||
          (p.subjectKind === "clinic" && clinicIds.includes(p.subjectRef)) ||
          (p.subjectKind === "ward" && wardIds.includes(p.subjectRef)),
      ).length +
      data.closedWards.filter((w) => w.departmentId && ids.includes(w.departmentId)).length +
      data.closures.filter((c) => c.departmentId && ids.includes(c.departmentId)).length
    );
  };

  const pick = (v: View) => {
    setView(v);
    router.replace(v === "cards" ? PATH : `${PATH}?view=${v}`, { scroll: false });
  };

  const shown = top.filter((x) =>
    filter === "archived"
      ? x.archived
      : !x.archived && (filter === "all" || (filter === "live" ? x.live : !x.live)),
  );
  const open = view === "cards" ? (departments.find((x) => x.id === sel) ?? null) : null;
  const empty = current.length === 0;
  const archivedN = top.length - current.length;

  const stats: ReadonlyArray<[number, readonly [string, string], string | false, View]> = [
    [current.length, DEPTS.stats.departments, "mid", "cards"],
    [liveN, DEPTS.stats.live, "mid", "cards"],
    [noHead, DEPTS.stats.noHead, "mid", "cards"],
    [unavailable, DEPTS.stats.unavailable, "mid", "unavailable"],
  ];
  const filters: ReadonlyArray<readonly [Filter, string, number]> = [
    ["all", DEPTS.filters.all, current.length],
    ["live", DEPTS.filters.live, liveN],
    ["off", DEPTS.filters.off, offList.length],
    ...(archivedN ? ([["archived", DEPTS.filters.archived, archivedN]] as const) : []),
  ];
  const fr = data.firstRun;
  const canLegacy = fr.legacy === "offered" || fr.legacy === "declined";

  return (
    <div className={k("su-wrap", "su-split")}>
      <div className={k("su-page")}>
        <div className={`${k("ahead")} ${d.head}`}>
          <div className={k("ahl")}>
            <h1>{DEPTS.title}</h1>
            <span className={k("adate")}>
              {fill(DEPTS.count, { n: current.length, live: liveN })}
            </span>
          </div>
          <Seg
            opts={[
              ["cards", DEPTS.views.cards],
              ["unavailable", DEPTS.views.unavailable],
              ["hours", DEPTS.views.hours],
            ]}
            value={view}
            onPick={pick}
            label={DEPTS.title}
            className={d.wrapSeg}
          />
          <span className={k("grow")} />
          {!empty && fr.preset && fr.preset.add.length ? (
            <button type="button" className={k("btn", "sm")} onClick={() => setModal("preset")}>
              {DEPTS.startFrom}
            </button>
          ) : null}
          {!empty && canLegacy && fr.legacyPlan ? (
            <button type="button" className={k("btn", "sm")} onClick={() => setModal("legacy")}>
              {DEPTS.bringIn}
            </button>
          ) : null}
          <button
            type="button"
            className={k("btn", "sm", "k")}
            onClick={() => setModal("add")}
            data-tour="wt-dp-add"
          >
            {DEPTS.add}
          </button>
        </div>

        <div className={`${k("su-dst")} ${d.stats}`} data-tour="wt-dp-stats">
          {stats.map(([n, [label, sub], cls, go]) => (
            <button
              key={label}
              type="button"
              className={`${k("su-dsc", cls)} ${d.stat}`}
              onClick={() => pick(go)}
            >
              <span className={k("su-dsd")} aria-hidden="true" />
              <div>
                <b>{n}</b>
                <span>{label}</span>
                <small>{sub}</small>
              </div>
            </button>
          ))}
        </div>

        {view === "unavailable" ? (
          <UnavailableNow data={data} reporting={reporting} />
        ) : view === "hours" ? (
          <HoursPlaces data={data} />
        ) : empty && !archivedN ? (
          <FirstRun
            data={data}
            onPreset={() => setModal("preset")}
            onLegacy={() => setModal("legacy")}
            onPick={() => setModal("add")}
          />
        ) : (
          <>
            <div className={k("su-ctb")}>
              <div
                className={k("su-cfs")}
                role="group"
                aria-label={DEPTS.title}
                data-tour="wt-dp-filters"
              >
                {filters.map(([f, label, n]) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    className={k(filter === f && "on")}
                    onClick={() => setFilter(f)}
                  >
                    {label}
                    <b>{n}</b>
                  </button>
                ))}
              </div>
            </div>
            {filter === "off" && offList.length ? (
              <OffNote ids={offList.map((x) => x.id)} name={offList[0]!.name} />
            ) : null}
            {shown.length ? (
              <div className={d.cards} data-tour="wt-dp-cards">
                {shown.map((x) => {
                  const ids = idsOf(x, departments);
                  const head = headOf(x.id);
                  const down = downIn(x);
                  const on = sel === x.id;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      aria-pressed={on}
                      className={`${k("su-card")} ${d.card} ${on ? d.on : ""}`}
                      onClick={() => setSel(on ? null : x.id)}
                      data-guide-list="dept"
                      data-guide-id={x.id}
                    >
                      <span className={d.cardHead}>
                        <span className={`${k("su-ctile")} ${d.tile}`} aria-hidden="true">
                          {abbr(x.name)}
                        </span>
                        <span className={k("su-cn")}>
                          <b>{x.name}</b>
                          <small>{DEPTS.kinds[x.kind]}</small>
                        </span>
                      </span>
                      <span className={d.facts}>
                        {fill(DEPTS.facts, {
                          clinics: plural(DEPTS.clinics, sum(counts.clinics, ids)),
                          wards: plural(DEPTS.wards, sum(counts.wards, ids)),
                          beds: bedsOf(ids),
                        })}
                      </span>
                      <span className={d.foot}>
                        <span className={k("su-st", x.live && !x.archived ? "live" : "setup")}>
                          {x.archived ? DEPTS.archived : x.live ? DEPTS.live : DEPTS.notLive}
                        </span>
                        {x.isStart ? <span className={d.tag}>{DEPTS.start}</span> : null}
                        {down ? (
                          <span className={d.tag}>{fill(DEPTS.unavailableTag, { n: down })}</span>
                        ) : null}
                        <span className={d.grow} />
                        <small>
                          {head.length
                            ? head
                                .map((h) =>
                                  fill(h.acting ? DEPTS.acting : DEPTS.head, { name: h.name }),
                                )
                                .join(" · ")
                            : fill(DEPTS.head, { name: DEPTS.noHead })}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={k("su-note")}>{DEPTS.none}</p>
            )}
          </>
        )}
      </div>

      {open ? (
        <DepartmentDetail
          key={open.id}
          dept={open}
          data={data}
          assign={assign}
          onClose={() => setSel(null)}
        />
      ) : null}

      <AddDepartmentsDialog open={modal === "add"} onClose={() => setModal(null)} existing={top} />
      {fr.preset ? (
        <PresetDialog open={modal === "preset"} onClose={() => setModal(null)} preset={fr.preset} />
      ) : null}
      {fr.legacyPlan ? (
        <LegacyDialog
          open={modal === "legacy"}
          onClose={() => setModal(null)}
          plan={fr.legacyPlan}
          state={fr.legacy}
        />
      ) : null}
    </div>
  );
}

/** Departments that are not live are invisible to sign-up, queues and booking: say so with the one fix (D-SVC-02). */
function OffNote({ ids, name }: { ids: string[]; name: string }) {
  const op = useOp();
  return (
    <div className={k("su-card")}>
      <div className={`${k("su-td")} ${d.tdWrap}`}>
        <span className={`${k("su-tdt")} ${d.wrapText}`}>
          <b>
            {ids.length === 1
              ? fill(DEPTS.offOne, { name })
              : fill(DEPTS.offMany, { n: ids.length })}
          </b>
          <small>{DEPTS.offNote}</small>
        </span>
        <button
          type="button"
          className={k("btn", "sm", "k")}
          disabled={op.busy}
          onClick={() => op.run({ op: "set_departments_live", department_ids: ids })}
        >
          {ids.length === 1 ? DEPTS.setOneLive : fill(DEPTS.setAllLive, { n: ids.length })}
        </button>
      </div>
      {op.error ? (
        <p className={k("su-note")} role="alert">
          {op.error}
        </p>
      ) : null}
    </div>
  );
}

/** First run (§5.2): three ways in, the signed MoH standard first when there is one for this level. */
function FirstRun({
  data,
  onPreset,
  onLegacy,
  onPick,
}: {
  data: DepartmentsData;
  onPreset: () => void;
  onLegacy: () => void;
  onPick: () => void;
}) {
  const fr = data.firstRun;
  const F = DEPTS.firstRun;
  const doors = [
    fr.preset
      ? {
          t: fill(F.preset[0], { level: fr.preset.levelLabel }),
          s: fill(F.preset[1], { n: fr.preset.add.length }),
          b: F.preset[2],
          go: onPreset,
        }
      : null,
    (fr.legacy === "offered" || fr.legacy === "declined") && fr.legacyPlan
      ? { t: F.legacy[0], s: F.legacy[1], b: F.legacy[2], go: onLegacy }
      : null,
    { t: F.pick[0], s: F.pick[1], b: F.pick[2], go: onPick },
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  return (
    <>
      <div className={k("su-ch")}>
        <b>{F.title}</b>
      </div>
      <div className={d.cards}>
        {doors.map((x) => (
          <div key={x.t} className={`${k("su-card", "su-sec")} ${d.pad}`}>
            <span className={k("su-tgt")}>
              <b>{x.t}</b>
              <small>{x.s}</small>
            </span>
            <button type="button" className={k("btn", "sm")} onClick={x.go}>
              {x.b}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
