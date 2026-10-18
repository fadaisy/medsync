"use server";

import type { GovernanceRole } from "./governance-scope";
import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { hospitalDesignations, labSignedConfigs } from "@/db/schema";
import { secondFactorFresh } from "@/lib/auth-fresh";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { publishConsentVersion } from "@/lib/notifications/consent";
import { saveConfigDraft, signConfig } from "./catalogue-v2";
import { governanceWho } from "./governance-scope";
import { PAYLOADS } from "./signed-config";

/**
 * The referral governance desk's actions (Lab Phase 4 P8, A6; PT-2, PT-3, D-LAB4-07). The data protection lead
 * drafts and signs each partner's legal record and field list; the IPC lead the high-risk wording (the CSO
 * countersigns it in the admin console); the hospital admin names both leads. Zod → AAL2 → the designation or
 * the admin role → one transaction as the clinical writer (audited by trigger) → `{ id, serverTime }`.
 */

type Who = NonNullable<Awaited<ReturnType<typeof governanceWho>>>;
const uuid = z.uuid();
const bad = (e?: z.ZodError): ActionResult => ({
  ok: false,
  code: "invalid",
  error: e?.issues[0]?.message ?? "Check the form.",
});
const reauth: ActionResult = {
  ok: false,
  code: "forbidden",
  error: "reauth: enter your authenticator code to sign.",
};

async function run(
  need: GovernanceRole | "admin",
  fn: (tx: EmrTx, who: Who, now: Date) => Promise<string | void>,
): Promise<ActionResult> {
  try {
    const who = await governanceWho(null);
    if (!who)
      throw new EmrWriteError("forbidden", "Sign in with your authenticator to use this desk.");
    if (need === "admin" ? !who.admin : !who.roles.includes(need))
      throw new EmrWriteError(
        "forbidden",
        need === "admin"
          ? "Only the hospital admin names the leads."
          : need === "ipc_lead"
            ? "Only the infection prevention lead does this."
            : "Only the data protection lead does this.",
      );
    const r = await asClinicalWriter(who, (tx) => fn(tx, who, new Date()));
    return {
      ok: true,
      id: typeof r === "string" ? r : who.hospitalId,
      serverTime: new Date().toISOString(),
    };
  } catch (e) {
    return actionError(e);
  }
}

const KIND_ROLE = {
  partner_legal: "data_protection_lead",
  partner_fields: "data_protection_lead",
  referral_wording: "ipc_lead",
  // Lab Phase 5 (PR-12, A5): the wording a patient agrees to before results show in the app or by SMS.
  results_consent_notice: "data_protection_lead",
} as const;
const Kind = z.enum([
  "partner_legal",
  "partner_fields",
  "referral_wording",
  "results_consent_notice",
]);

/** A draft; key = the partner id (legal record, field list) or `high_risk` (the wording). */
export async function saveGovernanceConfigAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ kind: Kind, key: z.string().min(1).max(80), payload: z.unknown() })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  const payload = PAYLOADS[p.data.kind].safeParse(p.data.payload);
  if (!payload.success) return bad(payload.error);
  return run(KIND_ROLE[p.data.kind], (tx, who, now) =>
    saveConfigDraft(tx, who, { kind: p.data.kind, key: p.data.key, payload: payload.data }, now),
  );
}

/** Signed by the designated lead (not the draft's author, unless no one else holds the designation). */
export async function signGovernanceConfigAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ kind: Kind, configId: uuid, exceptionNote: z.string().trim().max(500).nullable() })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return reauth;
  const role = KIND_ROLE[p.data.kind];
  let notice: unknown = null;
  const r = await run(role, async (tx, who, now) => {
    await signConfig(
      tx,
      { ...who, as: role === "ipc_lead" ? "ipc_lead" : "dp_lead" },
      { configId: p.data.configId, exceptionNote: p.data.exceptionNote },
      now,
    );
    if (p.data.kind === "results_consent_notice") {
      const [row] = await tx
        .select({ payload: labSignedConfigs.payload })
        .from(labSignedConfigs)
        .where(eq(labSignedConfigs.id, p.data.configId));
      notice = row?.payload ?? null;
    }
    return p.data.configId;
  });
  // ponytail: published after the signing transaction (consent_versions is not the clinical writer's); the
  // insert is idempotent, so a failed publish is repaired by the next sign of a new version.
  if (r.ok && notice) {
    const n = notice as { version: string; inApp: string; sms: string };
    await publishConsentVersion("results_in_app", n.version, n.inApp);
    await publishConsentVersion("results_sms", n.version, n.sms);
  }
  return r;
}

export async function setDesignationAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      role: z.enum(["data_protection_lead", "ipc_lead"]),
      userId: uuid,
      startsOn: z.iso.date(),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("admin", async (tx, who, now) => {
    const [r] = await tx
      .insert(hospitalDesignations)
      .values({
        hospitalId: who.hospitalId,
        role: p.data.role,
        userId: p.data.userId,
        startsOn: p.data.startsOn,
        setBy: who.userId,
        setAt: now,
      })
      .returning({ id: hospitalDesignations.id });
    return r!.id;
  });
}

export async function endDesignationAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ id: uuid, endsOn: z.iso.date() }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("admin", async (tx, who) => {
    const [r] = await tx
      .update(hospitalDesignations)
      .set({ endsOn: p.data.endsOn })
      .where(
        and(
          eq(hospitalDesignations.id, p.data.id),
          eq(hospitalDesignations.hospitalId, who.hospitalId),
        ),
      )
      .returning({ id: hospitalDesignations.id });
    if (!r) throw new EmrWriteError("not_found", "That designation was not found.");
    return r.id;
  });
}
