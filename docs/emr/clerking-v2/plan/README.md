# Pack: clerking desk v2, step 10 Plan

**Built:** 28 Sep 2026, cloud session.
**Owner and CSO:** Usama Fadhul.
**Status:** draft. Nothing here is signed, and nothing has been built in the repo.

## What is here

| File | What it is |
|---|---|
| `PROMPT-CLERKING-PLAN.md` | The gated Claude Code build prompt: Phases 0 to 7, each ending in a STOP, plus the dose-verification task and a list of what the prototype invents. |
| `MONITORING-CHARTS.md` | Which plan items open which chart, and the fluid balance chart and its graphs in detail. Also covers graph design, storage and open decisions. |
| `drug-catalogue.v0.json` | **MS-RX-CAT-001**, the classified general formulary: 14 systems, 69 classes, 182 generic drugs and 100 diagnosis → class links. Each drug has routes, methods, allergy groups, flags and chart links. **No doses**: every dose waits for verification. |
| `drug-catalogue-validate.py` | Checks the catalogue's ids and links, and that no dose content has slipped in. |
| `drug-catalogue-README.md` | How the catalogue is structured and verified. |
| `prototype/` | `Prototype7.dc.html` (the design authority) with Prototypes 3 to 6 and the shared parts (Header, Rail, Note). |

## How it was made

1. **Prototype 3:** the Plan by problem, with tests, care items, the basket and the before-you-sign checklist.
2. **Prototype 4:** the prescribing engine in the Plan, built on `lib/prescribing` and the EMR prescribe sheet.
3. **Prototype 5:** prescribing by diagnosis (classes and generic examples), dose-by-age slots, how the medicine is given, the pharmacy seam, IV fluids with a fluid balance chart, and four test priorities with a frequency for routine.
4. **Prototype 6:** a centred dialog in the manner of the resus prescribe dialog, with the weight taken from the vitals.
5. **Prototype 7:** a landscape three-column dialog with minimal typing (regimens, taps and reason chips), and monitoring charts with graphs.

## Doses

Doses were not verified in this session: the environment's network policy blocked Medscape, the BNF, NICE, WHO and the Uganda MoH library.
- The only doses shown anywhere are the three already signed in the repo's emergency formulary: glucose IV, glucagon and the crystalloid bolus.
- To fill the rest, allow `reference.medscape.com` (and `bnf.nice.org.uk`, `bnfc.nice.org.uk`, `library.health.go.ug`) in the environment's network settings, then run Appendix A of the prompt.

## First message to give Claude Code

> Read `docs/emr/clerking-v2/plan/README.md`, then the prompt. Run Phase 0 only (discovery, no product changes) and STOP.
