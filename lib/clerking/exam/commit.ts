import type { ExamCatalogue, ExamItem } from "./catalogue";
import type { ExamContext } from "./context";
import type { AttrValue, ExamDraft } from "./payload";

import tokenMap from "@/data/clerking/exam-token-map.v1.json";
import { conceptDef } from "@/lib/facts/project/shared";
import { readAttr } from "./answers";
import { dehydration, footInfection } from "./classifiers";
import { amts, gcsTotal, mrcNumber, orientation } from "./scores";

/**
 * What signing charts from the examination (PROMPT-CLERKING-EXAM-V2 §8; CFC v1.3, signed
 * 2026-09-28). Table-driven from `data/clerking/exam-token-map.v1.json` and the concept's own
 * value type: a presence finding is present or absent; a coded state observation is its first
 * answer when negative ("normal", "equal") and its second when positive, with the catalogue
 * option ids as qualifiers; a choice writes its option id. Option-level findings are written only
 * when ticked (never inferred absent). The blocks (GCS parts, AMTS, orientation, the grids) and
 * classifier results (GTFCC, foot infection) are mapped here. One fact per concept and side: a
 * finding recorded in two places is present if any says so. Vital signs are not here: they are
 * written at once, as a set. Pure.
 */

export interface ExamCommitLine {
  conceptId: string;
  value:
    | { type: "presence"; presence: "present" | "absent" }
    | { type: "coded"; code: string }
    | { type: "quantity"; value: number; unit: string };
  context: Record<string, unknown>;
  restricted: boolean;
}

const MAP = tokenMap as {
  items: Record<string, string>;
  options: { item: string; attribute: string; option: string; concept: string }[];
  /** EC-7: an attribute whose chosen option is the coded value (`map` renames it to the
   *  concept's answer). */
  values?: { item: string; attribute: string; concept: string; map?: Record<string, string> }[];
};
/** Items written elsewhere: blocks (below) and vital-sign sets. */
const NOT_HERE = new Set(["ex.general.consciousness", "ex.nervous.amts", "ex.general.hydration"]);
const LATERALITY: Record<string, string> = {
  left: "left",
  right: "right",
  both: "bilateral",
  R: "right",
  L: "left",
};
const restrictedClass = (s?: string) => !!s && s !== "standard";
const has = (v: AttrValue | undefined, o: string) => (Array.isArray(v) ? v.includes(o) : v === o);

