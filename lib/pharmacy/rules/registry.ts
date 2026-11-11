import type { RegistryRule, RuleParam } from "@/content/pharmacy-rules";
import type { RosterParams } from "@/lib/pharmacy/derive/roster";

import { RULE_REGISTRY } from "@/content/pharmacy-rules";

/**
 * The one rules registry (SETUP-TABS.md §C3): the defaults in content/pharmacy-rules.ts, overridden per hospital by the
 * signed row in pharmacy_rules (0270; its `params.n` from 0273). Every check reads its number from here.
 */

const decimals = (p: RuleParam) => (String(p.step).split(".")[1] ?? "").length;
const unitFor = (n: number, p: RuleParam) =>
  n === 1 && p.unit.endsWith("s") ? p.unit.slice(0, -1) : p.unit;

/** "90 days", "1 day", "25%", "0.5 °C": the prototype's `textOf`. */
export function ruleText(rule: Pick<RegistryRule, "text" | "param">, n?: number) {
  const p = rule.param;
  if (!p) return rule.text;
  const v = n ?? p.n;
  if (p.unit === "UGX") return rule.text.replace("{n}", `UGX ${v.toLocaleString("en-GB")}`);
  return rule.text.replace(
    "{n}",
    `${v.toFixed(decimals(p))}${p.unit === "%" ? "" : " "}${unitFor(v, p)}`,
  );
}

export type ParamError = "nan" | "range" | "same";
export function validateParam(raw: string, p: RuleParam, current: number): ParamError | null {
  const v = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(v)) return "nan";
  if (v < p.min || v > p.max) return "range";
  return v === current ? "same" : null;
}

export interface SignedRule {
  rule_group: string;
  key: string;
  text: string;
  params: { n?: number } | null;
}
export type RuleNumbers = (group: string, key: string) => number;

/** A reader over the signed rows: the signed number when there is one, else the registry default. */
export function ruleNumbers(rows: readonly SignedRule[]): RuleNumbers {
  const signed = new Map(rows.map((r) => [`${r.rule_group}.${r.key}`, r.params?.n]));
  return (group, key) => {
    const n = signed.get(`${group}.${key}`);
    if (typeof n === "number") return n;
    const d = RULE_REGISTRY.find((g) => g.key === group)?.rules.find((r) => r.key === key)?.param
      ?.n;
    if (d === undefined) throw new Error(`rules registry: ${group}.${key} has no number`);
    return d;
  };
}

export const rosterParams = (n: RuleNumbers): RosterParams => ({
  perShift: n("roster", "per_shift"),
  maxWeek: n("roster", "shifts_week"),
  lateMin: n("roster", "late"),
  alertMin: n("roster", "not_in"),
  licWarnDays: n("roster", "licence_warn"),
  leaveAheadDays: n("roster", "leave_notice"),
});
