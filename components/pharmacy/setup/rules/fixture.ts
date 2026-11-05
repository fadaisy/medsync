import type { RulesView } from "@/lib/pharmacy/setup/types";

import { RULE_REGISTRY } from "@/content/pharmacy-rules";
import { ruleText } from "@/lib/pharmacy/derive/setup/rules";

/**
 * A synthetic Rules view for the styleguide and tests (SETUP-TABS §J: sample proposals and history never ship as
 * data). Generic names only. Prescription checks, Ordering and Health and lab supplies are unsigned; one proposal is by `me`, so the
 * second-sign block shows; one rejected history entry.
 */
const ME = "u-a";
const A = "Pharmacist A";
const B = "Pharmacist B";
const C = "Pharmacist C";
const UNSIGNED = ["rx", "ord", "sup"];
const at = (d: string) => `2026-${d}:00+03:00`;

export function rulesFixture(): RulesView {
  const groups = RULE_REGISTRY.map((g) => {
    const signed = !UNSIGNED.includes(g.key);
    return {
      key: g.key,
      title: g.title,
      showsOn: g.showsOn,
      signed,
      signatures: signed
        ? [
            { role: "in_charge" as const, byName: A, at: at("10-12T09:00") },
            { role: "second" as const, byName: B, at: at("10-12T09:30") },
          ]
        : [],
      rules: g.rules.map((r) => {
        const changed = g.key === "roster" && r.key === "shifts_week";
        return {
          key: r.key,
          name: r.name,
          text: ruleText(r),
          appliesTo: r.appliesTo,
          param: r.param,
          n: r.param?.n ?? null,
          source: changed
            ? ("changed" as const)
            : signed
              ? ("signed" as const)
              : ("default" as const),
          changedAt: changed ? at("10-28T11:20") : null,
          isNew: false,
          pendingId:
            g.key === "cold" && r.key === "expiry_warning"
              ? "p1"
              : g.key === "cd" && r.key === "min_gap"
                ? "p2"
                : null,
        };
      }),
    };
  });
  const reg = (g: string, k: string) =>
    RULE_REGISTRY.find((x) => x.key === g)!.rules.find((r) => r.key === k)!;
  const expiry = reg("cold", "expiry_warning");
  const gap = reg("cd", "min_gap");
  const offline = reg("cd", "offline");
  return {
    me: ME,
    groups,
    proposals: [
      {
        id: "p1",
        group: "cold",
        key: "expiry_warning",
        name: expiry.name,
        kind: "change",
        oldText: ruleText(expiry),
        newText: ruleText(expiry, 120),
        reason: "Short-dated stock arrives often; longer notice gives time to move it.",
        proposedBy: "u-c",
        proposedByName: C,
        proposedAt: at("11-02T15:40"),
        appliesTo: expiry.appliesTo,
        roles: ["second"],
        signedBy: ["u-b"],
      },
      {
        id: "p2",
        group: "cd",
        key: "min_gap",
        name: gap.name,
        kind: "change",
        oldText: gap.text,
        newText: `${gap.text} · tramadol inj 6 h`,
        reason: "Tramadol injection is now stocked on a ward.",
        proposedBy: ME,
        proposedByName: A,
        proposedAt: at("11-03T09:12"),
        appliesTo: gap.appliesTo,
        roles: [],
        signedBy: [],
      },
    ],
    history: [
      {
        at: at("10-28T11:20"),
        group: "Roster and people",
        name: reg("roster", "shifts_week").name,
        from: ruleText(reg("roster", "shifts_week"), 5),
        to: ruleText(reg("roster", "shifts_week")),
        kind: "changed",
        proposer: A,
        signers: [A, B],
        rejectNote: null,
        rejectedBy: null,
      },
      {
        at: at("10-15T10:05"),
        group: "Controlled drugs",
        name: offline.name,
        from: ruleText(offline),
        to: ruleText(offline, 6),
        kind: "rejected",
        proposer: A,
        signers: [],
        rejectNote: "Wards lose network for a full day at times",
        rejectedBy: B,
      },
      {
        at: at("10-12T09:30"),
        group: "Controlled drugs",
        name: "Controlled drugs",
        from: null,
        to: null,
        kind: "group_signed",
        proposer: null,
        signers: [A, B],
        rejectNote: null,
        rejectedBy: null,
      },
    ],
    can: { propose: true, signInCharge: true, signSecond: true },
  };
}
