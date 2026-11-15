"use server";

/**
 * Clinics & schedule writes (ADRs 0501–0507). Scope is resolved here, never sent by the client. The draft log,
 * versions and jobs are written with the server's database role after the hospital-admin scope check (0296: RLS
 * on, no client policy); the engine rows change ONLY through `cs_publish`, in one transaction (P4). Each write is
 * audited in `sa_audit_log` (CS10).
 */
import type { PortResult, When } from "@/components/clinics-schedule/port";
import type { Change } from "@/lib/clinics-schedule/model";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { CS_ERRORS } from "@/content/clinics-schedule/copy";
import { db } from "@/db";
import { scheduleChanges, schedulePublishJobs } from "@/db/schema/clinics-schedule";
import { deskDevices } from "@/db/schema/reception-desk";
import { saAuditLog } from "@/db/schema/sa-audit-log";
import { serviceLines } from "@/db/schema/service-lines";
import { clinicsScheduleLiveFor } from "@/lib/clinics-schedule/feature";
import { BANDS, ENTITIES, pairCode } from "@/lib/clinics-schedule/model";
import { checkPublish, runPublish } from "@/lib/clinics-schedule/publish";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";
import { callEdge } from "@/lib/supabase/edge";

const PATH = "/hospital-admin/clinics";

async function scope() {
  const s = await requireHospitalAdminScope();
  if (!clinicsScheduleLiveFor(s.hospitalId)) throw new Error("clinics_schedule_off");
  return s;
}

const audit = (
  actor: string,
  hospitalId: string,
  action: string,
  reason: string,
  after: Record<string, unknown>,
) =>
  db.insert(saAuditLog).values({
    actorId: actor,
    action,
    targetKind: "hospital",
    targetId: hospitalId,
    reason: reason.padEnd(8, "."),
    beforeData: null,
    afterData: after,
  });

const fail = (e: unknown, where: string): { ok: false; error: string } => {
  logger.error(`[clinics-schedule] ${where}`, { err: e });
  return { ok: false, error: CS_ERRORS.saveFailed };
};

const EditSchema = z.object({
  entity: z.enum(ENTITIES as [string, ...string[]]),
  key: z.string().min(1).max(80),
  before: z.unknown(),
  after: z.unknown(),
});
const ChangeSchema = z.object({
  id: z.string().uuid(),
  summary: z.string().min(1).max(300),
  edits: z.array(EditSchema).min(1).max(500),
});

export async function saveChange(raw: Change): Promise<PortResult> {
  const p = ChangeSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: CS_ERRORS.invalid };
  try {
    const s = await scope();
    await db.transaction(async (tx) => {
      await tx.insert(scheduleChanges).values({
        id: p.data.id,
        hospitalId: s.hospitalId,
        summary: p.data.summary,
        edits: p.data.edits,
        author: s.userId,
        status: "draft",
      });
      await tx.insert(saAuditLog).values({
        actorId: s.userId,
        action: "cs_draft",
        targetKind: "hospital",
        targetId: s.hospitalId,
        reason: p.data.summary.padEnd(8, "."),
        beforeData: null,
        afterData: { change: p.data.id },
      });
    });
    return { ok: true };
  } catch (e) {
    return fail(e, "saveChange");
  }
}

export async function undoChanges(ids: string[]): Promise<PortResult> {
  if (!ids.length || !z.array(z.string().uuid()).safeParse(ids).success)
    return { ok: false, error: CS_ERRORS.invalid };
  try {
    const s = await scope();
    await db
      .update(scheduleChanges)
      .set({ status: "undone" })
      .where(
        and(
          eq(scheduleChanges.hospitalId, s.hospitalId),
          eq(scheduleChanges.status, "draft"),
          inArray(scheduleChanges.id, ids),
        ),
      );
    await audit(s.userId, s.hospitalId, "cs_undo", `Undo ${ids.length} draft change(s)`, {
      changes: ids,
    });
    return { ok: true };
  } catch (e) {
    return fail(e, "undo");
  }
}

/** Tonight 22:00 or tomorrow 06:00, Kampala (UTC+3, no DST). */
function runAt(when: Exclude<When, "now">): Date {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  const day = Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate());
  const at = (dayMs: number, h: number) => new Date(dayMs + (h - 3) * 3_600_000);
  if (when === "tonight") {
    const t = at(day, 22);
    return t > now ? t : at(day + 86_400_000, 22);
  }
  return at(day + 86_400_000, 6);
}

export async function publishChanges(
  ids: string[],
  when: When,
): Promise<PortResult<{ version?: number; texts?: number; runAt?: string }>> {
  if (!ids.length || !z.array(z.string().uuid()).safeParse(ids).success)
    return { ok: false, error: CS_ERRORS.invalid };
  try {
    const s = await scope();
    if (when === "now") {
      const r = await runPublish(s, ids, s.userId);
      revalidatePath(PATH);
      return r;
    }
    const r = await checkPublish(s, ids, s.userId);
    if (!r.ok) return { ok: false, error: r.error };
    const t = runAt(when);
    await db.transaction(async (tx) => {
      const [job] = await tx
        .insert(schedulePublishJobs)
        .values({ hospitalId: s.hospitalId, runAt: t, author: s.userId, changeIds: ids })
        .returning({ id: schedulePublishJobs.id });
      await tx
        .update(scheduleChanges)
        .set({ status: "scheduled", jobId: job!.id })
        .where(and(eq(scheduleChanges.hospitalId, s.hospitalId), inArray(scheduleChanges.id, ids)));
    });
    await audit(s.userId, s.hospitalId, "cs_schedule", `Scheduled ${ids.length} change(s)`, {
      runAt: t.toISOString(),
      changes: ids,
    });
    return { ok: true, runAt: when };
  } catch (e) {
    return fail(e, "publish");
  }
}

