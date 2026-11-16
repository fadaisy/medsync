"use client";

import type { MenuRow } from "../_lib/model";
import type { Act } from "./shared";
import type { Hours, MenuOffering, SectionKey } from "@/lib/lab/test-menu";
import type { TestMenuData } from "@/lib/lab/test-menu-read";
import { useState } from "react";

import { Field, k, Seg } from "@/components/clinics-schedule/shared";
import { rowItem } from "@/components/lab/test-menu/test-menu";
import { newKey } from "@/components/lab/test-menu/use-menu-action";
import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import { minutesWords, sectionName, SECTIONS } from "@/lib/lab/test-menu";
import { saveOfferingsAction } from "@/lib/lab/test-menu-actions";
import v from "./lab.module.css";

/**
 * One test's detail (the prototype's panel, board 16): where it is done, its hours, the lab it goes to, the stated
 * turnaround and its section, then what the signed catalogue fixes. Changes are a draft until Save; a test taken
 * off the menu says what that does first. Results, units and ranges are never set here.
 */
export function TestPanel({
  row,
  data,
  act,
  onClose,
}: {
  row: MenuRow;
  data: TestMenuData;
  act: Act;
  onClose: () => void;
}) {
  const D = LAB_ADMIN.detail;
  const { t } = row;
  const [o, setO] = useState<MenuOffering>(row.o);
  const set = (p: Partial<MenuOffering>) => setO((x) => ({ ...x, ...p }));
  const name = t.masked ? C.restrictedTest : t.display;
  const profiles = data.profiles.filter((p) => p.testCodes.includes(t.code));
  const removing = o.where === "not_offered" && row.o.where !== "not_offered";
  const changed = JSON.stringify(o) !== JSON.stringify(row.o);
  const save = () =>
    act.run(
      () =>
        saveOfferingsAction({ surface: data.surface, clientKey: newKey(), items: [rowItem(o)] }),
      C.saved,
      removing ? onClose : undefined,
    );

  return (
    <aside className={k("det", "su-det")} aria-label={D.label}>
      <div className={k("su-dh")}>
        <div>
          <h2>{name}</h2>
          <p>{[sectionName(row.section), t.specimen, t.tube].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" className={k("btn", "sm", "q", "x")} onClick={onClose}>
          {D.close}
        </button>
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{D.where}</span>
        <Seg
          opts={(["in_house", "referred", "not_offered"] as const).map(
            (w) => [w, C.where[w]] as const,
          )}
          value={o.where}
          onPick={(w) => set({ where: w })}
          label={D.where}
          className={v.wrapSeg}
        />
        {o.where === "in_house" ? (
          <>
            <span className={k("cap")}>{D.hours}</span>
            <Seg
              opts={[
                ["24h", C.hours["24h"]],
                ["scheduled", C.hours.scheduled],
                ["none", C.hours.none],
              ]}
              value={o.hours ?? "none"}
              onPick={(h) =>
                set({
                  hours: (h === "none" ? null : h) as Hours,
                  hoursNote: h === "scheduled" ? (o.hoursNote ?? "") : null,
                })
              }
              label={D.hours}
              className={v.wrapSeg}
            />
            {o.hours === "scheduled" ? (
              <Field as="label" label={C.hoursNote}>
                <input
                  className={k("in")}
                  maxLength={60}
                  value={o.hoursNote ?? ""}
                  onChange={(e) => set({ hoursNote: e.target.value })}
                />
              </Field>
            ) : null}
          </>
        ) : null}
        {o.where !== "not_offered" ? (
          <Field as="label" label={o.where === "referred" ? C.referredToLabel : C.downRefer}>
            <input
              className={k("in")}
              maxLength={120}
              value={o.referredTo ?? ""}
              onChange={(e) => set({ referredTo: e.target.value || null })}
            />
          </Field>
        ) : null}
      </div>

      {o.where !== "not_offered" ? (
        <div className={k("su-sec")}>
          <span className={k("cap")}>{D.tat}</span>
          <Field
            as="label"
            label={C.turnaroundMinutes}
            hint={minutesWords(o.statedTurnaroundMinutes) ?? C.notSet}
          >
            <input
              className={k("in")}
              inputMode="numeric"
              value={o.statedTurnaroundMinutes ?? ""}
              onChange={(e) => {
                const x = e.target.value.replace(/\D/g, "").slice(0, 6);
                set({ statedTurnaroundMinutes: x ? Number(x) : null });
              }}
            />
          </Field>
          <p className={k("su-note")}>{D.tatHelp}</p>
        </div>
      ) : null}

      <div className={k("su-sec")}>
        <Field as="label" label={C.sectionLabel}>
          <select
            className={k("in")}
            value={o.sectionOverride ?? t.section ?? ""}
            onChange={(e) => set({ sectionOverride: e.target.value as SectionKey })}
          >
            {SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key === t.section ? C.recommendedMark(s.display) : s.display}
              </option>
            ))}
          </select>
        </Field>
        <p className={k("su-note")}>{C.sectionHelp}</p>
      </div>

      <div className={k("su-sec")}>
        {removing ? <p className={k("su-note")}>{C.removeConsequence(profiles.length)}</p> : null}
        <div className={v.row}>
          <button
            type="button"
            className={k("btn", "sm", "k")}
            disabled={!changed || act.pending}
            onClick={save}
          >
            {removing ? D.remove : D.save}
          </button>
        </div>
      </div>

      {t.components.length ? (
        <div className={k("su-sec")}>
          <span className={k("cap")}>{D.reportedAs}</span>
          <div className={k("chips", "sm")}>
            {t.components.map((c) => (
              <span key={c.id} className={k("su-ctag")}>
                {c.display}
              </span>
            ))}
          </div>
          <p className={k("su-note")}>{D.reportedLine}</p>
        </div>
      ) : null}

      <div className={k("su-sec")}>
        <span className={k("cap")}>{D.catalogue}</span>
        <div className={k("su-sum2")}>
          <div>
            <span>{C.specimen}</span>
            <b>{[t.specimen, t.tube].filter(Boolean).join(" · ") || "—"}</b>
          </div>
          <div>
            <span>{C.orderCode}</span>
            <b>{t.orderLoinc ?? C.noOrderCode}</b>
          </div>
        </div>
        {t.levelBasis ? (
          <p className={k("su-note")}>
            {t.levelBasis.basis === "national_menu_2017"
              ? C.levelBasis(t.levelBasis.table, t.levelBasis.narrative)
              : C.judgement}
          </p>
        ) : null}
        {t.advisory ? <p className={k("su-note")}>{t.advisory}</p> : null}
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{D.inProfiles}</span>
        <p className={k("su-note")}>
          {profiles.length ? profiles.map((p) => p.name).join(", ") : D.noProfiles}
        </p>
      </div>
    </aside>
  );
}
