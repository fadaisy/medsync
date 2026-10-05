/**
 * What the clerkship shows when the diabetes pack is live (NCD_DM_PACK_LIVE): the pack's result put in the order a
 * clinician acts on it. Pure: no I/O, safe in the browser. Every string is the pack's own (its displays, its neutral
 * text, its 'refer' wording under 16); nothing is composed here except the grouping.
 */
import type { DiabetesPack, PackInput, PackResult } from "@/lib/ncd/pack/types";

import { runProtocol } from "@/lib/ncd/pack/engine";

export type Urgency = "now" | "today" | "soon" | "routine";
export interface ViewItem {
  id: string;
  display: string;
  urgency: Urgency;
  /** Asked because pregnancy (or the weeks since a birth) is not recorded. */
  askFirst?: boolean;
}
export interface PackView {
  packVersion: string;
  /** One interrupt per event: its heading and every folded action (D-DM-41). */
  interrupt: { id: string; title: string; actions: string[] } | null;
  /** Same-day and urgent items not already inside the interrupt. */
  today: ViewItem[];
  flags: { id: string; display: string; severity: "red" | "amber"; action: string }[];
  diagnosis: { id: string; label: string; state: string; isDefault: boolean; verdict: string }[];
  classification: { code: string; display: string }[];
  care: ViewItem[];
  targets: { id: string; display: string }[];
  bands: { id: string; feature: string; display: string; tone: string }[];
  caveats: { id: string; label: string; alternative?: string }[];
  /** Questions that would complete a result, each with what it is for. */
  questions: { feature: string; display: string; count: number }[];
  /** Items held until pregnancy is answered. */
  withheld: number;
  restricted: string[];
}

const SET_LABEL: Record<string, string> = {
  ug_integrated_dm_2026: "Uganda 2026 guideline",
  who_hearts_d_2020: "WHO HEARTS-D 2020",
  ug_ucg_2023: "UCG 2023",
  ada_2026_prediabetes: "Prediabetes (Uganda 2026 bands)",
  who_2006_intermediate: "Intermediate hyperglycaemia (WHO 2006)",
  who_2013_gdm: "Gestational diabetes (WHO 2013)",
  who_2013_diabetes_in_pregnancy: "Diabetes in pregnancy (WHO 2013)",
  consensus_2021_remission: "Remission (2021 consensus)",
};

const URGENCY: Record<string, Urgency> = {
  immediate: "now",
  folded: "now",
  same_day: "today",
  urgent: "soon",
};

export function buildPackView(pack: DiabetesPack, input: PackInput): PackView {
  const r: PackResult = runProtocol(pack, input);
  const rules = new Map(pack.rules.map((x) => [x.id, x]));
  const steps = new Map(pack.management.map((x) => [x.id, x]));
  const flagsById = new Map(pack.therapyFlags.map((x) => [x.id, x]));
  const displayOf = (id: string) => {
    const it = rules.get(id) ?? steps.get(id);
    const key = r.metViaUnknown[id];
    return key && it?.x.unknownDisplays?.[key] ? it.x.unknownDisplays[key]! : (it?.display ?? id);
  };

  const interrupt = r.interrupt
    ? { id: r.interrupt, title: displayOf(r.interrupt), actions: r.interruptActions.slice(1) }
    : null;
  const today: ViewItem[] = [];
  const care: ViewItem[] = [];
  for (const [id, kind] of Object.entries(r.fired)) {
    if (kind === "therapyFlag") continue;
    const u = URGENCY[r.urgency[id] ?? ""] ?? "routine";
    if (u === "now") continue; // inside the interrupt
    const item = { id, display: displayOf(id), urgency: u, askFirst: id in r.metViaUnknown };
    (u === "routine" ? care : today).push(item);
  }
  today.sort((a, b) => Number(b.urgency === "today") - Number(a.urgency === "today"));

  const flags = Object.entries(r.fired)
    .filter(([, k]) => k === "therapyFlag")
    .map(([id]) => {
      const f = flagsById.get(id)!;
      return {
        id,
        display: f.display,
        severity: (f.severity === "red" ? "red" : "amber") as "red" | "amber",
        action: r.actionOverride[id] ?? f.action,
      };
    });

  const sets = [...pack.diagnosis, ...pack.diagnosisPending];
  const diagnosis = sets
    .filter((s) => r.diagnosis[s.id] && r.diagnosis[s.id] !== "not_applicable")
    .map((s) => ({
      id: s.id,
      label: SET_LABEL[s.id] ?? s.id,
      state: r.diagnosis[s.id]!,
      isDefault: s.x.default === true,
      verdict: s.x.verdict ?? "diabetes",
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

  const classification = pack.classifications
    .filter((c) => r.classification[c.code] === "met")
    .map((c) => ({ code: c.code, display: c.display ?? c.code }));

  const targets = r.targets.map((id) => ({
    id,
    display: pack.targets.find((t) => t.id === id)?.display ?? id,
  }));

  const bands = Object.entries(r.bands).flatMap(([id, code]) => {
    const t = pack.interpretation.find((i) => i.id === id);
    const b = t?.bands.find((x) => x.code === code);
    return t && b ? [{ id, feature: t.feature, display: b.display ?? code, tone: b.tone }] : [];
  });

  const caveats = r.caveats.map((id) => {
    const c = pack.validityCaveats.find((x) => x.id === id);
    return { id, label: c?.label ?? id, alternative: c?.alternative };
  });

  const counts = new Map<string, number>();
  for (const feats of Object.values(r.gaps))
    for (const f of feats) counts.set(f, (counts.get(f) ?? 0) + 1);
  const questions = [...counts]
    .map(([feature, count]) => ({
      feature,
      display: pack.features[feature]?.display ?? feature,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    packVersion: pack.pack.version,
    interrupt,
    today,
    flags,
    diagnosis,
    classification,
    care,
    targets,
    bands,
    caveats,
    questions,
    withheld: r.withheld.length,
    restricted: r.restricted,
  };
}
