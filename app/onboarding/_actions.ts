"use server";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const INTEREST_AUDIENCES = ["patient", "clinical", "hospital"] as const;

const SignupSchema = z.object({
  audience: z.enum(INTEREST_AUDIENCES),
  full_name: z.string().min(1, "Required.").max(120),
  email: z.string().email("Enter a valid email."),
  context: z.string().max(800).optional(),
  hospital_name: z.string().max(200).optional(),
  role: z.string().max(120).optional(),
  source: z.string().max(60).optional(),
});

export type InterestState = {
  ok?: boolean;
  errors?: Partial<
    Record<"full_name" | "email" | "context" | "hospital_name" | "role" | "_form", string>
  >;
};

/**
 * Insert via the anon Supabase client (the RLS policy allows anon INSERT).
 * Using the browser-side createClient here on the server is fine — the
 * client is auth-aware via cookies, and for unauth requests it just uses
 * the anon key. The RLS INSERT policy is the actual gate.
 */
export async function submitInterestAction(
  audience: (typeof INTEREST_AUDIENCES)[number],
  _prev: InterestState,
  formData: FormData,
): Promise<InterestState> {
  const parsed = SignupSchema.safeParse({
    audience,
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    context: formData.get("context") || undefined,
    hospital_name: formData.get("hospital_name") || undefined,
    role: formData.get("role") || undefined,
    source: formData.get("source") || undefined,
  });

  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return {
      errors: {
        full_name: f.full_name?.[0],
        email: f.email?.[0],
        context: f.context?.[0],
        hospital_name: f.hospital_name?.[0],
        role: f.role?.[0],
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("interest_signups").insert(parsed.data);

  if (error) {
    logger.warn("interest signup failed", { audience, reason: error.message });
    return { errors: { _form: "Couldn't save your interest. Try again in a moment." } };
  }

  logger.info("interest signup recorded", { audience });
  return { ok: true };
}
