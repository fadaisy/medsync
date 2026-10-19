import "server-only";

import type { PlanAnalyser, PlanComponent } from "./qc-plan-form";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { devices, hospitalDepartments, labStockItems, labStockLots } from "@/db/schema";
import { labComponentMeasures } from "@/db/schema/lab-safety";
import { conceptDef } from "@/lib/facts/project/shared";
import { labTests } from "./measures-setup";

/**
 * The lab's components by name (Lab Workspace v2 field kit: pick by name, never a concept id): every component
 * of an active in-house lab test, with its unit (the hospital's current measure, else the concept's canonical
 * unit) and the section of an analyser in service that measures it. Read only.
 */
export async function loadLabComponents(
  tx: EmrTx,
  hospitalId: string,
  opts: { quantityOnly?: boolean } = {},
): Promise<PlanComponent[]> {
  const [tests, measures, analysers] = await Promise.all([
    labTests(tx, hospitalId),
    tx
      .select({
        conceptId: labComponentMeasures.conceptId,
        unit: labComponentMeasures.unitDisplay,
        ucum: labComponentMeasures.unitUcum,
      })
      .from(labComponentMeasures)
      .where(
        and(
          eq(labComponentMeasures.hospitalId, hospitalId),
          isNull(labComponentMeasures.supersededBy),
        ),
      ),
    loadAnalysersInService(tx, hospitalId),
  ]);
  const seen = new Map<string, PlanComponent>();
  for (const t of tests)
    for (const c of t.components ?? []) {
      if (seen.has(c)) continue;
      const def = conceptDef(c);
      if (opts.quantityOnly && def && def.valueType !== "quantity") continue;
      const m = measures.find((x) => x.conceptId === c);
      seen.set(c, {
        conceptId: c,
        name: def?.display ?? t.display,
        unit: m?.unit ?? m?.ucum ?? def?.canonicalUnit ?? null,
        section: analysers.find((a) => a.linkedConcepts.includes(c))?.section ?? null,
      });
    }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Analysers in service (kind analyser, state in use), by name, with their section (prompt 5.11). */
export async function loadAnalysersInService(
  tx: EmrTx,
  hospitalId: string,
): Promise<PlanAnalyser[]> {
  const rows = await tx
    .select({
      id: devices.id,
      model: devices.model,
      section: hospitalDepartments.name,
      linked: devices.linkedConcepts,
    })
    .from(devices)
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, devices.sectionId))
    .where(
      and(
        eq(devices.hospitalId, hospitalId),
        eq(devices.kind, "analyser"),
        eq(devices.state, "in_use"),
      ),
    )
    .orderBy(devices.model);
  return rows.map((r) => ({
    id: r.id,
    model: r.model,
    section: r.section ?? null,
    linkedConcepts: r.linked,
  }));
}

/** Accepted (or in use) lots of control material, the only lots a plan may name (prompt 5.11). */
export async function loadControlLots(tx: EmrTx, hospitalId: string) {
  return tx
    .select({
      id: labStockLots.id,
      lot: labStockLots.lot,
      itemId: labStockLots.itemId,
      item: labStockItems.name,
      useBy: labStockLots.useBy,
    })
    .from(labStockLots)
    .innerJoin(labStockItems, eq(labStockItems.id, labStockLots.itemId))
    .where(
      and(
        eq(labStockLots.hospitalId, hospitalId),
        eq(labStockItems.kind, "control"),
        inArray(labStockLots.state, ["accepted", "in_use"]),
      ),
    )
    .orderBy(labStockItems.name, labStockLots.lot);
}
