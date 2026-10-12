import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, isNull, or } from "drizzle-orm";

import V16 from "@/data/emr/clinical-fact-concepts.v1.6.json";
import {
  referenceRangeBands,
  referenceRangeVersions,
  researchImports,
  testCatalogue,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { CONCEPTS } from "@/lib/facts/catalogue.generated";
import { saveConfigDraft } from "./catalogue-v2";
import { planImport, RESEARCH_FILE, sha256 } from "./research-import";

/**
 * The research import on the database (Lab Phase 2 §6.5; RI-1..RI-8; ADR 0253). Everything lands as a
 * draft: reference-interval versions with their sources (Phase 1's store) and decision-scheme drafts (the
 * signed configuration). A re-import of the same file is a no-op (RI-1). A test that already has an open
 * draft keeps it, and the report says so: nothing a person typed is overwritten.
 */

type Actor = { userId: string; hospitalId: string };
const TESTS_V2 = V16.testsV2 as Record<string, string[]>;
const NEW_UNITS = new Map(V16.concepts.map((c) => [c.id, c.canonicalUnit]));
const canonicalUnit = (id: string) =>
  (CONCEPTS as Record<string, { canonicalUnit: string | null }>)[id]?.canonicalUnit ??
  NEW_UNITS.get(id) ??
  null;

export function researchText(root = process.cwd()) {
  return readFileSync(join(root, RESEARCH_FILE), "utf8");
}

export async function importResearch(tx: EmrTx, actor: Actor, now: Date, text = researchText()) {
  const hash = sha256(text);
  const [done] = await tx
    .select({ report: researchImports.report })
    .from(researchImports)
    .where(and(eq(researchImports.hospitalId, actor.hospitalId), eq(researchImports.hash, hash)));
  if (done) return { hash, alreadyImported: true, report: done.report };

  const tests = await tx
    .select({
      id: testCatalogue.id,
      code: testCatalogue.code,
      hospitalId: testCatalogue.hospitalId,
    })
    .from(testCatalogue)
    .where(or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, actor.hospitalId)));
  // A hospital's own row wins over the default menu's for the same code (buildTestMenu's rule).
  const byCode = new Map<string, string>();
  for (const t of tests.sort((a, b) => (a.hospitalId ? 1 : 0) - (b.hospitalId ? 1 : 0)))
    byCode.set(t.code, t.id);
  const { plan, report } = planImport(
    text,
    [...byCode.keys()].map((code) => ({ code, components: TESTS_V2[code] ?? [] })),
    canonicalUnit,
  );
  const skipped: string[] = [];
  for (const d of plan.references) {
    const testId = byCode.get(d.testCode)!;
    const open = await tx
      .select({
        id: referenceRangeVersions.id,
        version: referenceRangeVersions.version,
        status: referenceRangeVersions.status,
      })
      .from(referenceRangeVersions)
      .where(
        and(
          eq(referenceRangeVersions.hospitalId, actor.hospitalId),
          eq(referenceRangeVersions.testId, testId),
          eq(referenceRangeVersions.conceptId, d.concept),
        ),
      );
    if (open.some((o) => o.status === "draft")) {
      skipped.push(`${d.testCode} ${d.concept}`);
      continue;
    }
    const [v] = await tx
      .insert(referenceRangeVersions)
      .values({
        hospitalId: actor.hospitalId,
        testId,
        conceptId: d.concept,
        unitUcum: d.unit,
        version: Math.max(0, ...open.map((o) => o.version)) + 1,
        authoredBy: actor.userId,
        importHash: hash,
        createdAt: now,
      })
      .returning({ id: referenceRangeVersions.id });
    await tx.insert(referenceRangeBands).values(
      d.bands.map((b) => ({
        versionId: v!.id,
        sex: b.sex,
        ageFromDays: b.ageFromDays,
        ageToDays: b.ageToDays,
        low: b.low,
        high: b.high,
        source: b.source,
        provenance: b.provenance,
        verification: b.verification,
      })),
    );
  }
  for (const s of plan.schemes)
    await saveConfigDraft(
      tx,
      actor,
      { kind: "scheme", key: s.concept, payload: s.payload, newVersion: true },
      now,
    );
  const full = { ...report, skippedOpenDrafts: skipped };
  await tx.insert(researchImports).values({
    hospitalId: actor.hospitalId,
    hash,
    importedBy: actor.userId,
    importedAt: now,
    report: full,
  });
  return { hash, alreadyImported: false, report: full };
}

/** The draft band, only while its version is a draft at this hospital. */
async function draftBand(tx: EmrTx, hospitalId: string, bandId: string) {
  const [b] = await tx
    .select({ id: referenceRangeBands.id, status: referenceRangeVersions.status })
    .from(referenceRangeBands)
    .innerJoin(referenceRangeVersions, eq(referenceRangeVersions.id, referenceRangeBands.versionId))
    .where(
      and(eq(referenceRangeBands.id, bandId), eq(referenceRangeVersions.hospitalId, hospitalId)),
    );
  if (!b) throw new EmrWriteError("not_found", "That band was not found.");
  if (b.status !== "draft")
    throw new EmrWriteError("conflict", "This range is signed; start a new draft.");
}

/** RI-5: what the person found, and where they read it. Audited (0104's trigger on the band). */
export async function recordDraftCheck(
  tx: EmrTx,
  actor: Actor,
  input: {
    bandId: string;
    finding: "matches" | "corrected";
    where: string;
    low?: string | null;
    high?: string | null;
  },
  now: Date,
) {
  await draftBand(tx, actor.hospitalId, input.bandId);
  await tx
    .update(referenceRangeBands)
    .set({
      checkNote: `${input.finding === "matches" ? "Matches" : "Corrected"}: ${input.where}`.slice(
        0,
        500,
      ),
      checkedBy: actor.userId,
      checkedAt: now,
      ...(input.finding === "corrected"
        ? { low: input.low ?? null, high: input.high ?? null }
        : {}),
    })
    .where(eq(referenceRangeBands.id, input.bandId));
}

/** RI-6: the lead keeps one source; the other stays visible as a rejected alternative with the reason. */
export async function rejectBand(
  tx: EmrTx,
  actor: Actor,
  input: { bandId: string; reason: string | null },
) {
  await draftBand(tx, actor.hospitalId, input.bandId);
  await tx
    .update(referenceRangeBands)
    .set({ rejectedReason: input.reason?.trim() || null })
    .where(eq(referenceRangeBands.id, input.bandId));
}
