import "server-only";

import type { EqaRound, EqaSample } from "./eqa";
import type { ReleasedResult } from "./lookback";
import type { EmrTx } from "@/lib/emr/db";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import {
  clinicalObservations,
  diagnosticReports,
  labAltAssessments,
  labEqaRounds,
  labEqaSchemes,
  labLookbackItems,
  labResultSnapshots,
  labSettings,
  testCatalogue,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { roundOutcome, testerWarnings } from "./eqa";
import { eqaLookBack, sortLookBack } from "./lookback";
import { openAutomaticNc } from "./nc-store";
import { analyteName } from "./qc-store";
import { addDays, dayOf, endOfDay } from "./stock";

/**
 * External quality assessment on the database (Lab Phase 3 Step 7, §6.7 EA-1..EA-6; GATE A P8, 0115). Schemes
 * (the tests they cover are the enrolment), rounds (samples, our results, the provider's scores as JSON) and
 * alternative assessments. Scores are the provider's, entered once from its report: MedSync never re-scores
 * (EA-3). An unacceptable sample opens a nonconformity with a patient look-back over receipt → scoring (EA-4).
 * HIV panel samples carry the algorithm's kit name, so HMIS 105 10.3 counts them under EQA, by kit (EA-6).
 */

type Actor = { userId: string; hospitalId: string };
const TZ = DEFAULT_TIME_ZONE;
const invalid = (m: string) => new EmrWriteError("invalid", m);
const notFound = (m: string) => new EmrWriteError("not_found", m);

/** What a round's `samples` JSON holds (GATE A §3.2 0115, plus `kit` for EA-6 and the provider's bias). */
export interface StoredSample {
  sampleId: string;
  conceptId: string;
  /** HIV panels: the signed algorithm's kit name the sample was tested on (10.3 by kit). */
  kit?: string | null;
  ours?: string | null;
  target?: string | null;
  score?: "acceptable" | "unacceptable";
  scoreKind?: "percent" | "sdi" | "z" | null;
  scoreValue?: number | null;
  limit?: string | null;
  bias?: number | null;
}

/** EA-2's operational window (the prompt's 30 days) until the lead sets one; labelled operational. */
export const EQA_TESTER_WINDOW_DAYS = 30;

export async function eqaSettings(tx: EmrTx, hospitalId: string) {
  const [s] = await tx
    .select({ q: labSettings.quality })
    .from(labSettings)
    .where(eq(labSettings.hospitalId, hospitalId));
  const q = (s?.q ?? {}) as { eqaTesterWindowDays?: number | null; altPeriodDays?: number | null };
  return {
    testerWindowDays: q.eqaTesterWindowDays ?? EQA_TESTER_WINDOW_DAYS,
    testerWindowSet: q.eqaTesterWindowDays != null,
    /** EA-5: the lead's period; no default (alternatives count only once it is set). */
    altPeriodDays: q.altPeriodDays ?? null,
  };
}

/** A stored round as the engine reads it. */
export const toRound = (r: typeof labEqaRounds.$inferSelect): EqaRound => ({
  hospitalId: r.hospitalId,
  id: r.id,
  schemeId: r.schemeId,
  receivedOn: r.receivedOn,
  dueOn: r.dueOn ?? r.receivedOn,
  submittedOn: r.submittedOn,
  scoredOn: r.scoredOn,
  testedBy: r.testedBy,
  samples: (r.samples as StoredSample[]).map(
    (s): EqaSample => ({
      sampleId: s.sampleId,
      conceptId: s.conceptId,
      ...(s.score ? { score: s.score } : {}),
      ...(s.bias != null ? { bias: s.bias } : {}),
      ...(s.kit ? { kit: s.kit } : {}),
    }),
  ),
});

/** Every round of the hospital as engine rounds (Step 9 reads these for 10.3 EQA). */
export async function eqaRoundsFor(tx: EmrTx, hospitalId: string): Promise<EqaRound[]> {
  const rows = await tx.select().from(labEqaRounds).where(eq(labEqaRounds.hospitalId, hospitalId));
  return rows.map(toRound);
}

/* ─── EA-1: schemes and enrolment ──────────────────────────────────────── */

export async function saveScheme(
  tx: EmrTx,
  a: Actor,
  input: {
    id: string | null;
    name: string;
    provider: string;
    covers: string[];
    roundsPerYear: number | null;
    active: boolean;
  },
) {
  const v = {
    name: input.name,
    provider: input.provider,
    covers: [...new Set(input.covers)],
    roundsPerYear: input.roundsPerYear,
    active: input.active,
  };
  if (!input.id) {
    const [r] = await tx
      .insert(labEqaSchemes)
      .values({ hospitalId: a.hospitalId, ...v })
      .returning({ id: labEqaSchemes.id });
    return r!.id;
  }
  const [r] = await tx
    .update(labEqaSchemes)
    .set(v)
    .where(and(eq(labEqaSchemes.id, input.id), eq(labEqaSchemes.hospitalId, a.hospitalId)))
    .returning({ id: labEqaSchemes.id });
  if (!r) throw notFound("That scheme is not in this lab.");
  return r.id;
}

/* ─── EA-2: rounds, our results, submission ───────────────────────────── */

export async function recordRound(
  tx: EmrTx,
  a: Actor,
  input: {
    schemeId: string;
    label: string;
    receivedOn: string;
    dueOn: string | null;
    samples: { sampleId: string; conceptId: string; kit: string | null }[];
  },
) {
  const [s] = await tx
    .select({ id: labEqaSchemes.id })
    .from(labEqaSchemes)
    .where(and(eq(labEqaSchemes.id, input.schemeId), eq(labEqaSchemes.hospitalId, a.hospitalId)));
  if (!s) throw notFound("That scheme is not in this lab.");
  if (input.dueOn && input.dueOn < input.receivedOn)
    throw invalid("The results are due after the panel is received.");
  if (new Set(input.samples.map((x) => x.sampleId)).size !== input.samples.length)
    throw invalid("Each sample needs its own scheme id.");
  const [r] = await tx
    .insert(labEqaRounds)
    .values({
      hospitalId: a.hospitalId,
      schemeId: s.id,
      label: input.label,
      receivedOn: input.receivedOn,
      dueOn: input.dueOn,
      samples: input.samples.map(
        (x): StoredSample => ({
          sampleId: x.sampleId,
          conceptId: x.conceptId,
          ...(x.kit ? { kit: x.kit } : {}),
        }),
      ),
    })
    .onConflictDoNothing()
    .returning({ id: labEqaRounds.id });
  if (!r) throw new EmrWriteError("conflict", "This scheme already has a round with that label.");
  return r.id;
}

async function roundOf(tx: EmrTx, hospitalId: string, roundId: string) {
  const [r] = await tx
    .select({ r: labEqaRounds, s: labEqaSchemes })
    .from(labEqaRounds)
    .innerJoin(labEqaSchemes, eq(labEqaSchemes.id, labEqaRounds.schemeId))
    .where(and(eq(labEqaRounds.id, roundId), eq(labEqaRounds.hospitalId, hospitalId)))
    .for("update", { of: labEqaRounds });
  if (!r) throw notFound("That round is not in this lab.");
  return r;
}

/** EA-2: patient releases of the scheme's tests by these users from `from` (the warning's evidence). */
export async function releasesBy(
  tx: EmrTx,
  hospitalId: string,
  users: readonly string[],
  tests: readonly string[],
  fromDay: string,
) {
  if (!users.length || !tests.length) return [];
  const d = diagnosticReports;
  const rows = await tx
    .select({ userId: d.recordedByUserId, testCode: testCatalogue.code, at: d.recordedAt })
    .from(d)
    .innerJoin(testCatalogue, eq(testCatalogue.id, d.testId))
    .where(
      and(
        eq(d.hospitalId, hospitalId),
        eq(d.kind, "lab"),
        eq(d.performer, "in_house"),
        inArray(d.status, ["final", "amended", "corrected"]),
        inArray(d.recordedByUserId, [...users]),
        inArray(testCatalogue.code, [...tests]),
        gte(d.recordedAt, startOfLocalDay(new Date(`${fromDay}T12:00:00Z`), TZ)),
      ),
    );
  return rows.map((r) => ({
    hospitalId,
    userId: r.userId,
    testCode: r.testCode,
    day: dayOf(r.at, TZ),
  }));
}

/**
 * EA-2: our results, who tested the panel and the date submitted to the provider (once). The tester check is a
 * warning only: the user ids who released no patient result for the scheme's tests in the window are returned.
 */
export async function recordEqaResults(
  tx: EmrTx,
  a: Actor,
  input: {
    roundId: string;
    results: { sampleId: string; ours: string }[];
    testedBy: string[];
    submittedOn: string;
  },
) {
  const { r, s } = await roundOf(tx, a.hospitalId, input.roundId);
  if (r.submittedOn) throw new EmrWriteError("conflict", "These results were already submitted.");
  if (input.submittedOn < r.receivedOn)
    throw invalid("Results are submitted after the panel is received.");
  const samples = r.samples as StoredSample[];
  for (const x of input.results)
    if (!samples.some((y) => y.sampleId === x.sampleId))
      throw invalid(`Sample ${x.sampleId} is not in this round.`);
  if (samples.some((y) => !input.results.find((x) => x.sampleId === y.sampleId)?.ours.trim()))
    throw invalid("Enter a result for every sample.");
  await tx
    .update(labEqaRounds)
    .set({
      samples: samples.map((y) => ({
        ...y,
        ours: input.results.find((x) => x.sampleId === y.sampleId)!.ours.trim(),
      })),
      testedBy: [...new Set(input.testedBy)],
      submittedOn: input.submittedOn,
    })
    .where(eq(labEqaRounds.id, r.id));
  const settings = await eqaSettings(tx, a.hospitalId);
  const round = toRound({ ...r, testedBy: [...new Set(input.testedBy)] });
  return testerWarnings({
    round,
    scheme: { ...s, roundsPerYear: s.roundsPerYear ?? 0 },
    releases: await releasesBy(
      tx,
      a.hospitalId,
      round.testedBy,
      s.covers,
      addDays(r.receivedOn, -settings.testerWindowDays),
    ),
    windowDays: settings.testerWindowDays,
  });
}

/* ─── EA-3, EA-4: the provider's scores, once; unacceptable → nonconformity + look-back ─── */

/** In-house released numeric results of a component, first release of each value, oldest first. */
async function releasedInHouse(
  tx: EmrTx,
  hospitalId: string,
  conceptId: string,
  from: Date,
  to: Date,
) {
  const o = clinicalObservations;
  return tx
    .selectDistinctOn([o.logicalId], {
      id: o.id,
      reportId: o.reportId,
      patientUserId: o.patientUserId,
      value: o.valueNum,
      releasedAt: o.recordedAt,
      low: labResultSnapshots.rangeLow,
      high: labResultSnapshots.rangeHigh,
    })
    .from(o)
    .innerJoin(diagnosticReports, eq(diagnosticReports.id, o.reportId))
    .leftJoin(labResultSnapshots, eq(labResultSnapshots.observationId, o.id))
    .where(
      and(
        eq(o.hospitalId, hospitalId),
        eq(o.conceptId, conceptId),
        eq(diagnosticReports.performer, "in_house"),
        inArray(o.status, ["final", "amended", "corrected"]),
        sql`${o.valueNum} IS NOT NULL`,
        gte(o.recordedAt, from),
        lt(o.recordedAt, to),
      ),
    )
    .orderBy(o.logicalId, asc(o.recordedAt));
}

export async function recordEqaScores(
  tx: EmrTx,
  a: Actor,
  input: {
    roundId: string;
    scoredOn: string;
    reportPath: string | null;
    scores: {
      sampleId: string;
      target: string | null;
      score: "acceptable" | "unacceptable";
      scoreKind: "percent" | "sdi" | "z" | null;
      scoreValue: number | null;
      limit: string | null;
      bias: number | null;
    }[];
  },
  now: Date,
): Promise<{ outcome: string; ncId: string | null }> {
  const { r, s } = await roundOf(tx, a.hospitalId, input.roundId);
  if (r.outcome) throw new EmrWriteError("conflict", "This round's scores are already recorded.");
  if (!r.submittedOn) throw invalid("Record our results and the date submitted first.");
  if (input.scoredOn < r.receivedOn)
    throw invalid("The report is dated after the panel was received.");
  const samples = r.samples as StoredSample[];
  if (samples.some((y) => !input.scores.some((x) => x.sampleId === y.sampleId)))
    throw invalid("Enter the provider's score for every sample.");
  const scored = samples.map((y): StoredSample => {
    const x = input.scores.find((z) => z.sampleId === y.sampleId)!;
    return {
      ...y,
      target: x.target,
      score: x.score,
      scoreKind: x.scoreKind,
      scoreValue: x.scoreValue,
      limit: x.limit,
      ...(x.bias != null ? { bias: x.bias } : {}),
    };
  });
  const round = toRound({ ...r, samples: scored, scoredOn: input.scoredOn });
  const out = roundOutcome(round);
  let ncId: string | null = null;
  if (out.lookBack) {
    const names = [...new Set(out.unacceptable.map((u) => analyteName(u.conceptId)))].join(", ");
    const nc = await openAutomaticNc(
      tx,
      a.hospitalId,
      {
        source: "eqa_unacceptable",
        sourceRef: r.id,
        deviceId: null,
        conceptId: out.unacceptable[0]!.conceptId,
        title: `EQA unacceptable: ${names} (${s.name}, ${r.label})`,
        whatHappened: `The provider scored ${out.unacceptable.length} of ${scored.length} samples unacceptable (${out.unacceptable.map((u) => u.sampleId).join(", ")}). Patient results from ${out.lookBack.from} to ${out.lookBack.to} are listed for review.`,
      },
      now,
    );
    ncId = nc.id;
    const from = startOfLocalDay(new Date(`${out.lookBack.from}T12:00:00Z`), TZ);
    const to = endOfDay(out.lookBack.to, TZ);
    for (const conceptId of new Set(out.unacceptable.map((u) => u.conceptId))) {
      const rows = await releasedInHouse(tx, a.hospitalId, conceptId, from, to);
      const results = eqaLookBack({
        hospitalId: a.hospitalId,
        conceptId,
        from,
        to,
        results: rows.map(
          (x): ReleasedResult => ({
            hospitalId: a.hospitalId,
            deviceId: null,
            conceptId,
            reportId: x.reportId!,
            observationId: x.id,
            patientUserId: x.patientUserId,
            releasedAt: x.releasedAt,
            value: x.value!,
            override: false,
          }),
        ),
      });
      // LB-2 without the estimate unless the provider gave a bias for this analyte (EA-4).
      const given = out.unacceptable.find((u) => u.conceptId === conceptId && u.bias != null);
      const bias = given ? { label: "estimate" as const, value: given.bias!, level: 0 } : null;
      const band = new Map(rows.map((x) => [x.id, { low: x.low, high: x.high }]));
      const items = results.map((x) => ({
        ncId: nc.id,
        hospitalId: a.hospitalId,
        patientUserId: x.patientUserId,
        reportId: x.reportId,
        observationId: x.observationId,
        releasedAt: x.releasedAt,
        value: x.value,
        sort: sortLookBack([x], bias, { band: band.get(x.observationId) ?? null, critical: [] })[0]!
          .sort,
      }));
      if (items.length) await tx.insert(labLookbackItems).values(items).onConflictDoNothing();
    }
  }
  await tx
    .update(labEqaRounds)
    .set({
      samples: scored,
      scoredOn: input.scoredOn,
      reportPath: input.reportPath,
      outcome: out.outcome,
      ncId,
    })
    .where(eq(labEqaRounds.id, r.id));
  return { outcome: out.outcome!, ncId };
}

/* ─── EA-5: alternative assessments ───────────────────────────────────── */

export async function recordAltAssessment(
  tx: EmrTx,
  a: Actor,
  input: {
    testCode: string;
    method: "split_sample" | "interlab" | "retained_samples";
    partner: string | null;
    doneOn: string;
    results: string;
    conclusion: string;
  },
  now: Date,
) {
  if (input.doneOn > dayOf(now, TZ)) throw invalid("The date done cannot be in the future.");
  if (input.method !== "retained_samples" && !input.partner)
    throw invalid("Name the other laboratory.");
  const [r] = await tx
    .insert(labAltAssessments)
    .values({
      hospitalId: a.hospitalId,
      testCode: input.testCode,
      method: input.method,
      partner: input.partner,
      doneOn: input.doneOn,
      results: { text: input.results },
      conclusion: input.conclusion,
      recordedBy: a.userId,
    })
    .returning({ id: labAltAssessments.id });
  return r!.id;
}
