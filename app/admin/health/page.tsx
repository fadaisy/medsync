import type { Metadata } from "next";

import { PlaceholderPanel } from "../_components/placeholder-panel";

export const metadata: Metadata = {
  title: "Health · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export default function HealthPage() {
  return (
    <PlaceholderPanel
      gate="E"
      eyebrow="Area 6 · Platform health"
      title="Platform health"
      tag="MVP"
      intro={
        '"Is the platform okay right now?" — a glanceable strip, not a dashboard. Aggregate, operational metrics only; no patient-level data ever appears here.'
      }
      mvpBullets={[
        "Tenant counts: active vs. pending (top-line health of onboarding).",
        "Approval backlog (links to /admin).",
        "System status (the /api/health Phase 0 check).",
        "Recent error count from Sentry.",
        "Recent failed-login / security signals (auth.audit_log_entries summary).",
      ]}
      deferredBullets={[
        "Full dashboards / trend charts.",
        "SMS delivery analytics (Africa's Talking — ships with the SMS phase).",
        "Auto-alerting on threshold breaches.",
      ]}
    />
  );
}
