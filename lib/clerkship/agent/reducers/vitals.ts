import type {
  AgentInput,
  EvidenceItem,
  FeatureIndex,
  Insight,
  VitalsEscalationRule,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { gcsTotal } from "@/lib/clerkship/exam/types";

function metricValue(
  v: AgentInput["examVitals"],
  metric: string,
): { ok: boolean; sbp?: number; dbp?: number; value?: number } {
  switch (metric) {
    case "bp":
      return { ok: v.sbp != null || v.dbp != null, sbp: v.sbp, dbp: v.dbp };
    case "spo2":
      return { ok: v.spo2 != null, value: v.spo2 };
    case "rr":
      return { ok: v.rr != null, value: v.rr };
    case "hr":
      return { ok: v.hr != null, value: v.hr };
    case "temp":
      return { ok: v.tempC != null, value: v.tempC };
    case "glucose":
      return { ok: v.glucose != null, value: v.glucose };
    case "gcs": {
      const t = gcsTotal(v);
      return { ok: t != null, value: t };
    }
    default:
      return { ok: false };
  }
}

function cmp(a: number, op: string, b: number): boolean {
  switch (op) {
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    default:
      return false;
  }
}

function triggered(
  rule: VitalsEscalationRule,
  mv: { sbp?: number; dbp?: number; value?: number },
): boolean {
  const t = rule.trigger;
  if (rule.vital === "bp") {
    const s = mv.sbp != null && t.systolic != null && cmp(mv.sbp, t.comparator, t.systolic);
    const d = mv.dbp != null && t.diastolic != null && cmp(mv.dbp, t.comparator, t.diastolic);
    return Boolean(s || d);
  }
  return mv.value != null && t.value != null && cmp(mv.value, t.comparator, t.value);
}

export function vitalFlags(
  input: AgentInput,
  idx: FeatureIndex,
  rules: VitalsEscalationRule[],
): Insight[] {
  const out: Insight[] = [];
  for (const rule of rules) {
    const mv = metricValue(input.examVitals, rule.trigger.metric);
    if (!mv.ok || !triggered(rule, mv)) continue;

    // An accompanying feature fires if any of its catalog match-tokens is present
    // (falling back to the prose itself when no match-tokens are given).
    const featureEvidence: EvidenceItem[] = [];
    for (const f of rule.escalation.anyOf) {
      const tokens = (f.match && f.match.length ? f.match : [f.feature]).map(normalizeFeature);
      const tok = tokens.find((t) => idx.presentDisplays.has(t));
      if (tok) featureEvidence.push(idx.provenance.get(tok) ?? { label: f.feature, from: "ros" });
    }
    const escalated = featureEvidence.length > 0;
    const tier = escalated ? rule.escalation.tier : rule.baseTier;

    const vitalEvidence: EvidenceItem = {
      label: `${rule.vital.toUpperCase()} recorded`,
      from: "vitals",
    };

    out.push({
      id: `vital:${rule.id}:${escalated ? "esc" : "base"}`,
      kind: "vital-flag",
      severity: tier.severity,
      target: { area: "vitals" },
      message: `${tier.label} — ${tier.ddx.join(", ")}. ${tier.action}`,
      evidence: [vitalEvidence, ...featureEvidence],
      sourceRef: { pack: "vitals-escalation", entryId: rule.id, citation: rule.citation },
    });
  }
  return out;
}
