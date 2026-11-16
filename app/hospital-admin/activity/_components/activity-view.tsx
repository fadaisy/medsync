"use client";

import type { ActivityArea, ActivityRow } from "@/lib/hospital-admin/activity";
import Link from "next/link";
import { useState } from "react";

import { Icon, k } from "@/components/clinics-schedule/shared";
import { ACTIVITY } from "@/content/hospital-admin/admin-nav";
import { fill } from "@/content/lab-workspace-v2";
import { ACTIVITY_DAYS } from "@/lib/hospital-admin/activity";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

type Tab = "all" | ActivityArea;

const WHEN = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: DEFAULT_TIME_ZONE,
});

const ICON: Record<ActivityArea, string> = {
  schedule: "calendar",
  people: "person",
  hospital: "card",
};

/** Activity (ADR 0517) in the Tether desk look: a filter by area, then one line per audited admin action. */
export function ActivityView({
  rows,
  cut,
  failed,
}: {
  rows: readonly ActivityRow[];
  cut: boolean;
  failed: boolean;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const tabs: ReadonlyArray<[Tab, string]> = [
    ["all", ACTIVITY.tabs.all],
    ["schedule", ACTIVITY.tabs.schedule],
    ["people", ACTIVITY.tabs.people],
    ["hospital", ACTIVITY.tabs.hospital],
  ];
  const shown = tab === "all" ? rows : rows.filter((r) => r.area === tab);

  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{ACTIVITY.title}</h1>
            <span className={k("adate")}>{ACTIVITY.lead}</span>
          </div>
        </div>
        <div className={k("su-ctb")}>
          <div className={k("su-cfs")} role="tablist" aria-label={ACTIVITY.title}>
            {tabs.map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={k(tab === t && "on")}
                onClick={() => setTab(t)}
              >
                {label}
                <b>{t === "all" ? rows.length : rows.filter((r) => r.area === t).length}</b>
              </button>
            ))}
          </div>
        </div>
        <div className={k("su-card")}>
          {failed ? (
            <p className={k("su-none")}>{ACTIVITY.failed}</p>
          ) : shown.length ? (
            shown.map((r) => (
              <div key={r.id} className={k("su-td")}>
                <span className={k("su-tdi")} aria-hidden="true">
                  <Icon n={ICON[r.area]} size={16} />
                </span>
                <span className={k("su-tdt")}>
                  <b>{r.what}</b>
                  <small>
                    {[
                      r.who ?? ACTIVITY.someone,
                      WHEN.format(new Date(r.at)),
                      ACTIVITY.areas[r.area],
                    ].join(" · ")}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </small>
                </span>
              </div>
            ))
          ) : (
            <p className={k("su-none")}>{fill(ACTIVITY.empty, { days: ACTIVITY_DAYS })}</p>
          )}
        </div>
        <p className={k("su-note")}>
          {fill(ACTIVITY.windowNote, { days: ACTIVITY_DAYS })}{" "}
          {cut ? fill(ACTIVITY.more, { n: rows.length }) : null}{" "}
          <Link href="/hospital-admin/clinics?view=history">{ACTIVITY.note}</Link>
        </p>
      </div>
    </div>
  );
}
