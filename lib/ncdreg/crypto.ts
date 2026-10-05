/**
 * Identifier encryption and blind indexes for the registry, through the repository's own layer
 * (lib/encryption.ts, ADR 0008). Name tokens and numbers are indexed with `blindIndex` under an NCD
 * domain prefix (D-17), so the same token never joins to another table's index.
 */
import "server-only";

import { blindIndex, decrypt, encrypt } from "@/lib/encryption";
import {
  nameTokens,
  normaliseHospitalNumber,
  normaliseNationalId,
  normalisePhone,
} from "./identity";

export const enc = (v: string | null | undefined) => (v == null || v === "" ? null : encrypt(v));
export const dec = (v: string | null | undefined) => (v == null ? null : decrypt(v));

export const nameTokenHmacs = (given: string, family: string) =>
  nameTokens(given, family).map((t) => blindIndex(`ncd-name:${t}`));
export const phoneHmac = (p: string | null | undefined) => {
  const n = normalisePhone(p);
  return n ? blindIndex(`ncd-phone:${n}`) : null;
};
export const hospitalNumberHmac = (h: string | null | undefined) => {
  const n = normaliseHospitalNumber(h);
  return n ? blindIndex(`ncd-hosp:${n}`) : null;
};
export const nationalIdHmac = (v: string | null | undefined) => {
  const n = normaliseNationalId(v);
  return n ? blindIndex(`ncd-nin:${n}`) : null;
};
