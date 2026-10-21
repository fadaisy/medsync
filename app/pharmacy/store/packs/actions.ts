"use server";

import * as packs from "@/lib/pharmacy/stores/packs";
import { attestResult, bareResult, supplyAct } from "@/lib/pharmacy/stores/supply-action";

/**
 * Signed packs (Appendix D; Section 8 `saveSignedPack`, `signPack`; D-PH2-22). `pharmacy.manage` writes a draft and
 * signs it as the first signer; each signer confirms with their own password and code (`attestSigner`, never
 * logged, stored or returned). Shown when any Phase 2 flag or `pharmacyDispensing` is on.
 */

export async function saveSignedPack(raw: unknown) {
  return bareResult(
    await supplyAct(
      "saveSignedPack",
      "packs",
      packs.SavePackInput,
      raw,
      "pharmacy.manage",
      packs.saveSignedPack,
    ),
  );
}

/** A signer's second factor (purpose `signer`): the first signer themselves, or the second signer. */
export async function attestSigner(raw: unknown) {
  return attestResult(
    await supplyAct(
      "attestSigner",
      "packs",
      packs.AttestPersonInput,
      raw,
      "pharmacy.view",
      (ctx, i) => packs.attestPerson(ctx, { ...i, action: "sign_pack" }),
    ),
  );
}

export async function signPack(raw: unknown) {
  return bareResult(
    await supplyAct(
      "signPack",
      "packs",
      packs.SignPackInput,
      raw,
      "pharmacy.manage",
      packs.signPack,
    ),
  );
}
