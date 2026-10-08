/**
 * Demo data mode (§10, I5–I7, ADR 0214). Switching on creates a demo load record and writes the
 * catalogue's patients through the normal command path as the `demo_loader` principal; switching off
 * removes every record of that load's synthetic persons, in one transaction, and verifies nothing is
 * left. Real records are never touched: selection is by demo load id AND is_synthetic, a trigger
 * refuses deleting any non-synthetic person's row, and the policies confine the loader to synthetic
 * rows. The audit log is append-only: its entries about demo records stay.
 */
import "server-only";

import type { NcdContext } from "../context";
import type { NcdTx } from "../db";
import type { DemoCatalogue, ScenarioPatient } from "./catalogue";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  ncdCommandLog,
  ncdDemoLoad,
  ncdIndicatorSnapshot,
  ncdPerson,
  ncdSmsTemplate,
} from "@/db/schema";
import { setConditionEnabled } from "../admin";
import { applyCommand } from "../commands/apply";
import { enabledConditions } from "../commands/shared";
import { authorize, fromDb, NcdError } from "../context";
import { rows, withNcd } from "../db";
import { generatePatients } from "../fixtures/generator";
import { addMonths, monthOf } from "../indicators/engine";
import { storeSnapshot } from "../indicators/snapshot";
import { FULL_ROLES } from "../standard/conditions";
import { DEMO_ACTORS, DEMO_CATALOGUE } from "./source";
import { dayIso, uuidv5, writeScenarioPatient } from "./writer";

export type DemoMode = "scenario" | "full_clinic";

/** The loader's context: the switching user's authority, confined to synthetic rows by principal. */
export function loaderContext(ctx: NcdContext, demoLoadId: string, day0: string): NcdContext {
  return {
    ...ctx,
    principal: "demo_loader",
    roles: ["demo_loader"],
    caps: new Set(["demo_write", "snapshot_compute"]),
    demoLoadId,
    enteredAt: new Date(`${day0}T08:00:00+03:00`),
    today: day0,
    actorLabel: (role) => DEMO_ACTORS[role] ?? null,
  };
}

const run = <T>(ctx: NcdContext, fn: (tx: NcdTx) => Promise<T>) =>
  withNcd(ctx, "app", fn, ctx.db).catch((e: unknown) => {
    throw fromDb(e);
  });

/** The generated cohort for full_clinic: deterministic from the catalogue's seed, size and day 0. */
export function generatedCohort(cat: DemoCatalogue, day0: string): ScenarioPatient[] {
  const g = cat.generator;
  return generatePatients({
    seed: g.seed,
    day0,
    size: g.target_registered_excluding_died,
    existing: cat.scenario_patients.filter((p) => !p.events.some((e) => e.type === "death")).length,
    spec: g as never,
    bpModule: FULL_ROLES.bp,
    glucoseModule: FULL_ROLES.glycaemic,
    reservedNames: new Set(cat.scenario_patients.map((p) => `${p.given_name} ${p.family_name}`)),
    reservedPhones: new Set(
      cat.scenario_patients.map((p) => p.phone_1).filter((x): x is string => !!x),
    ),
  });
}

