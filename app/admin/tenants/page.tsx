import type { Metadata } from "next";

import { PlaceholderPanel } from "../_components/placeholder-panel";

export const metadata: Metadata = {
  title: "Tenants · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export default function TenantsPage() {
  return (
    <PlaceholderPanel
      gate="D"
      eyebrow="Area 2 · Tenant management"
      title="Tenants"
      tag="MVP"
      intro="Manage hospitals as platform tenants. The MVP slice covers the day-to-day shape: see who's onboarded, who's pending, who's active; activate an approved hospital; designate or confirm its first hospital admin."
      mvpBullets={[
        "List every hospital with its state (pending / active / suspended).",
        "View a hospital's departments, staff counts, and admins.",
        "Activate an approved hospital (sets hospitals.state = active) via Edge Function with sa_audit_log entry.",
        "Designate or confirm the first hospital admin for an approved tenant.",
      ]}
      deferredBullets={[
        "Suspend / deactivate a tenant — four-eyes-class. Defers until the four-eyes wiring (GATE F) is exercised end-to-end, with confirm-friction (type the hospital name) and soft-state. Clinical data is never hard-deleted.",
        "Detailed per-tenant configuration and tenant-level settings panel.",
      ]}
    />
  );
}
