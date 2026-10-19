import "server-only";

import type { CatalogueTest, Hours, Level, MenuOffering, SectionKey, Where } from "./test-menu";
import type { EmrDb } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  clinicalConcepts,
  diagnosticOfferings,
  hospitals,
  labCatalogueRequests,
  labOrderProfiles,
  labSettings,
  testCatalogue,
} from "@/db/schema";
import { CONCEPTS } from "@/lib/facts/catalogue.generated";
import { loadOpenProblems } from "@/lib/services/data";
import { availabilityReasonLabel } from "@/supabase/functions/_shared/services-hub";
import { resultLists } from "./catalogue-v2";
import { levelOf, mask, notOffered } from "./test-menu";

/**
 * Lab test menu v2 (5.1–5.6; TM-3 to TM-5, TM-10, TM-11): one read for both entry points, the hub's Diagnostics
 * and the lab's Set-up → Tests. Restricted names are masked here, at the read (Law 6, §9): a masked row carries no
 * name, aliases or results, so nothing on the client can reveal them.
 */

export type Surface = "lab" | "hub";

export interface MenuProfile {
  id: string;
  name: string;
  note: string | null;
  testCodes: string[];
  /** TM-10: a test in it is no longer offered; never silently changed. */
  flagged: boolean;
}

export interface MenuRequest {
  id: string;
  name: string;
  state: "new" | "in_review" | "added" | "declined";
  reason: string | null;
  testCode: string | null;
  at: string;
}

export interface TestMenuData {
  surface: Surface;
  hospitalName: string;
  level: Level | null;
  canSeeRestricted: boolean;
  tests: CatalogueTest[];
  menu: MenuOffering[];
  /** In-house tests with an open hub problem: the amber pill's words (DX-4). */
  problems: Record<string, string>;
  hidden: SectionKey[];
  profiles: MenuProfile[];
  requests: MenuRequest[];
}

/** The catalogue as the menu reads it: every default-menu lab test with a catalogue section. */
export async function loadCatalogueTests(
  hospitalId: string,
  canSeeRestricted: boolean,
  database: EmrDb = db as unknown as EmrDb,
) {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(testCatalogue)
      .where(and(isNull(testCatalogue.hospitalId), eq(testCatalogue.kind, "lab")))
      .orderBy(testCatalogue.display);
    const list = await resultLists(tx, hospitalId);
    const withSection = rows.filter((r) => r.section);
    const ids = [...new Set(withSection.flatMap((r) => list(r.code, r.components)))];
    const codes = ids.length
      ? await tx
          .select({ id: clinicalConcepts.id, codes: clinicalConcepts.codes })
          .from(clinicalConcepts)
          .where(inArray(clinicalConcepts.id, ids))
      : [];
    const loinc = new Map(
      codes.map((c) => [
        c.id,
        ((c.codes ?? []) as { system: string; code: string | null; status: string }[]).find(
          (x) => x.system === "LOINC" && x.status === "verified",
        )?.code ?? null,
      ]),
    );
    return withSection.map((r) =>
      mask(
        {
          code: r.code,
          display: r.display,
          aliases: r.aliases,
          section: r.section as SectionKey,
          components: list(r.code, r.components).map((id) => {
            const c = (
              CONCEPTS as Record<string, { display: string; canonicalUnit: string | null }>
            )[id];
            return {
              id,
              display: c?.display ?? id,
              unit: c?.canonicalUnit ?? null,
              loinc: loinc.get(id) ?? null,
            };
          }),
          specimen: r.specimen,
          tube: r.tube,
          orderLoinc: r.orderLoinc,
          minLevel: r.minLevel,
          levelBasis: r.levelBasis as CatalogueTest["levelBasis"],
          usualRoute: r.usualRoute as CatalogueTest["usualRoute"],
          referTo: r.referTo,
          restricted: r.restrictedClass !== null,
          masked: false,
          advisory: r.advisory,
          offerByDefault: r.offerByDefault,
          signed: r.active,
        },
        canSeeRestricted,
      ),
    );
  });
}

/** TM-3: the lab rows keyed by a catalogue test (a LOINC-keyed legacy row is not a menu row). */
export async function loadMenuOfferings(
  hospitalId: string,
  codes: ReadonlySet<string>,
  database: EmrDb = db as unknown as EmrDb,
): Promise<MenuOffering[]> {
  const rows = await database
    .select()
    .from(diagnosticOfferings)
    .where(
      and(eq(diagnosticOfferings.hospitalId, hospitalId), eq(diagnosticOfferings.kind, "lab")),
    );
  return rows
    .filter((o) => codes.has(o.code))
    .map((o) => ({
      code: o.code,
      where: o.provision as Where,
      sectionOverride: o.sectionOverride as SectionKey | null,
      hours: o.hours as Hours,
      hoursNote: o.hoursNote,
      statedTurnaroundMinutes: o.statedTurnaroundMinutes,
      referredTo: o.referredTo,
    }));
}

export async function loadTestMenuData(
  hospitalId: string,
  surface: Surface,
  canSeeRestricted: boolean,
): Promise<TestMenuData> {
  const tests = await loadCatalogueTests(hospitalId, canSeeRestricted);
  const codes = new Set(tests.map((t) => t.code));
  const [menu, problems, [h], [settings], profileRows, requestRows] = await Promise.all([
    loadMenuOfferings(hospitalId, codes),
    loadOpenProblems(hospitalId),
    db
      .select({ name: hospitals.name, level: hospitals.level })
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId)),
    db
      .select({ hidden: labSettings.hiddenSections })
      .from(labSettings)
      .where(eq(labSettings.hospitalId, hospitalId)),
    db
      .select()
      .from(labOrderProfiles)
      .where(and(eq(labOrderProfiles.hospitalId, hospitalId), eq(labOrderProfiles.active, true)))
      .orderBy(labOrderProfiles.name),
    db
      .select()
      .from(labCatalogueRequests)
      .where(eq(labCatalogueRequests.hospitalId, hospitalId))
      .orderBy(desc(labCatalogueRequests.createdAt))
      .limit(20),
  ]);
  return {
    surface,
    hospitalName: h?.name ?? "",
    level: levelOf(h?.level ?? null),
    canSeeRestricted,
    tests,
    menu,
    problems: Object.fromEntries(
      problems
        .filter((p) => p.subjectKind === "test" && codes.has(p.subjectRef))
        .map((p) => [p.subjectRef, availabilityReasonLabel(p.reason)]),
    ),
    hidden: (settings?.hidden ?? []) as SectionKey[],
    profiles: profileRows.map((p) => ({
      id: p.id,
      name: p.name,
      note: p.note,
      testCodes: p.testCodes,
      flagged: notOffered(p.testCodes, menu).length > 0,
    })),
    requests: requestRows.map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state as MenuRequest["state"],
      reason: r.reason,
      testCode: r.testCode,
      at: r.createdAt.toISOString(),
    })),
  };
}