/** I5: switch demo data on. Scenario patients load within the request; the full clinic continues in chunks. */
export async function turnOn(ctx: NcdContext, mode: DemoMode, cat: DemoCatalogue = DEMO_CATALOGUE) {
  authorize(ctx, "demo_data_manage");
  const day0 = ctx.today;
  const { id, previous } = await run(ctx, async (tx) => {
    const [{ approved } = { approved: false }] = await rows<{ approved: boolean }>(
      tx,
      sql`SELECT private.ncd_facility_approved(${ctx.facilityId}) AS approved`,
    );
    if (approved) throw new NcdError("interlock", cat.ui_copy.blocked_after_go_live);
    const active = await tx
      .select({ id: ncdDemoLoad.id })
      .from(ncdDemoLoad)
      .where(
        and(
          eq(ncdDemoLoad.facilityId, ctx.facilityId),
          inArray(ncdDemoLoad.status, ["loading", "on", "removing"]),
        ),
      );
    if (active.length) throw new NcdError("conflict", "Demo data is already on or loading.");
    const previous = [...(await enabledConditions(tx, ctx))];
    const [row] = await tx
      .insert(ncdDemoLoad)
      .values({
        facilityId: ctx.facilityId,
        mode,
        catalogueVersion: cat.version,
        seed: cat.generator.seed,
        day0,
        status: "loading",
        previousConditionSettings: { enabled: previous },
        startedBy: ctx.userId!,
        startedAt: ctx.enteredAt,
      })
      .returning({ id: ncdDemoLoad.id });
    return { id: row!.id, previous };
  });
  const loader = loaderContext(ctx, id, day0);
  try {
    // Enable the catalogue's modules; remember the previous settings (restored on removal).
    await run(loader, async (tx) => {
      for (const code of cat.condition_modules_enabled_while_on)
        if (!previous.includes(code))
          await setConditionEnabled(loader, code, true, "Demo data on", tx);
      const templates = await tx.select({ id: ncdSmsTemplate.id }).from(ncdSmsTemplate).limit(1);
      if (!templates.length)
        await tx.insert(ncdSmsTemplate).values(
          cat.sms_templates_demo.map((t) => ({
            facilityId: ctx.facilityId,
            purpose: t.purpose,
            language: t.language,
            body: t.text,
            status: t.status,
            createdBy: ctx.userId,
          })),
        );
    });
    // Patients are written by continueLoad in short chunks, so the card can show real progress.
    const cohort = mode === "full_clinic" ? generatedCohort(cat, day0).length : 0;
    await run(ctx, (tx) =>
      tx
        .update(ncdDemoLoad)
        .set({ progress: progressOf(0, cat.scenario_patients.length, cohort) })
        .where(eq(ncdDemoLoad.id, id)),
    );
  } catch (e) {
    await run(ctx, (tx) =>
      tx
        .update(ncdDemoLoad)
        .set({ status: "failed", progress: { error: e instanceof Error ? e.message : String(e) } })
        .where(eq(ncdDemoLoad.id, id)),
    );
    throw e;
  }
  return { id };
}

/**
 * Full clinic: write the next chunk of the generated cohort (resumable, idempotent by command id).
 * Called by the administration card and the cron route until the load is done.
 */
export type LoadProgress = {
  /** Steps done: each scenario patient, the data-quality step, then each generated patient. */
  next: number;
  total: number;
  scenario: number;
  cohort: number;
};
const progressOf = (next: number, scenario: number, cohort: number): LoadProgress => ({
  next,
  total: scenario + 1 + cohort,
  scenario,
  cohort,
});

/**
 * Writes the next steps of a loading demo load for up to `budgetMs`, then records its progress. The
 * admin card calls it in short chunks while open (so its bar moves), the cron route in long ones.
 * Every write is idempotent by command id, so a chunk cut short is simply resumed.
 */
export async function continueLoad(
  ctx: NcdContext,
  budgetMs = 20_000,
  cat: DemoCatalogue = DEMO_CATALOGUE,
) {
  authorize(ctx, "demo_data_manage");
  const [load] = await run(ctx, (tx) =>
    tx
      .select()
      .from(ncdDemoLoad)
      .where(and(eq(ncdDemoLoad.facilityId, ctx.facilityId), eq(ncdDemoLoad.status, "loading"))),
  );
  if (!load) return { done: true, next: 0, total: 0 };
  const scenario = cat.scenario_patients;
  const cohort = load.mode === "full_clinic" ? generatedCohort(cat, load.day0) : [];
  const total = scenario.length + 1 + cohort.length;
  let next = (load.progress as Partial<LoadProgress>).next ?? 0;
  const loader = loaderContext({ ...ctx, userId: load.startedBy }, load.id, load.day0);
  const opts = { day0: load.day0, demoLoadId: load.id };
  const started = Date.now();
  const stillLoading = async () =>
    (
      await run(ctx, (tx) =>
        tx
          .select({ id: ncdDemoLoad.id })
          .from(ncdDemoLoad)
          .where(and(eq(ncdDemoLoad.id, load.id), eq(ncdDemoLoad.status, "loading"))),
      )
    ).length > 0;
  try {
    while (next < total && Date.now() - started < budgetMs) {
      // Turned off (or failed) meanwhile: write nothing more against this load (finding 6).
      // ponytail: checked per step, not locked; a patient in flight at removal is caught by removal's residue check.
      if (!(await stillLoading())) return { done: true, next, total };
      if (next < scenario.length) await writeScenarioPatient(loader, scenario[next]!, opts);
      else if (next === scenario.length) await dataQualitySteps(loader, cat, load.day0, load.id);
      else await writeScenarioPatient(loader, cohort[next - scenario.length - 1]!, opts);
      next++;
    }
  } catch (e) {
    await run(ctx, (tx) =>
      tx
        .update(ncdDemoLoad)
        .set({ status: "failed", progress: { error: e instanceof Error ? e.message : String(e) } })
        .where(eq(ncdDemoLoad.id, load.id)),
    );
    throw e;
  }
  await run(ctx, (tx) =>
    tx
      .update(ncdDemoLoad)
      .set({ progress: progressOf(next, scenario.length, cohort.length) })
      .where(and(eq(ncdDemoLoad.id, load.id), eq(ncdDemoLoad.status, "loading"))),
  );
  if (next >= total) await finishLoad({ ...ctx, userId: load.startedBy }, load.id, load.day0);
  return { done: next >= total, next, total };
}

