# ADR 0164 — The clerking catalogue is data: schema, versioning, sign-off, token map

**Status:** Accepted — 2026-09-27. GATE A (D-CV-01, D-CV-13, D-CV-15, H10, H11).

## Context

Clinical content in components cannot be reviewed, signed or grown without code changes. The handoff brought MS-EMR-CLERK-CAT-001:

- 96 symptoms, 65 property families and 766 options;
- 13 review-of-systems groups;
- 129 red flags, 75 flag rules and 19 reference entries;
- the history lists and the composer rules.

## Decision

1. **Where it lives:** `data/clerking/clerking-history-catalogue.v1.json`, byte-identical to the handed-over copy. It is validated by a Zod schema (`lib/clerking/catalogue.ts`) and checked in CI with `npm run clerking:catalogue-check`.
2. **Sign-off is a separate file,** `data/clerking/catalogue-signoff.v1.json`, pinned to the catalogue's SHA-256.
   - The owner signed all 75 rules and 19 values as drafted on 27 Sep 2026.
   - A rule or value is switched off by listing its id under `withheld`, without editing the catalogue.
3. **Store ids, never labels:** answers hold catalogue option ids with the catalogue version, and labels render at read time.
4. **One shared vocabulary:** `data/clerking/token-map.v1.json` maps every symptom to a `symptom_catalog` code or CFC concept. It has 56 exact matches, 23 broader ones (detail kept in qualifiers) and 17 new tokens added by migration 0076. There is never a private copy.
5. **The catalogue reaches the desk** once per session, from `/api/clerking/catalogue?v=<hash>` (static and immutable).
6. **Local-language terms** are left empty until Ugandan clinicians supply and sign them. Nothing is machine-translated.

## Consequences

- Adding a symptom needs no code; a test proves it.
- Only 12 of 96 symptoms chart as facts today, because the CFC has 35 finding concepts. The rest are kept in the signed note with their ids. Charting more needs a CFC v1.2 finding addendum.
