# ADR 0352 — Level templates from the national standard test menu

**Status:** Accepted — 2026-10-19 (TM-D03, TM-D04, TM-D05).

## Decision

- `templateFor(level)` (TM-6) over the signed catalogue: low-value tests skipped; in-house when the minimum level is
  reached and the 2017 national menu lists it (or usual route in-house, or NRH); referred one level up or for a
  national laboratory (CPHL, NTRL, UVRI, UBTS), which becomes `referred_to`. The lower of table and narrative is used.
- Snapshot: HC III 33/69, HC IV 61/83, GH 110/69, RRH 151/64, NRH 197/88; re-baselined only by a signed change.
- `applyTemplate` adds missing tests only and returns the preview counts; stated turnaround is never filled.
