/**
 * Tide feature flags (build prompt §4). All start off.
 *
 * `EXPO_PUBLIC_MOBILE_FLAGS` turns one on for a build ("mobilePhoneOtp,mobileChat"): each feature that is
 * off for now stays built and wired, so switching it on is a setting, not a code change.
 *
 * `mobileClinicalData` cannot be turned on from the environment: it reads
 * patient readings, medicines, labs, mood and chat, which law L2 keeps off the
 * phone until the CSO signs Gate CG. Flipping `GATE_CG_SIGNED` is a reviewed
 * code change that names the signed artifact, not a build setting.
 */
export type Flag =
  | "mobileClinicalData"
  | "mobilePayments"
  | "mobileQrSignIn"
  | "mobileMapPin"
  | "mobilePhoneOtp"
  /** Care-team chat: hidden until there is a clinician inbox to answer it (ADR 0342). */
  | "mobileChat";

/** Gate CG governance artifact: not signed (17 Oct 2026). */
export const GATE_CG_SIGNED = false;

const fromEnv = new Set(
  (process.env.EXPO_PUBLIC_MOBILE_FLAGS ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
);

export function flag(name: Flag): boolean {
  if (name === "mobileClinicalData") return GATE_CG_SIGNED && fromEnv.has(name);
  return fromEnv.has(name);
}
