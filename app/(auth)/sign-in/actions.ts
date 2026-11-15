"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { SIGN_IN } from "@/content/auth";
import { logger } from "@/lib/logger";
import { createClient, setActiveAccount, slotForSignIn } from "@/lib/supabase/server";
import { safeRedirect, signInErrorMessage } from "./errors";
import { landingFor } from "./landing";

const SignInSchema = z.object({
  email: z.string().email(SIGN_IN.errors.email),
  password: z.string().min(1, SIGN_IN.errors.required),
  redirect: z.string().optional(),
});

export type SignInState = {
  errors?: Partial<Record<"email" | "password" | "_form", string>>;
  /** The password was right and the account has an authenticator: the code field opens under the password. */
  mfa?: { redirect: string };
};

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirect: formData.get("redirect") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      errors: {
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
    };
  }

  // Its own cookie slot, so the accounts already signed in here stay signed in.
  const slot = await slotForSignIn(parsed.data.email);
  const supabase = await createClient(slot);
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.warn("sign-in failed", { reason: error.message });
    // Never leak whether email exists: one message for an unknown email and a
    // wrong password. Only a rate limit (429) says something different.
    return { errors: { _form: signInErrorMessage(error) } };
  }
  await setActiveAccount(slot);

  // An account with an authenticator gives its code on this page, not a second one. The level is asked for with
  // the new session's token: that session is not in this request's cookies yet, and without the token the answer
  // was "no code needed", so the page redirected and the separate code page caught it.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(
    signInData.session?.access_token,
  );
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    logger.info("sign-in password accepted; code next");
    return { mfa: { redirect: parsed.data.redirect ?? "" } };
  }

  // The landing decides whether ?redirect= may be honoured (a path the user may open, LD-4).
  const landing = signInData.user
    ? await landingFor(signInData.user.id, parsed.data.redirect)
    : { target: safeRedirect(parsed.data.redirect) ?? "/", reason: "default-landing" };
  const target = landing.target;

  logger.info("sign-in succeeded", { target, routeReason: landing.reason });
  redirect(target);
}
