"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";

/**
 * Patient updates their own editable profile fields. Identity fields
 * (first/surname/DoB/sex/ID number/patient code) are NOT editable here
 * — per the GATE A proposal those go through a future "request a
 * change" surface so the audit trail captures the intent.
 *
 * Uses Drizzle (service-role) rather than the authed Supabase client
 * because the encryption helper runs server-side; the scope helper
 * has already authenticated the user and we filter by `id = scope.userId`.
 * RLS is defence-in-depth, not the only guard.
 */

const NOK_RELATIONSHIPS = [
  "spouse",
  "parent",
  "child",
  "sibling",
  "guardian",
  "friend",
  "other",
] as const;

const UpdateSchema = z.object({
  phone: z.string().min(4, "Phone is required.").max(40),
  village_address: z.string().max(240).optional(),
  preferred_language: z.string().max(40).optional(),
  // Conditions: comma-separated. We split + trim + de-dupe + drop blanks.
  known_conditions: z.string().max(500).optional(),
  nok_name: z.string().max(120).optional(),
  nok_relationship: z.enum(NOK_RELATIONSHIPS).or(z.literal("")).optional(),
  nok_phone: z.string().max(40).optional(),
});

export type ProfileUpdateState = {
  ok?: boolean;
  error?: string;
};

export async function updatePatientProfileAction(
  _prev: ProfileUpdateState,
  formData: FormData,
): Promise<ProfileUpdateState> {
  const parsed = UpdateSchema.safeParse({
    phone: formData.get("phone"),
    village_address: stringOrUndef(formData.get("village_address")),
    preferred_language: stringOrUndef(formData.get("preferred_language")),
    known_conditions: stringOrUndef(formData.get("known_conditions")),
    nok_name: stringOrUndef(formData.get("nok_name")),
    nok_relationship: (formData.get("nok_relationship") as string | null) ?? "",
    nok_phone: stringOrUndef(formData.get("nok_phone")),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const scope = await requirePatientScope();

  const conditions = parseConditions(parsed.data.known_conditions);

  // NoK: enforce both name + phone or neither (skip silently for empty).
  const hasNokName = !!parsed.data.nok_name;
  const hasNokPhone = !!parsed.data.nok_phone;
  if (hasNokName !== hasNokPhone) {
    return { error: "Next of kin needs both a name and a phone (or neither)." };
  }

  try {
    await db
      .update(patientProfiles)
      .set({
        phoneEncrypted: encrypt(parsed.data.phone.trim()),
        villageAddressEncrypted: parsed.data.village_address
          ? encrypt(parsed.data.village_address.trim())
          : null,
        preferredLanguage: parsed.data.preferred_language ?? null,
        knownConditions: conditions.length > 0 ? conditions : null,
        nokNameEncrypted: parsed.data.nok_name ? encrypt(parsed.data.nok_name.trim()) : null,
        nokRelationship: parsed.data.nok_relationship ? parsed.data.nok_relationship : null,
        nokPhoneEncrypted: parsed.data.nok_phone ? encrypt(parsed.data.nok_phone.trim()) : null,
        updatedAt: new Date(),
      })
      .where(eq(patientProfiles.id, scope.userId));
  } catch (err) {
    logger.error("patient.profile.update_failed", { reason: String(err) });
    return { error: "We couldn't save those changes — try again in a moment." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/profile");
  return { ok: true };
}

function stringOrUndef(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function parseConditions(raw: string | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(/[,\n]/)) {
    const trimmed = part.trim();
    if (trimmed) out.add(trimmed);
  }
  return Array.from(out).slice(0, 24);
}
