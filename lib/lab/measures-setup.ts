import "server-only";

import type { MeasureDraft } from "./catalogue";
import type { RangeBand, Sex } from "./ranges";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNull, max, ne, or } from "drizzle-orm";

import { loincCodes } from "@/db/schema/clinical-codes";
import { testCatalogue } from "@/db/schema/emr";
import {
  labComponentMeasures,
  referenceRangeBands,
  referenceRangeVersions,
  ucumUnits,
} from "@/db/schema/lab-safety";
import { EmrWriteError } from "@/lib/emr/write/context";
import { conceptDef } from "@/lib/facts/project/shared";
import { toCanonical } from "@/lib/units";
import { measureChange, measureDraftErrors } from "./catalogue";
import { rangeSignErrors } from "./ranges";
import { toMeasure } from "./units";

/**
 * The test catalogue's measurement facts and the reference ranges (Lab Phase 1 §5.6, §5.7; UN-1,
 * UN-4, UN-7, RR-6; D-LAB1-11, -12). Only measurement facts live here: a test's name, section and
 * where it is offered stay with the Departments and services hub (one store per fact).
 */

type Actor = { userId: string; hospitalId: string };
const invalid = (m: string) => new EmrWriteError("invalid", m);

const MEASURE_ERRORS: Record<string, string> = {
  unit_required: "A number needs its unit.",
  unit_unknown: "Choose the unit from the list.",
  decimal_places: "Decimal places: 0 to 6.",
  unit_on_non_numeric: "Only a number has a unit or an entry check.",
  loinc_unknown: "That LOINC code is not in the imported table.",
  entry_check_not_decimal: "Entry check: type numbers.",
  entry_check_order: "Entry check: the low must be below the high.",
  unit_not_derivable:
    "MedSync cannot read this unit for decision support. Choose the unit the test reports in from the list, or ask for it to be added.",
};

/** The lab tests this hospital may result (global catalogue plus its own), active and in-house. */
export async function labTests(tx: EmrTx, hospitalId: string) {
  return tx
    .select({
      id: testCatalogue.id,
      display: testCatalogue.display,
      components: testCatalogue.components,
      code: testCatalogue.code,
    })
    .from(testCatalogue)
    .where(
      and(
        eq(testCatalogue.kind, "lab"),
        eq(testCatalogue.active, true),
        eq(testCatalogue.inHouse, true),
        or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, hospitalId)),
      ),
    )
    .orderBy(testCatalogue.display);
}

/** UN-4: any change to a measure is its next version; the current one is superseded, never edited. */
export async function saveMeasure(
  tx: EmrTx,
  actor: Actor,
  input: { testId: string; conceptId: string; draft: MeasureDraft },
  now: Date,
): Promise<{ kind: "same" } | { kind: "new_version"; version: number; id: string }> {
  const [test] = (await labTests(tx, actor.hospitalId)).filter((t) => t.id === input.testId);
  if (!test || !(test.components ?? []).includes(input.conceptId))
    throw invalid("That component is not part of a lab test here.");
  const d = input.draft;
  const [units, loinc] = await Promise.all([
    d.unitUcum
      ? tx.select({ code: ucumUnits.code }).from(ucumUnits).where(eq(ucumUnits.code, d.unitUcum))
      : Promise.resolve([]),
    d.loincCode
      ? tx
          .select({ code: loincCodes.code })
          .from(loincCodes)
          .where(eq(loincCodes.code, d.loincCode))
      : Promise.resolve([]),
  ]);
  const errors = measureDraftErrors(
    d,
    new Set(units.map((u) => u.code)),
    new Set(loinc.map((l) => l.code)),
  );
  // Decision support reads each value in the concept's canonical unit (D-CFC-14): a unit it cannot
  // derive from would leave a result unreadable, so it is refused here, not at result entry.
  const canonical = conceptDef(input.conceptId)?.canonicalUnit;
  if (
    d.resultType === "number" &&
    d.unitUcum &&
    canonical &&
    d.unitUcum !== canonical &&
    "error" in toCanonical(input.conceptId, 1, d.unitUcum)
  )
    errors.push("unit_not_derivable");
  if (errors.length) throw invalid(errors.map((e) => MEASURE_ERRORS[e] ?? e).join(" "));
  const [current] = await tx
    .select()
    .from(labComponentMeasures)
    .where(
      and(
        eq(labComponentMeasures.hospitalId, actor.hospitalId),
        eq(labComponentMeasures.testId, input.testId),
        eq(labComponentMeasures.conceptId, input.conceptId),
        isNull(labComponentMeasures.supersededBy),
      ),
    )
    .for("update");
  const change = measureChange(current ? toMeasure(current) : null, d);
  if (change.kind === "same") return change;
  const [row] = await tx
    .insert(labComponentMeasures)
    .values({
      hospitalId: actor.hospitalId,
      testId: input.testId,
      conceptId: input.conceptId,
      version: change.version,
      resultType: d.resultType,
      unitUcum: d.unitUcum,
      unitDisplay: d.unitDisplay,
      decimalPlaces: d.decimalPlaces,
      loincCode: d.loincCode,
      entryCheckLow: d.entryCheckLow,
      entryCheckHigh: d.entryCheckHigh,
      authoredBy: actor.userId,
      createdAt: now,
    })
    .returning({ id: labComponentMeasures.id });
  if (current)
    await tx
      .update(labComponentMeasures)
      .set({ supersededBy: row!.id })
      .where(eq(labComponentMeasures.id, current.id));
  return { kind: "new_version", version: change.version, id: row!.id };
}

