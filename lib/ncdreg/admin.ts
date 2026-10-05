/**
 * Administration (§7 I2–I4, §8.3): the condition catalogue per facility, definition versions with
 * four-eyes approval, settings, NCD role assignment, and the go-live interlock. Online-only. Every
 * change is a row (append-only where it is a version) and every row is audited by trigger.
 */
import "server-only";

import type { NcdContext } from "./context";
import type { NcdTx } from "./db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import {
  ncdConditionSetting,
  ncdDefinitionVersion,
  ncdDemoLoad,
  ncdFacilitySettings,
  ncdGoLiveRequest,
  ncdStaffRole,
} from "@/db/schema";
import { enabledConditions, facilitySettings } from "./commands/shared";
import { authorize, can, fromDb, moduleOf, NcdError } from "./context";
import { rows, withNcd } from "./db";
import { HTN_GRADE_TABLE } from "./standard/calculations";
import { ALL_CODE_LISTS, MEDICINE_LIST } from "./standard/code-lists";

const run = <T>(ctx: NcdContext, fn: (tx: NcdTx) => Promise<T>) =>
  withNcd(ctx, "app", fn, ctx.db).catch((e: unknown) => {
    throw fromDb(e);
  });

/* ─── facility status (banner, empty states, go-live screen) ─────────── */

export type FacilityStatus = {
  approved: boolean;
  goLive: { id: string; status: string; requestedBy: string; requestedAt: Date } | null;
  demo: typeof ncdDemoLoad.$inferSelect | null;
  syntheticPersons: number;
  persons: number;
  draftDefinitions: boolean;
  enabled: string[];
  draftCoreEnabled: string[];
};

export async function facilityStatus(ctx: NcdContext): Promise<FacilityStatus> {
  return run(ctx, async (tx) => {
    const [{ approved, synthetic, persons } = { approved: false, synthetic: 0, persons: 0 }] =
      await rows<{
        approved: boolean;
        synthetic: number;
        persons: number;
      }>(
        tx,
        sql`SELECT private.ncd_facility_approved(${ctx.facilityId}) AS approved,
                 c.synthetic, c.total AS persons FROM private.ncd_person_counts() c`,
      );
    const [goLive] = await tx
      .select()
      .from(ncdGoLiveRequest)
      .where(eq(ncdGoLiveRequest.facilityId, ctx.facilityId))
      .orderBy(desc(ncdGoLiveRequest.requestedAt))
      .limit(1);
    const [demo] = await tx
      .select()
      .from(ncdDemoLoad)
      .where(eq(ncdDemoLoad.facilityId, ctx.facilityId))
      .orderBy(desc(ncdDemoLoad.startedAt))
      .limit(1);
    const enabled = [...(await enabledConditions(tx, ctx))];
    const draftCoreEnabled = enabled.filter((c) => {
      const m = moduleOf(ctx, c);
      return m.level === "core" && m.status === "draft";
    });
    // Draft while anything the module uses is draft (§8.3): the whole of 0.1 is.
    const draftDefinitions =
      ALL_CODE_LISTS.some((l) => l.status === "draft") ||
      MEDICINE_LIST.status === "draft" ||
      enabled.some((c) => moduleOf(ctx, c).status === "draft");
    return {
      approved: !!approved,
      goLive: goLive
        ? {
            id: goLive.id,
            status: goLive.status,
            requestedBy: goLive.requestedBy,
            requestedAt: goLive.requestedAt,
          }
        : null,
      demo: demo ?? null,
      syntheticPersons: synthetic,
      persons,
      draftDefinitions,
      enabled,
      draftCoreEnabled,
    };
  });
}

/* ─── I4 condition catalogue ───────────────────────────────────────────── */

export async function conditionSettings(ctx: NcdContext) {
  return run(ctx, async (tx) => {
    const history = await tx
      .select()
      .from(ncdConditionSetting)
      .where(eq(ncdConditionSetting.facilityId, ctx.facilityId))
      .orderBy(ncdConditionSetting.conditionCode, desc(ncdConditionSetting.version));
    const enabled = await enabledConditions(tx, ctx);
    const counts = await rows<{ code: string; n: number }>(
      tx,
      sql`SELECT condition_code AS code, count(*)::int AS n FROM public.ncd_registration
          WHERE facility_id = ${ctx.facilityId} AND superseded_by_id IS NULL GROUP BY 1`,
    );
    const n = new Map(counts.map((c) => [c.code, c.n]));
    return ctx.catalogue.map((m) => ({
      module: m,
      enabled: enabled.has(m.code),
      registrations: n.get(m.code) ?? 0,
      history: history.filter((h) => h.conditionCode === m.code),
    }));
  });
}

