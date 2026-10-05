/**
 * E5: SMS templates per facility, each with a purpose, a language and a status (draft →
 * pending_review → approved). English is seeded as `draft` from the demo catalogue's wording; the
 * Luganda slots are created empty with `pending_review` and the build never writes a translation.
 * Only `approved` templates are sent, and approval takes two different holders of
 * `sms_template_approve`: the first is recorded as `first_approver`, the second as `approved_by`
 * (the table's CHECK holds the same rule). A body with a banned term (E4) is refused on save.
 */
import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";

import { ncdSmsTemplate } from "@/db/schema";

import { authorize, NcdError, type NcdContext } from "../context";
import { withNcd, type NcdTx } from "../db";
import { DEMO_CATALOGUE } from "../demo/source";
import { bannedTermsIn } from "./banned";

export type TemplatePurpose = "appointment_reminder" | "missed_visit";
export type SmsTemplate = typeof ncdSmsTemplate.$inferSelect;

export const PURPOSE_LABEL: Record<TemplatePurpose, string> = {
  appointment_reminder: "Appointment reminder, 2 days before",
  missed_visit: "Missed-visit reminder",
};
export const LANGUAGE_LABEL: Record<string, string> = { en: "English", lg: "Luganda" };
export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Awaiting approval",
  approved: "Approved",
  retired: "Retired",
};

/** The seed: English wording from the catalogue as draft; every other language an empty slot. */
export function seedRows(facilityId: string, userId: string | null) {
  return DEMO_CATALOGUE.sms_templates_demo.map((t) => ({
    facilityId,
    purpose: t.purpose,
    language: t.language,
    body: t.language === "en" ? t.text : "",
    status: t.language === "en" ? "draft" : "pending_review",
    createdBy: userId,
  }));
}

/** Seeds the facility's templates once, for a user who manages code lists. Idempotent. */
export async function ensureTemplates(ctx: NcdContext): Promise<void> {
  authorize(ctx, "code_list_manage");
  await withNcd(
    ctx,
    "app",
    async (tx) => {
      const [any] = await tx.select({ id: ncdSmsTemplate.id }).from(ncdSmsTemplate).where(eq(ncdSmsTemplate.facilityId, ctx.facilityId)).limit(1);
      if (!any) await tx.insert(ncdSmsTemplate).values(seedRows(ctx.facilityId, ctx.userId));
    },
    ctx.db,
  );
}

export async function listTemplates(ctx: NcdContext): Promise<SmsTemplate[]> {
  return withNcd(
    ctx,
    "app",
    (tx) =>
      tx
        .select()
        .from(ncdSmsTemplate)
        .where(and(eq(ncdSmsTemplate.facilityId, ctx.facilityId), ne(ncdSmsTemplate.status, "retired")))
        .orderBy(asc(ncdSmsTemplate.purpose), asc(ncdSmsTemplate.language)),
    ctx.db,
  );
}

/** The approved template for a purpose and language, if any (what the dispatcher may send). */
export async function approvedTemplate(tx: NcdTx, facilityId: string, purpose: TemplatePurpose, language = "en") {
  const [t] = await tx
    .select()
    .from(ncdSmsTemplate)
    .where(
      and(
        eq(ncdSmsTemplate.facilityId, facilityId),
        eq(ncdSmsTemplate.purpose, purpose),
        eq(ncdSmsTemplate.language, language),
        eq(ncdSmsTemplate.status, "approved"),
      ),
    )
    .limit(1);
  return t ?? null;
}

export function checkBody(body: string): void {
  const hits = bannedTermsIn(body);
  if (hits.length)
    throw new NcdError("invalid", `The message may not name a condition, a measurement, a medicine or the department. Remove: ${hits.join(", ")}.`, { banned: hits });
}

async function load(tx: NcdTx, ctx: NcdContext, id: string): Promise<SmsTemplate> {
  const [t] = await tx.select().from(ncdSmsTemplate).where(and(eq(ncdSmsTemplate.id, id), eq(ncdSmsTemplate.facilityId, ctx.facilityId)));
  if (!t) throw new NcdError("not_found", "Template not found.");
  return t;
}

