# MedSync diabetes knowledge pack 0.3.0-draft

MS-NCD-DM-PACK-001 · generated 2026-10-05 · **draft: nothing here is signed or live**

Start with `HANDBACK-NCD-DIABETES.md`. It says what the pack is, what was checked, what is weak, and which 37 decisions are the CSO's. `PROMPT-NCD-DIABETES.md` is the gated build prompt for Claude Code.

| Folder | Contents |
|---|---|
| `catalog/` | The rule content, by lane, in the `NcdCatalog` shape |
| `dossier/` | 335 reference entries (every number lives here once) and the 802-claim research table, as JSON and CSV |
| `vignettes/` | 83 synthetic patients with expected and computed results |
| `decisions/` | The CSO decision register |
| `review/` | 122 findings from two independent reviews, with what was done about each |
| `designb/` | The pack manifest for MS-NCD-ENG-001 |
| `clerking-v2/`, `wiring/` | The clerking-desk specification, test menu, formulary classes and concept proposals |
| `tools/` | The builder, validator and reference evaluator, with the research claims they read |

To re-validate: `python3 tools/build/build.py --check` (Python 3, no dependencies). It fails on any dose-like string, any number without a reference, any label that does not match its predicate, any restricted leak, and any patient whose result differs from what is expected.
