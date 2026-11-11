"use client";

import type { Issue } from "./shared";
import type { RuleItem } from "@/components/pharmacy/medicines/rules";
import type { PlacesView, RuleGroupRow, RulesView } from "@/lib/pharmacy/setup/types";
import Link from "next/link";
import { useState } from "react";

import { proposeRegistryRuleAction } from "@/app/pharmacy/setup/roster-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { RuleLine } from "@/components/pharmacy/medicines/rules";
import { linkBtn, newKey } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { MEDICINES } from "@/content/pharmacy-medicines";
import { PL } from "@/content/pharmacy-setup-places";
import { cn } from "@/lib/utils";
import { issuesOf } from "./shared";

const D = MEDICINES.rulesDlg;
/** The badges in prototype order, each one registry group. "Opening and closing" has no registry group: left out. */
const KEYS = ["ho", "cold", "price", "ord"] as const;
type Key = (typeof KEYS)[number];

/** A registry group's lines with their pending proposals, as RuleLine takes them. */
function itemsOf(g: RuleGroupRow, rules: RulesView) {
  return g.rules.map((r) => {
    const p = rules.proposals.find((x) => x.group === g.key && x.key === r.key) ?? null;
    // ProposalRow carries signer ids, not names: say "on record" for a role that has signed.
    const signed = (role: "in_charge" | "second") =>
      p?.roles.includes(role) ? PL.signerOnRecord : null;
    const item: RuleItem = {
      group: g.key,
      key: r.key,
      text: r.text,
      label: r.name,
      productId: null,
      proposal: p
        ? {
            id: p.id,
            group: p.group,
            key: p.key,
            newText: p.newText,
            reason: p.reason,
            productId: null,
            inCharge: signed("in_charge"),
            second: signed("second"),
          }
        : null,
    };
    return { item, numeric: r.param && r.n !== null ? String(r.n) : undefined };
  });
}

/** §B1: `Rules`, then one pill per group with its issue chip; each opens the group's rules (§C). */
export function PlaceRuleBadges({
  view,
  rules,
  toast,
}: {
  view: PlacesView;
  rules: RulesView | null;
  toast: (m: string) => void;
}) {
  const [openKey, setOpenKey] = useState<Key | null>(null);
  if (!rules) return null;
  const issues = issuesOf(view);
  const group = rules.groups.find((g) => g.key === openKey) ?? null;
  const issue = openKey && openKey !== "price" ? issues[openKey] : undefined;
  return (
    <>
      <div role="group" aria-label={PL.rulesAria} className="flex flex-wrap items-center gap-1.5">
        <span className="text-ink-600 mr-0.5 text-[12px] font-semibold">{PL.rules}</span>
        {KEYS.map((k) => {
          const g = rules.groups.find((x) => x.key === k);
          if (!g) return null;
          const is: Issue | undefined = k === "price" ? undefined : issues[k];
          const pending = g.rules.filter((r) => r.pendingId).length;
          const scope = PL.badges[k].scope;
          return (
            <button
              key={k}
              type="button"
              aria-haspopup="dialog"
              aria-label={PL.badgeAria(scope, g.rules.length, is?.t ?? null, pending)}
              onClick={() => setOpenKey(k)}
              className="bg-tide-sunken text-foreground hover:bg-ink-200 focus-visible:shadow-focus inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap outline-none"
            >
              {scope} <span className="text-ink-600 font-medium">· {g.rules.length}</span>
              {is ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px]",
                    is.red
                      ? "bg-status-critical-bg text-status-critical-fg-aa"
                      : "bg-status-caution-bg text-status-caution-fg-aa",
                  )}
                >
                  {is.t}
                </span>
              ) : null}
              {pending ? (
                <span className="bg-status-caution-bg text-status-caution-fg-aa rounded-full px-1.5 text-[11px]">
                  {PL.toSign(pending)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <EditorDialog open={!!group} onOpenChange={(o) => !o && setOpenKey(null)} width="medium">
        {group && openKey ? (
          <>
            <div className="flex items-start justify-between gap-3 px-6 pt-5">
              <div className="flex flex-col gap-1">
                <DialogTitle>{D.title(PL.badges[openKey].scope)}</DialogTitle>
                <span className="text-body-s text-ink-600">{PL.badges[openKey].affects}</span>
              </div>
              <LabButton variant="text" onClick={() => setOpenKey(null)}>
                {D.close}
              </LabButton>
            </div>
            <ul className="divide-border flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-6 py-3 [&>li]:py-2.5">
              {itemsOf(group, rules).map(({ item, numeric }) => (
                <RuleLine
                  key={item.key}
                  item={item}
                  can={{ ...rules.can, edit: false, levels: false, review: false, request: false }}
                  toast={toast}
                  numeric={numeric}
                  propose={(value, why) =>
                    proposeRegistryRuleAction({
                      clientKey: newKey(),
                      group: item.group,
                      key: item.key,
                      n: numeric ? Number(value) : null,
                      newText: numeric ? null : value,
                      reason: why,
                    })
                  }
                />
              ))}
            </ul>
            {issue ? (
              <div className="px-6 pb-3">
                <div className="bg-ink-50 flex flex-col gap-1 rounded-xl px-3 py-2.5 text-[13px] leading-[18px]">
                  <span className="text-ink-700 text-[12px] font-bold">{PL.rightNow}</span>
                  {issue.now.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="border-border text-body-s text-ink-700 flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
              <span>{D.footer}</span>
              <Link href="/pharmacy/setup?tab=rules" className={linkBtn}>
                {D.seeAll}
              </Link>
            </div>
          </>
        ) : null}
      </EditorDialog>
    </>
  );
}
