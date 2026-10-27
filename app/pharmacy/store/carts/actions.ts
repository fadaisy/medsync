"use server";

import { reportSealBroken, SealBrokenInput } from "@/lib/pharmacy/distribution/store";
import * as carts from "@/lib/pharmacy/stores/cart-store";
import { createLocation, CreateLocationInput } from "@/lib/pharmacy/stores/location-store";
import * as wards from "@/lib/pharmacy/stores/ward-store";
import { act, attestAnswer } from "../wards/_lib/act";

/** Emergency carts, pharmacy side (5.5; Section 8). Each action names its permission. */

/** `createLocation` for a cart (`pharmacy.manage`). */
export async function createCartLocation(raw: unknown) {
  return act("carts", CreateLocationInput, raw, "pharmacy.manage", (_w, i, ctx) =>
    createLocation(ctx, i),
  );
}
/** `setCartList`: a draft (`pharmacy.manage`), signed with the unit's clinical lead. */
export async function setCartList(raw: unknown) {
  return act("carts", wards.CartListInput, raw, "pharmacy.manage", wards.setCartList);
}
/** A signer's second factor for a cart list (`pharmacy.manage`). */
export async function attestCartSigner(raw: unknown) {
  return attestAnswer(
    await act("carts", wards.AttestInput, raw, "pharmacy.manage", (who, input) =>
      wards.attestAtPlace(who, input, ["pack_first", "pack_second"]),
    ),
  );
}
/** `signPack` for a cart list (`pharmacy.manage` with the unit's clinical lead, or the exception). */
export async function signCartList(raw: unknown) {
  return act("carts", wards.SignPackInput, raw, "pharmacy.manage", wards.signLocationPack);
}
/** The unit nurse in charge's second factor for a cart check (`pharmacy.stock`). */
export async function attestCartConfirmer(raw: unknown) {
  return attestAnswer(
    await act("carts", wards.AttestInput, raw, "pharmacy.stock", (who, input) =>
      wards.attestAtPlace(who, input, ["cart_confirm"]),
    ),
  );
}
/** `recordCartCheck` (`pharmacy.stock` + the unit nurse in charge's confirmation): EC-1 to EC-4. */
export async function recordCartCheck(raw: unknown) {
  return act("carts", carts.CartCheckInput, raw, "pharmacy.stock", carts.recordCartCheck);
}
/** 4.14 a cart's seal reported broken (`pharmacy.stock`); never a movement (ADR 0465). */
export async function reportCartSealBroken(raw: unknown) {
  return act("carts", SealBrokenInput, raw, "pharmacy.stock", reportSealBroken);
}
