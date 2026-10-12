"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { getAuthState } from "@/lib/auth";
import { secondFactorFresh } from "@/lib/auth-fresh";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { labCriticalsLiveFor } from "@/lib/lab/feature";
import {
  approveSmsTemplate,
  editSmsTemplate,
  ensureSmsTemplates,
  saveLabSettings,
  saveResponseDraft,
  setContacts,
  signResponseVersion,
} from "./setup";

/**
 * Critical-results set-up actions (§5.8). The lab side needs `lab.manage`; signing needs a fresh
 * second factor (§8). The CSO countersigns from the super-admin surface, where the CSO works
 * (no in-app CSO role exists; recorded as residual governance risk, §12).
 */

const uuid = z.uuid();
const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });
const REAUTH: ActionResult = {
  ok: false,
  code: "forbidden",
  error: "reauth: enter your authenticator code to sign.",
};

async function asManager<T>(
  fn: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    actor: { userId: string; hospitalId: string },
  ) => Promise<T>,
) {
  const actor = await requireEmrActor("lab");
  if (!labCriticalsLiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "Critical alerts are not switched on here.");
  if (!actor.labPermissions?.includes("lab.manage"))
    throw new EmrWriteError(
      "forbidden",
      "Only the laboratory lead changes critical-results set-up.",
    );
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

const Settings = z.object({
  labPhone: z.string().trim().max(40).nullable(),
  secondCheck: z.boolean(),
  smsLive: z.boolean(),
});

export async function saveLabSettingsAction(raw: unknown) {
  const p = Settings.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      code: "invalid",
      error: p.error.issues[0]?.message ?? "Invalid input.",
    } as const;
  if (p.data.labPhone && p.data.labPhone.length < 3)
    return { ok: false, code: "invalid", error: "Type the lab's full number." } as const;
  return run(() =>
    asManager(async (tx, a) => (await saveLabSettings(tx, a, p.data, new Date()), a.hospitalId)),
  );
}

const Contacts = z.object({
  departmentId: uuid.nullable(),
  level: z.union([z.literal(1), z.literal(2)]),
  userIds: z.array(uuid).max(10),
});

export async function setContactsAction(raw: unknown) {
  const p = Contacts.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." } as const;
  return run(() =>
    asManager(
      async (tx, a) => (
        await setContacts(tx, a, p.data, new Date()),
        p.data.departmentId ?? a.hospitalId
      ),
    ),
  );
}

const Draft = z.object({
  ackWithinMin: z.number().int(),
  level1AfterMin: z.number().int().nullable(),
  level2AfterMin: z.number().int().nullable(),
  source: z.string().trim().max(500),
});

export async function saveResponseDraftAction(raw: unknown) {
  const p = Draft.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Type whole minutes." } as const;
  return run(() => asManager((tx, a) => saveResponseDraft(tx, a, p.data)));
}

const Sign = z.object({ versionId: uuid, exceptionNote: z.string().trim().max(500).nullable() });

export async function signResponseAsLeadAction(raw: unknown) {
  const p = Sign.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." } as const;
  if (!(await secondFactorFresh())) return REAUTH;
  return run(() =>
    asManager(
      async (tx, a) => (
        await signResponseVersion(tx, { ...a, as: "lead" }, p.data, new Date()),
        p.data.versionId
      ),
    ),
  );
}

const Template = z.object({
  kind: z.enum(["level0", "escalation"]),
  body: z.string().trim().min(10).max(320),
});

export async function editSmsTemplateAction(raw: unknown) {
  const p = Template.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      code: "invalid",
      error: "Type the message (10 to 320 characters).",
    } as const;
  return run(() =>
    asManager(
      async (tx, a) => (
        await ensureSmsTemplates(tx, a, new Date()),
        await editSmsTemplate(tx, a, p.data, new Date()),
        a.hospitalId
      ),
    ),
  );
}

export async function approveSmsTemplateAction(raw: unknown) {
  const p = z.object({ templateId: uuid }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." } as const;
  return run(() =>
    asManager(
      async (tx, a) => (
        await approveSmsTemplate(tx, a, p.data.templateId, new Date()),
        p.data.templateId
      ),
    ),
  );
}

export async function seedSmsTemplatesAction() {
  return run(() =>
    asManager(async (tx, a) => (await ensureSmsTemplates(tx, a, new Date()), a.hospitalId)),
  );
}

/* ─── The CSO countersigns (super-admin surface) ─────────────────────── */

const CsoSign = z.object({
  hospitalId: uuid,
  versionId: uuid,
  exceptionNote: z.string().trim().max(500).nullable(),
});

export async function signResponseAsCsoAction(raw: unknown): Promise<ActionResult> {
  const p = CsoSign.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  const state = await getAuthState();
  if (!state.user || state.aal !== "aal2" || !state.roles.includes("superadmin"))
    return { ok: false, code: "forbidden", error: "Only the clinical safety officer signs here." };
  if (!(await secondFactorFresh())) return REAUTH;
  const userId = state.user.id;
  return run(() =>
    asClinicalWriter({ userId, hospitalId: p.data.hospitalId }, async (tx) => {
      await signResponseVersion(
        tx,
        { userId, hospitalId: p.data.hospitalId, as: "cso" },
        p.data,
        new Date(),
      );
      return p.data.versionId;
    }),
  );
}
