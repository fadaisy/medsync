"use server";

import { createLocation, CreateLocationInput } from "@/lib/pharmacy/stores/location-store";
import * as wards from "@/lib/pharmacy/stores/ward-store";
import { act, attestAnswer } from "./_lib/act";

/** Ward stock, pharmacy side (5.4; Section 8). Each action names its permission. */

/** `createLocation` for a ward (`pharmacy.manage`). */
export async function createWardLocation(raw: unknown) {
  return act("wards", CreateLocationInput, raw, "pharmacy.manage", (_w, i, ctx) =>
    createLocation(ctx, i),
  );
}
/** `setWardSupplyModel` (`pharmacy.manage`). */
export async function setWardSupplyModel(raw: unknown) {
  return act("wards", wards.WardSupplyInput, raw, "pharmacy.manage", wards.setWardSupplyModel);
}
/** `setWardLevels`: a draft (`pharmacy.manage`), signed with the ward's nurse in charge. */
export async function setWardLevels(raw: unknown) {
  return act("wards", wards.WardLevelsInput, raw, "pharmacy.manage", wards.setWardLevels);
}
/** A signer's second factor for ward levels (`pharmacy.manage`). */
export async function attestWardSigner(raw: unknown) {
  return attestAnswer(
    await act("wards", wards.AttestInput, raw, "pharmacy.manage", (who, input) =>
      wards.attestAtPlace(who, input, ["pack_first", "pack_second"]),
    ),
  );
}
/** `signPack` for ward levels (`pharmacy.manage` with the ward's nurse in charge, or the exception). */
export async function signWardLevels(raw: unknown) {
  return act("wards", wards.SignPackInput, raw, "pharmacy.manage", wards.signLocationPack);
}
/** `recordCount` at a ward (`pharmacy.stock`): blind; WS-3. */
export async function recordWardCount(raw: unknown) {
  return act("wards", wards.WardCountInput, raw, "pharmacy.stock", wards.recordWardCount);
}
/** `raiseRequisition` for a ward (`pharmacy.store`). */
export async function raiseWardRequisition(raw: unknown) {
  return act(
    "wards",
    wards.WardRequisitionInput,
    raw,
    "pharmacy.store",
    wards.raiseWardRequisition,
  );
}
