# Step 11 gap report: national connections (GATE N)

17 Oct 2026. Prompt Step 11 builds a national adapter **only for a system with all four**: a written
specification, a signed data-sharing agreement, a test environment and a named contact (GATE N, D-LAB4-23).
**No system has any of the four.** No code is written: no scraping and no unofficial endpoints.

## What was asked, when, of whom, and the answer

The request is drafted as `docs/lab/phase-4/letter-to-nhlds.md`, addressed to the Commissioner, NHLDS (copy:
Division of Health Information). It goes from the hospital on its letterhead, signed by its own officer.

| Asked                                                        | When                            | Of whom                   | Answer |
| ------------------------------------------------------------ | ------------------------------- | ------------------------- | ------ |
| The four GATE N items for IRRDS, ResTrack, A-LIS and the LDR | **Not yet sent** (owner action) | NHLDS, Ministry of Health | None   |

## Per system

| System                                | Spec             | Agreement | Test environment | Contact | Outcome            | What the lab does now                                                    |
| ------------------------------------- | ---------------- | --------- | ---------------- | ------- | ------------------ | ------------------------------------------------------------------------ |
| IRRDS (requests and results dispatch) | None public (H1) | None      | None             | None    | Gap                | CPHL's paper form, the hub rider, results typed from the returned report |
| ResTrack (sample tracking)            | None public (H2) | None      | None             | None    | Gap                | Manifest and handover recorded in MedSync; tracking by phone             |
| A-LIS                                 | None public (H3) | None      | None             | None    | Gap; not used here | This hospital's lab runs on MedSync                                      |
| National Laboratory Data Repository   | None public (H4) | None      | None             | None    | Gap                | HMIS 105 section 10 from records (Phase 3, HM-16)                        |

H1–H4 are carried from `LAB-PHASE-4-RESEARCH.md` (13 Oct 2026). They are re-checked when an answer arrives.

## In the product

Connections shows each national line as "Not connected" with Appendix A's words (`notConnectedCphl`,
`notConnectedLdr`, `notUsedHereAlis`). No `labNationalExchange` flag and no `lib/exchange/national/**` exist
until a system passes GATE N.

## To resume Step 11

1. The hospital sends the letter and records the date and the addressee in its table.
2. When an answer gives all four items for a system, re-check H1–H4 for it, build its adapter on the existing
   store, matching and partner register (NX-2..NX-5), and report STOP 11 for that system.
