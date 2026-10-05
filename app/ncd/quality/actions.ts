"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fromDb } from "@/lib/ncdreg/context";
import {
  AUDIT_FIELDS,
  drawAuditSample,
  personByRegistryNumber,
  recordAgreement,
} from "@/lib/ncdreg/quality";
import { requireNcdScope } from "@/lib/ncdreg/scope";

type Result<T = null> = { ok: true; value: T } | { ok: false; message: string };
const month = z.string().regex(/^\d{4}-\d{2}$/);

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await fn();
    revalidatePath("/ncd/quality");
    return { ok: true, value };
  } catch (e) {
    return { ok: false, message: fromDb(e).message };
  }
}

/** G4: draw (or redraw, idempotent) the month's audit sample. */
export async function drawSampleAction(
  raw: unknown,
): Promise<Result<{ sampled: number; visits: number }>> {
  const m = month.safeParse(raw);
  if (!m.success) return { ok: false, message: "Choose a month." };
  const { ctx } = await requireNcdScope();
  return guard(async () => {
    const r = await drawAuditSample(ctx, `${m.data}-01`);
    return { sampled: r.sampled.length, visits: r.visits };
  });
}

const agreement = z.object({
  sampleId: z.string().uuid(),
  fields: z.record(z.enum(AUDIT_FIELDS.map((f) => f.key) as [string, ...string[]]), z.boolean()),
});

/** G4: field-level agreement for one sampled visit. */
export async function recordAgreementAction(raw: unknown): Promise<Result> {
  const p = agreement.safeParse(raw);
  if (!p.success) return { ok: false, message: "Mark each field as agreeing or not." };
  const { ctx } = await requireNcdScope();
  return guard(async () => {
    await recordAgreement(ctx, p.data.sampleId, p.data.fields);
    return null;
  });
}

/** A7: find a record by registry number for the duplicate review. */
export async function findRecordAction(
  raw: unknown,
): Promise<
  Result<{ id: string; name: string; registryNumber: string; age: number; sex: string } | null>
> {
  const n = z.string().trim().min(3).max(40).safeParse(raw);
  if (!n.success) return { ok: false, message: "Type a registry number." };
  const { ctx } = await requireNcdScope();
  try {
    const i = await personByRegistryNumber(ctx, n.data);
    return {
      ok: true,
      value: i
        ? { id: i.id, name: i.name, registryNumber: i.registryNumber, age: i.age, sex: i.sex }
        : null,
    };
  } catch (e) {
    return { ok: false, message: fromDb(e).message };
  }
}
