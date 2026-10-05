/**
 * Data quality reads and the audit sample (G3, G4, A7). Queries come from the consistency rules
 * (written by the command path); they are resolved through the `query.resolve` command. The audit
 * sample is 5% of the month's closed visits, at least 10, drawn deterministically from the seed
 * "<facility id>:<month>" so anyone can redraw it and get the same visits. Merges are requested and
 * decided through `merge.request` / `merge.decide`; here are only their reads.
 */
import "server-only";

import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import { ncdAuditSample, ncdMergeRequest, ncdPerson, ncdQuery, ncdVisit } from "@/db/schema";

import { authorize, NcdError, type NcdContext } from "./context";
import { withNcd } from "./db";
import { identities, logAccess } from "./read/views";
import { CONSISTENCY_RULES } from "./standard/validation";

/* ─── G3 query list ────────────────────────────────────────────────────── */

const RULE_TEXT = new Map<string, string>(CONSISTENCY_RULES.rules.map((r) => [r.id, r.text]));

export async function queryList(ctx: NcdContext, status: "open" | "closed") {
  authorize(ctx, "data_quality", "audit_view");
  const qs = await withNcd(
    ctx,
    "app",
    (tx) =>
      tx
        .select()
        .from(ncdQuery)
        .where(and(eq(ncdQuery.facilityId, ctx.facilityId), status === "open" ? eq(ncdQuery.status, "open") : inArray(ncdQuery.status, ["resolved", "dismissed"])))
        .orderBy(status === "open" ? asc(ncdQuery.createdAt) : desc(ncdQuery.resolvedAt))
        .limit(200),
    ctx.db,
  );
  const ids = await identities(ctx, [...new Set(qs.map((q) => q.personId))]);
  await logAccess(ctx, "list_view", null, { list: "queries", status, count: qs.length });
  return qs.map((q) => ({ ...q, ruleText: RULE_TEXT.get(q.ruleId) ?? q.ruleId, identity: ids.get(q.personId) ?? null }));
}

/* ─── G4 audit sample ──────────────────────────────────────────────────── */

/** The fields checked against the source for each sampled visit. */
export const AUDIT_FIELDS = [
  { key: "visit_date", label: "Visit date" },
  { key: "blood_pressure", label: "Blood pressure" },
  { key: "weight", label: "Weight" },
  { key: "glucose", label: "Glucose" },
  { key: "medicines", label: "Medicines" },
  { key: "next_appointment", label: "Next appointment" },
] as const;

export const auditSeed = (facilityId: string, month: string) => `${facilityId}:${month.slice(0, 7)}`;
export const auditSize = (visits: number) => Math.min(visits, Math.max(10, Math.ceil(visits * 0.05)));

/**
 * The sample: every visit ranked by SHA-256(seed + visit id), the first `auditSize(n)` taken.
 * Pure: the same seed and the same visits always give the same sample, whatever their order.
 */
export function drawSample(visitIds: readonly string[], seed: string): string[] {
  const rank = (id: string) => createHash("sha256").update(`${seed}:${id}`).digest("hex");
  return [...visitIds]
    .map((id) => ({ id, r: rank(id) }))
    .sort((a, b) => a.r.localeCompare(b.r) || a.id.localeCompare(b.id))
    .slice(0, auditSize(visitIds.length))
    .map((x) => x.id);
}

const monthBounds = (month: string) => {
  const start = `${month.slice(0, 7)}-01`;
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { start, next: d.toISOString().slice(0, 10) };
};

/** Draw (or redraw: idempotent) the month's sample and store it in `ncd_audit_sample`. */
export async function drawAuditSample(ctx: NcdContext, month: string) {
  authorize(ctx, "data_quality");
  const { start, next } = monthBounds(month);
  const seed = auditSeed(ctx.facilityId, start);
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const visits = await tx
        .select({ id: ncdVisit.id, personId: ncdVisit.personId })
        .from(ncdVisit)
        .where(
          and(
            eq(ncdVisit.facilityId, ctx.facilityId),
            eq(ncdVisit.status, "closed"),
            eq(ncdVisit.isInvalid, false),
            eq(ncdVisit.isHistorical, false),
            gte(ncdVisit.visitDate, start),
            lt(ncdVisit.visitDate, next),
          ),
        );
      const picked = drawSample(visits.map((v) => v.id), seed);
      const person = new Map(visits.map((v) => [v.id, v.personId]));
      if (picked.length)
        await tx
          .insert(ncdAuditSample)
          .values(picked.map((visitId) => ({ facilityId: ctx.facilityId, personId: person.get(visitId)!, visitId, month: start, seed, createdAt: ctx.enteredAt })))
          .onConflictDoNothing();
      return { seed, visits: visits.length, sampled: picked };
    },
    ctx.db,
  );
}

