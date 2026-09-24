"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ALS_REFS } from "@/lib/resus/reference/als-catalog";
import { refValue } from "@/lib/resus/reference/ref";

/**
 * Arrest console audio and haptics (prompt §5.9, D15). A gentle two-note tone when the
 * rhythm check falls due (on by default from the hospital setting, one-tap mute), an
 * optional metronome (off by default, one tap on) and a vibration on phones that support
 * it. Audio is never the only cue: the cycle bar, the Next list and the assertive live
 * region carry the same message.
 *
 * Browsers only let audio start after a user gesture, so the AudioContext is created /
 * resumed on the first pointer or key press anywhere on the page.
 */

/** ALS-CPR-13 (110 /min, inside the signed 100–120). NaN — metronome hidden — until signed. */
export const METRONOME_PER_MIN = Number(refValue(ALS_REFS["ALS-CPR-13"]!));

// The console unmounts behind the "Survey (paused)" tab; the choices survive in this tab.
const prefs: { tone?: boolean; metronome?: boolean } = {};

type AudioCtor = typeof AudioContext;
function audioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ??
    null
  );
}

function beep(ctx: AudioContext, at: number, hz: number, seconds: number, gain: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(g).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

export interface ConsoleAudio {
  tone: boolean;
  toggleTone: () => void;
  metronome: boolean;
  toggleMetronome: () => void;
  metronomeAvailable: boolean;
}

/**
 * `cueKey` changes once per due rhythm check (null otherwise) — each new key cues once.
 * `running` = an arrest is in progress (the metronome only ticks then).
 */
export function useConsoleAudio(opts: {
  cueKey: string | null;
  running: boolean;
  toneDefault: boolean;
}): ConsoleAudio {
  const [tone, setTone] = useState(() => prefs.tone ?? opts.toneDefault);
  const [metronome, setMetronome] = useState(() => prefs.metronome ?? false);
  const ctxRef = useRef<AudioContext | null>(null);
  const toneRef = useRef(tone);
  useLayoutEffect(() => {
    toneRef.current = tone;
  }, [tone]);

  useEffect(() => {
    const unlock = () => {
      const C = audioCtor();
      if (!C) return;
      ctxRef.current ??= new C();
      if (ctxRef.current.state === "suspended") void ctxRef.current.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, []);

  const { cueKey, running } = opts;
  useEffect(() => {
    if (!cueKey) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator)
      navigator.vibrate([200, 100, 200]);
    const ctx = ctxRef.current;
    if (!toneRef.current || !ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    beep(ctx, t, 660, 0.25, 0.08);
    beep(ctx, t + 0.32, 880, 0.3, 0.08);
  }, [cueKey]);

  useEffect(() => {
    if (!metronome || !running || !Number.isFinite(METRONOME_PER_MIN)) return;
    // ponytail: setInterval jitter (a few ms) is fine for a pace guide; Web Audio look-ahead scheduling if it ever audibly drifts.
    const id = setInterval(() => {
      const ctx = ctxRef.current;
      if (ctx?.state === "running") beep(ctx, ctx.currentTime, 1000, 0.04, 0.05);
    }, 60_000 / METRONOME_PER_MIN);
    return () => clearInterval(id);
  }, [metronome, running]);

  return {
    tone,
    toggleTone: () => {
      prefs.tone = !tone;
      setTone(!tone);
    },
    metronome,
    toggleMetronome: () => {
      prefs.metronome = !metronome;
      setMetronome(!metronome);
    },
    metronomeAvailable: Number.isFinite(METRONOME_PER_MIN),
  };
}
