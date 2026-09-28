# Clerking desk v2, Examination: handoff pack

Copy this folder into the repository as `docs/emr/clerking-v2/exam/`, then give Claude Code the prompt.

| File                              | What it is                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROMPT-CLERKING-EXAM-V2.md`      | The gated build prompt: phases 0 to 7, laws E1 to E8, and GATE A decisions D-EX-01 to D-EX-22. It extends `PROMPT-CLERKING-DESK-V2.md`.                                                                                                                                                                                     |
| `clerking-exam-catalogue.v1.json` | MS-EMR-EXAM-CAT-001 (1.0.0-draft), awaiting CSO sign-off. It holds the clinical content: vital signs, 140 items in 10 systems, 17 scales, 24 classifiers, 33 reference entries, 49 sources, 84 flag rules, 47 history-to-exam suggestion rules, the composer, the prototype-parity list (24 changes) and 10 open decisions. |
| `prototype/ExamV2.dc.html`        | The approved interactive prototype (round 3). It is the design authority for layout and interaction: port it, don't paste it.                                                                                                                                                                                               |
| `prototype/ExamV2*.dc.html`       | 18 wrappers that open the prototype in a given state (GCS, CPAP, murmur, gate, and so on).                                                                                                                                                                                                                                  |
| `screenshots/E01` to `E19`        | The prototype at 1440×1024. The prompt's Section 5.14 says which state each one shows.                                                                                                                                                                                                                                      |

**How the pack was checked**

- The sources were opened and checked on 27 Sep 2026; each `sources` entry records whether it was verified.
- A separate clinical review then found 25 issues, and all of them are fixed in this version. For example:
  - GTFCC grading now applies only with diarrhoea or vomiting;
  - adult oedema is no longer counted as malnutrition until other causes are excluded;
  - asthma severity is applied only once the clinician confirms asthma;
  - melaena is now urgent.

**Content the prototype does not show:** the Feet system (IWGDF 2023), facies, bleeding signs, HIV-associated signs, liver stigmata, Hoffmann's sign, visual fields, and three vital-sign panels (lying and standing BP, BP in both arms, peak flow). Claude Code builds them from the same response types; each is marked `in_prototype: false` in the catalogue.
