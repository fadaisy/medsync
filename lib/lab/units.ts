import "server-only";

import type { Measure } from "./catalogue";
import type { Flag } from "./flags";
import type { Interpretation, PregnancyContext } from "./interpretation";
import type { Profile } from "./profiles";
import type { RangeVersion, Sex } from "./ranges";
import type { EmrTx } from "@/lib/emr/db";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { ResultValueInput } from "@/lib/emr/write/results";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { CRITICALS_COPY } from "@/content/lab-criticals";
import {
  labComponentMeasures,
  labResultSnapshots,
  labSettings,
  referenceRangeBands,
  referenceRangeVersions,
} from "@/db/schema/lab-safety";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { EmrWriteError } from "@/lib/emr/write/context";
import { conceptDef } from "@/lib/facts/project/shared";
import { entryCheck, parseResultInput } from "./catalogue";
import { loadConfigs, pregnancyAt } from "./catalogue-v2";
import { egfrFor } from "./egfr";
import { labStockLiveFor } from "./feature";
import { changeFlag, computeFlag } from "./flags";
import { resolveInterpretation } from "./interpretation";
import { ageDaysAt, resolveRange } from "./ranges";
import { inForce } from "./signed-config";
import { lotsAtRelease } from "./stock-store";

/**
 * Fixed units, signed ranges and snapshots on the result write (Lab Phase 1 Step 5, §6.1–§6.3; ADRs
 * 0240, 0241). With LAB_UNITS_RANGES on, a laboratory value is refused without its catalogue unit
 * (UN-1), parsed strictly (UN-5), takes the catalogue's unit and is never converted (UN-4,
 * D-LAB1-26), gets its range from the signed set in force at collection or the typed range marked
 * unsigned (RR-1, D-LAB1-09), and its flag computed; a changed flag keeps the computed one and the
 * reason (FL-3). Each value's snapshot is written beside it and never changes (Law 8).
 */

type MeasureRow = typeof labComponentMeasures.$inferSelect;
export type RangeState =
  | "signed"
  | "unsigned"
  | "no_band_for_age"
  | "sex_or_age_missing"
  | "no_signed_range";

const invalid = (m: string) => new EmrWriteError("invalid", m);
const FLAG_TO_LAB: Record<Flag, "L" | "H" | "N"> = { low: "L", high: "H", normal: "N" };

export const toMeasure = (m: MeasureRow): Measure => ({
  id: m.id,
  version: m.version,
  resultType: m.resultType as Measure["resultType"],
  unitUcum: m.unitUcum,
  unitDisplay: m.unitDisplay,
  decimalPlaces: m.decimalPlaces,
  loincCode: m.loincCode,
  entryCheckLow: m.entryCheckLow,
  entryCheckHigh: m.entryCheckHigh,
  methodCode: m.methodCode,
  idmsTraceable: m.idmsTraceable,
});

/** The current version of each component's measurement at this hospital (UN-4: the newest). */
export async function currentMeasures(tx: EmrTx, hospitalId: string, testId: string) {
  const rows = await tx
    .select()
    .from(labComponentMeasures)
    .where(
      and(
        eq(labComponentMeasures.hospitalId, hospitalId),
        eq(labComponentMeasures.testId, testId),
        isNull(labComponentMeasures.supersededBy),
      ),
    );
  return new Map(rows.map((r) => [r.conceptId, r]));
}

/** Every signed or superseded range version for the test, with its bands (RR-2 asks about the past). */
export async function rangeVersions(
  tx: EmrTx,
  hospitalId: string,
  testId: string,
): Promise<RangeVersion[]> {
  const versions = await tx
    .select()
    .from(referenceRangeVersions)
    .where(
      and(
        eq(referenceRangeVersions.hospitalId, hospitalId),
        eq(referenceRangeVersions.testId, testId),
      ),
    );
  const ids = versions.filter((v) => v.status !== "draft").map((v) => v.id);
  const bands = ids.length
    ? await tx
        .select()
        .from(referenceRangeBands)
        .where(inArray(referenceRangeBands.versionId, ids))
        .orderBy(asc(referenceRangeBands.ageFromDays))
    : [];
  return versions.map((v) => ({
    id: v.id,
    hospitalId: v.hospitalId,
    testId: v.testId,
    conceptId: v.conceptId,
    unitUcum: v.unitUcum,
    version: v.version,
    status: v.status as RangeVersion["status"],
    inForceFrom: v.inForceFrom,
    supersededAt: v.supersededAt,
    bands: bands
      .filter((b) => b.versionId === v.id)
      .map((b) => ({
        id: b.id,
        sex: b.sex as Sex | "any",
        ageFromDays: b.ageFromDays,
        ageToDays: b.ageToDays,
        low: b.low,
        high: b.high,
        methodCode: b.methodCode,
        rejected: b.rejectedReason !== null,
      })),
  }));
}

