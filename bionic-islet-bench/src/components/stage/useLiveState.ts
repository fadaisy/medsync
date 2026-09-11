import { useEffect, useRef, useState } from "react";

import type { SimState } from "../../engine/types.ts";
import { benchData } from "../../store/benchData.ts";
import { useBench } from "../../store/bench.ts";

/** The current device state, re-read at the store's publish rate. */
export function useLiveState(): SimState | null {
  useBench((s) => s.tick);
  return benchData.state;
}

/** True when the viewer has asked for reduced motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * A 1 to 0 decay that restarts whenever `counter` increases.
 *
 * Used for the things that genuinely happen at an instant: an optical flash,
 * an impedance sweep, a bolus starting. Under reduced motion it returns a
 * steady value instead of a pulse, so the part still reads as active without
 * anything moving.
 */
export function usePulse(counter: number, decayMs = 400): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  const lastCounter = useRef(counter);
  const startedAt = useRef(0);

  useEffect(() => {
    if (reduced) return;
    if (counter > lastCounter.current) {
      lastCounter.current = counter;
      startedAt.current = performance.now();
      setValue(1);
    } else if (counter < lastCounter.current) {
      lastCounter.current = counter;
    }
  }, [counter, reduced]);

  useEffect(() => {
    if (reduced || value === 0) return;
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAt.current;
      const next = Math.max(0, 1 - elapsed / decayMs);
      setValue(next);
      if (next > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, decayMs, reduced]);

  return reduced ? 0.45 : value;
}
