"use client";

import type { MenuRow } from "../_lib/model";
import type { TestMenuData } from "@/lib/lab/test-menu-read";
import type { OfferingRow } from "@/lib/services/data";
import type { Comparison, OpenProblem } from "@/supabase/functions/_shared/services-hub";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { k } from "@/components/clinics-schedule/shared";
import {
  AddTestsDialog,
  LevelDialog,
  RequestDialog,
  SectionHoursDialog,
} from "@/components/lab/test-menu/dialogs";
import { HospitalProfiles } from "@/components/lab/test-menu/profiles";
import { useMenuAction } from "@/components/lab/test-menu/use-menu-action";
import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { addLaboratoryAction } from "../_lib/actions";
import { compareWithLevel, labCounts, menuRows, referralGroups } from "../_lib/model";
import { ImagingTab } from "./imaging-tab";
import v from "./lab.module.css";
import { MenuTab } from "./menu-tab";
import { CompareTab, HoursTab, ReferralsTab } from "./other-tabs";
import { TestPanel } from "./test-panel";

export type LabTab = "menu" | "referrals" | "hours" | "imaging" | "profiles" | "compare";

const PATH = "/hospital-admin/lab";

type Dialog =
  | { kind: "level" | "add" | "request" }
  | { kind: "hours"; section: MenuRow["section"] }
  | null;

/**
 * Laboratory and imaging (phase 2 of ADR 0516), in the Tether desk. The test menu is the lab's own store, edited
 * through the same actions as the lab's Set-up → Tests; a test's detail opens beside the list. Every count is the
 * menu's own: nothing is estimated, and a turnaround nobody entered stays empty.
 */
