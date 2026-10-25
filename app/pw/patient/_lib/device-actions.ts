"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { DEVICE_COOKIE } from "@/lib/patient-web/getting-in-device";
import { resolvePatientScope } from "@/lib/patient/scope";

/**
 * Keeps the own-device answer for this browser session (D-PW-05): a session cookie (no maxAge), httpOnly,
 * SameSite=Lax, holding only the word. POST /sign-out deletes it in both modes. `resolve`, not `require`: the
 * dialog also shows over the consent gate.
 */
export async function setDeviceChoiceAction(choice: unknown): Promise<void> {
  const parsed = z.enum(["own", "shared"]).parse(choice);
  await resolvePatientScope();
  (await cookies()).set(DEVICE_COOKIE, parsed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
