import { SectionStub } from "./_section-stub";

/**
 * §12 — [04] Built for Uganda — capability band.
 * Attio analogue: their stats band ("1M API calls/wk, sub-50ms...").
 *
 * MedSync: capability tiles (Offline-first, SMS fallback, Low-data, Local
 * data residency) — design COMMITMENTS, not invented usage metrics.
 */
export function UgandaCapabilities() {
  return (
    <SectionStub
      n={12}
      bracket={4}
      name="Built for the realities of Ugandan care"
      intent="Capability statement tiles (not invented metrics): Offline-first · SMS fallback · Low-data · Local data residency."
      runtime="server"
      buildAt="GATE D"
      todo={[
        "4 large statement tiles",
        "No invented uptime/latency unless we can cite a measured one",
        "Counter-style animation only if a real number; reduced-motion: shown immediately",
      ]}
    />
  );
}
