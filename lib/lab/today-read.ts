import "server-only";

import type { LabPermission } from "./access";
import type { Period, TodaySnapshot } from "./today";
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { devices, labReferrals } from "@/db/schema";
import { asClinicalReader } from "@/lib/emr/db";
import { labWorklistFor } from "./page-data";
import { loadQcPlans } from "./qc-read";
import { loadLabSections } from "./read";
import { reportRows, statedTargets } from "./report-store";
import { localDayStart, PERIOD_DAYS, todaySnapshot } from "./today";
import { computeWorklist } from "./worklist";

const TERMINAL = ["completed", "failed", "lost", "cancelled", "rejected", "draft", "packed"];

/**
 * Today, the read (prompt 6.1 TD-1, TD-8; ADR 0346). One clinical-reader read of the 0118 indicator rows over
 * the window the snapshot needs (7 weeks back for the sparkline, two periods for 7 and 28 days), the stated
 * targets, the worklist as the bench computes it, open referrals out at partners, sections and QC status. No
 * write: criticals come from the 0118 rows, never from `loadLabCriticals` (which escalates as it reads).
 * Cached per request only; the as-of time shown is `now`.
 */
export async function loadToday(o: {
  hospitalId: string;
  userId: string;
  permissions: ReadonlySet<LabPermission>;
  sectionIds: readonly string[];
  now: Date;
  timeZone: string;
  period: Period;
  section: string | null;
  qc: boolean;
}): Promise<TodaySnapshot & { sectionNames: Map<string, string> }> {
  const { hospitalId: h, now } = o;
  const back = o.period === "today" ? 49 : PERIOD_DAYS[o.period] * 2;
  const from = new Date(localDayStart(now, o.timeZone).getTime() - back * 86_400_000);
  const [rows, worklist, sections, side] = await Promise.all([
    asClinicalReader({ userId: o.userId, hospitalId: h }, (tx) =>
      reportRows(tx, { from, to: now }),
    ),
    labWorklistFor(h),
    loadLabSections(h),
    db.transaction(async (t) => {
      const tx = t as never;
      // One connection: every query here runs on the transaction, in turn.
      const targets = await statedTargets(tx, h);
      const out = await t
        .select({ id: labReferrals.id })
        .from(labReferrals)
        .where(
          and(
            eq(labReferrals.hospitalId, h),
            isNotNull(labReferrals.sentAt),
            notInArray(labReferrals.state, TERMINAL),
          ),
        );
      const qc = o.qc ? (await loadQcPlans(tx, h, now)).rows : [];
      const deviceIds = [...new Set(qc.map((r) => r.deviceId))];
      const sectionOf = new Map(
        deviceIds.length
          ? (
              await t
                .select({ id: devices.id, sectionId: devices.sectionId })
                .from(devices)
                .where(inArray(devices.id, deviceIds))
            ).map((d) => [d.id, d.sectionId] as const)
          : [],
      );
      return {
        targets,
        outAtPartners: out.length,
        qc: qc.map((r) => ({ sectionId: sectionOf.get(r.deviceId) ?? null, status: r.status })),
      };
    }),
  ]);
  const wl = computeWorklist({
    rows: worklist.inputs,
    sections: worklist.sections,
    viewer: { hospitalId: h, permissions: o.permissions, sectionIds: o.sectionIds },
    filters: { section: "all" },
    serverNow: now,
  });
  const snap = todaySnapshot({
    now,
    timeZone: o.timeZone,
    period: o.period,
    section: o.section,
    rows,
    targets: side.targets,
    worklist: wl.rows,
    outAtPartners: side.outAtPartners,
    sections,
    qc: side.qc,
  });
  return { ...snap, sectionNames: new Map(sections.map((s) => [s.id, s.name])) };
}
