import "server-only";

import type { Hours, Level, MenuOffering, SectionKey } from "./test-menu";
import type { EmrDb, EmrScope } from "@/lib/emr/db";

import { LAB_TEST_MENU } from "@/content/lab-test-menu";
import { diagnosticOfferings } from "@/db/schema";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import { applyTemplate, minutesWords, templateFor } from "./test-menu";
import { loadCatalogueTests, loadMenuOfferings } from "./test-menu-read";

/**
 * Lab test menu v2 writes (TM-3, TM-7, TM-13), the cores of test-menu-actions.ts: the caller has checked who
 * may edit (TM-D09). One transaction; the audit trigger on diagnostic_offerings writes one row per test.
 */

type Item = Omit<MenuOffering, "sectionOverride"> & { sectionOverride: string | null };
const invalid = (m: string) => new EmrWriteError("invalid", m);

export async function saveOfferings(
  me: EmrScope,
  items: readonly Item[],
  now: Date,
  database?: EmrDb,
) {
  const tests = await loadCatalogueTests(me.hospitalId, true, database);
  const byCode = new Map(tests.map((t) => [t.code, t]));
  const have = new Set(
    (await loadMenuOfferings(me.hospitalId, new Set(byCode.keys()), database)).map((o) => o.code),
  );
  for (const i of items) {
    const t = byCode.get(i.code);
    if (!t) throw invalid("That test is not in the catalogue.");
    // Law 4: a test the lead and the CSO have not signed cannot be added.
    if (!have.has(i.code) && !t.signed) throw invalid(LAB_TEST_MENU.notSigned);
  }
  await asClinicalWriter(
    me,
    async (tx) => {
      for (const i of items) {
        const t = byCode.get(i.code)!;
        const row = {
          provision: i.where,
          // Law 2: an override equal to the catalogue's section is no override.
          sectionOverride: i.sectionOverride === t.section ? null : i.sectionOverride,
          hours: i.where === "in_house" ? i.hours : null,
          hoursNote: i.where === "in_house" ? i.hoursNote || null : null,
          statedTurnaroundMinutes: i.where === "not_offered" ? null : i.statedTurnaroundMinutes,
          // The ordering contract reads the words (DX-4); the menu keeps the minutes.
          statedTat: i.where === "not_offered" ? null : minutesWords(i.statedTurnaroundMinutes),
          // Referred: the partner; in-house: where it goes when it is down (5.4).
          referredTo: i.where === "not_offered" ? null : i.referredTo || null,
          confirmedAt: now,
          updatedBy: me.userId,
        };
        await tx
          .insert(diagnosticOfferings)
          .values({ hospitalId: me.hospitalId, kind: "lab", code: i.code, ...row })
          .onConflictDoUpdate({
            target: [
              diagnosticOfferings.hospitalId,
              diagnosticOfferings.kind,
              diagnosticOfferings.code,
            ],
            set: { ...row, updatedAt: now },
          });
      }
    },
    database,
  );
}

/** TM-6, TM-7: adds only the missing tests of the chosen sections; returns the preview counts. */
export async function addFromTemplate(
  me: EmrScope,
  input: { level: Level; sections: readonly string[]; hours: Hours },
  now: Date,
  database?: EmrDb,
) {
  const tests = await loadCatalogueTests(me.hospitalId, true, database);
  const menu = await loadMenuOfferings(me.hospitalId, new Set(tests.map((t) => t.code)), database);
  const chosen = new Set(input.sections);
  const tpl = templateFor(
    input.level,
    tests.filter((t) => chosen.has(t.section as SectionKey)),
  );
  const { add, counts } = applyTemplate(menu, tpl, input.hours);
  if (add.length)
    await asClinicalWriter(
      me,
      (tx) =>
        tx
          .insert(diagnosticOfferings)
          .values(
            add.map((o) => ({
              hospitalId: me.hospitalId,
              kind: "lab",
              code: o.code,
              provision: o.where,
              hours: o.hours,
              hoursNote: o.hoursNote,
              referredTo: o.referredTo,
              confirmedAt: now,
              updatedBy: me.userId,
            })),
          )
          .onConflictDoNothing(),
      database,
    );
  return counts;
}