/* ─── Reference ranges (§5.7) ─────────────────────────────────────────── */

export interface BandDraft {
  sex: Sex | "any";
  ageFromDays: number | null;
  ageToDays: number | null;
  low: string | null;
  high: string | null;
  source: string;
}

const BAND_ERRORS: Record<string, string> = {
  not_numeric: "Only a number has a range.",
  unit_mismatch: "The range's unit must be the test's unit.",
  no_bands: "Add at least one band.",
  band_empty: "Each band needs a low or a high.",
  band_not_decimal: "Type the limits as numbers.",
  band_order: "In each band the low must be below the high.",
  band_ages: "In each band the first age must be below the second.",
  band_overlap: "Bands for the same sex must not overlap.",
};
const bandWords = (errors: string[]) =>
  [...new Set(errors.map((e) => BAND_ERRORS[e.split(":")[0]!] ?? e))].join(" ");

async function measureFor(tx: EmrTx, hospitalId: string, testId: string, conceptId: string) {
  const [m] = await tx
    .select()
    .from(labComponentMeasures)
    .where(
      and(
        eq(labComponentMeasures.hospitalId, hospitalId),
        eq(labComponentMeasures.testId, testId),
        eq(labComponentMeasures.conceptId, conceptId),
        isNull(labComponentMeasures.supersededBy),
      ),
    );
  return m ?? null;
}

/** A draft replaces its own bands; once the lead has signed, an edit opens the next draft. */
export async function saveRangeDraft(
  tx: EmrTx,
  actor: Actor,
  input: { testId: string; conceptId: string; bands: BandDraft[] },
  now: Date,
): Promise<string> {
  const m = await measureFor(tx, actor.hospitalId, input.testId, input.conceptId);
  if (!m?.unitUcum) throw invalid("Set this test's unit in the catalogue first.");
  if (input.bands.some((b) => b.source.trim().length < 3))
    throw invalid("Every band needs its source.");
  const errors = rangeSignErrors(
    {
      unitUcum: m.unitUcum,
      bands: input.bands.map((b, i) => ({ id: String(i + 1), ...b })) as RangeBand[],
    },
    toMeasure(m),
  );
  if (errors.length) throw invalid(bandWords(errors));
  const key = and(
    eq(referenceRangeVersions.hospitalId, actor.hospitalId),
    eq(referenceRangeVersions.testId, input.testId),
    eq(referenceRangeVersions.conceptId, input.conceptId),
  );
  const [open] = await tx
    .select({ id: referenceRangeVersions.id })
    .from(referenceRangeVersions)
    .where(
      and(
        key,
        eq(referenceRangeVersions.status, "draft"),
        isNull(referenceRangeVersions.leadSignedBy),
      ),
    )
    .limit(1);
  let versionId = open?.id;
  if (versionId) {
    await tx.delete(referenceRangeBands).where(eq(referenceRangeBands.versionId, versionId));
    await tx
      .update(referenceRangeVersions)
      .set({ authoredBy: actor.userId, unitUcum: m.unitUcum })
      .where(eq(referenceRangeVersions.id, versionId));
  } else {
    const [{ v }] = (await tx
      .select({ v: max(referenceRangeVersions.version) })
      .from(referenceRangeVersions)
      .where(key)) as [{ v: number | null }];
    const [row] = await tx
      .insert(referenceRangeVersions)
      .values({
        hospitalId: actor.hospitalId,
        testId: input.testId,
        conceptId: input.conceptId,
        unitUcum: m.unitUcum,
        version: (v ?? 0) + 1,
        authoredBy: actor.userId,
        createdAt: now,
      })
      .returning({ id: referenceRangeVersions.id });
    versionId = row!.id;
  }
  await tx.insert(referenceRangeBands).values(
    input.bands.map((b) => ({
      versionId: versionId!,
      sex: b.sex,
      ageFromDays: b.ageFromDays,
      ageToDays: b.ageToDays,
      low: b.low,
      high: b.high,
      source: b.source.trim(),
    })),
  );
  return versionId;
}

/**
 * D-LAB1-11, -12: the laboratory lead signs, then the CSO. The CSO's signature checks the unit
 * against the test's unit at that moment (RR-6) and puts the version in force; the version before it
 * is superseded and stays readable for results collected while it was in force.
 */
