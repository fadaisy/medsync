"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { CRITICALS_COPY } from "@/content/lab-criticals";
import { testCatalogue } from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { encounters } from "@/db/schema/scheduling";
import { resolveEmrAccess } from "@/lib/emr/access";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { orderStatus, runEmrWrite } from "@/lib/emr/write/orders";
import { conceptDef } from "@/lib/facts/project/shared";
import { labDowntimeLiveFor } from "@/lib/lab/feature";
import { deliverAfterCommit } from "./criticals/store";
import {
  enterDowntimeForm,
  recordBriefing,
  recordDrill,
  recordPeriod,
  reserveFormNumbers,
  voidFormNumber,
} from "./downtime-store";
import { currentMeasures } from "./units";

/**
 * Downtime actions (Lab Phase 1 §5.9; D-LAB1-23: any lab user who may release results). Each is
 * the house contract: Zod, the lab scope (sign-in, AAL2, affiliation), the flag, one transaction.
 */

const uuid = z.uuid();
const when = z.coerce.date();
const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });

async function asLab<T>(
  fn: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    actor: Awaited<ReturnType<typeof requireEmrActor>>,
  ) => Promise<T>,
) {
  const actor = await requireEmrActor("lab");
  if (!labDowntimeLiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "Downtime entry is not switched on here.");
  if (!actor.labPermissions?.includes("lab.result.release"))
    throw new EmrWriteError("forbidden", "You do not have permission to enter downtime forms.");
  return asClinicalWriter({ userId: actor.userId, hospitalId: actor.hospitalId }, (tx) =>
    fn(tx, actor),
  );
}

async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return actionError(e);
  }
}

const Period = z.object({
  startsAt: when,
  endsAt: when,
  reason: z.enum(["network", "power", "system", "other"]),
  note: z.string().trim().max(500).nullable(),
});
export async function recordPeriodAction(raw: unknown) {
  const p = Period.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      code: "invalid",
      error: "Give the start, the end and the reason.",
    } as const;
  return run(() => asLab((tx, a) => recordPeriod(tx, a, p.data, new Date())));
}

