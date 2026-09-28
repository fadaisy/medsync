# Clerking desk v2: handoff pack

Copy this whole folder into the repository as `docs/emr/clerking-v2/`, then give Claude Code the prompt.

| File | What it is |
|---|---|
| `PROMPT-CLERKING-DESK-V2.md` | The gated build prompt (phases 0 to 7, GATE A decisions D-CV-01 to D-CV-16). |
| `clerking-history-catalogue.v1.json` | MS-EMR-CLERK-CAT-001: symptoms, properties, review of systems, linked answers, flag rules, reference entries, history lists and composer rules. DRAFT for CSO sign-off. |
| `prototype/Main.dc.html` | The approved interactive prototype (markup and logic). The design authority for layout and interaction; port it, don't paste it. |
| `screenshots/*.png` | The prototype rendered at 1440×1024 (2×): complaint, history, review of systems, the details pop-up, past history, family and social history. |
| `ds/medsync-chroma-tokens.json` | MedSync Chroma design tokens used by the prototype. |

Nothing needs to be attached separately: Claude Code reads the PNGs and the prototype source from the repository.
