"use client";

import type { Rhythm } from "@/lib/resus/model";
import { useId, useState } from "react";
import { ActivityIcon, HeartPulseIcon, MinusIcon, StethoscopeIcon, ZapIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { BtnText, consoleBtn, Overline } from "./arrest-console-model";

/**
 * RHYTHM — one tap records the rhythm check (ALS-RHY-*). VF/pVT primes Shock; PEA and
 * asystole restart the cycle; "Organised" first asks "Pulse?" inline (ALS-RHY-02) so one
 * check is one record: Yes → rhythm check with a pulse, then the ROSC confirm; No → PEA.
 * `data-console-key="r"` on the first button: the R key focuses the group.
 */

const RHYTHMS: { r: Rhythm; label: string; caption: string; icon: typeof ZapIcon }[] = [
  { r: "vf_pvt", label: "VF / pVT", caption: "Shockable", icon: ZapIcon },
  { r: "pea", label: "PEA", caption: "Non-shockable", icon: ActivityIcon },
  { r: "asystole", label: "Asystole", caption: "Non-shockable", icon: MinusIcon },
  { r: "organised", label: "Organised", caption: "Check pulse", icon: StethoscopeIcon },
];

export function RhythmRow({
  current,
  onRhythm,
  onPulse,
}: {
  current: Rhythm | null;
  onRhythm: (r: Rhythm) => void;
  onPulse: (present: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);
  const pulseId = useId();

  return (
    <div role="group" aria-label="Rhythm check" className="flex flex-col gap-2">
      <Overline>Rhythm</Overline>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RHYTHMS.map(({ r, label, caption, icon: Icon }, i) => (
          <button
            key={r}
            type="button"
            data-console-key={i === 0 ? "r" : undefined}
            // "Organised" only reveals the Pulse? question — a disclosure, nothing recorded yet.
            aria-expanded={r === "organised" ? asking : undefined}
            aria-controls={r === "organised" && asking ? pulseId : undefined}
            onClick={() => (r === "organised" ? setAsking((v) => !v) : onRhythm(r))}
            className={consoleBtn(
              "neutral",
              cn(current === r && "ring-offset-background ring-2 ring-teal-500/70 ring-offset-1"),
            )}
          >
            <Icon aria-hidden className="size-5 shrink-0" />
            <BtnText
              label={label}
              caption={current === r ? `${caption} · last recorded` : caption}
            />
          </button>
        ))}
      </div>
      {asking ? (
        <div
          id={pulseId}
          role="group"
          aria-label="Organised rhythm — pulse?"
          className="border-border bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-2"
        >
          <span className="text-body-m px-1 font-medium">Pulse?</span>
          <button
            type="button"
            className={consoleBtn("primed", "min-h-12")}
            onClick={() => {
              setAsking(false);
              onPulse(true);
            }}
          >
            <HeartPulseIcon aria-hidden className="size-5" />
            <BtnText label="Yes" caption="Confirm ROSC" />
          </button>
          <button
            type="button"
            className={consoleBtn("neutral", "min-h-12")}
            onClick={() => {
              setAsking(false);
              onPulse(false);
            }}
          >
            <ActivityIcon aria-hidden className="size-5" />
            <BtnText label="No" caption="Record as PEA" />
          </button>
          <button
            type="button"
            className="tap text-body-s text-muted-foreground hover:bg-muted min-h-11 rounded-md px-3"
            onClick={() => setAsking(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
