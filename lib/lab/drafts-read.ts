import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RangeBand } from "./ranges";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import V16 from "@/data/emr/clinical-fact-concepts.v1.6.json";
import {
  labSignedConfigs,
  referenceRangeBands,
  referenceRangeVersions,
  researchImports,
  testCatalogue,
} from "@/db/schema";
import { CONCEPTS } from "@/lib/facts/catalogue.generated";
import { conceptDef } from "@/lib/facts/project/shared";
import { ABNORMAL_ANSWERS, ADDENDUM_KEY } from "./catalogue-v2";
import { V17_ADDENDUM_KEY, V17_NEW_TESTS, V17_SOURCE_SHA256 } from "./catalogue-v17.generated";
import { rangeSignErrors } from "./ranges";
import { NOT_IMPORTED, sha256 } from "./research-import";
import { researchText } from "./research-store";
import { configSignErrors } from "./signed-config";

/**
 * Research drafts (Lab Phase 2 §5.13, artboard 13): the concept addendum, the imported reference and
 * cut-off drafts with what still blocks each, and what was deliberately not imported (RI-7). Read only.
 */

const ADDENDUM_FILE = "data/emr/clinical-fact-concepts.v1.6.json";

export type DraftState = "check" | "disagree" | "ready" | "boundaries" | "cso";

export interface DraftBand {
  id: string;
  sex: string;
  ageFromDays: number | null;
  ageToDays: number | null;
  low: string | null;
  high: string | null;
  source: string;
  provenance: {
    citation?: string | null;
    where?: string | null;
    population?: string | null;
    method?: string | null;
    confidence?: string | null;
    reason?: string | null;
  };
  verification: string | null;
  checkNote: string | null;
  checked: boolean;
  rejectedReason: string | null;
  overlaps: boolean;
}

export interface ReferenceDraftRow {
  versionId: string;
  result: string;
  test: string;
  unit: string;
  sources: { short: string; full: string }[];
  confidence: string[];
  state: DraftState;
  authoredByMe: boolean;
  bands: DraftBand[];
}

export interface SchemeDraftRow {
  id: string;
  result: string;
  label: string;
  state: DraftState;
}

const display = (id: string) =>
  conceptDef(id)?.display ?? V16.concepts.find((c) => c.id === id)?.display ?? id;
/** "Eller LA, Eller MA, …" → "Eller LA"; a long body name is cut. */
const firstAuthor = (c: string) => {
  const s = c.split(/,| et al|\.\s/)[0]!.trim();
  return s.length > 28 ? `${s.slice(0, 27)}…` : s;
};

/** CC-1: an addendum's newest row in words for the card, or null when nobody has drafted it. */
async function addendumConfig(tx: EmrTx, key: string, userId: string) {
  const [a] = await tx
    .select({
      id: labSignedConfigs.id,
      status: labSignedConfigs.status,
      leadSignedBy: labSignedConfigs.leadSignedBy,
      authoredBy: labSignedConfigs.authoredBy,
    })
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.kind, "addendum"),
        eq(labSignedConfigs.key, key),
        isNull(labSignedConfigs.hospitalId),
      ),
    )
    .orderBy(desc(labSignedConfigs.version))
    .limit(1);
  return a
    ? {
        id: a.id,
        state: (a.status !== "draft" ? "signed" : a.leadSignedBy ? "cso" : "draft") as
          | "signed"
          | "cso"
          | "draft",
        authoredByMe: a.authoredBy === userId,
      }
    : null;
}

