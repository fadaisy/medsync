# ADR 0470: Local medicines from the catalogue, controlled by a signed substance list

**Status:** Accepted, 29 Oct 2026, by the owner (Fadhul, also the CSO). Supersedes D-CAT-18 "Refuse for now" (ADR 0459) for catalogue medicines. The substance list (`data/pharmacy/controlled-substances.v1.json`) is **draft** until the CSO signs it. Migration **0264** is GATED and owner-applied.

## Context

D-CAT-18 refused every medicine that is not on the prescribing list, because such a medicine had no signed controlled class and would move without a witness. Receiving from the catalogue (owner item 11) therefore stopped at most of the national list.

## Decision

- A catalogue medicine's controlled status comes from a signed list of controlled **substances**. The medicine is controlled if any of its ingredients is on the list, with that substance's class. Otherwise it is not controlled.
- The list, from the Narcotic Drugs and Psychotropic Substances (Control) Act, 2024 (Cap. 37):
  - **narcotic** (Schedule 2): morphine, pethidine, fentanyl, methadone, codeine;
  - **psychotropic** (Schedule 3): diazepam, midazolam, clonazepam, alprazolam, phenobarbital, methylphenidate;
  - **policy** (MedSync policy, owner decision 29 Oct 2026, not law): lorazepam, buprenorphine, ketamine, tramadol, thiopental.
- The Act covers salts of a listed substance, so salts count: each entry names the salts it covers (`thiopental sodium` is thiopental).
- Matching uses the catalogue's own substances, by `cat_substances.key` or any of that substance's `cat_substance_names`. It never matches on a medicine's display name.
- Receiving from the catalogue (`productForPick`) makes a medicine off the prescribing list into a `local_medicine` product under its catalogue key. Its class is derived, never typed.
  - A catalogue medicine with no ingredient listed is refused in words, because its status cannot be known.
- Wherever controlled status is read (`controlledMedicineIds`, and through it `controlledSet`, `isControlledMedicine`, the witness checks and the register):
  - a local medicine takes its class from the list;
  - a prescribing-list medicine is decided exactly as before: the prescribing flag, or the hospital's signed `controlled_classes`.
- CS-5: while the list is unsigned, **production** refuses off-list medicines as before, using the signed D-CAT-18 words. Outside production the list applies at once. A local medicine that already exists always takes its class from the list.
- Migration 0264 replaces `pp_no_local_medicine` with `pp_local_medicine_linked`: a local medicine must name its catalogue medicine. There are no data changes.

## Consequences

- Most of the national list can be received from the catalogue without typing. A controlled local medicine moves only with a witness, like any controlled medicine.
- Over the EMHSLU 2023 seed, 26 catalogue medicines become controlled. `tests/pharmacy/controlled-substances.test.ts` lists them. Remifentanil is not on the list, so it is not controlled.
- A local medicine is never prescribed: its key matches no prescription.
- Typed local medicines (form 4.4) stay refused; only catalogue medicines are covered by this ADR.

## Alternatives considered

- Keep refusing. Rejected by the owner: hospitals would keep typing.
- Decide controlled status by display-name substrings. Rejected: a name is not an identity, and a substring can match the wrong medicine.
