# ADR 0469: Signed packs start from MedSync's sourced drafts

**Status:** Accepted, 29 Oct 2026, by the owner (Fadhul). Supersedes Pharmacy Phase 2's rule that nothing in a signed pack is pre-filled (Law 6 as applied to the Signed packs page; `lib/pharmacy/stores/packs.ts`, `docs/pharmacy/phase-2/user-guide.md`). The starting drafts themselves are **draft** until the Clinical Safety Officer signs them as MedSync's national template.

## Context

Phase 2 opened "Write a draft" empty for every pack and showed the sourced national figure beside a field as a reference only. The owner, walking through stocking-up in production: "what I dont want is hospital stuff to do a lot of typing, I want everything delivered on a silver plate."

## Decision

- Every pack kind on the Signed packs page (the 21 in `PACK_SCHEMAS`) has a starting draft in `data/pharmacy/packs/templates.v1.json`, read by `lib/pharmacy/stores/pack-templates.ts`.
- Every field carries its basis:
  - `national`: a figure or list printed in a Ministry of Health document, with the document and page (research notes of 29 Oct 2026: EMHS Manual 2018, SOP 2019, HMIS Manual 2010);
  - `medsync`: no national figure was found, so MedSync proposes one and says why. A MedSync value is never presented as national;
  - `hospital`: only the hospital can know it (the budget source, the message name, which medicines may be repeated). It is left empty, with one-click choices where the schema allows.
- "Write a draft" opens with the hospital's draft; with none, the version in force; with neither, MedSync's starting draft. Each field shows its basis in small text while its value is still MedSync's.
- While the template is unsigned, each dialog that opens from it says "MedSync's starting draft, not yet signed by MedSync's clinical safety officer". It is not tied to a production flag (CS-5 keeps whole workspaces off; it does not apply to a draft the hospital still has to sign).
- Nothing else changes:
  - a pack still takes effect only when signed: by two people, or by the CSO alone (ADR 0281);
  - the schemas, saving and signing are unchanged;
  - while a pack is unsigned, the readers still return null and every screen does its "while unsigned" column.

## Consequences

- A hospital signs a reviewed draft instead of typing every figure and list.
- The tracer list maps HMIS 105 section 6's 41 items (EMHS Manual 2018, Table 15, p. 150) to MedSync medicines where one exists. The items with no MedSync medicine (vaccines, test kits, nutrition products, some fixed-dose combinations) are listed beside the field, never guessed. The ARV items were replaced in DHIS2 in August 2024 by a list that is not published.
- The research found no EMHS manual newer than November 2018. The Phase 2 reference lines that cite an "EMHS Manual 2023" are no longer shown in the dialog; each field's basis replaces them.
- The templates and their wording wait for the CSO's signature (`templates.v1.json` `copy.status`).

## Alternatives considered

- Keep the empty form and the reference line. Refused by the owner.
- Fill only the national figures. This leaves most fields empty, because most have no national figure, so most of the typing stays.
