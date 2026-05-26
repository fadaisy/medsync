import { PlaceholderSurface } from "../_components/placeholder-surface";

export default function SchedulingPage() {
  return (
    <PlaceholderSurface
      title="Scheduling & queues"
      description="Per-department scheduling policy and aggregate walk-in / pre-queue visibility. Operational view only — never individual-patient clinical content."
      upcoming={[
        "Per-department scheduling policy (slot length, walk-in vs appointment)",
        "Live queue depth + wait-time per department (aggregate only)",
        "Daily / weekly throughput dashboards",
      ]}
    />
  );
}