/**
 * Enable or disable a module. A draft core module can be enabled only before go-live; disabling a
 * module with registrations refuses new registrations only (existing records stay and keep reporting).
 */
export async function setConditionEnabled(
  ctx: NcdContext,
  code: string,
  enabled: boolean,
  reason: string,
  tx0?: NcdTx,
) {
  authorize(ctx, "condition_catalogue_manage", "demo_write");
  const m = moduleOf(ctx, code);
  const body = async (tx: NcdTx) => {
    const [{ approved } = { approved: false }] = await rows<{ approved: boolean }>(
      tx,
      sql`SELECT private.ncd_facility_approved(${ctx.facilityId}) AS approved`,
    );
    if (enabled && approved && m.level === "core" && m.status !== "approved")
      throw new NcdError(
        "interlock",
        `${m.label} is a draft module: after go-live only an approved module can be enabled.`,
      );
    const [last] = await tx
      .select({ version: ncdConditionSetting.version })
      .from(ncdConditionSetting)
      .where(
        and(
          eq(ncdConditionSetting.facilityId, ctx.facilityId),
          eq(ncdConditionSetting.conditionCode, code),
        ),
      )
      .orderBy(desc(ncdConditionSetting.version))
      .limit(1);
    await tx.insert(ncdConditionSetting).values({
      facilityId: ctx.facilityId,
      conditionCode: code,
      enabled,
      moduleLevel: m.level,
      moduleStatus: m.status,
      moduleVersion: m.version,
      version: (last?.version ?? 0) + 1,
      reason,
      demoLoadId: ctx.principal === "demo_loader" ? ctx.demoLoadId : null,
      setBy: ctx.userId,
      setAt: ctx.enteredAt,
    });
  };
  return tx0 ? body(tx0) : run(ctx, body);
}

/* ─── I3 settings ──────────────────────────────────────────────────────── */

export const settingsPatch = z.object({
  glucoseUnit: z.enum(["mmol", "mgdl"]).optional(),
  creatinineUnit: z.enum(["umol", "mgdl"]).optional(),
  reminderBeforeDays: z.number().int().min(0).max(14).optional(),
  reminderAfterDays: z.number().int().min(1).max(30).optional(),
  reminderMaxMissed: z.number().int().min(0).max(5).optional(),
  sendWindowStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  sendWindowEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  defaultIntervalWeeks: z.array(z.number().int().min(1).max(52)).min(1).max(5).optional(),
  hospitalDisplayName: z.string().trim().max(80).nullable().optional(),
  clinicPhone: z.string().trim().max(20).nullable().optional(),
});

export async function getSettings(ctx: NcdContext) {
  return run(ctx, (tx) => facilitySettings(tx, ctx));
}

export async function updateSettings(ctx: NcdContext, patch: z.infer<typeof settingsPatch>) {
  authorize(ctx, "code_list_manage");
  const p = settingsPatch.parse(patch);
  return run(ctx, async (tx) => {
    const cur = await facilitySettings(tx, ctx);
    const values = {
      ...cur,
      ...p,
      facilityId: ctx.facilityId,
      version: cur.version + 1,
      updatedBy: ctx.userId,
      updatedAt: ctx.enteredAt,
    };
    await tx
      .insert(ncdFacilitySettings)
      .values(values)
      .onConflictDoUpdate({
        target: ncdFacilitySettings.facilityId,
        set: { ...p, version: values.version, updatedBy: ctx.userId, updatedAt: ctx.enteredAt },
      });
    return values;
  });
}

/* ─── I2 definition versions (code lists and threshold tables) ─────────── */

export const DEFINITION_IDS = [
  ...ALL_CODE_LISTS.map((l) => l.id),
  MEDICINE_LIST.id,
  HTN_GRADE_TABLE.id,
] as const;

export async function proposeDefinition(
  ctx: NcdContext,
  definitionId: string,
  payload: Record<string, unknown>,
) {
  authorize(ctx, "code_list_manage");
  if (!(DEFINITION_IDS as readonly string[]).includes(definitionId))
    throw new NcdError("invalid", "Unknown definition.");
  return run(ctx, async (tx) => {
    const prior = await tx
      .select({ version: ncdDefinitionVersion.version })
      .from(ncdDefinitionVersion)
      .where(
        and(
          eq(ncdDefinitionVersion.facilityId, ctx.facilityId),
          eq(ncdDefinitionVersion.definitionId, definitionId),
        ),
      );
    const version = `${definitionId}-f${prior.length + 1}`;
    const [row] = await tx
      .insert(ncdDefinitionVersion)
      .values({
        facilityId: ctx.facilityId,
        definitionId,
        version,
        payload,
        author: ctx.userId!,
        createdAt: ctx.enteredAt,
      })
      .returning();
    return row!;
  });
}

