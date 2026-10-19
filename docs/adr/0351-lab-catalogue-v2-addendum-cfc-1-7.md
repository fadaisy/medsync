# ADR 0351 — Catalogue v2 as addendum CFC v1.7

**Status:** Accepted — 2026-10-19 (TM-1, TM-2, TM-D06, TM-D11, TM-D12). In-product signature of `cfc-1.7.0` pending.

## Decision

- `docs/lab/test-menu-v2/lab-catalogue-v2.json` is read by `scripts/emr/cfc-v17.ts` into a CFC addendum and generated
  by `gen-seed.ts` into migration 0172 and `lib/lab/catalogue-v17.generated.ts` (drift-tested).
- 428 results are added; the 9 ids that exist are kept. 13 unverified codes import as `code: null` with a note.
  Free-text results are `as_typed` (never facts, A4). A result is restricted only when every test reporting it is.
- 255 tests arrive inactive with their catalogue facts; the 36 existing tests get the facts only while `section` is
  unset. Signing `cfc-1.7.0` (lead, then CSO, author ≠ signer; Set-up → Drafts) activates them and appends the
  additions to troponin, uACR and blood culture. Nothing is removed; F-4's two blood-culture results stay held.
- `refer_to` gains `MAK_PATH`; `obs.tb_xpert_rif` moves from TRIAL 89372-7 to ACTIVE 89489-9.
