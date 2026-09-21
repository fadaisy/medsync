import { Pill } from "@/components/ui/pill";
import { AVAILABILITY_KIND_LABEL, AVAILABILITY_KIND_TONES } from "./helpers";

/**
 * The key to the calendar's availability tints — one pill per kind present,
 * each with its word (never colour alone). ADR 0095; mounted under the
 * doctor's calendar. Only the kinds in the window: a legend for blocks the
 * clinician has not declared explains nothing.
 *
 * Ordered by the label map, which lists kinds in AVAILABILITY_KINDS order
 * (held by tests/scheduling/availability-kinds.test.ts) — importing the
 * schema constant here would drag drizzle into every client bundle.
 */
export function AvailabilityLegend({ kinds }: { kinds: ReadonlyArray<string> }) {
  const present = Object.keys(AVAILABILITY_KIND_LABEL).filter((k) => kinds.includes(k));
  if (present.length === 0) return null;
  return (
    <ul aria-label="Block colours" className="flex flex-wrap items-center gap-1.5">
      {present.map((k) => (
        <li key={k}>
          <Pill tone={AVAILABILITY_KIND_TONES[k]}>{AVAILABILITY_KIND_LABEL[k]}</Pill>
        </li>
      ))}
    </ul>
  );
}
