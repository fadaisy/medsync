import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import { and, asc, desc, eq, inArray, isNull, max, ne } from "drizzle-orm";

import { CRITICALS_COPY } from "@/content/lab-criticals";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { testCatalogue } from "@/db/schema/emr";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import {
  criticalContacts,
  criticalResponseVersions,
  labSettings,
  labSmsTemplates,
  ucumUnits,
} from "@/db/schema/lab-safety";
import { cadres } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { EmrWriteError } from "@/lib/emr/write/context";
import { CLERKING_CADRE_CODES } from "@/lib/encounter/access";
import { renderSms } from "./messages";

/**
 * Critical-results set-up (Lab Phase 1 §5.8; D-LAB1-08, -11, -12, -17). Settings, contacts, the
 * response-time set and its two signatures, and the hospital's SMS templates with two approvers.
 * Values are typed by the hospital: nothing here proposes a number (Law 5). Writes run as the owner
 * after the caller's permission check, like every EMR write; the audit triggers record each change.
 */

type Actor = { userId: string; hospitalId: string };
const invalid = (m: string) => new EmrWriteError("invalid", m);

export async function saveLabSettings(
  tx: EmrTx,
  actor: Actor,
  input: { labPhone: string | null; secondCheck: boolean; smsLive: boolean },
  now: Date,
) {
  const values = {
    labPhone: input.labPhone?.trim() || null,
    secondCheck: input.secondCheck,
    smsLive: input.smsLive,
    updatedBy: actor.userId,
    updatedAt: now,
  };
  await tx
    .insert(labSettings)
    .values({ hospitalId: actor.hospitalId, ...values })
    .onConflictDoUpdate({ target: labSettings.hospitalId, set: values });
}

/** RC-2, RC-3: an ordered list per department (level 1) or for the hospital (level 2). */
export async function setContacts(
  tx: EmrTx,
  actor: Actor,
  input: { departmentId: string | null; level: 1 | 2; userIds: string[] },
  now: Date,
) {
  if ((input.level === 1) !== (input.departmentId !== null))
    throw invalid("Level 1 belongs to a department; level 2 to the hospital.");
  if (new Set(input.userIds).size !== input.userIds.length)
    throw invalid("A person is listed twice.");
  if (input.departmentId) {
    const [d] = await tx
      .select({ id: hospitalDepartments.id })
      .from(hospitalDepartments)
      .where(
        and(
          eq(hospitalDepartments.id, input.departmentId),
          eq(hospitalDepartments.hospitalId, actor.hospitalId),
        ),
      );
    if (!d) throw invalid("That department is not at this hospital.");
  }
  if (input.userIds.length > 0) {
    const ok = await tx
      .selectDistinct({ userId: staffAffiliations.userId })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          inArray(staffAffiliations.userId, input.userIds),
          eq(staffAffiliations.hospitalId, actor.hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
          inArray(cadres.code, [...CLERKING_CADRE_CODES]),
        ),
      );
    if (ok.length !== input.userIds.length)
      throw invalid("A contact must be a clinician here who may acknowledge a critical result.");
  }
  await tx
    .delete(criticalContacts)
    .where(
      and(
        eq(criticalContacts.hospitalId, actor.hospitalId),
        eq(criticalContacts.level, input.level),
        input.departmentId
          ? eq(criticalContacts.departmentId, input.departmentId)
          : isNull(criticalContacts.departmentId),
      ),
    );
  if (input.userIds.length > 0)
    await tx.insert(criticalContacts).values(
      input.userIds.map((userId, position) => ({
        hospitalId: actor.hospitalId,
        departmentId: input.departmentId,
        level: input.level,
        userId,
        position,
        createdBy: actor.userId,
        createdAt: now,
      })),
    );
}

/* ─── Response times: draft, then the lead, then the CSO ─────────────── */

export interface ResponseDraft {
  ackWithinMin: number;
  level1AfterMin: number | null;
  level2AfterMin: number | null;
  source: string;
}

const minutes = (n: number | null, what: string) => {
  if (n === null) return;
  if (!Number.isInteger(n) || n < 1 || n > 1440)
    throw invalid(`${what}: whole minutes, 1 to 1440.`);
};

