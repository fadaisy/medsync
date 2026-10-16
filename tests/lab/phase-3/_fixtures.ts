/**
 * Lab Phase 3 engine fixtures. Every number, range, target, SD, limit, level, window and validity period here is
 * INVENTED for tests (Law 3): none is a clinical or operational value, and none may be copied into a seed, a plan
 * or a sign-off pack. Two hospitals, so every list and count is shown to keep to its own.
 */
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

export const TZ = DEFAULT_TIME_ZONE; // Africa/Kampala, UTC+3, no DST
export const H1 = "hospital-a-fixture";
export const H2 = "hospital-b-fixture";

/** An instant from Kampala wall-clock time: kla("2026-09-30 23:30") = 2026-09-30T20:30Z. */
export const kla = (local: string) => new Date(`${local.replace(" ", "T")}:00+03:00`);
