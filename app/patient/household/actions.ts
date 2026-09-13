"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BOOKING_AGENT_RELATIONSHIPS } from "@/db/schema/provisional-patients";
import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";

/**
 * Add a person to the household list (PRD §2.9, ADR 0089). The write is
 * `pt-add-household-member` — the one writer of provisional_patients +
 * booking_agents for a patient, which encrypts the name and phone, keys the
 * blind index and audits `add_booking_agent`. This action only parses the
 * form and pins the scope; it never touches the tables.
 *
 * Adults only at this gate: the Edge Function refuses a minor with one
 * sentence, and that sentence is what the form shows.
 */
const AddMemberSchema = z
  .object({
    member_label: z.string().trim().min(1, "Give this person a name.").max(80),
    phone_e164: z
      .string()
      .trim()
      .regex(/^\+256(7\d{8}|[23489]\d{7,8})$/, "A Ugandan number, like +256 7XX XXX XXX."),
    date_of_birth: z.string().date().optional(),
    age_years: z.coerce.number().int().min(0).max(130).optional(),
    declared_adult: z.boolean(),
    relationship: z.enum(BOOKING_AGENT_RELATIONSHIPS),
  })
  .refine((i) => i.date_of_birth || i.age_years !== undefined, {
    message: "Give a date of birth or an age.",
    path: ["age_years"],
  });

/** `stamp` changes per success so the form can remount (clear) once per add, not on a later error. */
export type HouseholdActionState = { ok?: boolean; error?: string; stamp?: number };

export async function addHouseholdMemberAction(
  prev: HouseholdActionState,
  formData: FormData,
): Promise<HouseholdActionState> {
  // A refusal keeps the last success's stamp, so the form does not remount.
  const refuse = (error: string): HouseholdActionState => ({ error, stamp: prev.stamp });
  const dob = String(formData.get("date_of_birth") ?? "").trim();
  const age = String(formData.get("age_years") ?? "").trim();
  const parsed = AddMemberSchema.safeParse({
    member_label: formData.get("member_label"),
    phone_e164: normalisePhone(String(formData.get("phone_e164") ?? "")),
    date_of_birth: dob || undefined,
    age_years: age || undefined,
    declared_adult: formData.get("declared_adult") === "on",
    relationship: formData.get("relationship"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return refuse(first ?? "Please check the values.");
  }
  await requirePatientScope();
  const result = await callEdge("pt-add-household-member", parsed.data, "patient.household");
  if (!result.ok) return refuse(result.error);
  revalidatePath("/patient/household");
  revalidatePath("/patient/book");
  return { ok: true, stamp: Date.now() };
}

/** "0772 123 456" → "+256772123456"; already-E.164 input passes through. */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s()-]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.startsWith("256")) return `+${digits}`;
  return digits;
}