/** RR-5, D-LAB1-22: only "female" and "male" choose a sex band; nothing is guessed. */
export async function patientSexAge(tx: EmrTx, patientUserId: string, at: Date) {
  const [p] = await tx
    .select({ sex: patientProfiles.sex, dob: patientProfiles.dateOfBirth })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, patientUserId));
  const sex: Sex | null = p?.sex === "female" || p?.sex === "male" ? p.sex : null;
  return { sex, ageDays: ageDaysAt(p?.dob ? String(p.dob) : null, at) };
}

interface Pending {
  measure: MeasureRow;
  valueText: string;
  rangeState: RangeState;
  low: string | null;
  high: string | null;
  bandId: string | null;
  versionId: string | null;
  flagComputed: Flag | null;
  flagFinal: Flag | null;
  reason: string | null;
  confirmedEntryCheck: boolean;
  /** Lab Phase 2: what flagged it, kept on the snapshot (DS-9). */
  interpretation: (Interpretation & Record<string, unknown>) | Record<string, unknown> | null;
  labOnly: boolean;
}

export interface FixedUnits {
  values: ResultValueInput[];
  /** After the observations are inserted: one snapshot per quantity value of the new version. */
  snapshot: (
    rows: readonly {
      id: string;
      conceptId?: string | null;
      supersedesId?: string | null;
      valueType?: string | null;
    }[],
    reportId: string,
  ) => Promise<void>;
}

/**
 * Prepares the values of one report version, or refuses them. Null when the test is not a lab test
 * or the measures are not in use here: the write then runs exactly as before (Law 14).
 */