/** Turn demo data on and write it all, in this call (tests, scripts). The admin card chunks instead. */
export async function loadDemo(
  ctx: NcdContext,
  mode: DemoMode,
  cat: DemoCatalogue = DEMO_CATALOGUE,
) {
  const r = await turnOn(ctx, mode, cat);
  while (!(await continueLoad(ctx, 600_000, cat)).done);
  return r;
}

/** §10.3 optional steps: a same-day duplicate visit for the catalogue's patient, kept and queried. */
async function dataQualitySteps(
  loader: NcdContext,
  cat: DemoCatalogue,
  day0: string,
  demoLoadId: string,
) {
  const step = cat.data_quality_demo.find((d) => d.rule === "same_day_duplicate_visit");
  const key = step?.how.match(/for ([A-Z]{2}) on day 0/)?.[1];
  if (!key || !cat.scenario_patients.some((p) => p.key === key)) return;
  const personId = uuidv5(`${demoLoadId}:${key}:person`);
  await applyCommand(
    { ...loader, enteredAt: new Date(`${day0}T09:30:00+03:00`) },
    {
      id: uuidv5(`${demoLoadId}:${key}:dq-visit`),
      type: "visit.arrive",
      payload: {
        visitId: uuidv5(`${demoLoadId}:${key}:dq-visit-row`),
        personId,
        visitType: "unscheduled",
      },
      clientTs: null,
    },
  );
}

/** Snapshots for the 12 complete months before day 0 (synthetic, never signable), then "on". */
async function finishLoad(ctx: NcdContext, demoLoadId: string, day0: string) {
  const [live] = await run(ctx, (tx) =>
    tx
      .select({ id: ncdDemoLoad.id })
      .from(ncdDemoLoad)
      .where(and(eq(ncdDemoLoad.id, demoLoadId), eq(ncdDemoLoad.status, "loading"))),
  );
  if (!live) return;
  const loader = loaderContext(ctx, demoLoadId, day0);
  const last = addMonths(monthOf(day0), -1);
  for (let i = 11; i >= 0; i--) await storeSnapshot(loader, addMonths(last, -i), dayIso(day0, 0));
  await run(ctx, async (tx) => {
    const [c] = await rows<{ persons: number; visits: number }>(
      tx,
      sql`SELECT (SELECT count(*)::int FROM public.ncd_person WHERE demo_load_id = ${demoLoadId}) AS persons,
                 (SELECT count(*)::int FROM public.ncd_visit v JOIN public.ncd_person p ON p.id = v.person_id WHERE p.demo_load_id = ${demoLoadId}) AS visits`,
    );
    await tx
      .update(ncdDemoLoad)
      .set({ status: "on", counts: c ?? {} })
      .where(and(eq(ncdDemoLoad.id, demoLoadId), eq(ncdDemoLoad.status, "loading")));
  });
}

/** The tables holding a person's records, children first (§10.5 removal order). */
const CHILD_ORDER = [
  "ncd_sms_log",
  "ncd_reminder",
  "ncd_call",
  "ncd_audit_sample",
  "ncd_query",
  "ncd_record_version",
  "ncd_observation",
  "ncd_visit",
  "ncd_appointment",
  "ncd_review",
  "ncd_event",
  "ncd_merge_request",
  "ncd_name_index",
  "ncd_registration",
] as const;

