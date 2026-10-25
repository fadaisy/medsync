import "server-only";

import { cookies } from "next/headers";

import { DEVICE_COOKIE, parseDeviceChoice } from "@/lib/patient-web/getting-in-device";

/** This session's own-device choice (D-PW-05), or null when the patient has not been asked yet. */
export async function readDeviceChoice() {
  return parseDeviceChoice((await cookies()).get(DEVICE_COOKIE)?.value);
}