async function waitingJob(hospitalId: string) {
  const [job] = await db
    .select()
    .from(schedulePublishJobs)
    .where(
      and(
        eq(schedulePublishJobs.hospitalId, hospitalId),
        eq(schedulePublishJobs.status, "waiting"),
      ),
    )
    .orderBy(asc(schedulePublishJobs.runAt))
    .limit(1);
  return job;
}

export async function cancelSchedule(): Promise<PortResult> {
  try {
    const s = await scope();
    const job = await waitingJob(s.hospitalId);
    if (!job) return { ok: true };
    await db.transaction(async (tx) => {
      await tx
        .update(schedulePublishJobs)
        .set({ status: "cancelled" })
        .where(eq(schedulePublishJobs.id, job.id));
      await tx
        .update(scheduleChanges)
        .set({ status: "draft", jobId: null })
        .where(eq(scheduleChanges.jobId, job.id));
    });
    await audit(s.userId, s.hospitalId, "cs_cancel_schedule", "Cancelled a scheduled publish", {
      job: job.id,
    });
    return { ok: true };
  } catch (e) {
    return fail(e, "cancelSchedule");
  }
}

export async function publishEarly(): Promise<PortResult<{ version: number }>> {
  try {
    const s = await scope();
    const job = await waitingJob(s.hospitalId);
    if (!job) return { ok: false, error: CS_ERRORS.stale };
    const r = await runPublish(s, job.changeIds, s.userId);
    if (r.ok)
      await db
        .update(schedulePublishJobs)
        .set({ status: "done", ranAt: new Date() })
        .where(eq(schedulePublishJobs.id, job.id));
    revalidatePath(PATH);
    return r;
  } catch (e) {
    return fail(e, "publishEarly");
  }
}

/** P7: at once and audited; resuming goes through publish. */
export async function pauseClinic(clinicId: string): Promise<PortResult> {
  if (!z.string().uuid().safeParse(clinicId).success)
    return { ok: false, error: CS_ERRORS.invalid };
  try {
    const s = await scope();
    const done = await db
      .update(serviceLines)
      .set({ pausedAt: new Date(), pausedBy: s.userId })
      .where(and(eq(serviceLines.id, clinicId), eq(serviceLines.hospitalId, s.hospitalId)))
      .returning({ id: serviceLines.id });
    if (!done.length) return { ok: false, error: CS_ERRORS.stale };
    await audit(s.userId, s.hospitalId, "cs_pause", "Paused a clinic", { clinic: clinicId });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "pause");
  }
}

/** S23: the device row, then a single-use 15-minute code (only its hash is stored). */
export async function addDevice(
  kind: "desk" | "tablet" | "screen",
  name: string,
  place: string,
): Promise<PortResult<{ id: string; code: string }>> {
  const p = z
    .object({
      kind: z.enum(["desk", "tablet", "screen"]),
      name: z.string().min(1).max(80),
      place: z.string().min(1).max(120),
    })
    .safeParse({ kind, name, place });
  if (!p.success) return { ok: false, error: CS_ERRORS.invalid };
  try {
    const s = await scope();
    const code = pairCode();
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(deskDevices)
        .values({
          hospitalId: s.hospitalId,
          label: p.data.name,
          kind: p.data.kind,
          place: p.data.place,
          createdBy: s.userId,
          lockMinutes: p.data.kind === "screen" ? null : 10,
        })
        .returning({ id: deskDevices.id });
      await tx.execute(sql`select public.desk_pair_issue(${row!.id}::uuid, ${code})`);
      return row!.id;
    });
    await audit(
      s.userId,
      s.hospitalId,
      "cs_pair_device",
      `Pairing code issued for ${p.data.name}`,
      { device: id },
    );
    return { ok: true, id, code };
  } catch (e) {
    return fail(e, "addDevice");
  }
}

/** D-CS-09: people come from the staff invite; the grade is set once they accept. */
export async function invitePerson(v: {
  name: string;
  role: string;
  band: string;
  email: string;
}): Promise<PortResult<{ id: string }>> {
  const p = z
    .object({
      name: z.string().min(1).max(120),
      role: z.string().min(1).max(120),
      band: z.enum(BANDS as unknown as [string, ...string[]]),
      email: z.string().email(),
    })
    .safeParse(v);
  if (!p.success) return { ok: false, error: CS_ERRORS.invalid };
  try {
    const s = await scope();
    const r = await callEdge<{ invitations: { id: string }[] }>(
      "ha-invite-staff",
      {
        hospital_id: s.hospitalId,
        invites: [{ email: p.data.email.toLowerCase() }],
        reason: `Clinics & schedule: ${p.data.name}, ${p.data.role}`,
      },
      "[clinics-schedule] invite",
    );
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, id: r.data.invitations[0]?.id ?? "" };
  } catch (e) {
    return fail(e, "invite");
  }
}
