import { z } from "zod";

/**
 * The phone's "A few more details" rules. Each one mirrors the web's own profile actions
 * (app/patient/profile/actions.ts and complete-actions.ts), so a value the web refuses the phone
 * refuses too, with the same words. Pure: the route does the writing.
 */

/** Copied from app/patient/profile/actions.ts, where it is a local constant of a server-action file. */
export const PHONE_E164_UG = /^\+2567\d{8}$|^\+256[23489]\d{7,8}$/;
const PHONE_MESSAGE = "Enter a Ugandan phone number.";

export const TITLE_CODES = ["mr", "ms", "mrs", "dr", "other"] as const;
export const ID_TYPES = ["nin", "passport", "refugee_id", "other"] as const;
export const NOK_RELATIONSHIPS = [
  "spouse",
  "parent",
  "child",
  "sibling",
  "guardian",
  "friend",
  "other",
] as const;

export const ID_LOCKED = "An ID is already on file. To change it, contact support.";
export const NOK_BOTH = "Next of kin needs both a name and a phone (or neither).";

const TitleSchema = z.enum(TITLE_CODES, "Choose a title from the list.").nullable();
const LanguageSchema = z.string("Enter a language.").trim().max(40, "Keep it under 40 characters.");
const IdSchema = z.object({
  type: z.enum(ID_TYPES, "Choose the type of ID."),
  number: z
    .string("Enter the number as it's printed.")
    .trim()
    .min(4, "Enter the number as it's printed.")
    .max(40, "That number is too long."),
});
const NokSchema = z
  .object({
    name: z.string().trim().max(120, "That name is too long.").optional(),
    relationship: z.enum(NOK_RELATIONSHIPS).or(z.literal("")).nullable().optional(),
    phone: z.string().trim().regex(PHONE_E164_UG, PHONE_MESSAGE).or(z.literal("")).optional(),
  })
  .nullable();

export type Section = "title" | "language" | "id" | "nok";
export type IdType = (typeof ID_TYPES)[number];
export type NokRelationship = (typeof NOK_RELATIONSHIPS)[number];

/** What to write. `nok: null` clears all three next-of-kin fields. Plaintext: the route encrypts. */
export interface ParsedDetails {
  title?: (typeof TITLE_CODES)[number] | null;
  language?: string | null;
  id?: { type: IdType; number: string };
  nok?: { name: string; relationship: NokRelationship | null; phone: string } | null;
}

/** As complete-actions.ts: a NIN is stored without spaces and upper-cased; other IDs as typed. */
export function normaliseIdNumber(type: IdType, number: string): string {
  return type === "nin" ? number.replace(/\s+/g, "").toUpperCase() : number.trim();
}

/** As actions.ts: a name and a phone, or neither. Neither clears the next of kin. */
export function nokProblem(name: string | undefined, phone: string | undefined): string | null {
  return !!name?.trim() !== !!phone?.trim() ? NOK_BOTH : null;
}

/**
 * Each section given is checked on its own, so one bad section does not cost the others: the
 * route writes `data` and returns `errors` beside it. A section left out is not touched.
 */
export function parseDetails(body: unknown): {
  data: ParsedDetails;
  errors: Partial<Record<Section | "form", string>>;
} {
  const data: ParsedDetails = {};
  const errors: Partial<Record<Section | "form", string>> = {};
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return { data, errors: { form: "Try again." } };
  const b = body as Record<string, unknown>;
  const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check this and try again.";

  if (b.title !== undefined) {
    const r = TitleSchema.safeParse(b.title);
    if (r.success) data.title = r.data;
    else errors.title = first(r.error);
  }
  if (b.language !== undefined) {
    const r = LanguageSchema.safeParse(b.language);
    if (r.success) data.language = r.data || null;
    else errors.language = first(r.error);
  }
  if (b.id !== undefined) {
    const r = IdSchema.safeParse(b.id);
    if (r.success)
      data.id = { type: r.data.type, number: normaliseIdNumber(r.data.type, r.data.number) };
    else errors.id = first(r.error);
  }
  if (b.nok !== undefined) {
    const r = NokSchema.safeParse(b.nok);
    if (!r.success) errors.nok = first(r.error);
    else if (r.data === null) data.nok = null;
    else {
      const problem = nokProblem(r.data.name, r.data.phone);
      if (problem) errors.nok = problem;
      // Neither name nor phone: nobody to reach, so the relationship goes too.
      else if (!r.data.name) data.nok = null;
      else
        data.nok = {
          name: r.data.name,
          relationship: r.data.relationship || null,
          phone: r.data.phone ?? "",
        };
    }
  }
  return { data, errors };
}
