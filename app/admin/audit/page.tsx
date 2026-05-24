import type { Metadata } from "next";

import { PlaceholderPanel } from "../_components/placeholder-panel";

export const metadata: Metadata = {
  title: "Audit · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export default function AuditPage() {
  return (
    <PlaceholderPanel
      gate="C"
      eyebrow="Area 5 · Audit &amp; oversight"
      title="Audit console"
      intro="Makes the superadmin's power visible and reviewable — the surface a PDPO auditor would inspect first. Built early so every subsequent action across the workspace is visibly logged in here from the moment it ships."
      mvpBullets={[
        "Prominent first-class view of sa_audit_log: every cross-tenant read, approval, admin creation, catalog change, break-glass event.",
        "Filter by actor, action type, target tenant, and date (via the project DateRangePicker primitive — built as part of this gate).",
        "Export — itself an audited action; export writes its own sa_audit_log row capturing the filter applied.",
        "Break-glass events visually distinct / loud so they're impossible to miss.",
        "Surface the general public.audit_log too where relevant (e.g. specific tenant slice).",
      ]}
      deferredBullets={[
        "Mutation paths (none — the console is read + filter + export only). Append-only at the DB by trigger; UI cannot edit or delete.",
        "Auto-alerting on suspicious patterns (e.g. break-glass rate spikes). Lands when the alerting infra ships.",
      ]}
    />
  );
}
