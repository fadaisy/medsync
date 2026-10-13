import "server-only";

import type { StoredSample } from "./eqa-store";
import type { EmrTx } from "@/lib/emr/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  cadres,
  diagnosticOfferings,
  labAltAssessments,
  labEqaRounds,
  labEqaSchemes,
  labNonconformities,
  labTestServices,
  staffAffiliations,
  testCatalogue,
  users,
} from "@/db/schema";
import { LAB_CADRES } from "@/lib/emr/write/orders";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { eqaCoverage, roundOutcome, roundOverdue, testerWarnings } from "./eqa";
import { eqaSettings, releasesBy, toRound } from "./eqa-store";
import { analyteName } from "./qc-store";
import { addDays, dayOf } from "./stock";

/** The orderable in-house tests here (hub provision `in_house`), with their names (EA-5's list). */
export async function inHouseTests(tx: EmrTx, hospitalId: string) {
  return tx
    .select({ code: labTestServices.testCode, display: testCatalogue.display })
    .from(labTestServices)
    .innerJoin(
      diagnosticOfferings,
      and(
        eq(diagnosticOfferings.hospitalId, labTestServices.hospitalId),
        eq(diagnosticOfferings.kind, "lab"),
        eq(diagnosticOfferings.code, labTestServices.offeringCode),
      ),
    )
    .innerJoin(testCatalogue, eq(testCatalogue.code, labTestServices.testCode))
    .where(
      and(
        eq(labTestServices.hospitalId, hospitalId),
        eq(diagnosticOfferings.provision, "in_house"),
      ),
    )
    .orderBy(asc(testCatalogue.display));
}

/**
 * The EQA page in one read (§5.8, artboard 8): schemes with their next due and last outcome, rounds with samples,
 * scores, testers and the EA-2 warning, coverage (EA-5) with alternative assessments, lab staff to pick testers.
 */
export async function loadEqa(tx: EmrTx, hospitalId: string, now: Date) {
  const today = dayOf(now, DEFAULT_TIME_ZONE);
  const [schemes, rounds, alts, tests, staff, settings] = await Promise.all([
    tx
      .select()
      .from(labEqaSchemes)
      .where(eq(labEqaSchemes.hospitalId, hospitalId))
      .orderBy(asc(labEqaSchemes.name)),
    tx
      .select({ r: labEqaRounds, nc: labNonconformities.number })
      .from(labEqaRounds)
      .leftJoin(labNonconformities, eq(labNonconformities.id, labEqaRounds.ncId))
      .where(eq(labEqaRounds.hospitalId, hospitalId))
      .orderBy(desc(labEqaRounds.receivedOn)),
    tx
      .select({ a: labAltAssessments, by: users.fullName })
      .from(labAltAssessments)
      .leftJoin(users, eq(users.id, labAltAssessments.recordedBy))
      .where(eq(labAltAssessments.hospitalId, hospitalId))
      .orderBy(desc(labAltAssessments.doneOn)),
    inHouseTests(tx, hospitalId),
    tx
      .selectDistinct({ userId: users.id, name: users.fullName })
      .from(staffAffiliations)
      .innerJoin(users, eq(users.id, staffAffiliations.userId))
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          eq(staffAffiliations.hospitalId, hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
          inArray(cadres.code, [...LAB_CADRES]),
        ),
      )
      .orderBy(asc(users.fullName)),
    eqaSettings(tx, hospitalId),
  ]);
  const name = new Map(staff.map((s) => [s.userId, s.name]));
  const testName = new Map(tests.map((t) => [t.code, t.display]));
  // EA-2: one read of every tester's releases back to the earliest round's window.
  const testers = [...new Set(rounds.flatMap((x) => x.r.testedBy))];
  const earliest = rounds.map((x) => x.r.receivedOn).sort()[0];
  const releases = earliest
    ? await releasesBy(
        tx,
        hospitalId,
        testers,
        [...new Set(schemes.flatMap((s) => s.covers))],
        addDays(earliest, -settings.testerWindowDays),
      )
    : [];
  const schemeOf = new Map(schemes.map((s) => [s.id, s]));
  const roundViews = rounds.map(({ r, nc }) => {
    const s = schemeOf.get(r.schemeId)!;
    const round = toRound(r);
    return {
      id: r.id,
      schemeId: r.schemeId,
      scheme: s.name,
      label: r.label,
      receivedOn: r.receivedOn,
      dueOn: r.dueOn,
      submittedOn: r.submittedOn,
      scoredOn: r.scoredOn,
      reportPath: r.reportPath,
      outcome: r.outcome as "acceptable" | "unacceptable" | "mixed" | null,
      ncId: r.ncId,
      ncNumber: nc,
      overdue: roundOverdue(round, today),
      samples: (r.samples as StoredSample[]).map((x) => ({
        ...x,
        analyte: analyteName(x.conceptId),
      })),
      testedBy: r.testedBy.map((u) => ({ userId: u, name: name.get(u) ?? "Staff" })),
      // EA-2: warning only; who has released no patient result for these tests in the window.
      testerWarnings: r.testedBy.length
        ? testerWarnings({
            round,
            scheme: { ...s, roundsPerYear: s.roundsPerYear ?? 0 },
            releases,
            windowDays: settings.testerWindowDays,
          }).map((u) => name.get(u) ?? "Staff")
        : [],
      acceptable: round.samples.filter((x) => x.score === "acceptable").length,
      scored: roundOutcome(round).outcome ? round.samples.filter((x) => x.score).length : 0,
    };
  });
  const coverage = eqaCoverage({
    hospitalId,
    tests: tests.map((t) => t.code),
    schemes: schemes.map((s) => ({ ...s, roundsPerYear: s.roundsPerYear ?? 0 })),
    alternatives:
      settings.altPeriodDays === null
        ? []
        : alts.map(({ a }) => ({ hospitalId, testCode: a.testCode, doneOn: a.doneOn })),
    today,
    periodDays: settings.altPeriodDays ?? 0,
  });
  return {
    settings,
    staff,
    tests,
    schemes: schemes.map((s) => {
      const mine = roundViews.filter((x) => x.schemeId === s.id);
      return {
        ...s,
        coversNames: s.covers.map((c) => testName.get(c) ?? c),
        next: mine.find((x) => !x.submittedOn) ?? null,
        last: mine.find((x) => x.outcome) ?? null,
        rounds: mine,
      };
    }),
    coverage: coverage.map((c) => ({ ...c, display: testName.get(c.testCode) ?? c.testCode })),
    alternatives: alts.map(({ a, by }) => ({
      ...a,
      display: testName.get(a.testCode) ?? a.testCode,
      by: by ?? "Staff",
    })),
  };
}
