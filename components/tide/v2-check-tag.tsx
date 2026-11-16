import { CARE_V2_COPY } from "@/content/patient-app/care";
import { cn } from "@/lib/utils";

/**
 * A check's state on My care (patient app v2 §5.8): "Overdue" is amber, as the prompt asks, always with its word;
 * Due and Done are neutral. Its own file so the amber is allowlisted here alone (tests/patient-web/guards).
 */
export function CheckStateTag({ state }: { state: "due" | "overdue" | "done" }) {
  const M = CARE_V2_COPY.myCare;
  return (
    <span
      className={cn(
        "rounded-md px-2 py-1 text-[12px] font-semibold",
        state === "overdue"
          ? "bg-pw-caution-tint text-pw-caution-text"
          : "bg-pw-surface-2 text-pw-ink-2",
      )}
    >
      {{ due: M.due, overdue: M.overdue, done: M.done }[state]}
    </span>
  );
}