/** An edit goes to the unsigned draft, or opens a new one: a signature is never edited away (§5.7). */
export async function saveResponseDraft(
  tx: EmrTx,
  actor: Actor,
  input: ResponseDraft,
): Promise<string> {
  minutes(input.ackWithinMin, "Acknowledge within");
  minutes(input.level1AfterMin, "Level 1 after");
  minutes(input.level2AfterMin, "Level 2 after");
  if (input.level2AfterMin !== null && input.level1AfterMin === null)
    throw invalid("Set level 1 before level 2.");
  if (input.source.trim().length < 3) throw invalid("Say where these times come from.");
  const values = {
    ackWithinMin: input.ackWithinMin,
    level1AfterMin: input.level1AfterMin,
    level2AfterMin: input.level2AfterMin,
    source: input.source.trim(),
    authoredBy: actor.userId,
  };
  const [open] = await tx
    .select({ id: criticalResponseVersions.id })
    .from(criticalResponseVersions)
    .where(
      and(
        eq(criticalResponseVersions.hospitalId, actor.hospitalId),
        eq(criticalResponseVersions.status, "draft"),
        isNull(criticalResponseVersions.leadSignedBy),
      ),
    )
    .limit(1);
  if (open) {
    await tx
      .update(criticalResponseVersions)
      .set(values)
      .where(eq(criticalResponseVersions.id, open.id));
    return open.id;
  }
  const [{ v }] = (await tx
    .select({ v: max(criticalResponseVersions.version) })
    .from(criticalResponseVersions)
    .where(eq(criticalResponseVersions.hospitalId, actor.hospitalId))) as [{ v: number | null }];
  const [row] = await tx
    .insert(criticalResponseVersions)
    .values({ hospitalId: actor.hospitalId, version: (v ?? 0) + 1, ...values })
    .returning({ id: criticalResponseVersions.id });
  return row!.id;
}

/**
 * The laboratory lead signs first, the CSO second (D-LAB1-11). D-LAB1-12: the lead may not sign their
 * own draft, nor the CSO countersign their own lead signature, unless no second person exists and the
 * exception is recorded. The CSO's signature puts the set in force and supersedes the one before.
 */
export async function signResponseVersion(
  tx: EmrTx,
  signer: { userId: string; hospitalId: string; as: "lead" | "cso" },
  input: { versionId: string; exceptionNote: string | null },
  now: Date,
) {
  const [v] = await tx
    .select()
    .from(criticalResponseVersions)
    .where(
      and(
        eq(criticalResponseVersions.id, input.versionId),
        eq(criticalResponseVersions.hospitalId, signer.hospitalId),
      ),
    )
    .for("update");
  if (!v) throw new EmrWriteError("not_found", "That set of response times was not found.");
  if (v.status !== "draft") throw new EmrWriteError("conflict", "This set is already signed.");
  const note = input.exceptionNote?.trim() || null;
  if (note && note.length < 10) throw invalid("Say in a sentence why no second person can sign.");
  if (signer.as === "lead") {
    if (v.leadSignedBy)
      throw new EmrWriteError("conflict", "The laboratory lead has already signed.");
    if (v.authoredBy === signer.userId && !note)
      throw new EmrWriteError(
        "forbidden",
        "You wrote this draft: another lead signs it, or record why no one else can.",
      );
    await tx
      .update(criticalResponseVersions)
      .set({
        leadSignedBy: signer.userId,
        leadSignedAt: now,
        ...(note ? { exceptionNote: note } : {}),
      })
      .where(eq(criticalResponseVersions.id, v.id));
    return;
  }
  if (!v.leadSignedBy) throw new EmrWriteError("conflict", "The laboratory lead signs first.");
  if (v.leadSignedBy === signer.userId && !note && !v.exceptionNote)
    throw new EmrWriteError(
      "forbidden",
      "You signed as the lead: a different person signs as CSO, or record why no one else can.",
    );
  await tx
    .update(criticalResponseVersions)
    .set({ status: "superseded", supersededAt: now })
    .where(
      and(
        eq(criticalResponseVersions.hospitalId, signer.hospitalId),
        eq(criticalResponseVersions.status, "signed"),
        ne(criticalResponseVersions.id, v.id),
      ),
    );
  await tx
    .update(criticalResponseVersions)
    .set({
      status: "signed",
      csoSignedBy: signer.userId,
      csoSignedAt: now,
      ...(note ? { exceptionNote: note } : {}),
    })
    .where(eq(criticalResponseVersions.id, v.id));
}

export async function responseVersions(tx: EmrTx, hospitalId: string) {
  return tx
    .select()
    .from(criticalResponseVersions)
    .where(eq(criticalResponseVersions.hospitalId, hospitalId))
    .orderBy(desc(criticalResponseVersions.version));
}

/* ─── SMS templates: two approvers (MS-3, D-LAB1-17) ─────────────────── */

const FIXTURE_FIELDS = { place: "Ward 4A", labNumber: "0414 000 000" };

async function scanTerms(tx: EmrTx) {
  const [tests, units] = await Promise.all([
    tx.select({ display: testCatalogue.display }).from(testCatalogue),
    tx.select({ code: ucumUnits.code, display: ucumUnits.display }).from(ucumUnits),
  ]);
  return {
    names: [],
    testNames: tests.map((t) => t.display),
    units: units.flatMap((u) => [u.code, u.display]),
  };
}

