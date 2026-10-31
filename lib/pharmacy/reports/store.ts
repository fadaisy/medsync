import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RC, RULES } from "@/content/pharmacy-rework-records";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { REPORT_KINDS, reportGate, reportIssues, reportRows } from "./derive";
import { reportFigures } from "./read";

/**
 * Reports move Draft → Checked (anyone) → Submitted (in-charge), with the figures frozen at submission (rework PRD
 * §6.6, S9; TECH-SPEC §4 `checkReport`, `submitReport`). The figures and their issues are worked out again here, on
 * the server, so a stale screen cannot check past a remark or submit past a blocking item. 0269's guard enforces the
 * order and the in-charge in SQL as well.
 */
export const REPORT_NEED: PharmacyNeed = {
  permission: ["pharmacy.dispense", "pharmacy.stock", "pharmacy.store", "pharmacy.manage"],
  point: "none",
};

const kind = z.enum(REPORT_KINDS as unknown as ["hmis_meds", "hmis_epi", "cd_return", "losses"]);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const CheckInput = z.object({
  kind,
  month,
  remarks: z.record(z.string().max(80), z.string().trim().min(2).max(120)).default({}),
});
export const SubmitInput = z.object({ kind, month });

const fail = (code: "conflict" | "forbidden" | "invalid", m: string) => new EmrWriteError(code, m);

async function current(ctx: PharmacyCtx, k: string, ym: string) {
  const [r] = rowsOf<{ id: string; status: string; remarks: Record<string, string> }>(
    await ctx.tx.execute(sql`
    SELECT id, status, remarks FROM public.pharmacy_reports
     WHERE hospital_id = ${ctx.actor.hospitalId}::uuid AND kind = ${k} AND period = ${`${ym}-01`}::date
     FOR UPDATE`),
  );
  return r ?? null;
}

export async function checkReport(ctx: PharmacyCtx, input: z.infer<typeof CheckInput>) {
  const was = await current(ctx, input.kind, input.month);
  if (was) {
    if (was.status === "checked") return { id: was.id };
    throw fail("conflict", RC.refused.reportDone);
  }
  const f = await reportFigures(ctx.tx, ctx.actor.hospitalId, input.month);
  const issues = reportIssues(input.kind, f, RULES.epiWastageRemarkPct);
  // Only remarks the figures ask for are kept.
  const remarks = Object.fromEntries(
    Object.entries(input.remarks).filter(([k]) => issues.some((i) => i.key === k)),
  );
  if (!reportGate(issues, remarks, "draft", ctx.manages).canCheck)
    throw fail("invalid", RC.refused.reportRemarks);
  const [row] = rowsOf<{ id: string }>(
    await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_reports (hospital_id, kind, period, remarks, checked_by, checked_at, created_by)
    VALUES (${ctx.actor.hospitalId}::uuid, ${input.kind}, ${`${input.month}-01`}::date, ${JSON.stringify(remarks)}::jsonb,
            ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz, ${ctx.actor.userId}::uuid)
    RETURNING id`),
  );
  return { id: row!.id };
}

export async function submitReport(ctx: PharmacyCtx, input: z.infer<typeof SubmitInput>) {
  if (!ctx.manages) throw fail("forbidden", RC.refused.inChargeOnly);
  const was = await current(ctx, input.kind, input.month);
  if (!was) throw fail("invalid", RC.refused.reportNotChecked);
  if (was.status === "submitted") return { id: was.id };
  const f = await reportFigures(ctx.tx, ctx.actor.hospitalId, input.month);
  const issues = reportIssues(input.kind, f, RULES.epiWastageRemarkPct);
  const gate = reportGate(issues, was.remarks, "checked", ctx.manages);
  if (gate.blocked) throw fail("conflict", RC.refused.reportStop);
  if (gate.remarksLeft) throw fail("invalid", RC.refused.reportRemarks);
  const snapshot = { rows: reportRows(input.kind, f), issues, remarks: was.remarks };
  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_reports
       SET status = 'submitted', submitted_by = ${ctx.actor.userId}::uuid, submitted_at = ${ctx.now.toISOString()}::timestamptz,
           snapshot = ${JSON.stringify(snapshot)}::jsonb
     WHERE id = ${was.id}::uuid`);
  return { id: was.id };
}
