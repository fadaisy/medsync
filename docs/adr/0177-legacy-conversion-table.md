# ADR 0177 — Continuing a v1 clerking draft in the new format: a signed conversion table, choices, provenance

**Status:** Accepted — 2026-09-28. Signed by the CSO (`docs/emr/clerking-v2/legacy-conversion-proposal.md` §7).
Supersedes the conversion rule of gate-a §4 as built in ADR 0167 ("complaints whose v1 token is exactly one catalogue
symptom's token").

## Context

"Continue in the new format" turned a v1 clerking draft into payload v2 by inverting the token map. That narrowed seven
broad codes silently (for example "weakness" became focal weakness), sent 35 of the 89 old codes to text, and ignored
the v1 review of systems altogether.

## Decision

1. **One signed table is the only mapping.** `data/clerking/legacy-conversion.v1.json` (MS-EMR-CLERK-LEGACY-001),
   hash-pinned in `legacy-conversion-signoff.v1.json`, gives every v1 finding token a row: the 89 codes of 0042/0045,
   the 17 of 0076, and every CFC finding concept without a code. Each row says what a yes and a no become. A token
   with no row is carried as words, never as a finding. `clerking:catalogue-check` checks the hash and every id.
2. **Never narrow silently.** A combined code becomes a choice the clinician finishes; until then it counts as not asked
   (a complaint keeps its words as text). Pregnancy status, the LMP and activity are proposed for confirmation and never
   written without it.
3. **Merge rule.** Any yes → yes; all no → no; yes against no → yes, with the contradiction listed. Multi-choice presets
   combine; clashing single-choice presets become a choice. An answer whose symptom does not apply to the patient's sex
   is dropped and listed.
4. **Provenance lives in the draft** (`history.converted`): one line per v1 answer, the open choices, and words carried
   as systems-review text. The review list opens the first time the draft opens; a strip stays while choices are open.
5. **Two conversion flags with signed wording**, kept in the table rather than the catalogue: CONV-RISK (urgent) while
   a converted "risk" yes has no timing, plan or action; CONV-PR-BLEED (caution) while the rectal-bleeding choice is
   open. Decision support only, like every flag.
6. **An answer on a symptom the Systems step does not list** (a converted v1 answer, for example breathlessness) is
   written in the note and charted at signing.

## Consequences

- No migration: the conversion is code and data. Deploy order does not matter.
- A later table version (codes promoted in production through the 0044 governance, catalogue v1.1's `sym.urgency`)
  is a new file and a new sign-off, never an edit.
- Three token-map rows still chart a broader symptom as a narrower concept; `docs/emr/cfc/cfc-v1.4-proposal.md`
  awaits signature.