/** The month's sample with its agreement rate: agreeing fields over checked fields. */
export async function auditSample(ctx: NcdContext, month: string) {
  authorize(ctx, "data_quality", "audit_view");
  const { start } = monthBounds(month);
  const rowsOf = await withNcd(
    ctx,
    "app",
    (tx) =>
      tx
        .select({ s: ncdAuditSample, visitDate: ncdVisit.visitDate })
        .from(ncdAuditSample)
        .innerJoin(ncdVisit, eq(ncdVisit.id, ncdAuditSample.visitId))
        .where(and(eq(ncdAuditSample.facilityId, ctx.facilityId), eq(ncdAuditSample.month, start)))
        .orderBy(asc(ncdVisit.visitDate)),
    ctx.db,
  );
  const ids = await identities(ctx, [...new Set(rowsOf.map((r) => r.s.personId))]);
  let agree = 0;
  let checked = 0;
  for (const { s } of rowsOf)
    for (const v of Object.values(s.fieldAgreement ?? {})) {
      checked++;
      if (v) agree++;
    }
  return {
    month: start,
    seed: rowsOf[0]?.s.seed ?? auditSeed(ctx.facilityId, start),
    rows: rowsOf.map(({ s, visitDate }) => ({ ...s, visitDate, identity: ids.get(s.personId) ?? null })),
    agreement: { agree, checked, rate: checked ? agree / checked : null },
  };
}

/** The registry lead records field-level agreement for one sampled visit. */
export async function recordAgreement(ctx: NcdContext, sampleId: string, fields: Record<string, boolean>) {
  authorize(ctx, "data_quality");
  const known = new Set<string>(AUDIT_FIELDS.map((f) => f.key));
  if (Object.keys(fields).some((k) => !known.has(k))) throw new NcdError("invalid", "Unknown audit field.");
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const [r] = await tx
        .update(ncdAuditSample)
        .set({ fieldAgreement: fields, checkedBy: ctx.userId, checkedAt: ctx.enteredAt })
        .where(and(eq(ncdAuditSample.id, sampleId), eq(ncdAuditSample.facilityId, ctx.facilityId)))
        .returning({ id: ncdAuditSample.id });
      if (!r) throw new NcdError("not_found", "Sampled visit not found.");
      return r;
    },
    ctx.db,
  );
}

/* ─── A7 duplicate review and merge ────────────────────────────────────── */

export async function mergeRequests(ctx: NcdContext) {
  authorize(ctx, "data_quality", "merge_request", "merge_approve", "audit_view");
  const rs = await withNcd(
    ctx,
    "app",
    (tx) => tx.select().from(ncdMergeRequest).where(eq(ncdMergeRequest.facilityId, ctx.facilityId)).orderBy(desc(ncdMergeRequest.requestedAt)).limit(100),
    ctx.db,
  );
  const ids = await identities(ctx, [...new Set(rs.flatMap((r) => [r.personId, r.loserPersonId]))]);
  return rs.map((r) => ({ ...r, survivor: ids.get(r.personId) ?? null, loser: ids.get(r.loserPersonId) ?? null }));
}

/** Two records picked by registry number, for the duplicate review. */
export async function personByRegistryNumber(ctx: NcdContext, registryNumber: string) {
  authorize(ctx, "merge_request", "merge_approve");
  const [p] = await withNcd(
    ctx,
    "app",
    (tx) =>
      tx
        .select({ id: ncdPerson.id })
        .from(ncdPerson)
        .where(and(eq(ncdPerson.facilityId, ctx.facilityId), eq(ncdPerson.registryNumber, registryNumber.trim().toUpperCase()), isNull(ncdPerson.mergedIntoId)))
        .limit(1),
    ctx.db,
  );
  if (!p) return null;
  return (await identities(ctx, [p.id])).get(p.id) ?? null;
}
