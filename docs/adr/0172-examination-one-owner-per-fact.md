# ADR 0172 — Examination: one owner per fact (links, mirrors, shared attributes)

**Status:** Accepted — 2026-09-28. E3, TM1, D-EX-13 signed by the CSO.

## Decision

1. **Links** are read-only views of another item or block (conjunctivae → pallor and jaundice; foot pulses → the pulses grid; the Nervous system's consciousness → General) with a button that opens the owner.
2. **Mirrors** are options that read and write their owner's option (oral thrush under HIV-associated signs; palmar erythema under liver stigmata). A mirror with several owners is read-only (Kaposi-like lesions). A mirror may name the owner item with attribute values (bilateral pitting oedema → oedema, pitting, both legs). TM1 declared twelve more, so no finding is answerable in two places.
3. **Shared attributes** (the respiratory distress signs) edit the one fact from either place.
4. **Unticking never infers normal:** an owner left with nothing recorded is cleared, not set negative.
5. **The composer writes each fact once, by its owner**, and the commit merges per concept.

## Consequences

- E-8 is resolved (a test renders the step and counts the editable places).
- A property test holds that mirrored and shared facts never disagree after random taps.
