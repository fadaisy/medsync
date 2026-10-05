# ADR 0212 — Duplicate search over encrypted identifiers by blind index and tiered matching

**Status:** Proposed — 2026-10-05. NCDSync build (§7 A1–A2).

## Decision

1. Names are normalised (lower case, accents and punctuation stripped, doubled letters collapsed, a final h dropped) and
   each token is indexed with the repository's `blindIndex` under an `ncd-name:` prefix. Phones (E.164), hospital numbers
   and national IDs are indexed likewise (D-17). No English phonetic algorithm is used.
2. Candidates are retrieved by token or number match, decrypted on the server and tiered: definite (same hospital
   number or national ID), probable (same phone and a similar name, or similar name, same sex and birth year within 2),
   possible (similar name and same sex; the five closest). "Similar" = some token pair with Jaro-Winkler ≥ 0.90. The
   measure and thresholds are versioned, draft data (sign-off register S21).
3. A person cannot be created without a search in the last 24 hours (a keyed search token), and the server re-runs the
   search at enrolment: every definite and probable candidate must be linked or dismissed.

## Consequences

- The catalogue's duplicate check lands in its expected tiers. Old spellings stay indexed after a name change, so either
  spelling finds the person.
