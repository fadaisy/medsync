# ADR 0052 — Smart prescribing: grab-and-give accountability + the pharmacy seam (gated persistence)

**Status:** Accepted — CLINICAL-SAFETY artifact (2026-06-03)
**Context:** Emergency drugs are **grabbed from the crash cart and given at the point of care** — there is no prescribe → dispense → administer cycle. The tool must record the administration as the prescription, capture it cleanly for later pharmacy reconciliation, and do so on an immutable, audited record — while shipping safely (no risky production DDL in the same push that deploys the app).

## Decision

1. **The administration IS the prescription (grab-and-give).** `recordEmergencyAdministration` ([app/nurse/resus/actions.ts](../../app/nurse/resus/actions.ts)) appends a `drug` event to the **immutable resus timeline** (the audited, append-only `appendResusEvent` record) with the full accountability payload: drug · dose · concentration · route · giver · time · patient · encounter · cart · amount(mg) · controlled · override-reason + flags · source. Cumulative dosing is a pure projection over the timeline (`priorAdministrationsFromTimeline`, [lib/prescribing/administration.ts](../../lib/prescribing/administration.ts)).
2. **Controlled drugs require a witness** even in an emergency (stricter capture) — enforced in the write path. Overriding a `block` safety flag requires a recorded reason; both are audited.
3. **Allergies, until the persistent store lands, are captured in-episode** (`recordResusAllergies` → a timeline `note` with `allergyCapture`; the latest wins, NKDA clears). This makes the prescribe-time allergy check **real within the resus** with no production DDL change. The persistent cross-encounter `patient_allergies` table is the clean seam.
4. **The pharmacy seam is reconciliation, not dispensing.** Every administration captures drug + amount + cart + time + patient + giver + controlled — exactly what the future pharmacy module will reconcile against to restock + monitor expiry. The pharmacy module is **not built here**.
5. **Persistence is GATED.** Migration [0039_smart_prescribing.sql](../../supabase/migrations/0039_smart_prescribing.sql) + drizzle ([db/schema/prescribing.ts](../../db/schema/prescribing.ts)) define `patient_allergies`, `prescriptions` (the shared anchor — so `medication_administration_records.prescription_id` can become a real FK), `crash_carts`/`crash_cart_stock`, and append-only `emergency_administrations` (the reconciliation record), with RLS + audit triggers mirroring the nurse-workspace pattern (0031). It is **written + reviewed but NOT auto-applied** — the deployed v1 records to the timeline; apply 0039 via the controlled DB step (as 0038 was), then repoint the allergy read + administration write at the tables. The drizzle definitions are inert at runtime (no deployed code path queries them yet).

## Consequences

**Positive:** a complete, audited accountability record that ships with zero production-migration risk; the pharmacy-reconciliation data is captured from day one; controlled-drug + override discipline is enforced; the persistence layer is designed + reviewed and turns on behind a controlled DB step; the `prescriptions` anchor extends the tool to full prescribing later. **Negative:** until 0039 is applied, allergies are per-episode (not cross-encounter) and administrations live on the resus timeline rather than the dedicated table (a documented, intentional v1 trade-off); the timeline payload and the future `emergency_administrations` row must be kept shape-compatible (they are).

## Related

- [app/nurse/resus/actions.ts](../../app/nurse/resus/actions.ts), [lib/prescribing/administration.ts](../../lib/prescribing/administration.ts), [supabase/migrations/0039_smart_prescribing.sql](../../supabase/migrations/0039_smart_prescribing.sql), [db/schema/prescribing.ts](../../db/schema/prescribing.ts), [app/nurse/resus/[episodeId]/\_components/prescribe-dialog.tsx](../../app/nurse/resus/[episodeId]/_components/prescribe-dialog.tsx)
- ADR 0051 (the catalog + engine); ADR 0044 (resus record immutability — the pattern reused)
