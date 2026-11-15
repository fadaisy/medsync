/**
 * D-CS-05: starting consultation fee bands, UGX, general / private. DRAFT — Fadhul signs; the hospital, not
 * Tether, owns its prices. A hospital's own bands (hospital_fee_bands, four-eyes) replace these; until then the
 * workspace shows these as "draft bands" and nothing priced from them reaches patients unpublished.
 */
import type { SignedCopy } from "@/content/signed-copy";
import type { Band } from "@/lib/clinics-schedule/model";

export const FEE_BANDS_STATUS: SignedCopy = { status: "draft", signedBy: null, signedOn: null };

export const DRAFT_BANDS: Record<Band, { general: number; private: number }> = {
  nurse: { general: 10000, private: 20000 },
  co: { general: 15000, private: 30000 },
  mo: { general: 30000, private: 50000 },
  specialist: { general: 60000, private: 100000 },
  consultant: { general: 100000, private: 150000 },
};

/** Where the starting numbers come from (canvas note; the sources it names, not re-verified here). */
export const BANDS_SOURCE =
  "Draft bands for a Kampala private-not-for-profit hospital, all in UGX. The Medical Council's fee guidelines put a general doctor's consultation around 16,000 with a 30,000 cap, a super-specialist's around 85,000, and a review at roughly 70–75% of a first visit. A 2017 fee study for the medical and dental associations gave 10,000–40,000 for a general doctor and 20,000–100,000 for a specialist. Public private wings charge about 50,000. Set your own before launch; the hospital, not Tether, owns its prices.";

/** D-CS-21: clinic hours a week above which the load bar turns amber. A hint, never a block. DRAFT. */
export const WORKLOAD_THRESHOLD_HOURS = 30;
