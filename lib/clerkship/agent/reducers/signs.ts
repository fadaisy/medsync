import type {
  AgentInput,
  DependencyRule,
  EvidenceItem,
  ExcludeItem,
  ExpectItem,
  FeatureIndex,
  IncompatibilityRule,
  Insight,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

/**
 * Does the rule's trigger fire? Matches on `when.match` tokens (the catalog /
 * structured-exam tokens), falling back to the prose `when.sign` only when no
 * match array is given. An explicit empty `match: []` never fires — used to keep
 * a sourced rule on the record without surfacing it (e.g. incompatibilities that
 * are already enforced by a single-select exam field). Returns the matched
 * finding's provenance, or null when nothing fired.
 */
function whenHit(idx: FeatureIndex, when: { sign: string; match?: string[] }): EvidenceItem | null {
  const tokens = (when.match ?? [when.sign]).map(normalizeFeature);
  const tok = tokens.find((t) => idx.presentDisplays.has(t));
  if (!tok) return null;
  return idx.provenance.get(tok) ?? { label: when.sign, from: "exam" };
}

export function mustCheckSigns(
  _input: AgentInput,
  idx: FeatureIndex,
  rules: DependencyRule[],
): Insight[] {
  const out: Insight[] = [];
  for (const r of rules) {
    const hit = whenHit(idx, r.when);
    if (!hit) continue;
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
      evidence: [hit],
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
    const hit = whenHit(idx, r.when);
    if (!hit) continue;
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
      evidence: [hit],
      excludes,
      sourceRef: { pack: "sign-incompatibilities", entryId: r.id, citation: r.citation },
    });
  }
  return out;
}
