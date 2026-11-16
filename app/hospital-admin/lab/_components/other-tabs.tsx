"use client";

import type { CompareRow, MenuRow } from "../_lib/model";
import type { Act } from "./shared";
import type { Level, SectionKey } from "@/lib/lab/test-menu";
import type { TestMenuData } from "@/lib/lab/test-menu-read";

import { k, Toggle } from "@/components/clinics-schedule/shared";
import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import { minutesWords, SECTIONS } from "@/lib/lab/test-menu";
import { setSectionHiddenAction } from "@/lib/lab/test-menu-actions";
import { referralGroups, sectionHours } from "../_lib/model";
import v from "./lab.module.css";
import { sectionHoursWords } from "./shared";

const nameOf = (r: MenuRow) => (r.t.masked ? C.restrictedTest : r.t.display);

/** Referrals, grouped by the lab each test goes to; a referred test with no lab is listed first. */
export function ReferralsTab({
  rows,
  noLab,
  onOpen,
}: {
  rows: MenuRow[];
  noLab: MenuRow[];
  onOpen: (code: string) => void;
}) {
  const R = LAB_ADMIN.referrals;
  const groups = referralGroups(rows);
  return (
    <>
      <p className={k("su-note")}>{R.note}</p>
      {noLab.length ? (
        <div className={`${k("su-card")} ${v.pad}`}>
          <p className={v.plain}>{R.noLab(noLab.map(nameOf).join(", "))}</p>
        </div>
      ) : null}
      {groups.length ? (
        <div className={v.g2}>
          {groups.map((g) => (
            <div key={g.lab} className={k("su-card")}>
              <div className={k("su-ch")}>
                <b>{g.lab}</b>
                <small>{R.tests(g.rows.length)}</small>
              </div>
              <div className={v.list}>
                {g.rows.map((r) => (
                  <button
                    key={r.t.code}
                    type="button"
                    className={v.kv}
                    onClick={() => onOpen(r.t.code)}
                  >
                    <span>{nameOf(r)}</span>
                    <b>{minutesWords(r.o.statedTurnaroundMinutes) ?? C.notSet}</b>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={k("su-none")}>{R.none}</p>
      )}
    </>
  );
}

/** Hours by section: each section's in-house hours in words, set for the section at once; shown or hidden. */
export function HoursTab({
  data,
  rows,
  act,
  onSet,
}: {
  data: TestMenuData;
  rows: MenuRow[];
  act: Act;
  onSet: (section: SectionKey) => void;
}) {
  const H = LAB_ADMIN.hours;
  const hidden = new Set(data.hidden);
  return (
    <>
      <p className={k("su-note")}>{H.note}</p>
      <div className={k("su-card")}>
        {SECTIONS.map((s) => {
          const inHouse = rows.filter(
            (r) => r.section === s.key && r.o.where === "in_house",
          ).length;
          const off = hidden.has(s.key);
          return (
            <div key={s.key} className={v.hrow}>
              <span className={k("su-cn")}>
                <b>{s.display}</b>
                <small>{H.inHouse(inHouse)}</small>
              </span>
              <span className={v.w}>{sectionHoursWords(sectionHours(rows, s.key))}</span>
              <button
                type="button"
                className={k("btn", "sm")}
                disabled={!inHouse}
                onClick={() => onSet(s.key)}
              >
                {H.set}
                <span className={v.sr}>: {s.display}</span>
              </button>
              <Toggle
                on={!off}
                disabled={act.pending}
                flip={() =>
                  act.run(
                    () =>
                      setSectionHiddenAction({
                        surface: data.surface,
                        section: s.key,
                        hidden: !off,
                      }),
                    C.saved,
                  )
                }
                t={H.shown}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Compare with your level: the tests where the menu differs from the guide (the level template, TM-6). */
export function CompareTab({
  level,
  rows,
  onStart,
}: {
  level: Level;
  rows: CompareRow[];
  onStart: () => void;
}) {
  const P = LAB_ADMIN.compare;
  const levelName = C.levels[level as keyof typeof C.levels] ?? level;
  return (
    <>
      <div className={v.between}>
        <p className={k("su-note")}>{P.note(levelName)}</p>
        <button type="button" className={k("btn", "sm")} onClick={onStart}>
          {LAB_ADMIN.startLevel}
        </button>
      </div>
      <div className={`${k("su-card")} ${v.scx}`}>
        <div className={`${v.cr} ${v.hd}`} aria-hidden="true">
          <span>{P.cols.test}</span>
          <span>{P.cols.guide}</span>
          <span>{P.cols.yours}</span>
        </div>
        {rows.map((r) => (
          <div key={r.code} className={v.cr}>
            <b>{r.test.masked ? C.restrictedTest : r.test.display}</b>
            <span className={v.w}>{r.guide ? C.where[r.guide] : P.notInGuide}</span>
            <span className={v.w}>{C.where[r.yours]}</span>
          </div>
        ))}
        {!rows.length ? <p className={k("su-none")}>{P.none}</p> : null}
      </div>
    </>
  );
}
