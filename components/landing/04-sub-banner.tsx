import { SectionStub } from "./_section-stub";

/**
 * §04 — Sub-banner / chip just above the hero H1. Attio analogue: the small
 * "Meet the Developer Platform, now with MCP" pill.
 */
export function SubBanner() {
  return (
    <SectionStub
      n={4}
      name="Sub-banner chip"
      intent='One honest highlight chip linking to hospital onboarding. Working copy: "Now inviting founding hospital partners in Uganda →".'
      runtime="server"
      buildAt="GATE B"
      todo={["Pill component; teal-tinted; routes to /onboarding/hospital"]}
    />
  );
}
