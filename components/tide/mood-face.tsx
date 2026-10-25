import type { Mood } from "@patient-core/log";

import { MOOD_COPY } from "@/content/patient/home";
import { cn } from "@/lib/utils";

/**
 * The three mood faces and an empty ring for a day not recorded (the phone's `mood-face.tsx`, same paths).
 * The phone paints them from `t.mood`, which the web token block does not carry yet, so they take the
 * nearest Tide tokens; never amber or green (L4). `pop` grows the face when it has just been picked.
 */
export function MoodFace({
  mood,
  size = 48,
  pop = false,
  decorative = false,
}: {
  mood: Mood;
  size?: number;
  pop?: boolean;
  /** Inside a control that already names it. */
  decorative?: boolean;
}) {
  const line = "fill-none stroke-pw-ink [stroke-linecap:round]";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : MOOD_COPY.faces[mood]}
      className={cn(
        "shrink-0 transition-[scale] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        pop && "scale-[1.2] motion-reduce:scale-100",
      )}
    >
      {mood === "good" ? (
        <>
          <circle cx={24} cy={24} r={22} className="fill-pw-accent-soft" />
          <path d="M13.5 21.5 q3.5 -4.5 7 0" strokeWidth={2.6} className={line} />
          <path d="M27.5 21.5 q3.5 -4.5 7 0" strokeWidth={2.6} className={line} />
          <path d="M14 28 q10 11 20 0 z" className="fill-pw-ink" />
        </>
      ) : null}
      {mood === "okay" ? (
        <>
          <circle cx={24} cy={24} r={22} className="fill-pw-info-tint" />
          <circle cx={17} cy={21} r={2.8} className="fill-pw-ink" />
          <circle cx={31} cy={21} r={2.8} className="fill-pw-ink" />
          <path d="M16.5 31.5 L31.5 29.5" strokeWidth={2.6} className={line} />
          <path d="M27 14 l6 1.5" strokeWidth={2.2} className={line} />
        </>
      ) : null}
      {mood === "low" ? (
        <>
          <circle cx={24} cy={24} r={22} className="fill-pw-surface-3" />
          <path d="M13 18.5 l6.5 2.5" strokeWidth={2.3} className={line} />
          <path d="M35 18.5 l-6.5 2.5" strokeWidth={2.3} className={line} />
          <circle cx={17.5} cy={24.5} r={2.6} className="fill-pw-ink" />
          <circle cx={30.5} cy={24.5} r={2.6} className="fill-pw-ink" />
          <path d="M17 35 q7 -6.5 14 0" strokeWidth={2.6} className={line} />
          <path d="M37.5 11 q2.5 4 0 6 q-2.5 -2 0 -6 z" className="fill-pw-area-readings" />
        </>
      ) : null}
      {mood === "none" ? (
        <circle
          cx={24}
          cy={24}
          r={21}
          strokeWidth={2}
          strokeDasharray="3 4"
          className="stroke-pw-line-strong fill-none"
        />
      ) : null}
    </svg>
  );
}