export async function signRangeVersion(
  tx: EmrTx,
  signer: { userId: string; hospitalId: string; as: "lead" | "cso" },
  input: { versionId: string; exceptionNote: string | null },
  now: Date,
) {
  const [v] = await tx
    .select()
    .from(referenceRangeVersions)
    .where(
      and(
        eq(referenceRangeVersions.id, input.versionId),
        eq(referenceRangeVersions.hospitalId, signer.hospitalId),
      ),
    )
    .for("update");
  if (!v) throw new EmrWriteError("not_found", "That range was not found.");
  if (v.status !== "draft") throw new EmrWriteError("conflict", "This range is already signed.");
  const note = input.exceptionNote?.trim() || null;
  if (note && note.length < 10) throw invalid("Say in a sentence why no second person can sign.");
  const m = await measureFor(tx, signer.hospitalId, v.testId, v.conceptId);
  const bands = await tx
    .select()
    .from(referenceRangeBands)
    .where(eq(referenceRangeBands.versionId, v.id));
  const errors = m
    ? rangeSignErrors(
        { unitUcum: v.unitUcum, bands: bands.map((b) => ({ ...b, sex: b.sex as Sex | "any" })) },
        toMeasure(m),
      )
    : ["unit_mismatch"];
  if (errors.length) throw invalid(bandWords(errors));
  if (signer.as === "lead") {
    if (v.leadSignedBy)
      throw new EmrWriteError("conflict", "The laboratory lead has already signed.");
    if (v.authoredBy === signer.userId && !note)
      throw new EmrWriteError(
        "forbidden",
        "You wrote this draft: another lead signs it, or record why no one else can.",
      );
    await tx
      .update(referenceRangeVersions)
      .set({
        leadSignedBy: signer.userId,
        leadSignedAt: now,
        ...(note ? { exceptionNote: note } : {}),
      })
      .where(eq(referenceRangeVersions.id, v.id));
    return;
  }
  if (!v.leadSignedBy) throw new EmrWriteError("conflict", "The laboratory lead signs first.");
  if (v.leadSignedBy === signer.userId && !note && !v.exceptionNote)
    throw new EmrWriteError(
      "forbidden",
      "You signed as the lead: a different person signs as CSO, or record why no one else can.",
    );
  await tx
    .update(referenceRangeVersions)
    .set({ status: "superseded", supersededAt: now })
    .where(
      and(
        eq(referenceRangeVersions.hospitalId, v.hospitalId),
        eq(referenceRangeVersions.testId, v.testId),
        eq(referenceRangeVersions.conceptId, v.conceptId),
        eq(referenceRangeVersions.status, "signed"),
        ne(referenceRangeVersions.id, v.id),
      ),
    );
  await tx
    .update(referenceRangeVersions)
    .set({
      status: "signed",
      csoSignedBy: signer.userId,
      csoSignedAt: now,
      inForceFrom: now,
      ...(note ? { exceptionNote: note } : {}),
    })
    .where(eq(referenceRangeVersions.id, v.id));
}

/** What the catalogue and range pages show (§5.6, §5.7). */
export async function loadMeasuresSetup(tx: EmrTx, hospitalId: string) {
  const [tests, measures, versions, units] = await Promise.all([
    labTests(tx, hospitalId),
    tx
      .select()
      .from(labComponentMeasures)
      .where(
        and(
          eq(labComponentMeasures.hospitalId, hospitalId),
          isNull(labComponentMeasures.supersededBy),
        ),
      ),
    tx
      .select()
      .from(referenceRangeVersions)
      .where(eq(referenceRangeVersions.hospitalId, hospitalId))
      .orderBy(desc(referenceRangeVersions.version)),
    tx.select().from(ucumUnits).orderBy(ucumUnits.display),
  ]);
  const draftIds = versions.filter((v) => v.status === "draft").map((v) => v.id);
  const signedIds = versions.filter((v) => v.status === "signed").map((v) => v.id);
  const bands = [...draftIds, ...signedIds].length
    ? await tx
        .select()
        .from(referenceRangeBands)
        .where(inArray(referenceRangeBands.versionId, [...draftIds, ...signedIds]))
    : [];
  const components = tests.flatMap((t) =>
    (t.components ?? []).map((c) => ({
      testId: t.id,
      test: t.display,
      conceptId: c,
      display: conceptDef(c)?.display ?? c,
      valueType: conceptDef(c)?.valueType ?? "quantity",
      measure: measures.find((m) => m.testId === t.id && m.conceptId === c) ?? null,
      signed:
        versions.find((v) => v.testId === t.id && v.conceptId === c && v.status === "signed") ??
        null,
      draft:
        versions.find((v) => v.testId === t.id && v.conceptId === c && v.status === "draft") ??
        null,
    })),
  );
  return { components, bands, units };
}