export async function prepareFixedUnits(
  ctx: WriteCtx,
  spec: {
    patientUserId: string;
    testId: string | null;
    values: readonly ResultValueInput[];
    collectedAt: Date;
    /** Lab Phase 2: the v2 catalogue's components, pinned profile and lab-only rows, and the status. */
    v2?: {
      components: string[];
      profile: Profile | null;
      labOnly: Set<string>;
      status: string;
      method?: "lab" | "bedside";
    } | null;
    /** Lab Phase 3 (LU-3, labStock): the device the result was made on, and its result time. */
    lotsAt?: { deviceId: string | null; resultAt: Date | null };
  },
): Promise<FixedUnits | null> {
  const { tx, actor, now } = ctx;
  if (!spec.testId) return null;
  const measures = await currentMeasures(tx, actor.hospitalId, spec.testId);
  const versions = await rangeVersions(tx, actor.hospitalId, spec.testId);
  const { sex, ageDays } = await patientSexAge(tx, spec.patientUserId, spec.collectedAt);
  const pending = new Map<string, Pending>();
  const values: ResultValueInput[] = [];

  // Lab Phase 2 (labCatalogueV2 with the signed addendum): what flags each value, the profile and method in
  // force, lab-only rows, and the calculated eGFR (DS-*, AP-6, ME-1, EG-*). Absent: Phase 1 exactly.
  const v2 = spec.v2 ?? null;
  const configs = v2 ? await loadConfigs(tx, actor.hospitalId) : [];
  const schemeBasis = (c: string) =>
    inForce(configs, "flag_basis", c, spec.collectedAt)?.payload.basis === "scheme";
  const pregnancy: PregnancyContext = spec.values.some((v) => schemeBasis(v.conceptId))
    ? await pregnancyAt(tx, spec.patientUserId, spec.collectedAt)
    : { state: "not_recorded" };

  const process = (v: ResultValueInput, extra: Record<string, unknown> | null = null) => {
    const def = conceptDef(v.conceptId);
    // PC-6: a meter's HI or LO is an answer, not a number: no unit check, no range, no flag.
    if (!def || def.valueType !== "quantity" || (v.code && !v.value)) {
      values.push(v);
      return;
    }
    const m = measures.get(v.conceptId);
    if (!m || m.resultType !== "number" || !m.unitUcum || !m.unitDisplay)
      throw invalid(`${def.display}: ${CRITICALS_COPY.noUnit}`); // UN-1
    const parsed = parseResultInput(v.value ?? "", m.decimalPlaces);
    if (!parsed.ok)
      throw invalid(
        parsed.reason === "too_many_decimals"
          ? `${def.display} takes ${m.decimalPlaces} decimal ${m.decimalPlaces === 1 ? "place" : "places"}.`
          : parsed.reason === "empty"
            ? `${def.display}: type the value.`
            : `${def.display}: type a number. A decimal comma is read as a point.`,
      ); // UN-5
    const check = entryCheck(parsed.value, toMeasure(m));
    if (check === "outside" && !v.entryCheckConfirmed)
      throw invalid(CRITICALS_COPY.entryCheck(parsed.value, m.unitDisplay, def.display)); // UN-6

    const resolved = resolveRange(
      {
        measure: {
          testId: spec.testId!,
          conceptId: v.conceptId,
          resultType: "number",
          unitUcum: m.unitUcum,
        },
        hospitalId: actor.hospitalId,
        sex,
        ageDaysAtCollection: ageDays,
        at: spec.collectedAt,
        methodCode: m.methodCode, // ME-2
      },
      versions,
    );
    const typed =
      v.referenceRange &&
      (v.referenceRange.low !== undefined || v.referenceRange.high !== undefined)
        ? v.referenceRange
        : null;
    let state: RangeState;
    let low: string | null = null;
    let high: string | null = null;
    if (resolved.kind === "band") {
      state = "signed";
      [low, high] = [resolved.band.low, resolved.band.high];
    } else if (resolved.reason === "no_signed_range" && !resolved.conflict && typed) {
      state = "unsigned"; // D-LAB1-09: typed as today, marked unsigned
      [low, high] = [
        typed.low !== undefined ? String(typed.low) : null,
        typed.high !== undefined ? String(typed.high) : null,
      ];
    } else {
      state = resolved.reason === "not_numeric" ? "no_signed_range" : resolved.reason;
    }
    const interpretation = v2
      ? resolveInterpretation({
          conceptId: v.conceptId,
          unitUcum: m.unitUcum,
          value: parsed.value,
          sex,
          ageDaysAtCollection: ageDays,
          pregnancy,
          method: v2.method ?? "lab", // Law 7: a scheme applies to bedside only if it names it
          at: spec.collectedAt,
          reference: resolved,
          configs,
        })
      : null;
    // CD-01: on a scheme basis the category drives the flag (its direction, or in range); otherwise Phase 1.
    const computed =
      interpretation?.basis === "scheme"
        ? interpretation.category?.abnormal
          ? interpretation.category.direction
          : "normal"
        : computeFlag(parsed.value, low === null && high === null ? null : { low, high });
    let final = computed;
    let reason: string | null = null;
    if (v.flagChange) {
      const c = changeFlag({
        computed,
        chosen: v.flagChange.flag,
        reason: v.flagChange.reason,
        actorId: actor.userId,
      });
      if (!c.ok)
        throw invalid(
          c.reason === "reason_required"
            ? `${def.display}: say why the flag is changed.`
            : `${def.display}: that is already the flag.`,
        );
      [final, reason] = [c.flagFinal, c.flagChangeReason];
    }
    pending.set(v.conceptId, {
      measure: m,
      valueText: parsed.value,
      rangeState: state,
      low,
      high,
      bandId: resolved.kind === "band" ? resolved.band.id : null,
      versionId: resolved.kind === "band" ? resolved.version.id : null,
      flagComputed: computed,
      flagFinal: final,
      reason,
      confirmedEntryCheck: check === "outside",
      interpretation: interpretation ? { ...interpretation, ...extra } : null,
      labOnly: v2?.labOnly.has(v.conceptId) ?? false,
    });
    values.push({
      ...v,
      value: parsed.value,
      unit: m.unitUcum,
      unitConfirmed: true,
      noConversion: true,
      referenceRange:
        low === null && high === null
          ? undefined
          : {
              ...(low !== null ? { low: Number(low) } : {}),
              ...(high !== null ? { high: Number(high) } : {}),
              unit: m.unitUcum,
            },
      labInterpretation: final ? FLAG_TO_LAB[final] : undefined,
    });
  };
  for (const v of spec.values) process(v);

  // EG-1..EG-4: eGFR is calculated from the creatinine in this version, never typed; an amended creatinine
  // is a new version, so the eGFR is recalculated with it. When a condition fails, the creatinine's
  // snapshot says which (EG-2).
  const creat = pending.get("obs.creatinine");
  if (
    v2 &&
    creat &&
    v2.components.includes("obs.egfr") &&
    !spec.values.some((v) => v.conceptId === "obs.egfr")
  ) {
    const [settings] = await tx
      .select({ reportEgfr: labSettings.reportEgfr })
      .from(labSettings)
      .where(eq(labSettings.hospitalId, actor.hospitalId));
    const e = egfrFor({
      creatinine: creat.valueText,
      unitUcum: creat.measure.unitUcum!,
      // Calculated with the creatinine it comes from and released with it: a preliminary creatinine
      // carries a preliminary eGFR, and release carries both forward unchanged (EG-1, EG-4).
      released: true,
      ageYears: ageDays === null ? null : Math.floor(ageDays / 365.25),
      sex,
      idmsTraceable: creat.measure.idmsTraceable,
      reportEgfr: settings?.reportEgfr ?? false,
      configs,
      at: spec.collectedAt,
    });
    const egfrMeasure = measures.get("obs.egfr");
    if (e.ok && egfrMeasure?.unitUcum)
      process(
        { conceptId: "obs.egfr", value: e.value },
        {
          calculatedFrom: {
            creatinine: creat.valueText,
            unit: creat.measure.unitUcum,
            refVersion: e.refVersion,
          },
        },
      );
    else
      creat.interpretation = {
        ...(creat.interpretation ?? {}),
        egfr: e.ok ? "no_unit_for_egfr" : e.reason,
      } as Pending["interpretation"];
  }

  const entered = new Set(pending.keys());
  return {
    values,
    snapshot: async (rows, reportId) => {
      const out: (typeof labResultSnapshots.$inferInsert)[] = [];
      // Law 4, LU-3: the lots in use at the result time, with the stock ledger on.
      const lots =
        spec.lotsAt && labStockLiveFor(actor.hospitalId)
          ? await lotsAtRelease(
              tx,
              actor.hospitalId,
              spec.lotsAt.deviceId,
              [...pending.keys()],
              spec.lotsAt.resultAt,
            )
          : null;
      const carried = rows.filter(
        (r) =>
          r.conceptId && !entered.has(r.conceptId) && r.supersedesId && r.valueType === "quantity",
      );
      const prior = carried.length
        ? await tx
            .select()
            .from(labResultSnapshots)
            .where(
              inArray(
                labResultSnapshots.observationId,
                carried.map((r) => r.supersedesId!),
              ),
            )
        : [];
      for (const r of rows) {
        const p = r.conceptId ? pending.get(r.conceptId) : undefined;
        if (p) {
          out.push({
            observationId: r.id,
            reportId,
            hospitalId: actor.hospitalId,
            patientUserId: spec.patientUserId,
            measureId: p.measure.id,
            measureVersion: p.measure.version,
            valueDecimal: p.valueText,
            valueText: p.valueText,
            unitUcum: p.measure.unitUcum!,
            unitDisplay: p.measure.unitDisplay!,
            rangeState: p.rangeState,
            rangeLow: p.low,
            rangeHigh: p.high,
            rangeBandId: p.bandId,
            rangeVersionId: p.versionId,
            flagComputed: p.flagComputed,
            flagFinal: p.flagFinal,
            flagChangeReason: p.reason,
            flagChangedBy: p.reason ? actor.userId : null,
            entryCheckConfirmedBy: p.confirmedEntryCheck ? actor.userId : null,
            createdAt: now,
            interpretation: p.interpretation,
            profileId: spec.v2?.profile?.id ?? null,
            methodCode: p.measure.methodCode,
            labOnly: p.labOnly,
            lots: lots?.get(r.conceptId!) ?? null,
          });
          continue;
        }
        // A value carried into the new version keeps the snapshot it was entered with (Law 8).
        const before = prior.find((s) => s.observationId === r.supersedesId);
        if (before) out.push({ ...before, observationId: r.id, reportId, createdAt: now });
      }
      if (out.length) await tx.insert(labResultSnapshots).values(out);
    },
  };
}
