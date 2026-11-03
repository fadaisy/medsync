"use client";

import type { ProposalRow, RulesView } from "@/lib/pharmacy/setup/types";
import { useState } from "react";

import { signRuleAction, withdrawRuleAction } from "@/app/pharmacy/medicines-actions";
import { rejectProposalAction } from "@/app/pharmacy/setup/setup-actions";
import { Chip, inputCls, useAct } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { Panel, Pill } from "@/components/tide/work/kit";
import { dayTime, RULES_TAB as R } from "@/content/pharmacy-setup-rules";
import { canInChargeSign, canSecondSign } from "@/lib/pharmacy/derive/setup/rules";
import { cn } from "@/lib/utils";

/** C2: each proposal, old → new, why, who and the signatures; sign, reject with a note, withdraw. */
export function Waiting({ view, toast }: { view: RulesView; toast: (m: string) => void }) {
  if (!view.proposals.length) return null;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {R.waiting}
          <Pill tone="caution" glyph={null}>
            {view.proposals.length}
          </Pill>
        </span>
      }
    >
      <ul className="divide-border flex flex-col divide-y">
        {view.proposals.map((p) => (
          <Proposal key={p.id} p={p} view={view} toast={toast} />
        ))}
      </ul>
    </Panel>
  );
}

function Proposal({
  p,
  view,
  toast,
}: {
  p: ProposalRow;
  view: RulesView;
  toast: (m: string) => void;
}) {
  const [pending, run] = useAct(toast);
  const [note, setNote] = useState<string | null>(null);
  const me = view.me;
  const group = view.groups.find((g) => g.key === p.group)?.title ?? p.group;
  const isNew = p.kind === "new";

  const sign = (role: "in_charge" | "second") =>
    run(
      () => signRuleAction({ id: p.id, role }),
      (d: { applied?: boolean } | undefined) =>
        d?.applied ? R.bothSigned : role === "in_charge" ? R.signedInCharge : R.signedSecondOnly,
    );
  const reject = () => {
    const n = (note ?? "").trim();
    if (!n) return toast(R.rejectNeedsWhy);
    void run(
      () => rejectProposalAction({ id: p.id, note: n }),
      () => R.rejected(p.proposedByName),
    ).then((ok) => ok && setNote(null));
  };

  const signer = (role: "in_charge" | "second") => {
    const done = p.roles.includes(role);
    if (done)
      return (
        <Chip tone="grey" key={role}>
          {role === "in_charge" ? R.inChargeSigned : R.secondSigned}
        </Chip>
      );
    if (role === "in_charge" ? !view.can.signInCharge : !view.can.signSecond) return null;
    const why =
      role === "second" && p.proposedBy === me
        ? R.proposerNotSecond
        : !(role === "in_charge" ? canInChargeSign : canSecondSign)(p, me)
          ? R.alreadySigned
          : null;
    return (
      <LabButton
        key={role}
        size="sm"
        busy={pending}
        disabledReason={why}
        reasonPlacement="below"
        onClick={() => sign(role)}
      >
        {role === "in_charge" ? R.signInCharge : R.signSecond}
      </LabButton>
    );
  };

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 py-3">
      <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-1.5">
        <span className="text-caption text-ink-600 font-semibold tracking-[0.04em] uppercase">
          {R.ruleLine(group, isNew ? R.newName(p.name) : p.name)}
        </span>
        <span className="text-body-s flex flex-wrap items-center gap-1.5">
          <span className="bg-tide-sunken text-ink-600 rounded-lg px-2 py-0.5 line-through">
            {p.oldText ?? R.none}
          </span>
          <span aria-hidden className="text-ink-500 font-semibold">
            {R.arrow}
          </span>
          <span className="bg-tide-lagoon-tint rounded-lg px-2 py-0.5 font-semibold text-teal-900">
            {p.newText}
          </span>
        </span>
        <span className="text-body-s text-ink-700">{R.why(p.reason)}</span>
        <span className="text-caption text-ink-600">
          {R.meta(p.proposedByName, dayTime(p.proposedAt), p.appliesTo, p.roles.length)}
        </span>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <span className="flex flex-wrap gap-1.5 sm:justify-end">
          {signer("in_charge")}
          {signer("second")}
        </span>
        {note !== null ? (
          <span className="flex flex-wrap gap-1.5 sm:justify-end">
            <input
              aria-label={R.rejectAria}
              placeholder={R.rejectPlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={cn(inputCls, "w-56")}
            />
            <LabButton size="sm" variant="primary" busy={pending} onClick={reject}>
              {R.reject}
            </LabButton>
            <LabButton size="sm" onClick={() => setNote(null)}>
              {R.cancel}
            </LabButton>
          </span>
        ) : (
          <span className="flex gap-1">
            {view.can.signInCharge || view.can.signSecond ? (
              <LabButton size="sm" variant="text" onClick={() => setNote("")}>
                {R.reject}
              </LabButton>
            ) : null}
            {view.can.propose ? (
              <LabButton
                size="sm"
                variant="text"
                busy={pending}
                onClick={() =>
                  run(
                    () => withdrawRuleAction({ id: p.id }),
                    () => R.withdrawn,
                  )
                }
              >
                {R.withdraw}
              </LabButton>
            ) : null}
          </span>
        )}
      </div>
    </li>
  );
}
