import "server-only";

import type { Mapping, OpenCheck, Profile } from "./profiles";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, isNull, or } from "drizzle-orm";

import V16 from "@/data/emr/clinical-fact-concepts.v1.6.json";
import { analyserProfiles, testCatalogue } from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { activationBlockers, ANALYSER_MODELS, mappingErrors, profileFromModel } from "./profiles";

/**
 * Analyser profiles on the database (Lab Phase 2 §6.2, §5.11; AP-1..AP-5; D-LAB2-26). A profile is drafted
 * from its model, its open questions answered, each mapped result marked verified on this analyser (CLSI
 * EP28, recorded by the laboratory lead), and only then put in use. A profile in use is frozen (0107's
 * trigger); a change is a new profile, and specimens already received keep the one they were pinned to.
 */

type Actor = { userId: string; hospitalId: string };
const TESTS_V2 = V16.testsV2 as Record<string, string[]>;
const invalid = (m: string) => new EmrWriteError("invalid", m);

const toProfile = (r: typeof analyserProfiles.$inferSelect): Profile => ({
  id: r.id,
  model: r.model,
  kind: r.kind as Profile["kind"],
  state: r.state as Profile["state"],
  mappings: r.mappings as Mapping[],
  openChecks: r.openChecks as OpenCheck[],
  verifiedConcepts: r.verifiedConcepts,
  deviceId: r.deviceId,
});

async function draft(tx: EmrTx, actor: Actor, id: string) {
  const [r] = await tx
    .select()
    .from(analyserProfiles)
    .where(and(eq(analyserProfiles.id, id), eq(analyserProfiles.hospitalId, actor.hospitalId)))
    .for("update");
  if (!r) throw new EmrWriteError("not_found", "That profile was not found.");
  if (r.state !== "draft")
    throw new EmrWriteError("conflict", "A profile in use is not changed: make a new one.");
  return r;
}

async function testFor(tx: EmrTx, hospitalId: string, code: string) {
  const rows = await tx
    .select({ id: testCatalogue.id, hospitalId: testCatalogue.hospitalId })
    .from(testCatalogue)
    .where(
      and(
        eq(testCatalogue.code, code),
        or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, hospitalId)),
      ),
    );
  return (rows.find((r) => r.hospitalId) ?? rows[0])?.id ?? null;
}

export async function createProfile(
  tx: EmrTx,
  actor: Actor,
  input: { modelId: string; bench: string | null },
  now: Date,
): Promise<string> {
  const model = ANALYSER_MODELS[input.modelId];
  if (!model) throw invalid("Choose an analyser model.");
  const testId = await testFor(tx, actor.hospitalId, model.test);
  if (!testId) throw invalid("This hospital has no test for that analyser.");
  const p = profileFromModel(input.modelId);
  const [row] = await tx
    .insert(analyserProfiles)
    .values({
      hospitalId: actor.hospitalId,
      testId,
      model: input.modelId,
      bench: input.bench?.trim() || null,
      kind: p.kind,
      mappings: p.mappings,
      openChecks: p.openChecks,
      createdBy: actor.userId,
      createdAt: now,
    })
    .returning({ id: analyserProfiles.id });
  return row!.id;
}

/** AP-1..AP-3: who sees each code. A refused mapping is never saved. */
export async function setVisibility(
  tx: EmrTx,
  actor: Actor,
  input: { profileId: string; code: string; visibility: Mapping["visibility"] },
) {
  const r = await draft(tx, actor, input.profileId);
  const p = toProfile(r);
  const model = ANALYSER_MODELS[p.model];
  if (model?.researchUse.includes(input.code) && input.visibility !== "never")
    throw invalid("Research-use parameters are never released (CD-05).");
  const mappings = p.mappings.map((m) =>
    m.code === input.code ? { ...m, visibility: input.visibility } : m,
  );
  const errors = mappingErrors({ ...p, mappings }, model, TESTS_V2[model?.test ?? ""] ?? []);
  if (errors.length)
    throw invalid(`That mapping is refused (${errors[0]!.error.replaceAll("_", " ")}).`);
  await tx.update(analyserProfiles).set({ mappings }).where(eq(analyserProfiles.id, r.id));
}

/** AP-4: an open question answered from the manual or the printed report. */
export async function resolveCheck(
  tx: EmrTx,
  actor: Actor,
  input: { profileId: string; code: string; resolution: string },
) {
  const r = await draft(tx, actor, input.profileId);
  const text = input.resolution.trim();
  if (text.length < 3) throw invalid("Say what you found.");
  const openChecks = (r.openChecks as OpenCheck[]).map((c) =>
    c.code === input.code ? { ...c, resolution: text.slice(0, 300), resolvedBy: actor.userId } : c,
  );
  await tx.update(analyserProfiles).set({ openChecks }).where(eq(analyserProfiles.id, r.id));
}

/** AP-4, D-LAB2-26: the lead records the result verified on this analyser (CLSI EP28). */
export async function setVerified(
  tx: EmrTx,
  actor: Actor,
  input: { profileId: string; concept: string; verified: boolean },
) {
  const r = await draft(tx, actor, input.profileId);
  const set = new Set(r.verifiedConcepts);
  if (input.verified) set.add(input.concept);
  else set.delete(input.concept);
  await tx
    .update(analyserProfiles)
    .set({ verifiedConcepts: [...set].sort() })
    .where(eq(analyserProfiles.id, r.id));
}

/** AP-4: "Use this profile" opens only with no blocker; the one in use before it is retired. */
export async function activateProfile(
  tx: EmrTx,
  actor: Actor,
  input: { profileId: string },
  now: Date,
) {
  const r = await draft(tx, actor, input.profileId);
  const p = toProfile(r);
  const model = ANALYSER_MODELS[p.model];
  const blockers = activationBlockers(p, model, TESTS_V2[model?.test ?? ""] ?? []);
  if (blockers.length)
    throw invalid(
      `Not yet: ${blockers.length} item${blockers.length === 1 ? "" : "s"} still to do.`,
    );
  await tx
    .update(analyserProfiles)
    .set({ state: "retired" })
    .where(
      and(
        eq(analyserProfiles.hospitalId, actor.hospitalId),
        eq(analyserProfiles.testId, r.testId),
        eq(analyserProfiles.state, "in_use"),
        r.bench ? eq(analyserProfiles.bench, r.bench) : isNull(analyserProfiles.bench),
      ),
    );
  await tx
    .update(analyserProfiles)
    .set({ state: "in_use", activatedBy: actor.userId, activatedAt: now })
    .where(eq(analyserProfiles.id, r.id));
}

export async function loadProfiles(tx: EmrTx, hospitalId: string) {
  const rows = await tx
    .select()
    .from(analyserProfiles)
    .where(eq(analyserProfiles.hospitalId, hospitalId));
  return rows.map((r) => {
    const p = toProfile(r);
    const model = ANALYSER_MODELS[p.model];
    return {
      ...p,
      bench: r.bench,
      modelDisplay: model?.display ?? p.model,
      blockers:
        p.state === "draft" ? activationBlockers(p, model, TESTS_V2[model?.test ?? ""] ?? []) : [],
      activatedAt: r.activatedAt,
    };
  });
}
