# ADR 0178 — The Summary is composed from the record; the syndrome is the clinician's; any change asks for review again

**Status:** Accepted — 2026-09-28. GATE A (summary and impression) signed by the CSO
(`docs/emr/clerking-v2/summary-impression/gate-a-proposal.md` §9; D-SI-01 to D-SI-04, D-SI-08, D-SI-24, D-SI-25).

## Context

Step 08 showed "Auto" with nothing composed, the note carried a "Summary: …" line inside the examination block, and a
free-text s12 narrative drifted from the record as soon as anything changed (STOP 0).

## Decision

1. **Composed, never invented (SI1).** `lib/clerking/summary/compose.ts` writes one paragraph from what is recorded and
   included: the one-liner (who, onset band from `REF-SI-ONSET`, course, the syndrome), the history, the examination
   and the vital signs (out of the NEWS2 zero band, or past a signed REF-DX threshold a profile on the board uses,
   D-SI-25), the pertinent negatives the board names, and allergies (always in). Not asked is never stated as "no".
2. **The syndrome is the clinician's words (SI2).** MedSync never names a syndrome or a diagnosis in the Summary.
3. **Reviewed explicitly (SI8).** "Mark as reviewed" stores a hash of the inputs; any change to inclusion, syndrome,
   mode or words makes it "Changed since review" with the exact difference. An unreviewed summary is a prompt at
   signing, not a block (D-SI-08).
4. **The note's own block.** A "summary" block sits between Examination and Impression; the examination block loses its
   "Summary:" line. On step 09 it is clamped to three lines with "Show all".
5. **In my words.** The clinician may write their own paragraph ("Your words go into the note. Later changes in the
   steps will not update them."). An old s12 narrative opens there and is never migrated on its own.
6. **Course everywhere (D-SI-24).** The shared course options were added to the 48 history property families that
   lacked them, as an amendment re-hashed in `catalogue-signoff.v1.json`.

## Consequences

- The summary is only as complete as the record; "Not recorded, so not stated" lists the gaps with links.
- Signing writes `summary.text` into the content before the HMAC; a signed note shows its signed text, never a
  recomposition.
- Behind `CLERKING_V2`; no migration.
