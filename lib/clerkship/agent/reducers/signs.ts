import type {
  AgentInput,
  DependencyRule,
  ExcludeItem,
  ExpectItem,
  FeatureIndex,
  IncompatibilityRule,
  Insight,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

export function mustCheckSigns(
  _input: AgentInput,
  idx: FeatureIndex,
  rules: DependencyRule[],
): Insight[] {
  const out: Insight[] = [];
  for (const r of rules) {
    if (!idx.presentDisplays.has(normalizeFeature(r.when.sign))) continue;
    const expects: ExpectItem[] = r.mustCheck.map((c) => ({
      label: c.sign,
      area: c.area,
      why: c.why,
    }));
    out.push({
      id: `mustcheck:${r.id}`,
      kind: "must-check",
      severity: "amber",
      target: { area: r.when.area, field: r.when.sign },
      message: `${r.when.sign} present — also characterise:`,
      evidence: [
        idx.provenance.get(normalizeFeature(r.when.sign)) ?? { label: r.when.sign, from: "exam" },
      ],
      expects,
      sourceRef: { pack: "sign-dependencies", entryId: r.id, citation: r.citation },
    });
  }
  return out;
}

export function incompatibleSigns(
  _input: AgentInput,
  idx: FeatureIndex,
  rules: IncompatibilityRule[],
): Insight[] {
  const out: Insight[] = [];
  for (const r of rules) {
    if (!idx.presentDisplays.has(normalizeFeature(r.when.sign))) continue;
    const excludes: ExcludeItem[] = r.implausible.map((x) => ({
      label: x.sign,
      area: x.area,
      code: x.sign,
      reason: r.reason,
    }));
    out.push({
      id: `incompat:${r.id}`,
      kind: "incompatible",
      severity: "info",
      target: { area: r.when.area, field: r.when.sign },
      message: r.reason,
      evidence: [
        idx.provenance.get(normalizeFeature(r.when.sign)) ?? { label: r.when.sign, from: "exam" },
      ],
      excludes,
      sourceRef: { pack: "sign-incompatibilities", entryId: r.id, citation: r.citation },
    });
  }
  return out;
}