async function removePersons(tx: NcdTx, who: ReturnType<typeof sql>, loadId: string | null) {
  const counts: Record<string, number> = {};
  // Abort if anything selected belongs to a person who is not synthetic (§10.5).
  const [{ bad } = { bad: 0 }] = await rows<{ bad: number }>(
    tx,
    sql`SELECT count(*)::int AS bad FROM public.ncd_person WHERE ${who} AND NOT is_synthetic`,
  );
  if (bad)
    throw new NcdError(
      "interlock",
      "Removal refused: the selection includes a record that is not synthetic. Nothing was changed.",
    );
  const ids = sql`(SELECT id FROM public.ncd_person WHERE ${who} AND is_synthetic)`;
  // Merge tombstones point at survivors; clear the pointers inside the set first.
  await tx.execute(sql`UPDATE public.ncd_person SET merged_into_id = NULL WHERE id IN ${ids}`);
  await tx.execute(
    sql`UPDATE public.ncd_registration SET superseded_by_id = NULL WHERE person_id IN ${ids}`,
  );
  for (const t of CHILD_ORDER) {
    const col =
      t === "ncd_merge_request"
        ? sql`(person_id IN ${ids} OR loser_person_id IN ${ids})`
        : sql`person_id IN ${ids}`;
    const r = await rows<{ n: number }>(
      tx,
      sql`WITH d AS (DELETE FROM ${sql.raw(`public.${t}`)} WHERE ${col} RETURNING 1) SELECT count(*)::int AS n FROM d`,
    );
    counts[t] = r[0]?.n ?? 0;
  }
  const cl = await rows<{ n: number }>(
    tx,
    sql`WITH d AS (DELETE FROM public.ncd_command_log WHERE person_id IN ${ids} ${loadId ? sql`OR (person_id IS NULL AND demo_load_id = ${loadId})` : sql``} RETURNING 1) SELECT count(*)::int AS n FROM d`,
  );
  counts.ncd_command_log = cl[0]?.n ?? 0;
  if (loadId) {
    const s = await tx
      .delete(ncdIndicatorSnapshot)
      .where(
        and(
          eq(ncdIndicatorSnapshot.demoLoadId, loadId),
          eq(ncdIndicatorSnapshot.isSynthetic, true),
        ),
      )
      .returning({ id: ncdIndicatorSnapshot.id });
    counts.ncd_indicator_snapshot = s.length;
  }
  const p = await rows<{ n: number }>(
    tx,
    sql`WITH d AS (DELETE FROM public.ncd_person WHERE ${who} AND is_synthetic RETURNING 1) SELECT count(*)::int AS n FROM d`,
  );
  counts.ncd_person = p[0]?.n ?? 0;
  return counts;
}

/** I6: switch demo data off. One transaction; verifies zero rows refer to the load; restores settings. */
export async function turnOff(ctx: NcdContext, confirmed: boolean) {
  authorize(ctx, "demo_data_manage");
  if (!confirmed) throw new NcdError("invalid", DEMO_CATALOGUE.ui_copy.confirm_off);
  const [load] = await run(ctx, (tx) =>
    tx
      .select()
      .from(ncdDemoLoad)
      .where(
        and(
          eq(ncdDemoLoad.facilityId, ctx.facilityId),
          inArray(ncdDemoLoad.status, ["loading", "on", "failed"]),
        ),
      ),
  );
  if (!load) throw new NcdError("not_found", "Demo data is not on.");
  const loader = loaderContext(ctx, load.id, ctx.today);
  const counts = await run(loader, async (tx) => {
    const c = await removePersons(tx, sql`demo_load_id = ${load.id}`, load.id);
    const [left] = await rows<{ n: number }>(
      tx,
      sql`SELECT (SELECT count(*) FROM public.ncd_person WHERE demo_load_id = ${load.id})
               + (SELECT count(*) FROM public.ncd_command_log WHERE demo_load_id = ${load.id})
               + (SELECT count(*) FROM public.ncd_indicator_snapshot WHERE demo_load_id = ${load.id}) AS n`,
    );
    if (Number(left?.n ?? 0) !== 0)
      throw new NcdError(
        "interlock",
        "Verification failed: demo rows remain. Nothing was changed.",
      );
    // Condition modules return to what they were before the load.
    const before = new Set(
      ((load.previousConditionSettings as { enabled?: string[] }).enabled ?? []) as string[],
    );
    for (const code of await enabledConditions(tx, loader))
      if (!before.has(code)) await setConditionEnabled(loader, code, false, "Demo data off", tx);
    return c;
  });
  await run(ctx, (tx) =>
    tx
      .update(ncdDemoLoad)
      .set({
        status: "off",
        endedBy: ctx.userId,
        endedAt: ctx.enteredAt,
        counts: { ...(load.counts as object), removed: counts },
      })
      .where(eq(ncdDemoLoad.id, load.id)),
  );
  return counts;
}

/** §8.3: "Remove all synthetic records" before a go-live request: selection by is_synthetic alone. */
export async function removeAllSynthetic(ctx: NcdContext) {
  authorize(ctx, "demo_data_manage");
  const loader = loaderContext(ctx, "00000000-0000-0000-0000-000000000000", ctx.today);
  return run({ ...loader, demoLoadId: null }, (tx) =>
    removePersons(tx, sql`facility_id = ${ctx.facilityId}`, null),
  );
}

export async function demoPersons(ctx: NcdContext, loadId: string) {
  return run(ctx, (tx) =>
    tx.select({ id: ncdPerson.id }).from(ncdPerson).where(eq(ncdPerson.demoLoadId, loadId)),
  );
}
export { ncdCommandLog };