/** Four-eyes: the approver is never the author (a CHECK holds it in the database too). */
export async function decideDefinition(ctx: NcdContext, id: string, approve: boolean) {
  authorize(ctx, "code_list_manage");
  return run(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(ncdDefinitionVersion)
      .where(eq(ncdDefinitionVersion.id, id));
    if (!row) throw new NcdError("not_found", "Not found.");
    if (row.status !== "proposed") throw new NcdError("conflict", "Already decided.");
    if (row.author === ctx.userId)
      throw new NcdError("forbidden", "A change needs a second person to approve it.");
    await tx
      .update(ncdDefinitionVersion)
      .set({
        status: approve ? "approved" : "refused",
        approver: ctx.userId,
        decidedAt: ctx.enteredAt,
      })
      .where(eq(ncdDefinitionVersion.id, id));
    return { ...row, status: approve ? "approved" : "refused" };
  });
}

export async function definitionVersions(ctx: NcdContext) {
  return run(ctx, (tx) =>
    tx
      .select()
      .from(ncdDefinitionVersion)
      .where(eq(ncdDefinitionVersion.facilityId, ctx.facilityId))
      .orderBy(desc(ncdDefinitionVersion.createdAt)),
  );
}

/* ─── NCD role assignment (D-16) ───────────────────────────────────────── */

export async function assignRole(
  ctx: NcdContext,
  userId: string,
  role: "registry_lead" | "head_of_department" | "auditor",
) {
  authorize(ctx, "ncd_role_assign");
  return run(ctx, (tx) =>
    tx
      .insert(ncdStaffRole)
      .values({
        facilityId: ctx.facilityId,
        userId,
        ncdRole: role,
        grantedBy: ctx.userId,
        grantedAt: ctx.enteredAt,
      }),
  );
}
export async function revokeRole(ctx: NcdContext, assignmentId: string) {
  authorize(ctx, "ncd_role_assign");
  return run(ctx, (tx) =>
    tx
      .update(ncdStaffRole)
      .set({ revokedBy: ctx.userId, revokedAt: ctx.enteredAt })
      .where(and(eq(ncdStaffRole.id, assignmentId), isNull(ncdStaffRole.revokedAt))),
  );
}

/* ─── §8.3 go-live interlock ───────────────────────────────────────────── */

export async function requestGoLive(ctx: NcdContext, note: string | null) {
  authorize(ctx, "go_live_request");
  return run(ctx, async (tx) => {
    const [{ n } = { n: 0 }] = await rows<{ n: number }>(
      tx,
      sql`SELECT synthetic AS n FROM private.ncd_person_counts()`,
    );
    if (n > 0)
      throw new NcdError(
        "interlock",
        `Go-live is refused while ${n} synthetic record${n === 1 ? "" : "s"} exist. Remove all synthetic records first.`,
        {
          synthetic: n,
        },
      );
    const enabled = [...(await enabledConditions(tx, ctx))];
    const draft = enabled.filter(
      (c) => moduleOf(ctx, c).level === "core" && moduleOf(ctx, c).status === "draft",
    );
    if (draft.length)
      throw new NcdError(
        "interlock",
        `Go-live is refused while a draft core module is enabled: ${draft.join(", ")}.`,
      );
    const [row] = await tx
      .insert(ncdGoLiveRequest)
      .values({
        facilityId: ctx.facilityId,
        requestedBy: ctx.userId!,
        requestedAt: ctx.enteredAt,
        note,
      })
      .returning();
    return row!;
  });
}

/** Approval by a different user holding clinical safety approval; the database re-checks every condition. */
export async function decideGoLive(ctx: NcdContext, requestId: string, approve: boolean) {
  authorize(ctx, "clinical_safety_approve");
  return run(ctx, async (tx) => {
    const [r] = await tx.select().from(ncdGoLiveRequest).where(eq(ncdGoLiveRequest.id, requestId));
    if (!r || r.status !== "requested") throw new NcdError("not_found", "No open go-live request.");
    if (r.requestedBy === ctx.userId)
      throw new NcdError("forbidden", "Go-live needs a second, different approver.");
    await tx
      .update(ncdGoLiveRequest)
      .set({
        status: approve ? "approved" : "refused",
        decidedBy: ctx.userId,
        decidedAt: ctx.enteredAt,
      })
      .where(eq(ncdGoLiveRequest.id, requestId));
    return { approved: approve };
  });
}

export { can };
