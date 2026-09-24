"use client";

import type { ConsoleAudio } from "./console-audio";
import type { ArrestState } from "@/lib/resus/model";
import type { LucideIcon } from "lucide-react";
import type { RefObject } from "react";
import {
  KeyboardIcon,
  MetronomeIcon,
  TriangleAlertIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtMs } from "./arrest-console-model";

/**
 * The arrest strip — the one red surface of the console (Law 5: the arrest state). The
 * heading takes focus on entry. A+ counts from this arrest's declaration, the resus T+ from
 * the episode start; the audio toggles are one tap each and say their state in words. With
 * no recorded age the engine runs adult rules (ALS-MOD-16): the strip says so.
 */

// The tap ring (teal) vanishes on the red strip: a white ring, like the heading's.
const stripBtn =
  "tap text-body-s inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-white/40 px-2.5 font-medium hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white aria-pressed:border-white aria-pressed:bg-rose-800 dark:border-red-900 dark:hover:bg-red-950 dark:aria-pressed:bg-red-950";

export function ArrestStrip({
  headingRef,
  seq,
  arrest,
  now,
  startedAtIso,
  audio,
  ageUnknown,
  onHelp,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  seq: number;
  arrest: ArrestState;
  now: number;
  startedAtIso: string;
  audio: ConsoleAudio;
  ageUnknown: boolean;
  onHelp: () => void;
}) {
  return (
    <header className="dark:bg-status-critical-bg dark:text-status-critical-fg flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-rose-600 px-4 py-2 text-white dark:border dark:border-red-900">
      <TriangleAlertIcon aria-hidden className="size-5 shrink-0" />
      <h2
        id="arrest-console-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-heading-s rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        Cardiac arrest #{Math.max(1, seq)}
      </h2>
      <p className="text-body-m flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono tabular-nums">A+{fmtMs(arrest.arrestElapsedMs, "mm")}</span>
        <span aria-hidden>·</span>
        <span>Cycle {arrest.cycle.number}</span>
        <span aria-hidden className="hidden sm:inline">
          ·
        </span>
        <span className="hidden font-mono tabular-nums sm:inline">
          Resus T+{fmtMs(now - Date.parse(startedAtIso), "hms")}
        </span>
      </p>
      {ageUnknown ? (
        <p className="text-body-s font-medium">Age not recorded — adult protocol</p>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <StripToggle
          on={audio.tone}
          onClick={audio.toggleTone}
          icon={audio.tone ? Volume2Icon : VolumeXIcon}
          name="Rhythm-check tone"
          word="Tone"
        />
        {audio.metronomeAvailable ? (
          <StripToggle
            on={audio.metronome}
            onClick={audio.toggleMetronome}
            icon={MetronomeIcon}
            name="Metronome"
            word="Metronome"
          />
        ) : null}
        <button
          type="button"
          aria-label="Keyboard shortcuts"
          onClick={onHelp}
          className={cn(stripBtn, "hidden lg:inline-flex")}
        >
          <KeyboardIcon aria-hidden className="size-4" />
        </button>
      </div>
    </header>
  );
}

/** A one-tap toggle: a stable name for assistive tech, the state as a visible word. */
function StripToggle({
  on,
  onClick,
  icon: Icon,
  name,
  word,
}: {
  on: boolean;
  onClick: () => void;
  icon: LucideIcon;
  name: string;
  word: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={name}
      onClick={onClick}
      className={stripBtn}
    >
      <Icon aria-hidden className="size-4" />
      {/* The state in words at every width: "On" on a phone, "Tone on" from sm up. */}
      <span aria-hidden className="sm:hidden">
        {on ? "On" : "Off"}
      </span>
      <span aria-hidden className="hidden sm:inline">
        {word} {on ? "on" : "off"}
      </span>
    </button>
  );
}
