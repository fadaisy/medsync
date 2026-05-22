import { SectionStub } from "./_section-stub";

/**
 * §12b — Trust / governance sub-band under [04].
 * Attio analogue: their security band ("ISO, GDPR, CCPA").
 * Per spec: NO certification badges we don't hold. Honest engineering claims.
 */
export function TrustGovernance() {
  return (
    <SectionStub
      n={12}
      name='Trust — "Built in, not bolted on"'
      intent="Honest governance posture: Uganda Data Protection and Privacy Act 2019 · encryption in transit + at rest · RLS at the DB layer · append-only audit · mandatory MFA for clinical users · patient consent & control · the Patient Data Committee. Framed as HIPAA-equivalent technical controls."
      runtime="server"
      buildAt="GATE D"
      todo={[
        "Item list of 7 governance points (real claims only)",
        'CTA: "Talk to us about a hospital pilot" → /onboarding/hospital',
        "NO ISO/HIPAA/SOC2 badges (none held)",
      ]}
    />
  );
}
