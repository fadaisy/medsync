import { SectionStub } from "./_section-stub";

/**
 * §05 — Hero. Attio analogue: H1 + subhead + 3 CTAs + dominant app mock below.
 *
 * Decided at GATE A:
 *   - H1 direction: "The hospital that doesn't stop at the gate." (final wording at GATE B)
 *   - Three-equal CTA doors: For patients / For clinicians / For hospitals
 *   - Hero mock = "Clinician Home" — see clinician-home-mock.tsx (built at GATE B)
 */
export function Hero() {
  return (
    <SectionStub
      n={5}
      name="Hero"
      intent='H1 + subhead + three equal CTA doors (patients / clinicians / hospitals) + dominant "Clinician Home" mock below.'
      runtime="server"
      buildAt="GATE B"
      todo={[
        'Final H1 wording (currently: "The hospital that doesn\'t stop at the gate.")',
        "Subhead: closed-loop premise in one sentence",
        "Three equal Button[primary, secondary, tealSoft] routing to /onboarding/{patient,clinical,hospital}",
        "Full Clinician Home mock (see ClinicianHomeMock component)",
        "Parallax/reveal on load (reduced-motion: static)",
      ]}
    />
  );
}
