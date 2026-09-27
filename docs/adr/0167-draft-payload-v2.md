# ADR 0167 — Clerking draft payload v2, and v1 coexistence

**Status:** Accepted — 2026-09-27. GATE A (§4, H11, H13).

## Decision

1. **The v2 draft is the encrypted `NoteContent`** with:
   - `schema: 2` and `catalogueVersion`;
   - `history`: complaints with properties and red flags, story, also-asked answers, review-of-systems answers and details, past, family and social history;
   - the v1 sections s11–s14;
   - `edited` blocks;
   - at signing, `flags`.

   It is validated at the action boundary (`lib/clerking/payload.ts`).

2. **"Not asked" is the absence of a key,** so it can never be written as a negative. Linked answers are derived, never stored.
3. **What commits when:**
   - **At once:** medicines and allergies, through the existing records.
   - **At signing, in the note's transaction:**
     - complaint and review-of-systems findings, with the catalogue qualifiers in the fact context;
     - tobacco status as `soc.tobacco`;
     - family history, one condition per relative, never `self`. This is H13: it would otherwise version the record on every relation tap.
   - **Note only,** until the CFC v1.2 addendum is signed: pack-years, drinking pattern and the rest of social history.
4. **v1 drafts** open in the v1 desk with "Continue in the new format" (`convertDraftToV2`).
   - It works only on the author's own unsigned `tpl.clerking.adult_opd` draft.
   - It maps only what maps: the header, the story, complaints whose token is exactly one catalogue symptom's, and s11–s14.
   - It is the one exception to "a draft keeps its template", and only in that direction.

   Signed notes of any version display as signed.
