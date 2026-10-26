/**
 * Reading a photo of a home device's screen (ADR 0411): the prompt Claude is
 * given and the checks its answer must pass before any number reaches the
 * phone. Pure, so the tests need no network. The numbers only fill the boxes:
 * the patient checks them and the phone's own danger check runs on save.
 */
import { z } from "zod";

export type PhotoKind = "bp" | "sugar" | "weight";

export const PHOTO_KINDS: readonly PhotoKind[] = ["bp", "sugar", "weight"];

const WHAT: Record<"bp" | "sugar", string> = {
  bp: 'a blood pressure monitor. Reply {"top": systolic, "bottom": diastolic, "pulse": pulse or null}',
  sugar:
    'a blood glucose meter. Reply {"value": the reading, "unit": "mmol/L" or "mg/dL" as shown, or null if no unit is shown}',
};

const TAIL = [
  "Use null for any number you cannot read clearly.",
  'If the photo does not show such a screen, reply {"unreadable": true}.',
  "Reply with that one JSON object and nothing else.",
];

/** The words Claude reads with the photo: read what is there, guess nothing. */
export function promptFor(kind: PhotoKind): string {
  if (kind === "weight")
    // A bathroom scale may be a dial (owner, 18 Oct 2026): the needle is read, kg first.
    return [
      "This photo should show a bathroom scale: a digital screen, or a dial with a needle.",
      'Reply {"value": the weight, "unit": "kg" or "lb"}.',
      "On a screen, read only the number shown; do not guess or correct it.",
      "On a dial, find the needle, then read where it crosses the scale from the marks on each side;",
      "if the dial has both a kg and a lb scale, read the kg one, to the nearest half kilogram.",
      ...TAIL,
    ].join(" ");
  return [
    `This photo should show the screen of ${WHAT[kind]}.`,
    "Read only the numbers the screen shows. Do not guess or correct them.",
    ...TAIL,
  ].join(" ");
}

/**
 * A dial needs thinking to read (four runs on a dial photo: 43–43.5 kg with it,
 * 42.5–45 without); a digital screen does not. About $0.0003 more a weight photo.
 */
export const thinksFor = (kind: PhotoKind) => kind === "weight";

const int = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

const BP = z.object({ top: int(50, 300), bottom: int(20, 200), pulse: int(20, 250).optional() });
const SUGAR = z.object({
  value: z.number().min(0.5).max(1000).nullable(),
  unit: z.enum(["mmol/L", "mg/dL"]).nullable().optional(),
});
const WEIGHT = z.object({
  value: z.number().min(1).max(900).nullable(),
  unit: z.enum(["kg", "lb"]).nullable().optional(),
});

/** What the phone gets: the boxes to fill, as text, or why there is nothing. */
export type PhotoReading =
  | { ok: true; top?: string; bottom?: string; pulse?: string; value?: string }
  | { ok: false; reason: "unreadable" };

const UNREADABLE = { ok: false, reason: "unreadable" } as const;

/**
 * Claude's reply → the boxes. The first JSON object in the text is taken;
 * anything outside a device's plain range is dropped, never clamped. Sugar in
 * mg/dL (or a number only mg/dL can be) becomes mmol/L; pounds become kg.
 */
export function readReply(kind: PhotoKind, text: string): PhotoReading {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return UNREADABLE;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return UNREADABLE;
  }
  if (raw && typeof raw === "object" && "unreadable" in raw) return UNREADABLE;

  if (kind === "bp") {
    const p = BP.safeParse(raw);
    if (!p.success || p.data.top === null || p.data.bottom === null) return UNREADABLE;
    if (p.data.bottom >= p.data.top) return UNREADABLE;
    return {
      ok: true,
      top: String(p.data.top),
      bottom: String(p.data.bottom),
      ...(p.data.pulse ? { pulse: String(p.data.pulse) } : {}),
    };
  }
  if (kind === "sugar") {
    const p = SUGAR.safeParse(raw);
    if (!p.success || p.data.value === null) return UNREADABLE;
    const mgdl = p.data.unit === "mg/dL" || (!p.data.unit && p.data.value > 40);
    const mmol = mgdl ? p.data.value / 18 : p.data.value;
    if (mmol < 0.5 || mmol > 50) return UNREADABLE;
    return { ok: true, value: mmol.toFixed(1) };
  }
  const p = WEIGHT.safeParse(raw);
  if (!p.success || p.data.value === null) return UNREADABLE;
  const kg = p.data.unit === "lb" ? p.data.value * 0.45359237 : p.data.value;
  if (kg < 1 || kg > 400) return UNREADABLE;
  return { ok: true, value: (Math.round(kg * 2) / 2).toFixed(1) };
}
