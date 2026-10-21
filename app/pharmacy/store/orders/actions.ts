"use server";

import { z } from "zod";

import * as expiry from "@/lib/pharmacy/stores/expiry-store";
import * as orders from "@/lib/pharmacy/stores/order-store";
import { bareResult, supplyAct } from "@/lib/pharmacy/stores/supply-action";

/**
 * Orders (5.9, 5.10; OQ-1 to OQ-6; Section 8). Behind `pharmacyOrdering`. Every write `pharmacy.manage`; prints
 * `pharmacy.view`, logged. MedSync does not send an order (Law 10): nothing here reaches the network.
 */

export async function saveOrderProposal(raw: unknown) {
  return bareResult(
    await supplyAct(
      "saveOrderProposal",
      "ordering",
      orders.ProposalInput,
      raw,
      "pharmacy.manage",
      orders.saveOrderProposal,
    ),
  );
}
export async function confirmCut(raw: unknown) {
  return bareResult(
    await supplyAct(
      "confirmCut",
      "ordering",
      orders.ConfirmCutInput,
      raw,
      "pharmacy.manage",
      orders.confirmCut,
    ),
  );
}
export async function saveOrder(raw: unknown) {
  return bareResult(
    await supplyAct(
      "saveOrder",
      "ordering",
      orders.SaveOrderInput,
      raw,
      "pharmacy.manage",
      orders.saveOrder,
    ),
  );
}
export async function closeOrderLine(raw: unknown) {
  return bareResult(
    await supplyAct(
      "closeOrderLine",
      "ordering",
      orders.CloseLineInput,
      raw,
      "pharmacy.manage",
      orders.closeOrderLine,
    ),
  );
}
export async function recordPaperOrderComparison(raw: unknown) {
  return bareResult(
    await supplyAct(
      "recordPaperOrderComparison",
      "ordering",
      orders.PaperComparisonInput,
      raw,
      "pharmacy.manage",
      orders.recordPaperOrderComparison,
    ),
  );
}

const PrintOrder = z.object({
  clientKey: z.uuid(),
  orderId: z.uuid(),
  form: z.enum(["order_085", "order_084b", "purchase_list", "quantities_text"]),
});

/** HMIS 085, HMIS 084B, a purchase list, or the copied quantities: each logged before it prints. */
export async function printOrder(raw: unknown) {
  return bareResult(
    await supplyAct("printOrder", "ordering", PrintOrder, raw, "pharmacy.view", (ctx, i) =>
      expiry.logPrint(ctx, { clientKey: i.clientKey, kind: i.form, refId: i.orderId }),
    ),
  );
}
