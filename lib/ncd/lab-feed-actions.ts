"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { ncdVisit } from "@/db/schema";
import { secondFactorFresh } from "@/lib/auth-fresh";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { OTHER_UNITS, saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { ncdLabFeedLiveFor } from "@/lib/lab/feature";
import { can } from "@/lib/ncdreg/context";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { outsideCanonical } from "./lab-feed";
import { FEED_FIELDS, labFeedFor, saveLabRefs } from "./lab-feed-read";

/**
 * The NCD feed (Lab Phase 2 §5.9, §8 "NCD"): field mappings drafted and signed by the registry lead (the CSO
 * countersigns in the super-admin console), the visit's references saved with the clinician's part, and
 * outside results typed with the laboratory that printed them.
 */

const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });
const field = z.enum(
  Object.keys(FEED_FIELDS) as [keyof typeof FEED_FIELDS, ...(keyof typeof FEED_FIELDS)[]],
);

async function scope(lead = false) {
  const { ctx } = await requireNcdScope();
  if (!ncdLabFeedLiveFor(ctx.facilityId))
    throw new EmrWriteError("config", "The lab feed is not switched on here.");
  if (lead && !ctx.roles.includes("registry_lead"))
    throw new EmrWriteError("forbidden", "Only the registry lead sets up the lab feed.");
  if (!lead && !can(ctx, "clinician_visit_write"))
    throw new EmrWriteError("forbidden", "Only the visit's clinician can do this.");
  if (!ctx.userId) throw new EmrWriteError("forbidden", "Sign in first.");
  return { ...ctx, userId: ctx.userId };
}

const Mapping = z.object({
  field,
  concept: z.string().min(3).max(80),
  unit: z.string().min(1).max(40),
  methods: z.array(z.enum(["lab", "bedside"])).min(1),
  windowDays: z.number().int().min(1).max(3650),
});

/** NF-1, D-LAB2-14: no default in code: every value here is the registry lead's. */
export async function saveFieldMappingAction(raw: unknown): Promise<ActionResult> {
  const p = Mapping.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      code: "invalid",
      error: "Choose the result, its unit, the methods and the window.",
    };
  try {
    const ctx = await scope(true);
    const a = { userId: ctx.userId, hospitalId: ctx.facilityId };
    const { field: f, ...payload } = p.data;
    return ok(
      await asClinicalWriter(a, (tx) =>
        saveConfigDraft(tx, a, { kind: "ncd_mapping", key: f, payload }, new Date()),
      ),
    );
  } catch (e) {
    return actionError(e);
  }
}

export async function signFieldMappingAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ configId: z.uuid(), exceptionNote: z.string().trim().max(500).nullable() })
    .safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  if (!(await secondFactorFresh()))
    return {
      ok: false,
      code: "forbidden",
      error: "reauth: enter your authenticator code to sign.",
    };
  try {
    const ctx = await scope(true);
    const a = { userId: ctx.userId, hospitalId: ctx.facilityId };
    await asClinicalWriter(a, (tx) => signConfig(tx, { ...a, as: "lead" }, p.data, new Date()));
    return ok(p.data.configId);
  } catch (e) {
    return actionError(e);
  }
}

/** NF-4: called when the clinician saves the visit; the references, not the numbers. */
export async function saveVisitLabRefsAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ visitId: z.uuid() }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    const ctx = await scope();
    const [v] = await db
      .select({ personId: ncdVisit.personId })
      .from(ncdVisit)
      .where(and(eq(ncdVisit.id, p.data.visitId), eq(ncdVisit.facilityId, ctx.facilityId)));
    if (!v) throw new EmrWriteError("not_found", "Visit not found here.");
    await saveLabRefs(
      ctx.facilityId,
      p.data.visitId,
      await labFeedFor(ctx.facilityId, v.personId, new Date()),
    );
    return ok(p.data.visitId);
  } catch (e) {
    return actionError(e);
  }
}

const Outside = z.object({
  visitId: z.uuid(),
  field,
  value: z.number().finite(),
  unit: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  laboratory: z.string().trim().min(2, "Name the laboratory.").max(120),
});

/** NF-7, D-LAB2-15: kept as printed, converted by the concept's plain factor only, tagged Outside. */
export async function addOutsideResultAction(raw: unknown): Promise<ActionResult> {
  const p = Outside.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: p.error.issues[0]?.message ?? "Check the result." };
  try {
    const ctx = await scope();
    const view = await (async () => {
      const [v] = await db
        .select({ personId: ncdVisit.personId })
        .from(ncdVisit)
        .where(and(eq(ncdVisit.id, p.data.visitId), eq(ncdVisit.facilityId, ctx.facilityId)));
      if (!v) throw new EmrWriteError("not_found", "Visit not found here.");
      return labFeedFor(ctx.facilityId, v.personId, new Date());
    })();
    const m = view.mappings[p.data.field];
    if (!m) throw new EmrWriteError("config", "This field has no signed mapping yet.");
    const canonical = outsideCanonical(
      p.data.value,
      p.data.unit,
      m.payload.unit,
      OTHER_UNITS[m.payload.concept] ?? [],
    );
    if (canonical === null)
      throw new EmrWriteError("invalid", "That unit cannot be converted for this result.");
    const entry = {
      ...p.data,
      canonical,
      canonicalUnit: m.payload.unit,
      enteredBy: ctx.userId,
      at: new Date().toISOString(),
    };
    await db
      .update(ncdVisit)
      .set({ outsideResults: sql`${ncdVisit.outsideResults} || ${JSON.stringify([entry])}::jsonb` })
      .where(and(eq(ncdVisit.id, p.data.visitId), eq(ncdVisit.facilityId, ctx.facilityId)));
    return ok(p.data.visitId);
  } catch (e) {
    return actionError(e);
  }
}
