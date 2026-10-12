"use client";

import type { LabelCheckShown } from "./collect-view";
import type { CollectDraft, CollectTarget } from "./model";
import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import { useState } from "react";

import { checkLabel, voidAndReprintLabel } from "@/lib/emr/actions/orders";

/**
 * Lab Phase 2 (§5.2, ID-1..ID-5): the label check and "Void and print new" for one bedside
 * collection, shared by the doctor's and the nurse's orders panels. Returns CollectView's props.
 * A new label clears the check (the old label no longer matches) and becomes the target's label.
 */
export function useCollectLab({
  surface,
  patientUserId,
  target,
  draft,
  setDraft,
  setTarget,
  setMessage,
  start,
}: {
  surface: "doctor" | "nurse";
  patientUserId: string;
  target: CollectTarget | null;
  draft: CollectDraft;
  setDraft: Dispatch<SetStateAction<CollectDraft>>;
  setTarget: (t: CollectTarget) => void;
  setMessage: (m: { ok: boolean; text: string } | null) => void;
  start: TransitionStartFunction;
}) {
  const [labelCheck, setLabelCheck] = useState<LabelCheckShown | null>(null);
  const base = { surface, patientUserId };

  return {
    reset: () => setLabelCheck(null),
    props: {
      labelCheck,
      onLabelNo: (labelNo: string, labelMethod: "scan" | "typed") => {
        setLabelCheck(null);
        setDraft((d) => ({ ...d, labelNo, labelMethod, labelOutcome: null }));
      },
      onWristband: (wristband: boolean) => setDraft((d) => ({ ...d, wristband })),
      onPaymentReason: (paymentReason: string) => setDraft((d) => ({ ...d, paymentReason })),
      onCheckLabel: () =>
        start(async () => {
          const labelNo = draft.labelNo?.trim();
          if (!target || !labelNo) return;
          const r = await checkLabel({
            ...base,
            orderId: target.orderId,
            labelNo,
            method: draft.labelMethod ?? "typed",
            wristbandChecked: !!draft.wristband,
            clientKey: crypto.randomUUID(),
          });
          if (!r.ok) return setMessage({ ok: false, text: r.error });
          const { outcome, otherIdentity } = r.data!;
          setMessage(null);
          setLabelCheck({ labelNo, outcome, other: otherIdentity });
          setDraft((d) => ({ ...d, labelOutcome: outcome }));
        }),
      onVoidLabel: (reason: string) =>
        start(async () => {
          if (!target) return;
          const r = await voidAndReprintLabel({
            ...base,
            orderId: target.orderId,
            reason,
            clientKey: crypto.randomUUID(),
          });
          if (!r.ok) return setMessage({ ok: false, text: r.error });
          const { labelNo } = r.data!;
          setLabelCheck(null);
          setDraft((d) => ({ ...d, labelNo: "", labelOutcome: null }));
          if (target.lab) setTarget({ ...target, lab: { ...target.lab, labelNo } });
          setMessage({ ok: true, text: `Label voided. New label ${labelNo}: print it.` });
        }),
    },
  };
}
