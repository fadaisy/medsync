import type { StartValues } from "@/data/readings";
import type { ReadingKind } from "@/lib/readings";

/**
 * Numbers out of what the patient said (ADR 0352): "120 over 80, pulse 72",
 * "sugar 6.4", "70 kilos". The phone's recogniser writes digits, so digits
 * are what is read; a word it cannot place is left alone. What comes back
 * only fills the boxes, for the patient to check before saving.
 */
export function readSpoken(kind: ReadingKind, said: string): Partial<StartValues> {
  const text = said.toLowerCase().replace(/,(?=\d)/g, ".");
  const nums = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

  if (kind === "bp") {
    const pair = /(\d{2,3})\s*(?:\/|over|on|by|-)\s*(\d{2,3})/.exec(text);
    const pulseWord =
      /(?:pulse|heart(?:\s*rate)?|beats?|bpm)\D{0,12}(\d{2,3})|(\d{2,3})\s*(?:bpm|beats)/.exec(
        text,
      );
    const out: Partial<StartValues> = {};
    const top = pair ? Number(pair[1]) : nums[0];
    const bottom = pair ? Number(pair[2]) : nums[1];
    if (top && bottom && top > bottom) {
      out.top = String(top);
      out.bottom = String(bottom);
    }
    const pulse = pulseWord ? Number(pulseWord[1] ?? pulseWord[2]) : pair ? undefined : nums[2];
    if (pulse && pulse >= 20 && pulse <= 250) out.pulse = String(pulse);
    return out;
  }

  const n = nums[0];
  if (n === undefined) return {};
  if (kind === "sugar") {
    // mg/dL said aloud, or a number only mg/dL can be: shown in mmol/L.
    const mmol = /mg|milligram/.test(text) || n > 40 ? n / 18 : n;
    return mmol >= 0.5 && mmol <= 50 ? { sugar: mmol.toFixed(1) } : {};
  }
  if (kind === "weight") {
    const kg = /pound|lb/.test(text) ? n * 0.45359237 : n;
    return kg >= 1 && kg <= 400 ? { weight: (Math.round(kg * 2) / 2).toFixed(1) } : {};
  }
  return n >= 20 && n <= 250 ? { pulse: String(Math.round(n)) } : {};
}
