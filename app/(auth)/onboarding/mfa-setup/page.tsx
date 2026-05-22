import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { createClient } from "@/lib/supabase/server";
import { MfaSetupForm } from "./form";

export const metadata: Metadata = { title: "Set up two-factor" };

/**
 * MFA enrolment. Server-rendered: we call mfa.enroll() at request time so the
 * QR code lives in the HTML (no client roundtrip, no risk of the secret
 * leaking via XHR). The factor stays "unverified" in Supabase until the user
 * submits a matching 6-digit code (handled by verifyEnrollmentAction).
 */
export default async function MfaSetupPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?redirect=/onboarding/mfa-setup");

  // If the user already has a verified TOTP factor, skip the page.
  // (Supabase's listFactors().totp is pre-filtered to verified-only;
  // unverified factors live in .all.)
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp?.[0]) redirect("/dashboard");

  // Clean up any stale unverified factor from a previous attempt.
  const unverified =
    factors?.all?.filter((f) => f.factor_type === "totp" && f.status === "unverified") ?? [];
  for (const stale of unverified) {
    await supabase.auth.mfa.unenroll({ factorId: stale.id });
  }

  const friendlyName = `MedSync (${new Date().toISOString().slice(0, 10)})`;
  const { data: enroll, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
    issuer: "MedSync",
  });

  if (error || !enroll || enroll.type !== "totp") {
    return (
      <div className="bg-card border-border rounded-lg border p-6">
        <p className="text-status-critical-fg text-body-s">
          Could not start MFA enrolment: {error?.message ?? "unknown error"}
        </p>
      </div>
    );
  }

  const qrSvg = await QRCode.toString(enroll.totp.uri, {
    type: "svg",
    margin: 1,
    width: 200,
    color: { dark: "#0D9488", light: "#FFFFFF00" },
  });

  return <MfaSetupForm factorId={enroll.id} secret={enroll.totp.secret} qrSvg={qrSvg} />;
}
