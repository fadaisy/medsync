/**
 * The own-device choice (D-PW-05) and idle sign-out (D-PW-06), pure so the client and the server share
 * them. The choice lives in one httpOnly, SameSite=Lax session cookie holding only "own" or "shared": no
 * PHI, and nothing in browser storage. No choice yet counts as shared (the default is No).
 */
export type DeviceChoice = "own" | "shared";

export const DEVICE_COOKIE = "pw-device";

/** Where an idle sign-out lands: the shared sign-in, which then shows PATIENT_WEB_COPY.idleSignedOut. */
export const IDLE_SIGNED_OUT_URL = "/sign-in?idle=1";

const MINUTE = 60_000;
export const IDLE_MS: Record<DeviceChoice, number> = {
  shared: 15 * MINUTE,
  own: 7 * 24 * 60 * MINUTE,
};

export function parseDeviceChoice(value: string | undefined | null): DeviceChoice | null {
  return value === "own" || value === "shared" ? value : null;
}

export function idleExpired(lastActive: number, now: number, choice: DeviceChoice | null): boolean {
  return now - lastActive >= IDLE_MS[choice ?? "shared"];
}
