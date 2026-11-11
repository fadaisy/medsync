"use client";

import type { RuleGroup } from "@/lib/pharmacy/derive/medicines";
import type { MedicinesPayload, Proposal } from "@/lib/pharmacy/medicines/read";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  proposeRuleAction,
  setPriceRuleAction,
  signRuleAction,
  withdrawRuleAction,
} from "@/app/pharmacy/medicines-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { FLAGS, MEDICINES, RX_CHECKS } from "@/content/pharmacy-medicines";
import { cn } from "@/lib/utils";
import { field, linkBtn, newKey } from "./shared";

const D = MEDICINES.rulesDlg;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface RuleItem {
  group: string;
  key: string | null;
  text: string;
  label?: string;
  productId: string | null;
  proposal: Proposal | null;
}

/** A group's rule lines, the hospital's signed text over the default (§9.1), each with its pending proposal. */
export function ruleItems(
  g: RuleGroup,
  data: Pick<MedicinesPayload, "rules" | "proposals">,
  generic?: string,
): RuleItem[] {
  const db = (key: string) => data.rules.find((r) => r.group === g.id && r.key === key)?.text;
  const prop = (key: string) =>
    data.proposals.find((p) => p.group === g.id && p.key === key) ?? null;
  if (g.id === "rx") {
    const keys = generic
      ? [generic.toLowerCase()].filter((k) => RX_CHECKS[k] || db(k))
      : Object.keys(RX_CHECKS);
    return keys.map((k) => ({
      group: "rx",
      key: k,
      text: db(k) ?? RX_CHECKS[k]!,
      label: generic ? undefined : cap(k),
      productId: null,
      proposal: prop(k),
    }));
  }
  return (g.rules as readonly string[]).map((d, i) => ({
    group: g.id,
    key: String(i),
    text: db(String(i)) ?? d,
    productId: null,
    proposal: prop(String(i)),
  }));
}

/** "This medicine only": its signed rules, and new ones waiting for signatures. */
export function lineRuleItems(
  data: Pick<MedicinesPayload, "rules" | "proposals">,
  lineId: string,
): RuleItem[] {
  const signed = data.rules
    .filter((r) => r.group === "line" && r.productId === lineId)
    .map((r) => ({
      group: "line",
      key: r.key,
      text: r.text,
      productId: lineId,
      proposal: data.proposals.find((p) => p.group === "line" && p.key === r.key) ?? null,
    }));
  const fresh = data.proposals
    .filter(
      (p) => p.group === "line" && p.productId === lineId && !signed.some((s) => s.key === p.key),
    )
    .map((p) => ({ group: "line", key: p.key, text: D.newRule, productId: lineId, proposal: p }));
  return [...signed, ...fresh];
}

