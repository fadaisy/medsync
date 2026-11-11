"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { RC } from "@/content/pharmacy-receive";
import { RC as RECORDS } from "@/content/pharmacy-rework-records";
import { logger } from "@/lib/logger";
import * as after from "@/lib/pharmacy/actions/receive/after";
import * as delivery from "@/lib/pharmacy/actions/receive/delivery";
import { finishDelivery } from "@/lib/pharmacy/actions/receive/finish";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { createServiceClient } from "@/lib/supabase/service";

/** Stock › Receive a delivery (RECEIVE §I): the session user acts; every check runs again on the server. */
type Act = (
  actor: Awaited<ReturnType<typeof requirePharmacyActor>>,
  raw: unknown,
) => Promise<{ ok: boolean }>;
const run = async <F extends Act>(fn: F, raw: unknown): Promise<Awaited<ReturnType<F>>> => {
  try {
    const out = (await fn(await requirePharmacyActor(), raw)) as Awaited<ReturnType<F>>;
    if (out.ok) revalidatePath("/pharmacy/stock/store");
    return out;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.receive.action_failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: RECORDS.refused.failed } as Awaited<ReturnType<F>>;
  }
};

export const startDeliveryAction = async (raw: unknown) => run(delivery.startDelivery, raw);
export const editDeliveryAction = async (raw: unknown) => run(delivery.editDelivery, raw);
export const saveInvoiceAction = async (raw: unknown) => run(delivery.saveInvoice, raw);
export const saveLinesAction = async (raw: unknown) => run(delivery.saveLines, raw);
export const syncCountingAction = async (raw: unknown) => run(delivery.syncCounting, raw);
export const scanPackAction = async (raw: unknown) => run(delivery.scanPack, raw);
export const linkGtinAction = async (raw: unknown) => run(delivery.linkGtin, raw);
export const addLocalMedicineAction = async (raw: unknown) => run(delivery.addLocalMedicine, raw);
export const askApprovalAction = async (raw: unknown) => run(delivery.askApproval, raw);
export const approveShortDatedAction = async (raw: unknown) => run(delivery.approveShortDated, raw);
export const abandonDeliveryAction = async (raw: unknown) => run(delivery.abandonDelivery, raw);
export const addPhotoAction = async (raw: unknown) => run(delivery.addPhoto, raw);
export const finishDeliveryAction = async (raw: unknown) => run(finishDelivery, raw);
export const putAwayLineAction = async (raw: unknown) => run(after.putAwayLine, raw);
export const undoPutAwayLineAction = async (raw: unknown) => run(after.undoPutAwayLine, raw);
export const sendStraightLineAction = async (raw: unknown) => run(after.sendStraightLine, raw);
export const assignInHouseCodeAction = async (raw: unknown) => run(after.assignInHouseCode, raw);
export const editOrderAction = async (raw: unknown) => run(after.editOrder, raw);
export const markChasedAction = async (raw: unknown) => run(after.markChased, raw);
export const sendClaimAction = async (raw: unknown) => run(after.sendClaim, raw);
export const creditClaimAction = async (raw: unknown) => run(after.creditClaim, raw);

const PhotoInput = z.object({ deliveryId: z.uuid(), id: z.uuid() });

/** A signed upload for one photo; the device compresses it first and the row keeps the path, never the image. */
export async function photoUploadAction(raw: unknown) {
  const i = PhotoInput.safeParse(raw);
  if (!i.success) return { ok: false as const, error: RC.says.photo };
  const actor = await requirePharmacyActor();
  const path = `${actor.hospitalId}/${i.data.deliveryId}/${i.data.id}.jpg`;
  const { data, error } = await createServiceClient()
    .storage.from("pharmacy-delivery-photos")
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, error: RC.says.photo };
  return { ok: true as const, signedUrl: data.signedUrl, path };
}
