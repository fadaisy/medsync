import type { SP } from "@/lib/lab/redirects";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { PillTabs } from "@/components/tide/work/space";
import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { db } from "@/db";
import { labHmisReports } from "@/db/schema";
import { hmisReminder } from "@/lib/lab/hmis105";
import { dayShort } from "@/lib/lab/period";
import { addDays, dayOf } from "@/lib/lab/stock";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { one, pillTabs } from "../../_lib/place-tabs";
import { labV2 } from "../../_lib/places";
import { DownloadsView } from "./downloads";
import { HmisView } from "./hmis";
import { IndicatorsView } from "./indicators";
import { RegisterView } from "./register";

const C = LABWS2_REPORTS;

/** HM-13: the month whose HMIS 105 is due next (an unsigned previous month until the 7th, else this one). */
async function hmisDueDate(hospitalId: string, now: Date) {
  const signed = await db
    .select({ month: labHmisReports.month })
    .from(labHmisReports)
    .where(
      and(
        eq(labHmisReports.hospitalId, hospitalId),
        inArray(labHmisReports.state, ["signed", "exported"]),
      ),
    );
  const today = dayOf(now, DEFAULT_TIME_ZONE);
  const due =
    hmisReminder(
      now,
      DEFAULT_TIME_ZONE,
      signed.map((r) => r.month.slice(0, 7)),
    ) ?? today.slice(0, 7);
  return dayShort(`${addDays(`${due}-28`, 7).slice(0, 7)}-07`, today);
}

/**
 * Lab Workspace v2, Reports (prompt 5.9; gate-a §3): Indicators · Daily register · HMIS 105 (with its due date)
 * · Downloads, at /lab/reports?tab=…. The tabs come from the viewer's places (flags and permissions).
 */
export async function ReportsPlace({ sp: raw }: { sp: SP }) {
  const v2 = await labV2();
  const defs = v2.tabs.reports;
  if (!defs.length) notFound();
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, one(v)]));
  const tab = defs.find((d) => d.key === sp.tab)?.key ?? defs[0]!.key;
  const scope = v2.scope;
  const hasHmis = defs.some((d) => d.key === "hmis");
  const due = hasHmis ? await hmisDueDate(scope.hospitalId, new Date()) : null;
  const tabs = (
    <PillTabs
      label={C.tabsLabel}
      current={tab}
      tabs={pillTabs(defs, "reports").map((t) =>
        t.key === "hmis" && due ? { ...t, label: fill(C.hmisTab, { date: due }) } : t,
      )}
    />
  );
  switch (tab) {
    case "register":
      return (
        <RegisterView
          scope={scope}
          lead={scope.access.permissions.has("lab.manage")}
          sp={sp}
          tabs={tabs}
        />
      );
    case "hmis":
      return <HmisView scope={scope} sp={sp} tabs={tabs} />;
    case "downloads":
      return (
        <DownloadsView
          scope={scope}
          sp={sp}
          tabs={tabs}
          reports={v2.visible.has("reports")}
          hmis={v2.visible.has("hmis")}
          register={v2.visible.has("register")}
        />
      );
    default:
      return <IndicatorsView scope={scope} sp={sp} tabs={tabs} />;
  }
}
