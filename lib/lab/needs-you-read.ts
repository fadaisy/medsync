import "server-only";

import type { NeedsYouItem } from "./needs-you";
import type { EmrDb } from "@/lib/emr/db";
import { and, asc, eq, inArray, isNotNull, isNull, ne, notExists, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  clinicalConcepts,
  criticalAlerts,
  deltaFlags,
  deltaOutcomes,
  diagnosticReports,
  encounterOrders,
  labMatchItems,
  labSignedConfigs,
  labStockItems,
  labStockLots,
} from "@/db/schema";
import { leadSlotFor, secondSlotFor } from "./catalogue-v2";
import { loadReferrals } from "./referral-read";
import { keyWords, kindWords } from "./setup-hub";

/**
 * Needs you, the read (prompt 6.2, NY-1..NY-4). Read only, from the sources that already decide each state:
 * open critical alerts (never `loadLabCriticals`, which escalates as it reads), delta flags without an
 * outcome, reports whose current version holds components for QC, match items waiting, referrals past RF-5,
 * lots received and not yet accepted, and signed-configuration drafts whose lead slot (or the lab counter
 * slot) this viewer may fill and did not author. The flags decide which sources are asked.
 */
export interface NeedsYouSources {
  criticals: boolean;
  delta: boolean;
  qc: boolean;
  referral: boolean;
  stock: boolean;
  manage: boolean;
}

export async function loadNeedsYou(
  hospitalId: string,
  viewerId: string,
  sources: NeedsYouSources,
  now: Date,
  database: EmrDb = db as unknown as EmrDb,
): Promise<NeedsYouItem[]> {
  const conn = database as unknown as typeof db;
  const [crit, delta, held, matches, overdue, lots, sigs] = await Promise.all([
    sources.criticals
      ? conn
          .select({
            id: criticalAlerts.id,
            patient: criticalAlerts.patientUserId,
            orderId: criticalAlerts.orderId,
            level: criticalAlerts.level,
            since: criticalAlerts.sentAt,
            restricted: criticalAlerts.restricted,
            test: encounterOrders.text,
          })
          .from(criticalAlerts)
          .leftJoin(encounterOrders, eq(encounterOrders.id, criticalAlerts.orderId))
          .where(and(eq(criticalAlerts.hospitalId, hospitalId), eq(criticalAlerts.state, "open")))
      : [],
    sources.delta
      ? conn
          .select({
            id: deltaFlags.id,
            patient: deltaFlags.patientUserId,
            orderId: deltaFlags.orderId,
            concept: clinicalConcepts.display,
            since: deltaFlags.createdAt,
            before: deltaFlags.previousValue,
            after: deltaFlags.currentValue,
            unit: deltaFlags.unit,
            sensitivity: encounterOrders.sensitivity,
          })
          .from(deltaFlags)
          .leftJoin(clinicalConcepts, eq(clinicalConcepts.id, deltaFlags.conceptId))
          .leftJoin(encounterOrders, eq(encounterOrders.id, deltaFlags.orderId))
          .where(
            and(
              eq(deltaFlags.hospitalId, hospitalId),
              notExists(
                conn
                  .select({ x: sql`1` })
                  .from(deltaOutcomes)
                  .where(eq(deltaOutcomes.flagId, deltaFlags.id)),
              ),
            ),
          )
      : [],
    sources.qc
      ? conn
          .select({
            reportId: diagnosticReports.id,
            orderId: diagnosticReports.orderId,
            at: diagnosticReports.recordedAt,
          })
          .from(diagnosticReports)
          .where(
            and(
              eq(diagnosticReports.hospitalId, hospitalId),
              isNotNull(diagnosticReports.qcHeld),
              sql`not exists (select 1 from ${diagnosticReports} n where n.supersedes_id = ${diagnosticReports.id})`,
            ),
          )
          .orderBy(asc(diagnosticReports.recordedAt))
      : [],
    sources.referral
      ? conn
          .select({ id: labMatchItems.id, at: labMatchItems.createdAt })
          .from(labMatchItems)
          .where(and(eq(labMatchItems.hospitalId, hospitalId), eq(labMatchItems.state, "waiting")))
          .orderBy(asc(labMatchItems.createdAt))
      : [],
    sources.referral
      ? conn.transaction((tx) =>
          loadReferrals(tx as never, hospitalId, {
            from: new Date(now.getTime() - 86_400_000),
            to: now,
            now,
          }),
        )
      : [],
    sources.stock
      ? conn
          .select({
            id: labStockLots.id,
            lot: labStockLots.lot,
            item: labStockItems.name,
            at: labStockLots.receivedAt,
          })
          .from(labStockLots)
          .innerJoin(labStockItems, eq(labStockItems.id, labStockLots.itemId))
          .where(
            and(
              eq(labStockLots.hospitalId, hospitalId),
              inArray(labStockLots.state, ["received", "in_acceptance"]),
            ),
          )
      : [],
    sources.manage
      ? conn
          .select({
            id: labSignedConfigs.id,
            kind: labSignedConfigs.kind,
            key: labSignedConfigs.key,
            version: labSignedConfigs.version,
            authoredBy: labSignedConfigs.authoredBy,
            leadSignedBy: labSignedConfigs.leadSignedBy,
            at: labSignedConfigs.createdAt,
          })
          .from(labSignedConfigs)
          .where(
            and(
              eq(labSignedConfigs.hospitalId, hospitalId),
              eq(labSignedConfigs.status, "draft"),
              ne(labSignedConfigs.authoredBy, viewerId),
              isNull(labSignedConfigs.csoSignedBy),
            ),
          )
      : [],
  ]);

  const items: NeedsYouItem[] = [];
  for (const c of crit)
    items.push({
      key: `alert:${c.id}`,
      kind: "alert",
      title: c.test ?? "",
      patientUserId: c.patient,
      restricted: c.restricted,
      detail: c.level ? String(c.level) : null,
      since: c.since,
      href: `/lab/needs-you/criticals/${c.id}`,
    });
  for (const d of delta)
    items.push({
      key: `delta:${d.id}`,
      kind: "delta",
      title: d.concept ?? "",
      patientUserId: d.patient,
      restricted: d.sensitivity === "restricted",
      detail: [d.before, d.after].every((v) => v != null)
        ? `${d.before} → ${d.after}${d.unit ? ` ${d.unit}` : ""}`
        : null,
      since: d.since,
      href: `/lab/bench/${d.orderId}`,
    });
  if (held.length)
    items.push({
      key: "qc_hold",
      kind: "qc_hold",
      title: "",
      patientUserId: null,
      detail: null,
      since: held[0]!.at,
      href: "/lab/quality?tab=today",
      count: held.length,
    });
  if (matches.length)
    items.push({
      key: "match",
      kind: "match",
      title: "",
      patientUserId: null,
      detail: null,
      since: matches[0]!.at,
      href: "/lab/send-outs?tab=match",
      count: matches.length,
    });
  for (const r of overdue)
    if (r.overdueDays)
      items.push({
        key: `overdue:${r.id}`,
        kind: "overdue",
        title: r.test,
        patientUserId: r.patientUserId,
        restricted: r.restricted,
        detail: `${r.partner}|${r.overdueDays}`,
        since: r.expected ?? r.sentAt ?? r.createdAt,
        href: `/lab/send-outs?tab=board&r=${r.id}`,
      });
  for (const l of lots)
    items.push({
      key: `lot:${l.id}`,
      kind: "lot",
      title: l.lot,
      patientUserId: null,
      detail: l.item,
      since: l.at,
      href: `/lab/quality/stock/receive?lot=${l.id}`,
    });
  for (const s of sigs) {
    const mine = s.leadSignedBy
      ? secondSlotFor(s.kind) === "lab_counter" && s.leadSignedBy !== viewerId
      : leadSlotFor(s.kind) === "lead";
    if (!mine) continue;
    items.push({
      key: `signature:${s.id}`,
      kind: "signature",
      title: [kindWords(s.kind), keyWords(s.key), `v${s.version}`].filter(Boolean).join(" · "),
      patientUserId: null,
      detail: null,
      since: s.at,
      href: `/lab/setup?sign=${s.id}`,
    });
  }
  return items;
}