export async function loadResearchDrafts(tx: EmrTx, hospitalId: string, userId: string) {
  const addendumHash = sha256(readFileSync(join(process.cwd(), ADDENDUM_FILE), "utf8"));
  const researchHash = sha256(researchText());
  const config = await addendumConfig(tx, ADDENDUM_KEY, userId);
  // Lab test menu v2 (TM-1): catalogue v2 is addendum v1.7, signed the same way.
  const v17Tests = await tx
    .select({
      id: testCatalogue.code,
      display: testCatalogue.display,
      components: testCatalogue.components,
    })
    .from(testCatalogue)
    .where(and(isNull(testCatalogue.hospitalId), inArray(testCatalogue.code, [...V17_NEW_TESTS])))
    .orderBy(testCatalogue.code);
  const v17Concepts = Object.entries(CONCEPTS).filter(([, c]) => c.phase === "v1.7");

  const [imported] = await tx
    .select({ importedAt: researchImports.importedAt, report: researchImports.report })
    .from(researchImports)
    .where(and(eq(researchImports.hospitalId, hospitalId), eq(researchImports.hash, researchHash)));

  const versions = await tx
    .select({
      id: referenceRangeVersions.id,
      conceptId: referenceRangeVersions.conceptId,
      unitUcum: referenceRangeVersions.unitUcum,
      authoredBy: referenceRangeVersions.authoredBy,
      leadSignedBy: referenceRangeVersions.leadSignedBy,
      test: testCatalogue.display,
    })
    .from(referenceRangeVersions)
    .innerJoin(testCatalogue, eq(testCatalogue.id, referenceRangeVersions.testId))
    .where(
      and(
        eq(referenceRangeVersions.hospitalId, hospitalId),
        eq(referenceRangeVersions.status, "draft"),
        isNotNull(referenceRangeVersions.importHash),
      ),
    );
  const bands = versions.length
    ? await tx
        .select()
        .from(referenceRangeBands)
        .where(
          inArray(
            referenceRangeBands.versionId,
            versions.map((v) => v.id),
          ),
        )
        .orderBy(referenceRangeBands.sex, referenceRangeBands.ageFromDays)
    : [];

  const references: ReferenceDraftRow[] = versions.map((v) => {
    const own = bands.filter((b) => b.versionId === v.id);
    const asRange: RangeBand[] = own.map((b) => ({
      id: b.id,
      sex: b.sex as RangeBand["sex"],
      ageFromDays: b.ageFromDays,
      ageToDays: b.ageToDays,
      low: b.low,
      high: b.high,
      methodCode: b.methodCode,
      rejected: b.rejectedReason !== null,
    }));
    const overlapping = new Set(
      rangeSignErrors(
        { unitUcum: v.unitUcum, bands: asRange },
        { resultType: "number", unitUcum: v.unitUcum },
      )
        .filter((e) => e.startsWith("band_overlap:"))
        .flatMap((e) => e.split(":").slice(1)),
    );
    const live = own.filter((b) => b.rejectedReason === null);
    const prov = (b: (typeof own)[number]) => (b.provenance ?? {}) as DraftBand["provenance"];
    const citations = [
      ...new Set(live.map((b) => prov(b).citation).filter((c): c is string => !!c)),
    ];
    return {
      versionId: v.id,
      result: display(v.conceptId),
      test: v.test,
      unit: v.unitUcum,
      sources: citations.map((full) => ({ short: firstAuthor(full), full })),
      confidence: [...new Set(live.map((b) => prov(b).confidence).filter((c): c is string => !!c))],
      state: v.leadSignedBy
        ? "cso"
        : live.some((b) => b.verification && !b.checkedBy)
          ? "check"
          : overlapping.size
            ? "disagree"
            : "ready",
      authoredByMe: v.authoredBy === userId,
      bands: own.map((b) => ({
        id: b.id,
        sex: b.sex,
        ageFromDays: b.ageFromDays,
        ageToDays: b.ageToDays,
        low: b.low,
        high: b.high,
        source: b.source,
        provenance: prov(b),
        verification: b.verification,
        checkNote: b.checkNote,
        checked: b.checkedBy !== null,
        rejectedReason: b.rejectedReason,
        overlaps: overlapping.has(b.id),
      })),
    };
  });

  const schemeRows = await tx
    .select({
      id: labSignedConfigs.id,
      key: labSignedConfigs.key,
      payload: labSignedConfigs.payload,
      leadSignedBy: labSignedConfigs.leadSignedBy,
    })
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.hospitalId, hospitalId),
        eq(labSignedConfigs.kind, "scheme"),
        eq(labSignedConfigs.status, "draft"),
      ),
    );
  const schemes: SchemeDraftRow[] = schemeRows.map((s) => ({
    id: s.id,
    result: display(s.key),
    label: String((s.payload as { label?: unknown }).label ?? s.key),
    state: s.leadSignedBy
      ? "cso"
      : configSignErrors("scheme", s.payload).length
        ? "boundaries"
        : "ready",
  }));

  return {
    addendum: {
      key: ADDENDUM_KEY,
      hash: addendumHash,
      count: V16.counts.concepts,
      config,
      concepts: V16.concepts.map((c) => ({
        id: c.id,
        display: c.display,
        valueType: c.valueType,
        unit: c.canonicalUnit,
        answers: ("answers" in c ? (c.answers as string[]) : []).map((a) => ({
          code: a,
          abnormal: ABNORMAL_ANSWERS[c.id]?.includes(a) ?? false,
        })),
      })),
      tests: V16.testsAdd.map((t) => ({
        id: t.id,
        display: t.display,
        components: t.panelComponents,
      })),
    },
    menuAddendum: {
      key: V17_ADDENDUM_KEY,
      hash: V17_SOURCE_SHA256,
      count: v17Concepts.length,
      config: await addendumConfig(tx, V17_ADDENDUM_KEY, userId),
      concepts: v17Concepts.map(([id, c]) => ({
        id,
        display: c.display,
        valueType: c.valueType as string,
        unit: c.canonicalUnit as string | null,
        answers: ((c.answers ?? []) as readonly string[]).map((a) => ({
          code: a,
          abnormal: ABNORMAL_ANSWERS[id]?.includes(a) ?? false,
        })),
      })),
      tests: v17Tests,
    },
    imported: imported
      ? {
          at: imported.importedAt,
          counts: (imported.report as { counts?: Record<string, number> }).counts ?? {},
        }
      : null,
    references,
    schemes,
    notImported: NOT_IMPORTED.map((id) => ({ id, display: display(id) })),
  };
}

export type ResearchDrafts = Awaited<ReturnType<typeof loadResearchDrafts>>;
