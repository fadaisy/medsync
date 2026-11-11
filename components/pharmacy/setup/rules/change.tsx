"use client";

import type { RuleParam } from "@/content/pharmacy-rules";
import type { RuleGroupRow, RuleRow } from "@/lib/pharmacy/setup/types";
import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { proposeRegistryRuleAction } from "@/app/pharmacy/setup/roster-actions";
import { newKey } from "@/components/pharmacy/medicines/shared";
import { inputCls, labelCls, useAct } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { RULE_REGISTRY } from "@/content/pharmacy-rules";
import { RULES_TAB as R } from "@/content/pharmacy-setup-rules";
import { ruleText, validateParam } from "@/lib/pharmacy/derive/setup/rules";
import { cn } from "@/lib/utils";

const decimals = (p: RuleParam) => (String(p.step).split(".")[1] ?? "").length;
const fmt = (n: number, p: RuleParam) => n.toFixed(decimals(p));
const num = (raw: string) => Number(raw.replace(",", ".").trim());
const stepBtn =
  "bg-card text-foreground grid size-9 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-ink-300)] hover:bg-ink-50 focus-visible:shadow-focus outline-none";

/** C3 inline change: a number by −/+ within its range, or new wording; Will read, why, then Send for signing. */
export function ChangeRule({
  g,
  r,
  toast,
  onClose,
}: {
  g: RuleGroupRow;
  r: RuleRow;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const p = r.param && r.n !== null ? r.param : null;
  const cur = r.n ?? 0;
  const reg = RULE_REGISTRY.find((x) => x.key === g.key)?.rules.find((x) => x.key === r.key);
  const [v, setV] = useState(p ? fmt(cur, p) : r.text);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, run] = useAct(toast);

  const n = num(v);
  const preview = p
    ? v.trim() && Number.isFinite(n)
      ? ruleText({ text: reg?.text ?? "{n}", param: p }, n)
      : R.ellipsis
    : v.trim() || R.ellipsis;
  const step = (d: 1 | -1) => {
    if (!p) return;
    const base = Number.isFinite(n) && v.trim() ? n : cur;
    setV(fmt(Math.min(p.max, Math.max(p.min, base + d * p.step)), p));
    setErr(null);
  };

  const send = () => {
    let error: string | null = null;
    if (p) {
      const bad = validateParam(v.replace(",", "."), p, cur);
      if (bad === "nan") error = R.err.nan;
      else if (bad === "range") error = R.err.range(fmt(p.min, p), fmt(p.max, p), p.unit);
      else if (bad === "same") error = R.err.same;
    } else if (!v.trim()) error = R.err.noWording;
    else if (v.trim() === r.text) error = R.err.sameWording;
    if (!error && !why.trim()) error = R.err.why;
    if (error) return setErr(error);
    void run(
      () =>
        proposeRegistryRuleAction({
          clientKey: newKey(),
          group: g.key,
          key: r.key,
          n: p ? n : null,
          newText: p ? null : v.trim(),
          reason: why.trim(),
        }),
      () => R.sent,
    ).then((ok) => ok && onClose());
  };

  return (
    <div className="bg-ink-50 rounded-tide-tile mx-2 mb-3 flex flex-col gap-2.5 px-3.5 py-3">
      {p ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={labelCls}>{R.newValue}</span>
          <span className="flex items-center gap-1.5">
            <button type="button" aria-label={R.less} className={stepBtn} onClick={() => step(-1)}>
              <MinusIcon aria-hidden className="size-4" />
            </button>
            <input
              inputMode="decimal"
              aria-label={r.name}
              value={v}
              onChange={(e) => (setV(e.target.value), setErr(null))}
              className={cn(inputCls, "w-20 text-center font-semibold tabular-nums")}
            />
            <button type="button" aria-label={R.more} className={stepBtn} onClick={() => step(1)}>
              <PlusIcon aria-hidden className="size-4" />
            </button>
          </span>
          <span className="text-body-s text-ink-700">
            {R.allowed(p.unit, fmt(p.min, p), fmt(p.max, p))}
          </span>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{R.newWording}</span>
          <input
            value={v}
            onChange={(e) => (setV(e.target.value), setErr(null))}
            className={inputCls}
          />
        </label>
      )}
      <span className="text-body-s text-foreground">
        <b className="font-semibold">{R.willRead}</b> {preview}
      </span>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>{R.whyChange}</span>
        <input
          value={why}
          placeholder={R.whyPlaceholder}
          onChange={(e) => (setWhy(e.target.value), setErr(null))}
          className={inputCls}
        />
      </label>
      <span className="text-caption text-ink-600">{R.impact(r.appliesTo, g.showsOn)}</span>
      {err ? (
        <span role="alert" className="text-body-s text-status-caution-fg-aa font-semibold">
          {err}
        </span>
      ) : null}
      <span className="flex flex-wrap gap-2">
        <LabButton size="sm" variant="primary" busy={pending} onClick={send}>
          {R.send}
        </LabButton>
        <LabButton size="sm" onClick={onClose}>
          {R.cancel}
        </LabButton>
      </span>
    </div>
  );
}
