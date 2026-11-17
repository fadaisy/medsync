"use client";

/** The two ways in: the live page (server actions) and the styleguide fixture (memory only). */
import type { CsPort } from "./port";
import type { View } from "./shared";
import type { CsData } from "@/lib/clinics-schedule/fixture";
import type { AdminNavGroup } from "@/lib/hospital-admin/admin-nav";

import {
  addDevice,
  cancelSchedule,
  invitePerson,
  pauseClinic,
  publishChanges,
  publishEarly,
  saveChange,
  undoChanges,
} from "@/app/hospital-admin/clinics/_lib/actions";
import { fixtureData } from "@/lib/clinics-schedule/fixture";
import { fixturePort } from "./port";
import { VIEWS } from "./shared";
import { ClinicsWorkspace } from "./workspace";

const livePort: CsPort = {
  saveChange,
  undo: undoChanges,
  publish: publishChanges,
  cancelSchedule,
  publishEarly,
  pause: pauseClinic,
  addDevice,
  invitePerson,
};

const asView = (v?: string): View =>
  (VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "ready";

export function LiveClinics({
  data,
  view,
  clinic,
  tab,
  groups,
}: {
  data: CsData;
  view?: string;
  /** `?clinic=` and `?tab=`: one clinic's panel, opened on a tab (ADR 0522). */
  clinic?: string;
  tab?: string;
  groups?: readonly AdminNavGroup[];
}) {
  return (
    <ClinicsWorkspace
      data={data}
      port={livePort}
      initialView={asView(view)}
      initialClinic={clinic ?? null}
      initialTab={tab ?? null}
      groups={groups}
    />
  );
}

export function FixtureClinics({
  scenario,
  view,
  groups,
}: {
  scenario: "ready" | "first" | "offline";
  view?: string;
  groups?: readonly AdminNavGroup[];
}) {
  return (
    <ClinicsWorkspace
      data={fixtureData(scenario)}
      port={fixturePort}
      forceOffline={scenario === "offline"}
      initialView={asView(view)}
      groups={groups}
    />
  );
}
