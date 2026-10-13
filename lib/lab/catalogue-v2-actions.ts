"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { labSettings } from "@/db/schema";
import { getAuthState } from "@/lib/auth";
import { secondFactorFresh } from "@/lib/auth-fresh";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { saveConfigDraft, signConfig } from "./catalogue-v2";
import { labCatalogueV2LiveFor } from "./feature";
import {
  activateProfile,
  createProfile,
  resolveCheck,
  setVerified,
  setVisibility,
} from "./profile-store";
import { importResearch, recordDraftCheck, rejectBand } from "./research-store";
import { PAYLOADS } from "./signed-config";

/**
 * Catalogue v2 set-up actions (Lab Phase 2 §5.10–§5.14, §8 "Catalogue" and "Interpretation"). The house
 * contract: Zod, the lab actor (AAL2), the flag, `lab.manage`, one transaction as the clinical writer
 * (audited), `{ id, serverTime }`. Signing needs a fresh second factor; the CSO countersigns from the
 * super-admin console (D-LAB1-11 carried over).
 */

const uuid = z.uuid();
const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });
const REAUTH: ActionResult = {
  ok: false,
  code: "forbidden",
  error: "reauth: enter your authenticator code to sign.",
};
const bad = (e?: z.ZodError): ActionResult => ({
  ok: false,
  code: "invalid",
  error: e?.issues[0]?.message ?? "Invalid input.",
});

async function asLead<T>(
  fn: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    a: { userId: string; hospitalId: string },
  ) => Promise<T>,
) {
  const actor = await requireEmrActor("lab");
  if (!labCatalogueV2LiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "The lab catalogue v2 is not switched on here.");
  if (!actor.labPermissions?.includes("lab.manage"))
    throw new EmrWriteError("forbidden", "Only the laboratory lead changes the catalogue.");
  const a = { userId: actor.userId, hospitalId: actor.hospitalId };
  return asClinicalWriter(a, (tx) => fn(tx, a));
}
const run = async (fn: () => Promise<string>): Promise<ActionResult> => {
  try {
    return ok(await fn());
  } catch (e) {
    return actionError(e);
  }
};

/* ─── Research drafts (§5.13; RI-*) ─────────────────────────────────── */

export async function importResearchAction(): Promise<ActionResult> {
  return run(() => asLead(async (tx, a) => (await importResearch(tx, a, new Date())).hash));
}

const Check = z.object({
  bandId: uuid,
  finding: z.enum(["matches", "corrected"]),
  where: z.string().trim().min(3, "Say which table or page you read.").max(300),
  low: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .nullable()
    .optional(),
  high: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .nullable()
    .optional(),
});
export async function recordDraftCheckAction(raw: unknown): Promise<ActionResult> {
  const p = Check.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run(() =>
    asLead(async (tx, a) => (await recordDraftCheck(tx, a, p.data, new Date()), p.data.bandId)),
  );
}

const Reject = z.object({ bandId: uuid, reason: z.string().trim().min(3).max(300).nullable() });
export async function rejectBandAction(raw: unknown): Promise<ActionResult> {
  const p = Reject.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run(() => asLead(async (tx, a) => (await rejectBand(tx, a, p.data), p.data.bandId)));
}

/* ─── Signed configuration (§5.12, §5.14; DS-*, D-LAB2-21, -27) ───────── */

const Draft = z.object({
  kind: z.enum(["scheme", "flag_basis", "elevation", "hiv_algorithm"]),
  key: z.string().trim().min(1).max(80),
  payload: z.unknown(),
});
export async function saveConfigDraftAction(raw: unknown): Promise<ActionResult> {
  const p = Draft.safeParse(raw);
  if (!p.success || !PAYLOADS[p.data.kind].safeParse(p.data.payload).success)
    return bad(p.success ? undefined : p.error);
  return run(() => asLead((tx, a) => saveConfigDraft(tx, a, p.data, new Date())));
}

/** CC-1: the concept addendum, global, keyed by the data file's hash. */
export async function draftAddendumAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run(() =>
    asLead((tx, a) =>
      saveConfigDraft(
        tx,
        a,
        { kind: "addendum", key: "cfc-1.6.0", payload: p.data, global: true },
        new Date(),
      ),
    ),
  );
}

const Sign = z.object({ configId: uuid, exceptionNote: z.string().trim().max(500).nullable() });
export async function signConfigAsLeadAction(raw: unknown): Promise<ActionResult> {
  const p = Sign.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return REAUTH;
  return run(() =>
    asLead(
      async (tx, a) => (
        await signConfig(tx, { ...a, as: "lead" }, p.data, new Date()),
        p.data.configId
      ),
    ),
  );
}

export async function signConfigAsCsoAction(raw: unknown): Promise<ActionResult> {
  // A global entry (REF, the addendum) has no hospital: the CSO signs it from any context.
  const p = Sign.extend({ hospitalId: uuid.nullable() }).safeParse(raw);
  if (!p.success) return bad(p.error);
  const state = await getAuthState();
  if (!state.user || state.aal !== "aal2" || !state.roles.includes("superadmin"))
    return { ok: false, code: "forbidden", error: "Only the clinical safety officer signs here." };
  if (!(await secondFactorFresh())) return REAUTH;
  const signer = {
    userId: state.user.id,
    hospitalId: p.data.hospitalId ?? "00000000-0000-0000-0000-000000000000",
    as: "cso" as const,
  };
  return run(async () => {
    await asClinicalWriter(signer, (tx) => signConfig(tx, signer, p.data, new Date()));
    return p.data.configId;
  });
}

/* ─── Analyser profiles (§5.11; AP-*) ───────────────────────────────── */

export async function createProfileAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ modelId: z.string().min(2).max(60), bench: z.string().trim().max(60).nullable() })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run(() => asLead((tx, a) => createProfile(tx, a, p.data, new Date())));
}

export async function setVisibilityAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      profileId: uuid,
      code: z.string().min(1).max(40),
      visibility: z.enum(["clinician", "lab_only", "never"]),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run(() => asLead(async (tx, a) => (await setVisibility(tx, a, p.data), p.data.profileId)));
}

export async function resolveCheckAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      profileId: uuid,
      code: z.string().min(1).max(40),
      resolution: z.string().trim().min(3).max(300),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run(() => asLead(async (tx, a) => (await resolveCheck(tx, a, p.data), p.data.profileId)));
}

export async function setVerifiedAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ profileId: uuid, concept: z.string().min(3).max(80), verified: z.boolean() })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run(() => asLead(async (tx, a) => (await setVerified(tx, a, p.data), p.data.profileId)));
}

export async function activateProfileAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ profileId: uuid }).safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return REAUTH;
  return run(() =>
    asLead(async (tx, a) => (await activateProfile(tx, a, p.data, new Date()), p.data.profileId)),
  );
}

/* ─── Lab settings: eGFR reporting (EG-1) ───────────────────────────── */

export async function setReportEgfrAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ on: z.boolean() }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run(() =>
    asLead(async (tx, a) => {
      await tx
        .insert(labSettings)
        .values({ hospitalId: a.hospitalId, reportEgfr: p.data.on, updatedBy: a.userId })
        .onConflictDoUpdate({
          target: labSettings.hospitalId,
          set: { reportEgfr: p.data.on, updatedBy: a.userId, updatedAt: new Date() },
        });
      return a.hospitalId;
    }),
  );
}
