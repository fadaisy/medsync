import type { Who } from "@/lib/pharmacy/cd/store";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { CONTROLS_RULES as R } from "@/content/pharmacy-rework-controls";
import { pharmacyCaseEvents, pharmacyCases } from "@/db/schema/pharmacy-rework-controls";
import { isInCharge } from "@/lib/pharmacy/cd/store";
import { q } from "@/lib/pharmacy/cd/sql";
import { fail } from "@/lib/pharmacy/stores/write";

/**
 * Investigations, the writes (rework TECH-SPEC §4 "Cases"). Cases from counts open themselves in the database (0267);
 * a report by hand opens here. Every change names who made it (`changed_by`); the database decides who may assign,
 * submit, send back and sign off, and what each step needs (S9). Each step leaves an event on the timeline.
 */
const event = (who: Who, caseId: string, kind: typeof pharmacyCaseEvents.$inferInsert.kind, what?: string | null, note?: string | null) =>
  who.tx.insert(pharmacyCaseEvents).values({
    hospitalId: who.hospitalId,
    caseId,
    kind,
    what: what ?? null,
    note: note ?? null,
    actorUserId: who.userId,
    createdAt: who.now,
  });

async function load(who: Who, caseId: string) {
  const [c] = await who.tx
    .select()
    .from(pharmacyCases)
    .where(and(eq(pharmacyCases.id, caseId), eq(pharmacyCases.hospitalId, who.hospitalId)))
    .for("update");
  if (!c) throw fail("not_found", "That case is not at your hospital.");
  if (c.signedOffAt) throw fail("conflict", "This case is closed.");
  return c;
}

const update = (who: Who, id: string, set: Partial<typeof pharmacyCases.$inferInsert>) =>
  who.tx.update(pharmacyCases).set({ ...set, changedBy: who.userId }).where(eq(pharmacyCases.id, id));

export const NewCaseInput = z.object({
  clientKey: z.uuid(),
  locationId: z.uuid(),
  medicineId: z.string().min(1).max(120),
  what: z.string().trim().min(2).max(200),
});

/** "Report a discrepancy", tap-only: place, medicine, what happened. Severity from the medicine. */
export async function openManualCase(who: Who, input: z.infer<typeof NewCaseInput>) {
  const [done] = await who.tx.select({ id: pharmacyCases.id }).from(pharmacyCases).where(eq(pharmacyCases.id, input.clientKey));
  if (done) return { id: done.id };
  const [m] = await q<{ name: string; controlled: boolean }>(
    who.tx,
    sql`SELECT p.name, private.pharmacy_medicine_controlled(p.hospital_id, p.medicine_id) AS controlled
          FROM public.pharmacy_products p WHERE p.hospital_id = ${who.hospitalId}::uuid AND p.medicine_id = ${input.medicineId} LIMIT 1`,
  );
  if (!m) throw fail("not_found", "That medicine is not stocked here.");
  const highRisk = R.highRisk.some((h) => m.name.toLowerCase().includes(h));
  const severity = m.controlled ? "high" : highRisk ? "medium" : "low";
  await who.tx.insert(pharmacyCases).values({
    id: input.clientKey,
    hospitalId: who.hospitalId,
    sourceType: "manual",
    medicineId: input.medicineId,
    locationId: input.locationId,
    qty: 0,
    what: input.what,
    severity,
    dueAt: new Date(who.now.getTime() + R.caseHours[severity] * 3_600_000),
    createdBy: who.userId,
    createdAt: who.now,
  });
  await event(who, input.clientKey, "opened", input.what);
  return { id: input.clientKey };
}

export const AssignInput = z.object({
  caseId: z.uuid(),
  ownerUserId: z.uuid(),
  hours: z.number().int().refine((h) => (R.assignHours as readonly number[]).includes(h)),
});
export async function assignCase(who: Who, input: z.infer<typeof AssignInput>) {
  await load(who, input.caseId);
  await update(who, input.caseId, {
    ownerUserId: input.ownerUserId,
    assignedBy: who.userId,
    assignedAt: who.now,
    dueAt: new Date(who.now.getTime() + input.hours * 3_600_000),
  });
  await event(who, input.caseId, "assigned", input.ownerUserId);
  return { id: input.caseId };
}

export const CaseIdInput = z.object({ caseId: z.uuid() });
/** Anyone may take a case nobody owns; it keeps its deadline. */
export async function takeCase(who: Who, input: z.infer<typeof CaseIdInput>) {
  const c = await load(who, input.caseId);
  if (c.ownerUserId) throw fail("conflict", "Someone already has this case.");
  await update(who, c.id, { ownerUserId: who.userId, assignedBy: who.userId, assignedAt: who.now });
  await event(who, c.id, "taken");
  return { id: c.id };
}

export const StepInput = z.object({ caseId: z.uuid(), what: z.string().trim().min(2).max(200), note: z.string().trim().min(1).max(1000).nullable() });
export async function addCaseStep(who: Who, input: z.infer<typeof StepInput>) {
  const c = await load(who, input.caseId);
  if (c.ownerUserId !== who.userId && !(await isInCharge(who.tx, who.userId, who.hospitalId)))
    throw fail("forbidden", "Only the owner or the in-charge adds to this case.");
  await event(who, c.id, "step", input.what, input.note);
  return { id: c.id };
}

export const FindingsInput = z.object({
  caseId: z.uuid(),
  cause: z.string().min(2).max(120),
  actions: z.array(z.string().min(2).max(120)).min(1),
  prevent: z.array(z.string().min(2).max(120)).min(1),
});
export async function submitFindings(who: Who, input: z.infer<typeof FindingsInput>) {
  const c = await load(who, input.caseId);
  await update(who, c.id, {
    findings: { cause: input.cause, actions: input.actions, prevent: input.prevent },
    submittedBy: who.userId,
    submittedAt: who.now,
  });
  await event(who, c.id, "submitted", input.cause);
  return { id: c.id };
}

export async function signOffCase(who: Who, input: z.infer<typeof CaseIdInput>) {
  const c = await load(who, input.caseId);
  await update(who, c.id, { signedOffBy: who.userId, signedOffAt: who.now });
  await event(who, c.id, "signed_off");
  return { id: c.id };
}

export const BackInput = z.object({ caseId: z.uuid(), why: z.string().trim().min(2).max(200) });
export async function sendBack(who: Who, input: z.infer<typeof BackInput>) {
  const c = await load(who, input.caseId);
  await update(who, c.id, { submittedBy: null, submittedAt: null });
  await event(who, c.id, "sent_back", input.why);
  return { id: c.id };
}

export const EscalateInput = z.object({ caseId: z.uuid(), to: z.string().trim().min(2).max(200) });
export async function escalateCase(who: Who, input: z.infer<typeof EscalateInput>) {
  const c = await load(who, input.caseId);
  if (!(await isInCharge(who.tx, who.userId, who.hospitalId))) throw fail("forbidden", "Only the in-charge escalates a case.");
  await event(who, c.id, "escalated", input.to);
  return { id: c.id };
}
