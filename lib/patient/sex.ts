/**
 * The words for `patient_profiles.sex` — client-safe (no `server-only`, no
 * db import) so a card in a client component can label the enum. The
 * server-only `lib/patient/profile.ts` re-exports this.
 */
export const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  intersex: "Intersex",
  prefer_not_say: "Prefer not to say",
};

export function sexLabel(sex: string | null | undefined): string | null {
  return sex ? (SEX_LABEL[sex] ?? null) : null;
}
