import type { StageView } from "@patient-core/visit-stages";
import { STAGES } from "@patient-core/visit-stages";
import { BellRingIcon, CheckIcon } from "lucide-react";

import { buttonClass, ICON } from "@/components/tide/kit";
import { VISIT_COPY } from "@/content/patient-app/visit";
import { cn } from "@/lib/utils";

/**
 * Where you are on the day of the visit (patient app v2 §5.5, W3): five connected steps with time stamps, in
 * words only (MR4: never a position, a count ahead or a wait). The current step's own words can be more exact
 * than the strip's label ("Waiting for the doctor").
 */
export function StageList({ view, times }: { view: StageView; times: (string | null)[] }) {
  return (
    <ol className="flex flex-col" aria-label="Where you are">
      {STAGES.map((s, i) => {
        const done = i < view.index;
        const now = i === view.index;
        return (
          <li key={s} className="flex gap-3" aria-current={now ? "step" : undefined}>
            <span className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full",
                  done && "bg-pw-accent text-pw-on-accent",
                  now && "bg-pw-act text-pw-on-act",
                  !done && !now && "bg-pw-surface-3 text-pw-ink-3",
                )}
              >
                {done ? (
                  <CheckIcon className="size-4" {...ICON} />
                ) : (
                  <span className="size-2 rounded-full bg-current" />
                )}
              </span>
              {i < STAGES.length - 1 ? (
                <span
                  className={cn("my-1 min-h-5 w-0.5 flex-1", done ? "bg-pw-accent" : "bg-pw-line")}
                />
              ) : null}
            </span>
            <span className="flex flex-1 justify-between gap-3 pb-4">
              <span
                className={cn("text-[15px]", now ? "font-semibold" : done ? "" : "text-pw-ink-3")}
              >
                {now ? view.label : s}
              </span>
              <span className="text-pw-ink-3 text-[13px] tabular-nums">{times[i] ?? ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The compact five-step strip on Home's visit card. */
export function StageStrip({ view }: { view: StageView }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" aria-hidden>
        {STAGES.map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= view.index ? "bg-pw-accent" : "bg-pw-line",
            )}
          />
        ))}
      </div>
      <p className="text-[14px] font-semibold">{view.label}</p>
    </div>
  );
}

/** "Called to Room 4": a strong lagoon banner, announced assertively (§11). */
export function CalledBanner({
  room,
  code,
  onOnMyWay,
}: {
  room: string;
  code: string;
  onOnMyWay?: () => void;
}) {
  return (
    <section
      role="alert"
      aria-live="assertive"
      className="rounded-pw-card bg-pw-accent text-pw-on-accent shadow-pw-accent flex flex-wrap items-center gap-4 p-5"
    >
      <BellRingIcon className="size-7 shrink-0" {...ICON} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[20px] font-semibold">
          {VISIT_COPY.called.title.replace("{room}", room)}
        </p>
        <p className="font-pw-mono text-[15px] tracking-[0.12em]">{code}</p>
      </div>
      {onOnMyWay ? (
        <button type="button" onClick={onOnMyWay} className={buttonClass("primary", "m")}>
          {VISIT_COPY.called.onMyWay}
        </button>
      ) : null}
    </section>
  );
}
