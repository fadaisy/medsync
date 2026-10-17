"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { ipcAlertActions, ipcListChecks } from "@/db/schema";
import { secondFactorFresh } from "@/lib/auth-fresh";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { AlertEntryPayload } from "./lab-alerts";
import { ipcScope } from "./scope";
import { clearPatientFlag, recordIpcAction } from "./store";

/**
 * The infection prevention workspace's writes (Lab Phase 5 §8, IPC group; IC-6, IC-8, IC-14, D-LAB5-19, -20). The
 * house contract: Zod → the IPC scope (AAL2, designation or in-charge) → one transaction as the clinical writer.
 * The alert list is drafted and signed by the IPC lead, countersigned by a laboratory lead, and checked by the
 * surveillance focal person; signing needs a fresh second factor.
 */
const bad = (e?: z.ZodError): ActionResult<never> => ({
  ok: false,
  code: "invalid",
  error: e?.issues[0]?.message ?? "Check the form.",
});
const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });
const REAUTH: ActionResult = {
  ok: false,
  code: "forbidden",
  error: "reauth: enter your authenticator code to sign.",
};

async function run(
  need: "act" | "ipc_lead" | "lab_lead" | "focal" | "view",
  fn: (a: { userId: string; hospitalId: string }) => Promise<string>,
) {
  try {
    const s = await ipcScope();
    const allowed =
      need === "act"
        ? s.acts
        : need === "view"
          ? s.all || s.wardIds.length > 0 || s.roles.includes("focal")
          : s.roles.includes(need);
    if (!allowed) throw new EmrWriteError("forbidden", "You do not do this here.");
    const a = { userId: s.userId, hospitalId: s.hospitalId };
    return ok(await fn(a));
  } catch (e) {
    return actionError(e);
  }
}

const Act = z.object({
  alertId: z.uuid(),
  kind: z.enum([
    "precautions_started",
    "already_in_precautions",
    "not_needed",
    "contacts_listed",
    "notified",
  ]),
  detail: z.record(z.string(), z.union([z.string().max(300), z.number().int().min(0).max(10_000)])),
  clientKey: z.string().min(8).max(120),
});
export async function recordIpcActionAction(raw: unknown): Promise<ActionResult> {
  const p = Act.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("act", (a) => asClinicalWriter(a, (tx) => recordIpcAction(tx, a, p.data, new Date())));
}

const Clear = z.object({
  patientUserId: z.uuid(),
  entryKey: z.string().min(2).max(80),
  reason: z.string().trim().min(3, "Say why.").max(500),
});
export async function clearPatientFlagAction(raw: unknown): Promise<ActionResult> {
  const p = Clear.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("act", (a) =>
    asClinicalWriter(
      a,
      async (tx) => (await clearPatientFlag(tx, a, p.data, new Date()), p.data.patientUserId),
    ),
  );
}

/** IC-14, Law 9: opening a `tb` alert's panel is recorded. */
export async function viewRestrictedAlertAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ alertId: z.uuid() }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("view", (a) =>
    asClinicalWriter(a, async (tx) => {
      await tx.insert(ipcAlertActions).values({
        hospitalId: a.hospitalId,
        alertId: p.data.alertId,
        kind: "viewed",
        detail: {},
        byUser: a.userId,
        at: new Date(),
      });
      return p.data.alertId;
    }),
  );
}

const Entry = z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), payload: AlertEntryPayload });
export async function saveAlertEntryAction(raw: unknown): Promise<ActionResult> {
  const p = Entry.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("ipc_lead", (a) =>
    asClinicalWriter(a, (tx) =>
      saveConfigDraft(
        tx,
        a,
        { kind: "ipc_alert_entry", key: p.data.key, payload: p.data.payload },
        new Date(),
      ),
    ),
  );
}

const Sign = z.object({
  configId: z.uuid(),
  as: z.enum(["ipc_lead", "lab_counter"]),
  exceptionNote: z.string().trim().max(500).nullable(),
});
export async function signAlertEntryAction(raw: unknown): Promise<ActionResult> {
  const p = Sign.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return REAUTH;
  return run(p.data.as === "ipc_lead" ? "ipc_lead" : "lab_lead", (a) =>
    asClinicalWriter(
      a,
      async (tx) => (
        await signConfig(
          tx,
          { ...a, as: p.data.as },
          { configId: p.data.configId, exceptionNote: p.data.exceptionNote },
          new Date(),
        ),
        p.data.configId
      ),
    ),
  );
}

/** D-LAB5-20: the surveillance focal person checks an entry's IDSR route against the guidelines. */
export async function checkAlertEntryAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ configId: z.uuid(), note: z.string().trim().min(3).max(500).nullable() })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("focal", (a) =>
    asClinicalWriter(a, async (tx) => {
      const [r] = await tx
        .insert(ipcListChecks)
        .values({
          hospitalId: a.hospitalId,
          configId: p.data.configId,
          checkedBy: a.userId,
          note: p.data.note,
        })
        .returning({ id: ipcListChecks.id });
      return r!.id;
    }),
  );
}
