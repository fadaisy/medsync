import { SectionStub } from "./_section-stub";

/**
 * §08 — CTA band #1 (mid-page). Attio analogue: "Start with 14 days of Pro,
 * for free." + 3 CTAs.
 *
 * Per spec: no free-trial language ("Express interest" / "Request a pilot"
 * instead).
 */
export function CtaBandMid() {
  return (
    <SectionStub
      n={8}
      name="CTA band #1 (mid-page)"
      intent={`Mid-page conversion break. Copy direction: "Care that doesn't stop at the gate." + the three audience doors (consistent with hero).`}
      runtime="server"
      buildAt="GATE C"
      todo={[
        "Dark CTA block per design system (bg-teal-900 / dark surface)",
        "Three CTAs: For patients / For clinicians / Request a pilot (hospitals)",
        'No "free trial" language',
      ]}
    />
  );
}
