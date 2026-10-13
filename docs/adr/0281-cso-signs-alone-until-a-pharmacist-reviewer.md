# ADR 0281 — The CSO signs alone until MedSync has a pharmacist reviewer

**Status:** Accepted — 2026-10-13 (owner, also the CSO). Amends [ADR 0272](0272-going-live-per-point.md) condition 1
for now; to be revisited when a pharmacist reviewer exists.

## Decision

1. Until MedSync has a registered pharmacist as reviewer, the CSO (a superadmin) signs the clinical packs, the
   hazard log, the Phase 1 wording (the patient wording and the SMS message name included) alone. Each signed set
   records that as its exception in words, which 0122 already allows in place of a second signer.
2. RD-1 condition 1 no longer requires a pharmacist's co-signature. The check stays in the code, switched off by
   `PHARMACIST_COSIGN.required` in `content/pharmacy-golive.ts`.
3. The hazard log now needs the CSO's own signature (`HAZARD_LOG_SIGNATURE.csoSignedBy`) for condition 1 to be met.

## Consequences

- A production point can go live without a pharmacist's review of the lane reasons, controlled classes,
  counselling points or label wording. The other five conditions, the legal answers among them, still apply.
- Reimplementing the co-signature means setting `required: true` and recording a pharmacist's signature on each
  set. Sets signed before then need that second signature to count.

## Alternatives considered

- Claude as reviewer: declined. It is not a registered pharmacist.
- Keeping the co-signature required: this blocks every production go-live until a pharmacist is found.