export function examCommitLines(
  ecat: ExamCatalogue,
  exam: ExamDraft,
  /** For the classifier results GTFCC and foot infection (they read the history and the vitals). */
  x: ExamContext | null,
): { lines: ExamCommitLine[]; unmapped: number } {
  const catalogue = { id: ecat.data.id, version: ecat.version };
  const merged = new Map<string, ExamCommitLine>();
  const written = new Set<string>();
  const put = (l: ExamCommitLine, item: string) => {
    written.add(item);
    const key = `${l.conceptId}|${l.context.laterality ?? ""}|${JSON.stringify(l.context.site ?? l.context.movement ?? l.context.reflex ?? l.context.artery ?? "")}`;
    const cur = merged.get(key);
    // Present wins over absent (a finding recorded in two places); otherwise the first stands.
    if (
      !cur ||
      (cur.value.type === "presence" &&
        l.value.type === "presence" &&
        l.value.presence === "present")
    )
      merged.set(key, cur ? { ...l, restricted: cur.restricted || l.restricted } : l);
  };
  const ctx = (item: string, extra: Record<string, unknown> = {}) => ({
    elicitedBy: "examination",
    catalogue,
    catalogueItem: item,
    ...extra,
  });
  const qualifiers = (attrs?: Record<string, AttrValue>) =>
    attrs && Object.keys(attrs).length ? { qualifiers: attrs } : {};
  const sideOf = (attrs?: Record<string, AttrValue>) => LATERALITY[String(attrs?.side ?? "")];

  /* Items */
  for (const [itemId, conceptId] of Object.entries(MAP.items)) {
    if (NOT_HERE.has(itemId)) continue;
    const item = ecat.item(itemId);
    const e = exam.entries[itemId];
    const def = conceptDef(conceptId);
    if (!item || !e || e.state === "not_examined" || !def) continue;
    const restricted = restrictedClass(item.sensitivity);
    const needsSide = def.contextRequired.includes("laterality");
    if (def.valueType === "presence") {
      const side = e.state === "negative" ? "bilateral" : sideOf(e.attrs);
      if (needsSide && !side) continue; // a positive finding needs its side (CFC laterality)
      put(
        {
          conceptId,
          value: { type: "presence", presence: e.state === "positive" ? "present" : "absent" },
          context: ctx(itemId, {
            ...(needsSide ? { laterality: side } : {}),
            ...qualifiers(e.attrs),
          }),
          restricted,
        },
        itemId,
      );
    } else if ((def.valueType === "coded" || def.valueType === "ordinal") && def.answers) {
      const code = codedValue(item, e, def.answers);
      if (!code) continue;
      if (conceptId === "exam.monofilament" || conceptId === "exam.vibration_128hz") {
        for (const l of feetSensation(itemId, conceptId, e, ctx)) put({ ...l, restricted }, itemId);
        continue;
      }
      const side = sideOf(e.attrs);
      if (needsSide && !side) continue;
      put(
        {
          conceptId,
          value: { type: "coded", code },
          context: ctx(itemId, { ...(side ? { laterality: side } : {}), ...qualifiers(e.attrs) }),
          restricted,
        },
        itemId,
      );
    } else if (def.valueType === "quantity") {
      const n = itemId === "ex.general.nutrition" ? e.attrs?.muac : e.attrs?.time;
      if (typeof n !== "number") continue;
      put(
        {
          conceptId,
          value: { type: "quantity", value: n, unit: def.canonicalUnit ?? "" },
          context: ctx(itemId, e.attrs?.site ? { site: e.attrs.site } : {}),
          restricted,
        },
        itemId,
      );
    }
  }

  /* Option-level findings: present only when ticked (own, mirrored or shared). */
  for (const o of MAP.options) {
    if (MAP.items[o.item] === o.concept) continue; // rides as a qualifier on the item's own fact
    const def = conceptDef(o.concept);
    if (!def || !has(readAttr(ecat, exam, o.item, o.attribute), o.option)) continue;
    const item = ecat.item(o.item);
    const opt = ecat.attribute(o.item, o.attribute)?.options?.find((p) => p.id === o.option);
    const restricted = restrictedClass(item?.sensitivity) || restrictedClass(opt?.sensitivity);
    const side = sideOf(exam.entries[o.item]?.attrs);
    if (def.contextRequired.includes("laterality") && !side) continue;
    if (def.valueType === "presence")
      put(
        {
          conceptId: o.concept,
          value: { type: "presence", presence: "present" },
          context: ctx(o.item, {
            catalogueOption: o.option,
            ...(side ? { laterality: side } : {}),
          }),
          restricted,
        },
        o.item,
      );
    else if (o.concept === "obs.pain_score" || o.concept === "obs.rass") continue; // below, with their values
  }

  /* Values from an option (EC-7: the retinopathy grade, the macula, the view). Written only when
   * the concept exists and has that answer; a hidden attribute was pruned, so an undilated look
   * commits no grade. */
  for (const o of MAP.values ?? []) {
    const def = conceptDef(o.concept);
    const v = readAttr(ecat, exam, o.item, o.attribute);
    const e = exam.entries[o.item];
    if (!def || typeof v !== "string" || !e || e.state === "not_examined") continue;
    const code = o.map?.[v] ?? v;
    if (!def.answers?.includes(code)) continue;
    // ponytail: a concept that needs more context than the item gives (the grade's laterality,
    // method and scale; the desk grades the worse eye) stays in the note until the form asks it.
    if (def.contextRequired.some((k) => k !== "elicitedBy")) continue;
    put(
      {
        conceptId: o.concept,
        value: { type: "coded", code },
        context: ctx(o.item, { catalogueAttribute: o.attribute }),
        restricted: restrictedClass(ecat.item(o.item)?.sensitivity),
      },
      o.item,
    );
  }

  /* Distress: pain score and RASS */
  const distress = exam.entries["ex.general.distress"];
  if (typeof distress?.attrs?.pain_nrs === "number")
    put(
      {
        conceptId: "obs.pain_score",
        value: { type: "quantity", value: distress.attrs.pain_nrs, unit: "{score}" },
        context: ctx("ex.general.distress", { scale: "nrs_0_10" }),
        restricted: false,
      },
      "ex.general.distress",
    );
  const rass = distress?.attrs?.rass;
  if (typeof rass === "string" && conceptDef("obs.rass"))
    put(
      {
        conceptId: "obs.rass",
        value: { type: "coded", code: `+${rass.replace("plus_", "")}` },
        context: ctx("ex.general.distress"),
        restricted: false,
      },
      "ex.general.distress",
    );

  /* Consciousness block: GCS parts (NT written as not testable, never 1) and orientation */
  const c = exam.blocks.consciousness;
  if (c?.method === "gcs")
    for (const [k, id] of [
      ["E", "obs.gcs_eye"],
      ["V", "obs.gcs_verbal"],
      ["M", "obs.gcs_motor"],
    ] as const) {
      const code = c.nt?.[k] ? "not_testable" : c[k] !== undefined ? String(c[k]) : null;
      if (code && conceptDef(id))
        put(
          {
            conceptId: id,
            value: { type: "coded", code },
            context: ctx(
              "ex.general.consciousness",
              c.nt?.[k] ? { notTestableReason: c.nt[k] } : {},
            ),
            restricted: false,
          },
          "ex.general.consciousness",
        );
    }
  const o = orientation(c);
  if (o.full !== null && conceptDef("exam.orientation"))
    put(
      {
        conceptId: "exam.orientation",
        value: { type: "coded", code: o.full ? "oriented" : "disoriented" },
        context: ctx(
          "ex.general.consciousness",
          o.not.length ? { qualifiers: { not: o.not } } : {},
        ),
        restricted: false,
      },
      "ex.general.consciousness",
    );
  void gcsTotal; // the total is written with the vital-sign set

  /* AMTS */
  const a = amts(exam);
  if (a?.complete && conceptDef("obs.amts"))
    put(
      {
        conceptId: "obs.amts",
        value: { type: "quantity", value: a.score, unit: "{score}" },
        context: ctx("ex.nervous.amts"),
        restricted: false,
      },
      "ex.nervous.amts",
    );

  /* Motor grids */
  for (const [movement, cell] of Object.entries(exam.blocks.power ?? {}))
    for (const s of ["R", "L"] as const) {
      const n = mrcNumber(cell[s]);
      if (n === null) continue;
      put(
        {
          conceptId: "exam.muscle_power",
          value: { type: "coded", code: String(n) },
          context: ctx("ex.nervous.motor_grids", {
            laterality: LATERALITY[s],
            movement,
            ...(cell[s]!.length > 1 ? { modifier: cell[s] } : {}),
          }),
          restricted: false,
        },
        "ex.nervous.motor_grids",
      );
    }
  for (const [reflex, cell] of Object.entries(exam.blocks.reflexes ?? {}))
    for (const s of ["R", "L"] as const) {
      const g = cell[s];
      if (g === undefined) continue;
      const ankle = reflex === "Ankle";
      const code = ankle ? (g === 0 ? "absent" : g === 1 ? "reduced" : "present") : String(g);
      put(
        {
          conceptId: ankle ? "exam.ankle_reflex" : "exam.tendon_reflex",
          value: { type: "coded", code },
          context: ctx("ex.nervous.motor_grids", {
            laterality: LATERALITY[s],
            reflex,
            ...(ankle ? { grade: g } : {}),
          }),
          restricted: false,
        },
        "ex.nervous.motor_grids",
      );
    }
  for (const s of ["R", "L"] as const) {
    const pl = exam.blocks.plantars?.[s];
    if (pl)
      put(
        {
          conceptId: "exam.plantar_response",
          value: { type: "coded", code: pl },
          context: ctx("ex.nervous.motor_grids", { laterality: LATERALITY[s] }),
          restricted: false,
        },
        "ex.nervous.motor_grids",
      );
  }

  /* Pulses grid */
  for (const [artery, cell] of Object.entries(exam.blocks.pulses ?? {}))
    for (const s of ["R", "L"] as const) {
      const v = cell[s];
      if (!v) continue;
      const pedal = artery === "Dorsalis pedis" || artery === "Posterior tibial";
      put(
        {
          conceptId: pedal ? "exam.pedal_pulses" : "exam.peripheral_pulse",
          value: { type: "coded", code: pedal && v === "bounding" ? "present" : v },
          context: ctx("ex.cardiovascular.pulses_grid", {
            laterality: LATERALITY[s],
            artery,
            ...(v === "bounding" ? { character: "bounding" } : {}),
          }),
          restricted: false,
        },
        "ex.cardiovascular.pulses_grid",
      );
    }

  /* Peak flow (panel) */
  const pef = exam.panels?.peakFlow?.best;
  if (typeof pef === "number" && conceptDef("obs.peak_flow"))
    put(
      {
        conceptId: "obs.peak_flow",
        value: { type: "quantity", value: pef, unit: "L/min" },
        context: ctx(
          "vs.pef",
          exam.panels?.peakFlow?.reference
            ? {
                reference: exam.panels.peakFlow.reference,
                referenceKind: exam.panels.peakFlow.referenceKind,
              }
            : {},
        ),
        restricted: false,
      },
      "vs.pef",
    );

  /* Classifier results: GTFCC (none, some, severe only), foot infection (grade 2 or more) */
  if (exam.entries["ex.general.hydration"] && x) {
    const g = dehydration(x);
    if (
      g.status === "result" &&
      (g.result === "none" || g.result === "some" || g.result === "severe")
    )
      put(
        {
          conceptId: "sign.dehydration",
          value: { type: "coded", code: g.result },
          context: ctx("ex.general.hydration", {
            classifier: "dehydration_gtfcc",
            inputs: g.inputs,
            ruleVersion: ecat.version,
          }),
          restricted: false,
        },
        "ex.general.hydration",
      );
  }
  const ulcer = exam.entries["ex.feet.ulcer"];
  const ulcerSide = sideOf(ulcer?.attrs);
  if (ulcer?.state === "positive" && ulcerSide && x) {
    const dfi = footInfection(x);
    if (dfi.status === "result" && Number(dfi.result) >= 2)
      put(
        {
          conceptId: "sign.foot_infection",
          value: { type: "presence", presence: "present" },
          context: ctx("ex.feet.ulcer", {
            laterality: ulcerSide,
            classifier: "dfi_iwgdf_idsa",
            grade: dfi.result,
            inputs: dfi.inputs,
            ruleVersion: ecat.version,
          }),
          restricted: false,
        },
        "ex.feet.ulcer",
      );
  }

  const lines = [...merged.values()];
  // Recorded items this commit could not chart (kept in the signed note with their ids).
  const unmapped = Object.entries(exam.entries).filter(
    ([id, e]) =>
      e.state !== "not_examined" && !written.has(id) && ecat.item(id)?.response.type !== "link",
  ).length;
  return { lines, unmapped };
}

