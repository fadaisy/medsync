"use server";

import type { PhotoState } from "@/components/forms";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { RC } from "@/content/pharmacy-rework-records";
import { storeAvatar } from "@/lib/avatars";
import { logger } from "@/lib/logger";
import * as r from "@/lib/pharmacy/actions/roster";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";

/** Set-up › People and roster (PEOPLE-ROSTER.md §18): the session user acts; every check runs again on the server. */
type Act = (
  actor: Awaited<ReturnType<typeof requirePharmacyActor>>,
  raw: unknown,
) => Promise<{ ok: boolean }>;
const run = async <F extends Act>(fn: F, raw: unknown): Promise<Awaited<ReturnType<F>>> => {
  try {
    const out = (await fn(await requirePharmacyActor(), raw)) as Awaited<ReturnType<F>>;
    if (out.ok) revalidatePath("/pharmacy/setup");
    return out;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.roster.action_failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: RC.refused.failed } as Awaited<ReturnType<F>>;
  }
};

export const assignToSlotAction = async (raw: unknown) => run(r.assignToSlot, raw);
export const removeFromSlotAction = async (raw: unknown) => run(r.removeFromSlot, raw);
export const moveBetweenSlotsAction = async (raw: unknown) => run(r.moveBetweenSlots, raw);
export const copyLastWeekAction = async (raw: unknown) => run(r.copyLastWeek, raw);
export const fillGapsAction = async (raw: unknown) => run(r.applyFillGaps, raw);
export const publishWeekAction = async (raw: unknown) => run(r.publishWeek, raw);
export const unlockWeekAction = async (raw: unknown) => run(r.unlockWeek, raw);
export const handOverAction = async (raw: unknown) => run(r.handOver, raw);
export const takeBackAction = async (raw: unknown) => run(r.takeBack, raw);
export const askSwapAction = async (raw: unknown) => run(r.askSwap, raw);
export const actOnSwapAction = async (raw: unknown) => run(r.actOnSwap, raw);
export const askLeaveAction = async (raw: unknown) => run(r.askLeave, raw);
export const decideLeaveAction = async (raw: unknown) => run(r.decideLeave, raw);
export const addPersonAction = async (raw: unknown) => run(r.addPerson, raw);
export const recordLicenceAction = async (raw: unknown) => run(r.recordLicence, raw);
export const signInAction = async (raw: unknown) => run(r.signIn, raw);
export const setRemindersAction = async (raw: unknown) => run(r.setReminders, raw);

/** §15: only the person themselves adds or changes their photo (storeAvatar writes the session user's own row). */
export async function updateMyPhotoAction(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const actor = await requirePharmacyActor();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first." };
  const key = await storeAvatar(actor.userId, file);
  if (!key) return { error: "We couldn't save that photo — try a JPEG or PNG under 8 MB." };
  revalidatePath("/pharmacy/setup");
  return { ok: true };
}
