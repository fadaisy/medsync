"use client";

import { ClaimDialog } from "./after/claims";
import { ConfirmDispatchDialog } from "./after/confirm-dispatch";
import { LabelsDialog } from "./after/labels";
import { ChaseDialog, OrderDialog } from "./board/order-dialogs";
import { StartDialog } from "./board/start-dialog";
import { useReceive } from "./provider";

/** Every dialog the tab opens, so any door reaches any of them. */
export function ReceiveDialogs() {
  const { dialog, open } = useReceive();
  const close = () => open(null);
  if (!dialog) return null;
  switch (dialog.kind) {
    case "start":
      return (
        <StartDialog
          orderId={dialog.orderId}
          seedMedId={dialog.seedMedId}
          edit={dialog.edit}
          onClose={close}
        />
      );
    case "order":
      return <OrderDialog orderId={dialog.orderId} startEditing={dialog.edit} onClose={close} />;
    case "chase":
      return <ChaseDialog orderId={dialog.orderId} onClose={close} />;
    case "claim":
      return <ClaimDialog claimId={dialog.claimId} step={dialog.step} onClose={close} />;
    case "labels":
      return <LabelsDialog deliveryId={dialog.deliveryId} onClose={close} />;
    case "confirm":
      return <ConfirmDispatchDialog dispatchId={dialog.dispatchId} onClose={close} />;
  }
}