export function LabView({
  tab: initial,
  test,
  menu,
  labId,
  imaging,
  problems,
  imagingComparison,
  presetLabel,
  oneResultPath,
}: {
  tab: LabTab;
  /** A test to open at once (⌘K's test results). */
  test: string | null;
  menu: TestMenuData;
  labId: string | null;
  imaging: OfferingRow[];
  problems: OpenProblem[];
  imagingComparison: Comparison | null;
  presetLabel: string | null;
  oneResultPath: boolean;
}) {
  const router = useRouter();
  const act = useMenuAction();
  const [tab, setTab] = useState<LabTab>(initial);
  const [sel, setSel] = useState<string | null>(test);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const rows = useMemo(() => menuRows(menu.tests, menu.menu), [menu.tests, menu.menu]);
  const n = labCounts(rows);
  const diff = useMemo(
    () => (menu.level ? compareWithLevel(menu.level, menu.tests, menu.menu) : []),
    [menu.level, menu.tests, menu.menu],
  );
  const L = LAB_ADMIN;
  const S = L.stats;
  const T = L.tabs;
  const selRow = rows.find((r) => r.t.code === sel) ?? null;

  const pick = (t: LabTab) => {
    setTab(t);
    setSel(null);
    router.replace(t === "menu" ? PATH : `${PATH}?tab=${t}`, { scroll: false });
  };
  const tabs: [LabTab, string, number][] = [
    ["menu", T.menu, n.onMenu],
    ["referrals", T.referrals, referralGroups(rows).length],
    ["hours", T.hours, new Set(rows.map((r) => r.section)).size],
    ["imaging", T.imaging, imaging.filter((o) => o.provision !== "not_offered").length],
    ["profiles", T.profiles, menu.profiles.length],
    ...(menu.level ? ([["compare", T.compare, diff.length]] as [LabTab, string, number][]) : []),
  ];
  const tiles: [number, string, string][] = [
    [n.onMenu, S.onMenu, S.onMenuSub],
    [n.inHouse, S.inHouse, S.inHouseSub],
    [n.referred, S.referred, S.referredSub(n.noLab.length)],
    [n.noTat, S.noTat, S.noTatSub],
  ];

  return (
    <div className={`${k("su-wrap", "su-split")} ${v.fill}`}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{L.title}</h1>
            <span className={k("adate")}>{L.lead}</span>
          </div>
          <span className={k("grow")} />
          <button
            type="button"
            className={k("btn", "sm")}
            onClick={() => setDialog({ kind: "level" })}
          >
            {L.startLevel}
          </button>
          <button
            type="button"
            className={k("btn", "sm", "k")}
            onClick={() => setDialog({ kind: "add" })}
          >
            {L.addTests}
          </button>
        </div>

        <div className={`${k("su-dst")} ${v.stats}`}>
          {tiles.map(([value, label, sub]) => (
            <div key={label} className={`${k("su-dsc", "mid")} ${v.still}`}>
              <span className={k("su-dsd")} aria-hidden="true" />
              <span className={v.tile}>
                <b>{value}</b>
                <span>{label}</span>
                <small>{sub}</small>
              </span>
            </div>
          ))}
        </div>

        <div className={k("su-ctb")}>
          <div className={`${k("su-cfs")} ${v.tabs}`} role="tablist" aria-label={T.label}>
            {tabs.map(([t, label, count]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={k(tab === t && "on")}
                onClick={() => pick(t)}
              >
                {label}
                <b>{count}</b>
              </button>
            ))}
          </div>
        </div>

        {act.message ? (
          <p className={k("su-note")} role="status">
            {act.message.text}
          </p>
        ) : null}

        {tab === "menu" ? (
          labId ? (
            <MenuTab
              data={menu}
              rows={rows}
              sel={sel}
              onOpen={(code) => setSel(sel === code ? null : code)}
              act={act}
            />
          ) : (
            <div className={`${k("su-card")} ${v.pad}`}>
              <p className={k("su-note")}>{L.noLab.text}</p>
              {addError ? (
                <p className={k("su-note")} role="alert">
                  {addError}
                </p>
              ) : null}
              <button
                type="button"
                className={k("btn", "sm", "k")}
                disabled={adding}
                onClick={() =>
                  startAdding(async () => {
                    setAddError(null);
                    const r = await addLaboratoryAction();
                    if (!r.ok) return setAddError(r.error);
                    router.refresh();
                  })
                }
              >
                {L.noLab.add}
              </button>
            </div>
          )
        ) : null}
        {tab === "referrals" ? (
          <ReferralsTab
            rows={rows}
            noLab={n.noLab}
            onOpen={(code) => {
              pick("menu");
              setSel(code);
            }}
          />
        ) : null}
        {tab === "hours" ? (
          <HoursTab
            data={menu}
            rows={rows}
            act={act}
            onSet={(section) => setDialog({ kind: "hours", section })}
          />
        ) : null}
        {tab === "imaging" ? (
          <ImagingTab
            offerings={imaging}
            problems={problems}
            comparison={imagingComparison}
            presetLabel={presetLabel}
          />
        ) : null}
        {tab === "profiles" ? <HospitalProfiles data={menu} /> : null}
        {tab === "compare" && menu.level ? (
          <CompareTab level={menu.level} rows={diff} onStart={() => setDialog({ kind: "level" })} />
        ) : null}

        <p className={`${k("su-note")} ${v.links}`}>
          {labId ? (
            <Link href={`/hospital-admin/departments?open=${labId}`}>{L.sectionsLink}</Link>
          ) : null}
          {oneResultPath ? (
            <Link href="/hospital-admin/departments/diagnostics/one-result-path">
              {L.oneResultPath}
            </Link>
          ) : null}
        </p>
      </div>

      {tab === "menu" && selRow ? (
        <TestPanel
          key={`${selRow.t.code}:${JSON.stringify(selRow.o)}`}
          row={selRow}
          data={menu}
          act={act}
          onClose={() => setSel(null)}
        />
      ) : null}

      {dialog?.kind === "level" ? (
        <LevelDialog data={menu} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "add" ? (
        <AddTestsDialog
          data={menu}
          onClose={() => setDialog(null)}
          onAsk={() => setDialog({ kind: "request" })}
        />
      ) : null}
      {dialog?.kind === "request" ? (
        <RequestDialog data={menu} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "hours" ? (
        <SectionHoursDialog
          section={dialog.section}
          rows={rows
            .filter((r) => r.section === dialog.section && r.o.where === "in_house")
            .map((r) => r.o)}
          surface={menu.surface}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
