"use server";

import { revalidatePath } from "next/cache";

import { authorize, fromDb, NcdError, resolveContext } from "@/lib/ncdreg/context";
import { signSnapshot, storeSnapshot } from "@/lib/ncdreg/indicators/snapshot";
import { requireNcdScope } from "@/lib/ncdreg/scope";

export type SignState = { ok: boolean; message: string } | null;

/**
 * F5: the registry lead signs the month. The snapshot is computed by the system principal (the
 * holder of snapshot_compute, as the monthly job would), then signed as the lead; the database
 * refuses before go-live or while demo data is on, and that refusal is shown as written.
 */
export async function signMonthAction(month: string, _prev: SignState, _form: FormData): Promise<SignState> {
  const { ctx } = await requireNcdScope();
  try {
    authorize(ctx, "report_sign");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month >= ctx.today.slice(0, 7))
      throw new NcdError("invalid", "A month can be signed once it has ended.");
    const system = await resolveContext({ userId: null, facilityId: ctx.facilityId, principal: "system" });
    const snap = await storeSnapshot(system, month);
    await signSnapshot(ctx, snap.id);
    revalidatePath(`/ncd/report/${month}`);
    revalidatePath("/ncd/dashboard");
    return { ok: true, message: "Signed. This month is now locked." };
  } catch (e) {
    return { ok: false, message: (e instanceof NcdError ? e : fromDb(e)).message };
  }
}