/** Editing returns the template to draft and clears any approval: a changed text is a new text. */
export async function saveTemplateBody(ctx: NcdContext, id: string, body: string): Promise<SmsTemplate> {
  authorize(ctx, "code_list_manage");
  const text = body.trim();
  checkBody(text);
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const t = await load(tx, ctx, id);
      if (t.status === "approved")
        await tx.update(ncdSmsTemplate).set({ status: "retired" }).where(eq(ncdSmsTemplate.id, t.id));
      const values = { body: text, status: "draft", firstApprover: null, approvedBy: null, approvedAt: null, version: t.version + 1 };
      if (t.status === "approved") {
        const [n] = await tx
          .insert(ncdSmsTemplate)
          .values({ facilityId: ctx.facilityId, purpose: t.purpose, language: t.language, createdBy: ctx.userId, ...values })
          .returning();
        return n!;
      }
      const [n] = await tx.update(ncdSmsTemplate).set(values).where(eq(ncdSmsTemplate.id, t.id)).returning();
      return n!;
    },
    ctx.db,
  );
}

/** Draft → awaiting approval. An empty slot cannot be submitted. */
export async function submitTemplate(ctx: NcdContext, id: string): Promise<SmsTemplate> {
  authorize(ctx, "code_list_manage");
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const t = await load(tx, ctx, id);
      if (t.status !== "draft") throw new NcdError("conflict", "Only a draft can be submitted.");
      if (!t.body.trim()) throw new NcdError("invalid", "Write the message before submitting it.");
      checkBody(t.body);
      const [n] = await tx.update(ncdSmsTemplate).set({ status: "pending_review", firstApprover: null, approvedBy: null }).where(eq(ncdSmsTemplate.id, t.id)).returning();
      return n!;
    },
    ctx.db,
  );
}

/**
 * One approval. The first records `first_approver`; a second, by a different user, approves the
 * template and retires any earlier approved one for the same purpose and language.
 */
export async function approveTemplate(ctx: NcdContext, id: string): Promise<SmsTemplate> {
  authorize(ctx, "sms_template_approve");
  if (!ctx.userId) throw new NcdError("forbidden", "Approval needs a signed-in user.");
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const t = await load(tx, ctx, id);
      if (t.status !== "pending_review") throw new NcdError("conflict", "Only a template awaiting approval can be approved.");
      if (!t.body.trim()) throw new NcdError("invalid", "An empty template cannot be approved.");
      checkBody(t.body);
      if (!t.firstApprover) {
        const [n] = await tx.update(ncdSmsTemplate).set({ firstApprover: ctx.userId }).where(eq(ncdSmsTemplate.id, t.id)).returning();
        return n!;
      }
      if (t.firstApprover === ctx.userId) throw new NcdError("forbidden", "A second, different person must approve this template.");
      await tx
        .update(ncdSmsTemplate)
        .set({ status: "retired" })
        .where(
          and(
            eq(ncdSmsTemplate.facilityId, ctx.facilityId),
            eq(ncdSmsTemplate.purpose, t.purpose),
            eq(ncdSmsTemplate.language, t.language),
            eq(ncdSmsTemplate.status, "approved"),
          ),
        );
      const [n] = await tx
        .update(ncdSmsTemplate)
        .set({ status: "approved", approvedBy: ctx.userId, approvedAt: ctx.enteredAt })
        .where(eq(ncdSmsTemplate.id, t.id))
        .returning();
      return n!;
    },
    ctx.db,
  );
}

/** What the Recall card shows: the approved text if there is one, else the draft, labelled. */
export async function templateFor(ctx: NcdContext, purpose: TemplatePurpose) {
  const all = await listTemplates(ctx);
  const en = all.filter((t) => t.purpose === purpose && t.language === "en");
  return en.find((t) => t.status === "approved") ?? en[0] ?? null;
}