export async function reserveFormsAction(
  raw: unknown,
): Promise<ActionResult<{ numbers: number[] }>> {
  const p = z.object({ count: z.number().int().min(1).max(200) }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Print 1 to 200 forms at a time." };
  try {
    const numbers = await asLab((tx, a) => reserveFormNumbers(tx, a, p.data.count, new Date()));
    return {
      ok: true,
      id: String(numbers[0]),
      serverTime: new Date().toISOString(),
      data: { numbers },
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function voidFormAction(raw: unknown) {
  const p = z
    .object({ number: z.number().int().positive(), reason: z.string().trim().min(3).max(200) })
    .safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: "Say why the form is voided." } as const;
  return run(() =>
    asLab(async (tx, a) => (await voidFormNumber(tx, a, p.data), String(p.data.number))),
  );
}

const Drill = z.object({
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participants: z.string().trim().min(2).max(500),
  whatWasDone: z.string().trim().min(3).max(1000),
  problems: z.string().trim().max(1000).nullable(),
});
export async function recordDrillAction(raw: unknown) {
  const p = Drill.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      code: "invalid",
      error: "Give the date, who took part and what was done.",
    } as const;
  return run(() => asLab((tx, a) => recordDrill(tx, a, p.data, new Date())));
}

const Briefing = z.object({
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  audience: z.string().trim().min(2).max(300),
  notes: z.string().trim().max(1000).nullable(),
});
export async function recordBriefingAction(raw: unknown) {
  const p = Briefing.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: "Give the date and who was briefed." } as const;
  return run(() => asLab((tx, a) => recordBriefing(tx, a, p.data, new Date())));
}

export interface FoundPatient {
  patientUserId: string;
  name: string;
  mrn: string;
  ageSex: string;
  openOrders: { orderId: string; testId: string; test: string }[];
  openVisit: { encounterId: string } | null;
}

/**
 * Enter a form, step 1: the patient by MRN. A patient who is not registered here, or whom the lab
 * has no basis to open, cannot be created from this screen (S43).
 */
export async function findPatientAction(raw: unknown): Promise<ActionResult<FoundPatient>> {
  const p = z.object({ mrn: z.string().trim().min(3).max(40) }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Type the MRN from the form." };
  try {
    const actor = await requireEmrActor("lab");
    if (!labDowntimeLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "Downtime entry is not switched on here.");
    const found = await asClinicalWriter(
      { userId: actor.userId, hospitalId: actor.hospitalId },
      async (tx) => {
        const [profile] = await tx
          .select({ id: patientProfiles.id })
          .from(patientProfiles)
          .where(eq(patientProfiles.patientCode, p.data.mrn.toUpperCase()));
        if (!profile) return null;
        const access = await resolveEmrAccess(tx, {
          userId: actor.userId,
          patientUserId: profile.id,
          hospitalId: actor.hospitalId,
        });
        if (!access.allowed) return null;
        const orders = await tx
          .select()
          .from(encounterOrders)
          .where(
            and(
              eq(encounterOrders.patientUserId, profile.id),
              eq(encounterOrders.hospitalId, actor.hospitalId),
              eq(encounterOrders.kind, "lab"),
              eq(encounterOrders.lifecycle, "events"),
            ),
          );
        const open: FoundPatient["openOrders"] = [];
        for (const o of orders) {
          const s = await orderStatus(tx, o);
          if (["active", "collected", "in_progress"].includes(s.state))
            open.push({ orderId: o.id, testId: o.testId!, test: o.text });
        }
        const [visit] = await tx
          .select({ id: encounters.id })
          .from(encounters)
          .where(
            and(
              eq(encounters.patientUserId, profile.id),
              eq(encounters.hospitalId, actor.hospitalId),
              eq(encounters.state, "in_progress"),
            ),
          )
          .limit(1);
        return {
          patientUserId: profile.id,
          openOrders: open,
          openVisit: visit ? { encounterId: visit.id } : null,
        };
      },
    );
    if (!found || (found.openOrders.length === 0 && !found.openVisit))
      return { ok: false, code: "not_found", error: CRITICALS_COPY.notRegistered };
    const ids = await identitiesFor(actor, [found.patientUserId], "lab_downtime_entry");
    const who = ids.get(found.patientUserId);
    return {
      ok: true,
      id: found.patientUserId,
      serverTime: new Date().toISOString(),
      data: {
        ...found,
        name: who?.name ?? "Name withheld",
        mrn: who?.mrn ?? p.data.mrn,
        ageSex: who?.ageSex ?? "",
      },
    };
  } catch (e) {
    return actionError(e);
  }
}

export interface FormComponent {
  conceptId: string;
  display: string;
  valueType: "quantity" | "coded" | "ordinal";
  answers: { code: string; label: string }[];
  unit: string | null;
}

/** The test's components and the unit each is entered in here (the catalogue's, when set). */
export async function testComponentsAction(
  raw: unknown,
): Promise<ActionResult<{ components: FormComponent[] }>> {
  const p = z.object({ testId: uuid }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Choose the test." };
  try {
    const actor = await requireEmrActor("lab");
    const out = await asClinicalWriter(
      { userId: actor.userId, hospitalId: actor.hospitalId },
      async (tx) => {
        const [test] = await tx
          .select()
          .from(testCatalogue)
          .where(
            and(
              eq(testCatalogue.id, p.data.testId),
              or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, actor.hospitalId)),
            ),
          );
        if (!test)
          throw new EmrWriteError("not_found", "That test is not on this hospital's menu.");
        const measures = await currentMeasures(tx, actor.hospitalId, test.id);
        const defaults = (test.defaultUnits ?? {}) as Record<string, string>;
        return test.components.map((c): FormComponent => {
          const def = conceptDef(c);
          return {
            conceptId: c,
            display: def?.display ?? c,
            valueType: (def?.valueType as FormComponent["valueType"]) ?? "quantity",
            answers: (def?.answers ?? []).map((code) => {
              const words = code.replace(/_/g, " ");
              return { code, label: words.charAt(0).toUpperCase() + words.slice(1) };
            }),
            unit: measures.get(c)?.unitUcum ?? defaults[c] ?? def?.canonicalUnit ?? null,
          };
        });
      },
    );
    return {
      ok: true,
      id: p.data.testId,
      serverTime: new Date().toISOString(),
      data: { components: out },
    };
  } catch (e) {
    return actionError(e);
  }
}

const Value = z.object({
  conceptId: z.string().trim().min(3).max(80),
  value: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(40).optional(),
  code: z.string().trim().max(60).optional(),
  entryCheckConfirmed: z.boolean().optional(),
});
const Check = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repeated"), repeatValue: z.string().trim().min(1).max(20) }),
  z.object({ kind: z.literal("checked_not_repeated") }),
  z.object({
    kind: z.literal("could_not_check"),
    reason: z.enum(["not_enough_sample", "analyser_down", "no_reagent", "other"]),
    text: z.string().trim().max(200).optional(),
  }),
]);
const Form = z.object({
  surface: z.literal("lab"),
  patientUserId: uuid,
  formNumber: z.number().int().positive(),
  collectedAt: when,
  resultedAt: when,
  releasedOnPaperBy: z.string().trim().min(2, "Who released the result on paper?").max(120),
  outsidePeriodReason: z.string().trim().max(200).nullable(),
  orderId: uuid.nullable(),
  newOrder: z
    .object({
      encounterId: uuid,
      testId: uuid,
      requestedByUserId: uuid,
      priority: z.enum(["routine", "urgent", "immediate"]),
    })
    .nullable(),
  values: z.array(Value).min(1, "Enter at least one result from the form.").max(40),
  marks: z
    .array(
      z.object({
        conceptId: z.string().trim().min(3).max(80),
        check: Check,
        sampleChecked: z.boolean(),
      }),
    )
    .max(40),
  call: z.object({ toUserId: uuid, at: when, readBack: z.boolean() }).nullable(),
  clientKey: z.string().trim().min(8).max(120),
});