export interface Share {
  n: number;
  d: number;
}

/**
 * Needs you, side panel (prompt 5.3): this week's three process measures, last 7 days to `now`. Criticals in
 * time = acknowledged by their due time, over alerts with a due time (the indicators engine's definition); delta
 * alerts decided = flags with an outcome over flags raised; matches resolved the same local day over matches
 * that waited. A measure with nothing behind it is null ("No data", never 0).
 */
export async function loadNeedsYouWeek(
  hospitalId: string,
  now: Date,
  timeZone: string,
  database: EmrDb = db as unknown as EmrDb,
): Promise<{ ackInTime: Share | null; deltaDecided: Share | null; matchesSameDay: Share | null }> {
  const conn = database as unknown as typeof db;
  const from = new Date(now.getTime() - 7 * 86_400_000);
  const [crit, delta, match] = await Promise.all([
    conn
      .select({
        d: sql<number>`count(*) filter (where ${criticalAlerts.dueAt} is not null)::int`,
        n: sql<number>`count(*) filter (where ${criticalAlerts.acknowledgedAt} <= ${criticalAlerts.dueAt})::int`,
      })
      .from(criticalAlerts)
      .where(
        and(
          eq(criticalAlerts.hospitalId, hospitalId),
          sql`${criticalAlerts.sentAt} between ${from} and ${now}`,
        ),
      ),
    conn
      .select({
        d: sql<number>`count(*)::int`,
        n: sql<number>`count(*) filter (where exists (select 1 from ${deltaOutcomes} o where o.flag_id = ${deltaFlags.id}))::int`,
      })
      .from(deltaFlags)
      .where(
        and(
          eq(deltaFlags.hospitalId, hospitalId),
          sql`${deltaFlags.createdAt} between ${from} and ${now}`,
        ),
      ),
    conn
      .select({
        d: sql<number>`count(*)::int`,
        n: sql<number>`count(*) filter (where ${labMatchItems.decidedAt} is not null and date(${labMatchItems.decidedAt} at time zone ${timeZone}) = date(${labMatchItems.createdAt} at time zone ${timeZone}))::int`,
      })
      .from(labMatchItems)
      .where(
        and(
          eq(labMatchItems.hospitalId, hospitalId),
          isNotNull(labMatchItems.reason),
          sql`${labMatchItems.createdAt} between ${from} and ${now}`,
        ),
      ),
  ]);
  const share = (r: { n: number; d: number } | undefined) =>
    r && r.d > 0 ? { n: r.n, d: r.d } : null;
  return {
    ackInTime: share(crit[0]),
    deltaDecided: share(delta[0]),
    matchesSameDay: share(match[0]),
  };
}