/** One rule line (§9.3): Change → new wording and why → Send for signing; then Proposed, the two signatures, Withdraw. */
export function RuleLine({
  item,
  can,
  toast,
  compact,
  numeric,
  propose,
  onCancel,
}: {
  item: RuleItem;
  can: MedicinesPayload["can"] | null;
  toast: (m: string) => void;
  compact?: boolean;
  /** A rule with a number (the registry's `param`): Change asks for the number, prefilled with this. */
  numeric?: string;
  /** Sends the proposal elsewhere than the Medicines rules (the registry, People's badges). */
  propose?: (value: string, why: string) => Promise<{ ok: boolean; error?: string }>;
  /** A new rule: opens editing at once, and Cancel removes the line. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!onCancel);
  const [text, setText] = useState(numeric ?? item.text);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const p = item.proposal;

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done: string | ((r: never) => string),
  ) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? MEDICINES.refused.failed);
      toast(typeof done === "string" ? done : done(r as never));
      setOpen(false);
      router.refresh();
    });

  const send = () => {
    if (!text.trim() || text.trim() === (numeric ?? item.text)) return setErr(D.typeFirst);
    if (!why.trim()) return setErr(D.sayWhy);
    run(
      () =>
        propose?.(text.trim(), why.trim()) ??
        proposeRuleAction({
          clientKey: newKey(),
          group: item.group,
          key: item.key,
          productId: item.productId,
          newText: text.trim(),
          reason: why.trim(),
        }),
      D.sent,
    );
  };
  const sign = (role: "in_charge" | "second") =>
    run(
      () => signRuleAction({ id: p!.id, role }),
      (r: { data?: { applied: boolean } }) =>
        r.data?.applied ? D.signedBoth(p!.newText) : D.signedOne,
    );

  return (
    <li
      className={cn(
        "flex flex-col gap-1",
        compact ? "text-[12px] leading-4" : "text-[13px] leading-[18px]",
      )}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-foreground min-w-0">
          {item.label ? <b>{item.label}: </b> : null}
          {item.text}
        </span>
        {can?.propose && !p && !open ? (
          <button
            type="button"
            className={linkBtn}
            aria-label={D.changeAria(item.text)}
            onClick={() => setOpen(true)}
          >
            {D.change}
          </button>
        ) : null}
      </span>
      {open ? (
        <span className="bg-ink-50 flex flex-col gap-2 rounded-xl p-2.5">
          <input
            aria-label={numeric ? D.newNumber : D.newWording}
            placeholder={numeric ? D.newNumber : D.newWording}
            inputMode={numeric ? "decimal" : undefined}
            value={text}
            onChange={(e) => (setText(e.target.value), setErr(null))}
            className={cn(field, numeric ? "w-24 rounded-lg tabular-nums" : "w-full rounded-lg")}
          />
          <input
            aria-label={D.why}
            placeholder={D.why}
            value={why}
            onChange={(e) => (setWhy(e.target.value), setErr(null))}
            className={cn(field, "w-full rounded-lg")}
          />
          <span className="flex flex-wrap items-center gap-2">
            <LabButton size="sm" variant="primary" busy={pending} onClick={send}>
              {D.send}
            </LabButton>
            <LabButton
              size="sm"
              variant="text"
              onClick={() => (onCancel ? onCancel() : setOpen(false), setErr(null))}
            >
              {MEDICINES.row.cancel}
            </LabButton>
          </span>
        </span>
      ) : null}
      {p ? (
        <span className="bg-status-caution-bg flex flex-col gap-1.5 rounded-xl px-2.5 py-2">
          <span>
            <b>{D.proposed}</b> {p.newText}
          </span>
          <span className="text-ink-700">{D.whyLine(p.reason)}</span>
          <span className="flex flex-wrap items-center gap-2">
            {p.inCharge ? (
              <span className="text-ink-700 text-[12px] font-semibold">
                {D.signedInCharge} · {p.inCharge}
              </span>
            ) : can?.signInCharge ? (
              <LabButton
                size="sm"
                variant="secondary"
                busy={pending}
                onClick={() => sign("in_charge")}
              >
                {D.signInCharge}
              </LabButton>
            ) : null}
            {p.second ? (
              <span className="text-ink-700 text-[12px] font-semibold">
                {D.signedSecond} · {p.second}
              </span>
            ) : can?.signSecond ? (
              <LabButton
                size="sm"
                variant="secondary"
                busy={pending}
                onClick={() => sign("second")}
              >
                {D.signSecond}
              </LabButton>
            ) : null}
            {can?.propose ? (
              <LabButton
                size="sm"
                variant="text"
                busy={pending}
                onClick={() => run(() => withdrawRuleAction({ id: p.id }), D.withdrawn)}
              >
                {D.withdraw}
              </LabButton>
            ) : null}
          </span>
        </span>
      ) : null}
      {err ? (
        <span role="alert" className="text-status-critical-fg-aa text-[12px] font-semibold">
          {err}
        </span>
      ) : null}
    </li>
  );
}

/** The price rule and the payers, inside "Every medicine" (§9.1). */
function PriceRuleLine({ data, toast }: { data: MedicinesPayload; toast: (m: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(String(data.rulePct ?? 25));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => {
    const n = Number(pct);
    if (!Number.isInteger(n) || n < 0 || n > 500) return setErr(D.markupRange);
    start(async () => {
      const r = await setPriceRuleAction({ pct: n });
      if (!r.ok) return setErr(r.error);
      toast(D.ruleSaved);
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <li className="flex flex-col gap-1 text-[13px] leading-[18px]">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          <b>{D.priceRule}</b> {D.priceRuleText(data.rulePct)}
        </span>
        {data.can.review && !open ? (
          <button type="button" className={linkBtn} onClick={() => setOpen(true)}>
            {data.rulePct === null ? D.setRule : D.changeRule}
          </button>
        ) : null}
      </span>
      {open ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-ink-700">{D.costPlus}</span>
          <input
            inputMode="numeric"
            aria-label={D.markupAria}
            value={pct}
            onChange={(e) => (setPct(e.target.value), setErr(null))}
            className={cn(field, "w-20 text-right tabular-nums")}
          />
          <span>%</span>
          <LabButton size="sm" variant="primary" busy={pending} onClick={save}>
            {D.save}
          </LabButton>
          <LabButton size="sm" variant="text" onClick={() => setOpen(false)}>
            {MEDICINES.row.cancel}
          </LabButton>
        </span>
      ) : null}
      {err ? (
        <span role="alert" className="text-status-critical-fg-aa text-[12px] font-semibold">
          {err}
        </span>
      ) : null}
      <span>
        <b>{D.payers}</b>{" "}
        {D.payerText(data.payers.filter((p) => p.kind !== "cash").map((p) => p.name))}
      </span>
    </li>
  );
}

/** A rule group's dialog (§9.2): the rules, how many medicines, "show" to filter, and the two-signature footer. */
export function RulesDialog({
  group,
  count,
  data,
  mode,
  onClose,
  onShow,
  toast,
}: {
  group: RuleGroup | null;
  count: number;
  data: MedicinesPayload;
  mode: "edit" | "operate";
  onClose: () => void;
  onShow: (g: RuleGroup) => void;
  toast: (m: string) => void;
}) {
  const g = group;
  const canShow = !!g && ("flag" in g || "cls" in g);
  const can = mode === "edit" ? data.can : null;
  return (
    <EditorDialog open={!!g} onOpenChange={(o) => !o && onClose()} width="medium">
      {g ? (
        <>
          <div className="flex items-start justify-between gap-3 px-6 pt-5">
            <div className="flex flex-col gap-1">
              <DialogTitle>{D.title(g.scope)}</DialogTitle>
              {canShow ? (
                <button type="button" className={cn(linkBtn, "w-fit")} onClick={() => onShow(g)}>
                  {D.count(count, false, true)}
                </button>
              ) : (
                <span className="text-body-s text-ink-600">
                  {D.count(count, g.id === "all", false)}
                </span>
              )}
            </div>
            <LabButton variant="text" onClick={onClose}>
              {D.close}
            </LabButton>
          </div>
          <ul className="divide-border flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-6 py-3 [&>li]:py-2.5">
            {ruleItems(g, data).map((it) => (
              <RuleLine key={`${it.group}:${it.key}`} item={it} can={can} toast={toast} />
            ))}
            {g.id === "all" ? <PriceRuleLine data={data} toast={toast} /> : null}
          </ul>
          <div className="border-border text-body-s text-ink-700 flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
            <span>{D.footer}</span>
            <Link href="/pharmacy/setup?tab=rules" className={linkBtn}>
              {D.seeAll}
            </Link>
          </div>
        </>
      ) : null}
    </EditorDialog>
  );
}

export const flagFilterWord = (g: RuleGroup) =>
  "flag" in g ? FLAGS[g.flag as keyof typeof FLAGS][0] : null;
