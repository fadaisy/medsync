/**
 * A2 duplicate search: name normalisation, blind-index tokens and tiering (D-09, DUPLICATE_RULES).
 * Pure; the server decrypts the retrieved candidates and calls `tierCandidates`.
 */
import { normalizeNin, normalizeUgPhone } from "@/lib/onboarding/fields";
import { DUPLICATE_RULES } from "./standard/validation";

/** Lower case, accents and punctuation stripped, doubled letters collapsed, a final h dropped. */
export function normaliseToken(t: string): string {
  return t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/(.{3,})h$/, "$1");
}

export function nameTokens(...parts: (string | null | undefined)[]): string[] {
  const out = parts
    .flatMap((p) => (p ?? "").split(/[\s\-']+/))
    .map(normaliseToken)
    .filter((t) => t.length >= 2);
  return [...new Set(out)];
}

export const normalisePhone = (p: string | null | undefined) => (p ? normalizeUgPhone(p) : null);
export const normaliseHospitalNumber = (h: string | null | undefined) =>
  h ? h.replace(/\s+/g, "").toUpperCase() || null : null;
export const normaliseNationalId = (n: string | null | undefined) =>
  n ? normalizeNin(n) || null : null;

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let trans = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) trans++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - trans / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Best similarity over every token pair (token-order-insensitive). */
export function nameSimilarity(a: readonly string[], b: readonly string[]): number {
  let best = 0;
  for (const x of a) for (const y of b) best = Math.max(best, jaroWinkler(x, y));
  return best;
}

export type IdentityFacts = {
  givenName: string;
  familyName: string;
  sex: "female" | "male" | null;
  birthYear: number | null;
  phones: (string | null)[];
  hospitalNumber: string | null;
  nationalId: string | null;
};
export type Candidate = IdentityFacts & { personId: string };
export type Tier = "definite" | "probable" | "possible";
export type MatchField =
  | "hospital_number"
  | "national_id"
  | "phone"
  | "similar_name"
  | "sex"
  | "birth_year";
export type TieredCandidate = {
  personId: string;
  tier: Tier;
  matched: MatchField[];
  score: number;
};

export function tierCandidates(
  typed: IdentityFacts,
  candidates: readonly Candidate[],
): TieredCandidate[] {
  const tTokens = nameTokens(typed.givenName, typed.familyName);
  const tPhones = new Set(typed.phones.map(normalisePhone).filter(Boolean));
  const tHosp = normaliseHospitalNumber(typed.hospitalNumber);
  const tNin = normaliseNationalId(typed.nationalId);
  const out: TieredCandidate[] = [];
  for (const c of candidates) {
    const matched: MatchField[] = [];
    if (tHosp && normaliseHospitalNumber(c.hospitalNumber) === tHosp)
      matched.push("hospital_number");
    if (tNin && normaliseNationalId(c.nationalId) === tNin) matched.push("national_id");
    if (c.phones.some((p) => p && tPhones.has(normalisePhone(p)))) matched.push("phone");
    const score = nameSimilarity(tTokens, nameTokens(c.givenName, c.familyName));
    const similar = score >= DUPLICATE_RULES.similar_name_threshold;
    if (similar) matched.push("similar_name");
    const sameSex = typed.sex != null && typed.sex === c.sex;
    if (sameSex) matched.push("sex");
    const nearYear =
      typed.birthYear != null &&
      c.birthYear != null &&
      Math.abs(typed.birthYear - c.birthYear) <= DUPLICATE_RULES.birth_year_band;
    if (nearYear) matched.push("birth_year");

    let tier: Tier | null = null;
    if (matched.includes("hospital_number") || matched.includes("national_id")) tier = "definite";
    else if ((matched.includes("phone") && similar) || (similar && sameSex && nearYear))
      tier = "probable";
    else if (similar && sameSex) tier = "possible";
    if (tier) out.push({ personId: c.personId, tier, matched, score });
  }
  const rank = { definite: 0, probable: 1, possible: 2 } as const;
  out.sort((a, b) => rank[a.tier] - rank[b.tier] || b.score - a.score);
  const possible = out
    .filter((c) => c.tier === "possible")
    .slice(0, DUPLICATE_RULES.possible_listed);
  return [...out.filter((c) => c.tier !== "possible"), ...possible];
}