/** A coded state or choice observation: the choice's id; a state's first answer when negative
 *  ("normal", "equal") and its second when positive. */
function codedValue(
  item: ExamItem,
  e: { state: string; choice?: string },
  answers: readonly string[],
): string | null {
  if (item.response.type === "choice")
    return e.choice && answers.includes(e.choice) ? e.choice : null;
  if (answers.length < 2) return null;
  return e.state === "positive" ? answers[1]! : answers[0]!;
}

/** Monofilament and 128 Hz vibration are per foot. */
function feetSensation(
  itemId: string,
  conceptId: string,
  e: { state: string; attrs?: Record<string, AttrValue> },
  ctx: (item: string, extra?: Record<string, unknown>) => Record<string, unknown>,
): Omit<ExamCommitLine, "restricted">[] {
  const out: Omit<ExamCommitLine, "restricted">[] = [];
  for (const foot of ["left", "right"] as const) {
    if (conceptId === "exam.monofilament") {
      const n = e.state === "negative" ? 0 : e.attrs?.[`sites_not_felt_${foot}`];
      if (typeof n !== "number") continue;
      out.push({
        conceptId,
        value: { type: "coded", code: n > 0 ? "abnormal" : "normal" },
        context: ctx(itemId, { laterality: foot, sitesTested: 3, sitesInsensate: n }),
      });
    } else {
      const side = e.attrs?.side;
      const lost = e.state === "positive" && (side === foot || side === "both");
      if (e.state === "positive" && !lost && side === undefined) continue;
      out.push({
        conceptId,
        value: { type: "coded", code: lost ? "absent" : "normal" },
        context: ctx(itemId, { laterality: foot }),
      });
    }
  }
  return out;
}
