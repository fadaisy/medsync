"use client";

import { useState } from "react";

import { abandonDeliveryAction } from "@/app/pharmacy/stock/store/receive-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { RCT } from "@/content/pharmacy-receive-count";
import { useReceive } from "../provider";
import { Field, inputCls } from "../shared";

const A = RCT.abandon;

/** Abandon this delivery (RECEIVE §D2): nothing moved, so a reason is all it needs. Back to the board after. */
export function AbandonDialog({
  deliveryId,
  onClose,
}: {
  deliveryId: string;
  onClose: () => void;
}) {
  const { run, go, forget, busy } = useReceive();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const r = reason.trim();
    if (!r) return setErr(A.need);
    run(
      () => abandonDeliveryAction({ deliveryId, reason: r }),
      () => {
        void forget(deliveryId);
        onClose();
        go(null);
      },
    );
  };

  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="medium">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{A.title}</DialogTitle>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
        <Field label={A.why} error={err || null}>
          {(a) => (
            <input
              {...a}
              autoFocus
              className={inputCls(!!a["aria-invalid"])}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErr("");
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          )}
        </Field>
      </div>
      <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3">
        <LabButton variant="quiet" onClick={onClose}>
          {A.keep}
        </LabButton>
        <LabButton className="h-11 sm:h-9" busy={busy} onClick={submit}>
          {A.go}
        </LabButton>
      </div>
    </EditorDialog>
  );
}
