import "server-only";

import type { MeasureDraft } from "./catalogue";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, isNull } from "drizzle-orm";

import { loincCodes } from "@/db/schema/clinical-codes";
import { labComponentMeasures, ucumUnits } from "@/db/schema/lab-safety";
import { EmrWriteError } from "@/lib/emr/write/context";
import { conceptDef } from "@/lib/facts/project/shared";
import { componentsFor } from "./catalogue-v2";
import { labTests, saveMeasure } from "./measures-setup";
import { researchText } from "./research-store";

/**
 * Fill the test catalogue from the catalogue research (owner request, 18 Oct 2026). For every component of every lab
 * test here that has no measure yet: the research's canonical UCUM unit, its decimals, and its LOINC code where the
 * research verified it against loinc.org and LOINC lists it ACTIVE. Every row goes through `saveMeasure`, so the unit
 * must be in MedSync's UCUM table and the LOINC code in the imported table; anything else is skipped and reported,
 * never forced. Existing measures are never changed. The laboratory lead presses the button: it is their act.
 */

type ResearchConcept = {
  id: string;
  valueType: "quantity" | "coded" | "ordinal" | "text";
  canonicalUnit: string | null;
  decimals: number | null;
  loinc: { code?: string; status?: string; loincStatus?: string } | null;
};

/** The research spells three units differently from MedSync's UCUM table (0107). */
const UNIT_ALIASES: Record<string, string> = {
  "copies/mL": "{copies}/mL",
  "log10 copies/mL": "{log_copies}/mL",
  count: "{count}",
};

export interface ResearchMeasure {
  resultType: "number" | "coded" | "text";
  unit: string | null;
  decimals: number | null;
  loinc: string | null;
}

/** Pure: the research's measurement facts per component, as MedSync would store them. */
export function researchMeasures(text: string): Map<string, ResearchMeasure> {
  const concepts = (JSON.parse(text) as { concepts: ResearchConcept[] }).concepts;
  return new Map(
    concepts.map((c) => {
      const verified =
        c.loinc?.code && c.loinc.status === "verified" && c.loinc.loincStatus === "ACTIVE"
          ? c.loinc.code
          : null;
      const resultType =
        c.valueType === "quantity" ? "number" : c.valueType === "text" ? "text" : "coded";
      return [
        c.id,
        {
          resultType,
          // MedSync's own clinical catalogue wins where it names the unit (decision support reads values in it);
          // otherwise the research's canonical unit, in MedSync's spelling.
          unit:
            resultType !== "number"
              ? null
              : (conceptDef(c.id)?.canonicalUnit ??
                (c.canonicalUnit ? (UNIT_ALIASES[c.canonicalUnit] ?? c.canonicalUnit) : null)),
          decimals: resultType === "number" ? (c.decimals ?? null) : null,
          loinc: verified,
        },
      ] as const;
    }),
  );
}

export interface FillReport {
  filled: number;
  kept: number;
  withoutLoinc: number;
  notInResearch: number;
  skipped: { test: string; concept: string; reason: string }[];
}

export async function fillMeasuresFromResearch(
  tx: EmrTx,
  actor: { userId: string; hospitalId: string },
  now: Date,
  text = researchText(),
): Promise<FillReport> {
  const research = researchMeasures(text);
  const [units, loincs, tests] = await Promise.all([
    tx.select({ code: ucumUnits.code, display: ucumUnits.display }).from(ucumUnits),
    tx.select({ code: loincCodes.code }).from(loincCodes),
    labTests(tx, actor.hospitalId),
  ]);
  const unitDisplay = new Map(units.map((u) => [u.code, u.display]));
  const loincSet = new Set(loincs.map((l) => l.code));
  const report: FillReport = { filled: 0, kept: 0, withoutLoinc: 0, notInResearch: 0, skipped: [] };
  for (const t of tests) {
    const { components } = await componentsFor(
      tx,
      actor.hospitalId,
      { code: t.code, components: t.components ?? [] },
      null,
    );
    for (const concept of components) {
      const r = research.get(concept);
      if (!r) {
        report.notInResearch += 1;
        continue;
      }
      const [current] = await tx
        .select({ id: labComponentMeasures.id })
        .from(labComponentMeasures)
        .where(
          and(
            eq(labComponentMeasures.hospitalId, actor.hospitalId),
            eq(labComponentMeasures.testId, t.id),
            eq(labComponentMeasures.conceptId, concept),
            isNull(labComponentMeasures.supersededBy),
          ),
        );
      if (current) {
        report.kept += 1;
        continue;
      }
      if (r.resultType === "number" && (!r.unit || !unitDisplay.has(r.unit))) {
        report.skipped.push({
          test: t.display,
          concept,
          reason: `unit ${r.unit ?? "missing"} is not in MedSync's unit list`,
        });
        continue;
      }
      const loinc = r.loinc && loincSet.has(r.loinc) ? r.loinc : null;
      const draft: MeasureDraft = {
        resultType: r.resultType,
        unitUcum: r.unit,
        unitDisplay: r.unit ? (unitDisplay.get(r.unit) ?? r.unit) : null,
        decimalPlaces: r.decimals,
        loincCode: loinc,
        entryCheckLow: null,
        entryCheckHigh: null,
      };
      try {
        // A savepoint per component, so one refusal never undoes the others.
        await tx.transaction((sp) =>
          saveMeasure(sp as EmrTx, actor, { testId: t.id, conceptId: concept, draft }, now),
        );
        report.filled += 1;
        if (!loinc) report.withoutLoinc += 1;
      } catch (e) {
        if (!(e instanceof EmrWriteError)) throw e;
        report.skipped.push({ test: t.display, concept, reason: e.message });
      }
    }
  }
  return report;
}
