"use client";

import type { RuleGroupRow } from "@/lib/pharmacy/setup/types";
import { useState } from "react";

import { proposeNewRuleAction } from "@/app/pharmacy/setup/setup-actions";
import { newKey } from "@/components/pharmacy/medicines/shared";
import { inputCls, labelCls, useAct } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { RULES_TAB as R } from "@/content/pharmacy-setup-rules";

/** C3 "+ Add a rule to this group": name, what it says, why; the same two signatures add it. */
export function AddRule({
  g,
  toast,
  onClose,
}: {
  g: RuleGroupRow;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState({ name: "", text: "", why: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, run] = useAct(toast);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => (
    setF({ ...f, [k]: e.target.value }),
    setErr(null)
  );

  const send = () => {
    if (!f.name.trim() || !f.text.trim()) return setErr(R.err.nameAndText);
    if (!f.why.trim()) return setErr(R.err.why);
    void run(
      () =>
        proposeNewRuleAction({
          clientKey: newKey(),
          group: g.key,
          name: f.name.trim(),
          text: f.text.trim(),
          appliesTo: "",
          reason: f.why.trim(),
        }),
      () => R.addSent,
    ).then((ok) => ok && onClose());
  };

  const field = (k: keyof typeof f, label: string, placeholder?: string) => (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <input value={f[k]} placeholder={placeholder} onChange={set(k)} className={inputCls} />
    </label>
  );
  return (
    <div className="bg-ink-50 rounded-tide-tile grid gap-2.5 px-3.5 py-3 sm:grid-cols-3">
      {field("name", R.addRule, R.addRulePlaceholder)}
      {field("text", R.addSays, R.addSaysPlaceholder)}
      {field("why", R.addWhy)}
      {err ? (
        <span
          role="alert"
          className="text-body-s text-status-caution-fg-aa font-semibold sm:col-span-3"
        >
          {err}
        </span>
      ) : null}
      <span className="flex flex-wrap gap-2 sm:col-span-3">
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