/** Enter a form (§5.9): one transaction; delivery after commit; the times said back. */
export async function enterDowntimeFormAction(
  raw: unknown,
): Promise<ActionResult<{ resultedAt: string; enteredAt: string; alertId: string | null }>> {
  const r = await runEmrWrite(Form, raw, async (ctx, input) => {
    if (!labDowntimeLiveFor(ctx.actor.hospitalId))
      throw new EmrWriteError("config", "Downtime entry is not switched on here.");
    if (!ctx.actor.labPermissions?.includes("lab.result.release"))
      throw new EmrWriteError("forbidden", "You do not have permission to enter downtime forms.");
    const out = await enterDowntimeForm(ctx, input);
    return { ...out, id: out.reportId };
  });
  if (!r.ok) return r;
  const out = r.data!;
  try {
    const { db } = await import("@/db");
    await deliverAfterCommit(db as unknown as Parameters<typeof deliverAfterCommit>[0], out.jobs);
  } catch {
    // Delivery failure is recorded as an event and never undoes the entry (CA-3).
  }
  return {
    ok: true,
    id: out.reportId,
    serverTime: r.serverTime,
    data: {
      resultedAt: out.resultedAt.toISOString(),
      enteredAt: out.enteredAt.toISOString(),
      alertId: out.alertId,
    },
  };
}

/** Clinicians here who may order (the requesting clinician, the person phoned). */
export async function orderingCliniciansAction(): Promise<
  ActionResult<{ people: { userId: string; name: string }[] }>
> {
  try {
    const actor = await requireEmrActor("lab");
    const { clinicianOptions } = await import("@/lib/emr/read/results");
    const people = await clinicianOptions(actor.hospitalId);
    return {
      ok: true,
      id: actor.hospitalId,
      serverTime: new Date().toISOString(),
      data: { people },
    };
  } catch (e) {
    return actionError(e);
  }
}
