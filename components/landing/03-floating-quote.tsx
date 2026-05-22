import { SectionStub } from "./_section-stub";

/**
 * §03 — Floating quote strip. Attio analogue: floating customer testimonial.
 * Substitute: clinical-mission line attributed to the MedSync founding team
 * (per spec rule #2 — no fabricated testimonials).
 */
export function FloatingQuote() {
  return (
    <SectionStub
      n={3}
      name="Floating quote"
      intent={`Honest substitute for Attio's customer quote: a founders'-voice mission line attributed to the MedSync founding team (or Usama Fadhul + role per GATE A decision).`}
      runtime="server"
      buildAt="GATE B"
      todo={[
        "Confirm exact wording at GATE B",
        "Attribution: MedSync founding team OR Usama Fadhul, founder + Clinical Safety Officer",
        "prefers-reduced-motion: skip fade-in",
      ]}
    />
  );
}