/** Seeds the two drafts from Appendix A, once per hospital. */
export async function ensureSmsTemplates(tx: EmrTx, actor: Actor, now: Date) {
  const existing = await tx
    .select({ kind: labSmsTemplates.kind })
    .from(labSmsTemplates)
    .where(eq(labSmsTemplates.hospitalId, actor.hospitalId));
  const have = new Set(existing.map((e) => e.kind));
  const missing = (["level0", "escalation"] as const).filter((k) => !have.has(k));
  if (missing.length)
    await tx.insert(labSmsTemplates).values(
      missing.map((kind) => ({
        hospitalId: actor.hospitalId,
        kind,
        version: 1,
        body: CRITICALS_COPY.smsDraft[kind],
        authoredBy: actor.userId,
        createdAt: now,
      })),
    );
}

/** A new wording is a new draft version, refused if it could carry a patient detail (MS-2). */
export async function editSmsTemplate(
  tx: EmrTx,
  actor: Actor,
  input: { kind: "level0" | "escalation"; body: string },
  now: Date,
) {
  const body = input.body.trim();
  const r = renderSms({ body, status: "approved" }, FIXTURE_FIELDS, await scanTerms(tx));
  if (!r.ok)
    throw invalid(
      r.reason === "banned_term"
        ? "The message may not name a patient, a test, a value or a restricted service."
        : r.reason === "too_long"
          ? "Keep the message to one SMS (160 plain characters, with the ward and the number)."
          : "Use only {place} and {lab number} in the message.",
    );
  const [{ v }] = (await tx
    .select({ v: max(labSmsTemplates.version) })
    .from(labSmsTemplates)
    .where(
      and(eq(labSmsTemplates.hospitalId, actor.hospitalId), eq(labSmsTemplates.kind, input.kind)),
    )) as [{ v: number | null }];
  await tx.insert(labSmsTemplates).values({
    hospitalId: actor.hospitalId,
    kind: input.kind,
    version: (v ?? 0) + 1,
    body,
    authoredBy: actor.userId,
    createdAt: now,
  });
}

/** Draft → awaiting a second approver → approved (the earlier approved one retires). */
export async function approveSmsTemplate(tx: EmrTx, actor: Actor, templateId: string, now: Date) {
  const [t] = await tx
    .select()
    .from(labSmsTemplates)
    .where(
      and(eq(labSmsTemplates.id, templateId), eq(labSmsTemplates.hospitalId, actor.hospitalId)),
    )
    .for("update");
  if (!t) throw new EmrWriteError("not_found", "That template was not found.");
  if (t.status === "draft") {
    await tx
      .update(labSmsTemplates)
      .set({ status: "pending_review", firstApprover: actor.userId })
      .where(eq(labSmsTemplates.id, t.id));
    return "pending_review" as const;
  }
  if (t.status !== "pending_review")
    throw new EmrWriteError("conflict", "This template is not awaiting approval.");
  if (t.firstApprover === actor.userId)
    throw new EmrWriteError("forbidden", "A second, different person approves it.");
  await tx
    .update(labSmsTemplates)
    .set({ status: "retired" })
    .where(
      and(
        eq(labSmsTemplates.hospitalId, actor.hospitalId),
        eq(labSmsTemplates.kind, t.kind),
        eq(labSmsTemplates.status, "approved"),
      ),
    );
  await tx
    .update(labSmsTemplates)
    .set({ status: "approved", approvedBy: actor.userId, approvedAt: now })
    .where(eq(labSmsTemplates.id, t.id));
  return "approved" as const;
}

/* ─── What set-up shows ───────────────────────────────────────────────── */

export async function loadCriticalsSetup(tx: EmrTx, hospitalId: string) {
  const [settings, versions, contacts, departments, templates, clinicians] = await Promise.all([
    tx.select().from(labSettings).where(eq(labSettings.hospitalId, hospitalId)),
    responseVersions(tx, hospitalId),
    tx
      .select()
      .from(criticalContacts)
      .where(eq(criticalContacts.hospitalId, hospitalId))
      .orderBy(asc(criticalContacts.position)),
    tx
      .select({
        id: hospitalDepartments.id,
        name: hospitalDepartments.name,
        parentId: hospitalDepartments.parentId,
      })
      .from(hospitalDepartments)
      .where(eq(hospitalDepartments.hospitalId, hospitalId))
      .orderBy(asc(hospitalDepartments.name)),
    tx
      .select()
      .from(labSmsTemplates)
      .where(eq(labSmsTemplates.hospitalId, hospitalId))
      .orderBy(asc(labSmsTemplates.kind), desc(labSmsTemplates.version)),
    tx
      .selectDistinct({
        userId: staffAffiliations.userId,
        departmentId: staffAffiliations.departmentId,
        cadre: cadres.name,
        name: users.fullName,
      })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .innerJoin(users, eq(users.id, staffAffiliations.userId))
      .where(
        and(
          eq(staffAffiliations.hospitalId, hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
          inArray(cadres.code, [...CLERKING_CADRE_CODES]),
        ),
      ),
  ]);
  return { settings: settings[0] ?? null, versions, contacts, departments, templates, clinicians };
}
