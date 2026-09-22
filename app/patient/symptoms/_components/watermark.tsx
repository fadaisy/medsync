import { cn } from "@/lib/utils";

export const WATERMARK_TEXT = "Unsigned clinical content";

/**
 * Gate CS (ADR 0098 ruling 2): the draft catalog renders only under this
 * line. Visible and read aloud, not a faded overlay — a watermark nobody
 * notices is not a watermark. Amber is the caution pair, never red.
 */
export function Watermark({ className }: { className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        "bg-status-caution-bg text-status-caution-fg text-caption rounded-md px-3 py-1.5 font-medium",
        className,
      )}
    >
      {WATERMARK_TEXT} — for review only, not signed by the clinical safety officer.
    </p>
  );
}
