/**
 * Reading a photo of a packaged food's nutrition label (ADR 0357): the prompt
 * Claude is given and the checks its answer must pass. Pure, so the tests need
 * no network. The values only fill the form; the patient checks them before
 * anything is saved.
 */
import { z } from "zod";

export const LABEL_PROMPT = [
  "This photo should show the nutrition information panel of a packaged food or drink.",
  "Read only what the label prints. Do not guess, correct or work anything out.",
  "If the panel has a per 100 g or per 100 ml column, read that column and set per to \"100\".",
  "If it only gives values per serving, read those, set per to \"serving\" and give the serving size in grams or ml if printed.",
  "Reply with one JSON object:",
  '{"name": the product name if it shows, else null, "per": "100" or "serving", "serving_g": number or null,',
  '"kcal": energy in kcal or null, "kj": energy in kJ or null, "carbs": carbohydrate g, "protein": g or null,',
  '"fat": total fat g or null, "fibre": dietary fibre g or null}.',
  "Use null for anything you cannot read clearly.",
  'If the photo does not show a nutrition panel, reply {"unreadable": true}.',
  "Reply with that one JSON object and nothing else.",
].join(" ");

const g = z.number().min(0).max(5000).nullable().optional();
const LABEL = z.object({
  name: z.string().max(200).nullable().optional(),
  per: z.enum(["100", "serving"]),
  serving_g: z.number().min(1).max(5000).nullable().optional(),
  kcal: g,
  kj: g,
  carbs: z.number().min(0).max(5000),
  protein: g,
  fat: g,
  fibre: g,
});

/** Values per 100 g, as text for the form's boxes, or why there are none. */
export type LabelReading =
  | {
      ok: true;
      name?: string;
      servingG?: string;
      kcal: string;
      carbs: string;
      protein?: string;
      fat?: string;
      fibre?: string;
    }
  | { ok: false; reason: "unreadable" };

const UNREADABLE = { ok: false, reason: "unreadable" } as const;
const r1 = (x: number) => String(Math.round(x * 10) / 10);

/**
 * Claude's reply → per-100 g boxes. Per-serving values are scaled by the
 * printed serving size (and refused without one). kcal comes from kJ only when
 * the label gives no kcal (÷ 4.184). Anything past what 100 g can hold is
 * dropped, never clamped.
 */
export function readLabel(text: string): LabelReading {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return UNREADABLE;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return UNREADABLE;
  }
  if (raw && typeof raw === "object" && "unreadable" in raw) return UNREADABLE;
  const p = LABEL.safeParse(raw);
  if (!p.success) return UNREADABLE;
  const v = p.data;
  const k = v.per === "100" ? 1 : v.serving_g ? 100 / v.serving_g : null;
  if (k === null) return UNREADABLE;
  const kcalRaw = v.kcal ?? (v.kj != null ? v.kj / 4.184 : null);
  if (kcalRaw === null) return UNREADABLE;
  const kcal = kcalRaw * k;
  const grams = (x: number | null | undefined) => (x == null ? null : x * k);
  const carbs = v.carbs * k;
  const [protein, fat, fibre] = [grams(v.protein), grams(v.fat), grams(v.fibre)];
  if (kcal > 950 || carbs > 100 || [protein, fat, fibre].some((x) => x !== null && x > 100))
    return UNREADABLE;
  return {
    ok: true,
    ...(v.name?.trim() ? { name: v.name.trim() } : {}),
    ...(v.serving_g ? { servingG: r1(v.serving_g) } : {}),
    kcal: String(Math.round(kcal)),
    carbs: r1(carbs),
    ...(protein !== null ? { protein: r1(protein) } : {}),
    ...(fat !== null ? { fat: r1(fat) } : {}),
    ...(fibre !== null ? { fibre: r1(fibre) } : {}),
  };
}
