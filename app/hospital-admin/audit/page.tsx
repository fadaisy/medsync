import { PlaceholderSurface } from "../_components/placeholder-surface";

export default function AuditPage() {
  return (
    <PlaceholderSurface
      title="Audit"
      description="Every staff change, every structural change, every admin action — for this hospital. Filterable, exportable. The export itself is an audited action."
      upcoming={[
        "Filterable activity ledger (actor, action, target, time)",
        "Per-action evidence panel (before/after, reason)",
        "Export as CSV — recorded in the same ledger",
      ]}
    />
  );
}
