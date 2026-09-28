import "server-only";

import type { ClerkingDeskData } from "./desk-data";
import type { FlowRow } from "@/lib/emr/chart";
import type { EmrDb } from "@/lib/emr/db";
import type { Acvpu } from "@/lib/triage/types";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";

import {
  allergies,
  allergyStatusAssertions,
  medicationStatements,
  pregnancyEpisodes,
} from "@/db/schema/emr";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { asClinicalReader } from "@/lib/emr/db";
import { loadAllergyInput } from "@/lib/emr/read/allergies";
import { conceptForToken } from "@/lib/emr/write/notes";
import { EXAM_CATALOGUE, EXAM_SIGNOFF } from "./exam/load";
import { CLERKING_CATALOGUE, CLERKING_LEGACY, CLERKING_SIGNOFF, CLERKING_TOKEN_MAP } from "./load";
import { readOutbreakMode } from "./outbreak";
import { INFORMANT_TO_ALLERGY_SOURCE, MANIFESTATION_TO_REACTION } from "./record-map";

/**
 * The v2 desk's record reads (desk-data.ts), for lib/emr/read/desk.ts. Vitals are the newest
 * reading of each NEWS2 input in the chart's flowsheet (the observation store, triage projected in);
 * allergies come from the one allergy record, across hospitals by decision (STOP 1, O-8).
 */

/** What signing charts (lib/emr/write/notes.ts uses the same map and resolver). */
const CHARTABLE = Object.entries(CLERKING_TOKEN_MAP)
  .filter(([, token]) => conceptForToken(token))
  .map(([symptom]) => symptom);

const AVPU: Record<string, Acvpu> = {
  alert: "A",
  new_confusion: "C", // CFC addendum (exam GATE A, HX3)
  voice: "V",
  pain: "P",
  unresponsive: "U",
};

/** The concepts an examination set writes (lib/clerking/exam/vitals.ts saveLines). */
const SET_CONCEPTS: Record<string, string> = {
  "obs.bp_systolic": "vs.bp",
  "obs.heart_rate": "vs.pulse",
  "obs.resp_rate": "vs.rr",
  "obs.spo2": "vs.spo2",
  "obs.temperature": "vs.temp",
  "obs.glucose": "vs.glucose",
  "obs.weight": "vs.weight",
  "obs.height": "vs.height",
  "obs.waist": "vs.waist",
};

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** The newest set saved at this visit (its reading-set id), with the qualifiers the note writes. */
async function latestExamSet(
  db: EmrDb,
  i: { patientUserId: string; encounterId: string },
): Promise<ClerkingDeskData["exam"]["set"]> {
  const rows = await db
    .select({
      conceptId: clinicalObservations.conceptId,
      context: clinicalObservations.context,
      at: clinicalObservations.effectiveAt,
    })
    .from(clinicalObservations)
    .where(
      and(
        eq(clinicalObservations.patientUserId, i.patientUserId),
        eq(clinicalObservations.encounterId, i.encounterId),
        inArray(clinicalObservations.conceptId, [
          ...Object.keys(SET_CONCEPTS),
          "obs.bp_diastolic",
          "obs.avpu",
          "obs.gcs",
        ]),
        notInArray(clinicalObservations.status, ["entered_in_error", "cancelled"]),
      ),
    )
    .orderBy(desc(clinicalObservations.effectiveAt))
    .limit(40);
  const newest = rows.find((r) => str((r.context as Record<string, unknown>)?.readingSetId));
  if (!newest?.at) return null;
  const setId = (newest.context as Record<string, unknown>).readingSetId;
  const set = rows.filter((r) => (r.context as Record<string, unknown>)?.readingSetId === setId);
  const ctx = (id: string) =>
    (set.find((r) => r.conceptId === id)?.context ?? {}) as Record<string, unknown>;
  const bp = ctx("obs.bp_systolic");
  const spo2 = ctx("obs.spo2");
  const oxygen = str(spo2.oxygenSupport);
  return {
    at: newest.at.toISOString(),
    fields: [
      ...new Set(
        set.flatMap((r) =>
          r.conceptId && SET_CONCEPTS[r.conceptId] ? [SET_CONCEPTS[r.conceptId]!] : [],
        ),
      ),
    ],
    arm: str(bp.arm),
    position: str(bp.position),
    rhythm: str(ctx("obs.heart_rate").rhythm),
    site: str(ctx("obs.temperature").site),
    glucoseContext: str(ctx("obs.glucose").glucoseContext),
    oxygen: oxygen === "room_air" ? "air" : oxygen === "supplemental_oxygen" ? "oxygen" : null,
    oxygenModality: str(spo2.oxygenDevice),
    acvpu:
      (["A", "C", "V", "P", "U"] as const).find(
        (a) => a === (newest.context as Record<string, unknown>).acvpu,
      ) ?? null,
    // A confirmed implausible value is marked in the line's context (E8).
    confirmed: set
      .filter((r) => (r.context as Record<string, unknown>)?.plausibilityConfirmed && r.conceptId)
      .map((r) => r.conceptId!.replace("obs.", "")),
  };
}

async function pregnancyOf(db: EmrDb, patientUserId: string): Promise<boolean | null> {
  const [p] = await db
    .select({ state: pregnancyEpisodes.pregnancyState })
    .from(pregnancyEpisodes)
    .where(
      and(
        eq(pregnancyEpisodes.patientUserId, patientUserId),
        notInArray(pregnancyEpisodes.status, ["entered_in_error", "cancelled"]),
      ),
    )
    .orderBy(desc(pregnancyEpisodes.effectiveAt))
    .limit(1);
  return p?.state === "pregnant"
    ? true
    : p?.state === "not_pregnant" || p?.state === "postpartum"
      ? false
      : null;
}

function newest(rows: readonly FlowRow[], conceptId: string) {
  const cell = rows.find((r) => r.conceptId === conceptId)?.cells.at(-1);
  return cell ?? null;
}
const numberOf = (v: string | undefined) => {
  const n = Number.parseFloat((v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Which of these current versions began (version 1) at this visit, recorded by this clinician. */
async function addedHere(
  db: EmrDb,
  t: typeof medicationStatements | typeof allergies,
  ids: string[],
  i: { scope: { userId: string }; encounterId: string },
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const current = await db
    .select({ id: t.id, logicalId: t.logicalId })
    .from(t)
    .where(inArray(t.id, ids));
  const firsts = await db
    .select({ logicalId: t.logicalId })
    .from(t)
    .where(
      and(
        inArray(
          t.logicalId,
          current.map((c) => c.logicalId),
        ),
        eq(t.version, 1),
        eq(t.encounterId, i.encounterId),
        eq(t.recordedByUserId, i.scope.userId),
      ),
    );
  const here = new Set(firsts.map((f) => f.logicalId));
  return new Set(current.filter((c) => here.has(c.logicalId)).map((c) => c.id));
}

export async function clerkingData(i: {
  scope: { userId: string; hospitalId: string };
  database?: EmrDb;
  patientUserId: string;
  encounterId: string;
  sex: string | null;
  ageYears: number | null;
  rows: readonly FlowRow[];
  medicines: Omit<ClerkingDeskData["medicines"][number], "addedHere">[];
}): Promise<ClerkingDeskData> {
  const owner = i.database ?? ((await import("@/db")).db as unknown as EmrDb);

  const cells = {
    rr: newest(i.rows, "obs.resp_rate"),
    spo2: newest(i.rows, "obs.spo2"),
    sbp: newest(i.rows, "obs.bp_systolic"),
    hr: newest(i.rows, "obs.heart_rate"),
    temp: newest(i.rows, "obs.temperature"),
    avpu: newest(i.rows, "obs.avpu"),
  };
  const more = {
    dbp: newest(i.rows, "obs.bp_diastolic"),
    glucose: newest(i.rows, "obs.glucose"),
    weight: newest(i.rows, "obs.weight"),
    height: newest(i.rows, "obs.height"),
    waist: newest(i.rows, "obs.waist"),
  };
  const present = Object.values(cells).filter((c) => c !== null);
  const latest =
    present
      .map((c) => c!.at)
      .sort()
      .at(-1) ?? null;
  const avpuWord = cells.avpu?.value.split(" ")[0]?.toLowerCase().replace(/ /g, "_");
  const [examSet, pregnant] = await Promise.all([
    latestExamSet(owner, i).catch(() => null),
    pregnancyOf(owner, i.patientUserId).catch(() => null),
  ]);

  const allergy = await loadAllergyInput(owner, i.patientUserId);
  const [touchedAllergy] = await owner
    .select({ id: allergies.id })
    .from(allergies)
    .where(
      and(eq(allergies.patientUserId, i.patientUserId), eq(allergies.encounterId, i.encounterId)),
    )
    .limit(1);
  const [touchedAssertion] = await owner
    .select({ id: allergyStatusAssertions.id })
    .from(allergyStatusAssertions)
    .where(
      and(
        eq(allergyStatusAssertions.patientUserId, i.patientUserId),
        eq(allergyStatusAssertions.encounterId, i.encounterId),
      ),
    )
    .limit(1);

  const outbreakMode = await asClinicalReader(
    i.scope,
    (tx) => readOutbreakMode(tx, i.scope.hospitalId),
    i.database,
  ).catch(
    () => false, // before 0076 is applied the table is missing: outbreak mode is off
  );

  const status = allergy.status;
  const listed = status.kind === "listed" ? status.allergies : [];
  const [medsHere, allergiesHere] = await Promise.all([
    addedHere(
      owner,
      medicationStatements,
      i.medicines.map((m) => m.statementId),
      i,
    ),
    addedHere(
      owner,
      allergies,
      listed.map((l) => l.allergy.id),
      i,
    ),
  ]);
  return {
    catalogueUrl: `/api/clerking/catalogue?v=${CLERKING_SIGNOFF.catalogueSha256.slice(0, 16)}`,
    catalogueVersion: CLERKING_CATALOGUE.version,
    sex: i.sex === "female" || i.sex === "male" ? i.sex : null,
    ageYears: i.ageYears,
    vitals: {
      respiratoryRate: numberOf(cells.rr?.value),
      spo2: numberOf(cells.spo2?.value),
      spo2Scale: "scale1",
      // Air or oxygen travels with SpO₂ in an examination set (HX2); a triage reading has none.
      oxygen: examSet && cells.spo2 && examSet.at === cells.spo2.at ? examSet.oxygen : null,
      systolicBp: numberOf(cells.sbp?.value),
      pulse: numberOf(cells.hr?.value),
      // The newest of the chart's AVPU and an examination set's ACVPU (C is only in a set, HX3).
      consciousness:
        examSet?.acvpu && (!cells.avpu || examSet.at >= cells.avpu.at)
          ? examSet.acvpu
          : avpuWord
            ? (AVPU[avpuWord] ?? null)
            : null,
      temperature: numberOf(cells.temp?.value),
    },
    vitalsAt: latest,
    vitalsFromTriage:
      present.length > 0 && present.every((c) => c!.id.startsWith("triage_records:")),
    medicines: i.medicines.map((m) => ({ ...m, addedHere: medsHere.has(m.statementId) })),
    allergies: {
      status: status.kind,
      touchedThisVisit: !!touchedAllergy || !!touchedAssertion,
      items:
        status.kind === "listed"
          ? listed.map((l) => ({
              id: l.allergy.id,
              name: l.allergy.substanceText ?? l.allergy.substanceCode ?? "Allergy",
              coded: l.coded,
              reactions: (l.allergy.manifestations ?? []).flatMap(
                (m) => MANIFESTATION_TO_REACTION[m] ?? [],
              ),
              severity: l.allergy.severity,
              source: l.allergy.informant
                ? (INFORMANT_TO_ALLERGY_SOURCE[l.allergy.informant] ?? null)
                : null,
              restricted: false,
              addedHere: allergiesHere.has(l.allergy.id),
            }))
          : [],
    },
    chartable: CHARTABLE,
    outbreakMode,
    canSeeRestricted: true, // the treating clinician, with an access basis (the desk's gate)
    exam: {
      catalogueUrl: `/api/clerking/exam-catalogue?v=${EXAM_SIGNOFF.catalogueSha256.slice(0, 16)}`,
      catalogueVersion: EXAM_CATALOGUE.version,
      signoff: {
        flagRules: EXAM_SIGNOFF.flagRules,
        referenceEntries: EXAM_SIGNOFF.referenceEntries,
        classifiers: EXAM_SIGNOFF.classifiers,
        withheld: EXAM_SIGNOFF.withheld,
      },
      latest: {
        sbp: numberOf(cells.sbp?.value),
        dbp: numberOf(more.dbp?.value),
        pulse: numberOf(cells.hr?.value),
        rr: numberOf(cells.rr?.value),
        spo2: numberOf(cells.spo2?.value),
        temp: numberOf(cells.temp?.value),
        glucose: numberOf(more.glucose?.value),
        weight: numberOf(more.weight?.value),
        height: numberOf(more.height?.value),
        waist: numberOf(more.waist?.value),
      },
      set: examSet,
      pregnant,
    },
    conversionFlags: CLERKING_LEGACY.flags,
    signoff: {
      flagRules: CLERKING_SIGNOFF.flagRules,
      referenceEntries: CLERKING_SIGNOFF.referenceEntries,
      withheld: CLERKING_SIGNOFF.withheld,
    },
  };
}
