# Pharmacy Workspace v2: STOP 0 (discovery)

Branch `feat/pharmacy-workspace-v2`, off `feat/pharmacy-demo` (4ffcc9d2). Worktree `~/Desktop/medsync-pharmws2`.

## The spec

The canvas README names `PROMPT-PHARMACY-WORKSPACE-V2.md`. **That file is not on this Mac.** I searched Downloads, Desktop and every worktree. Following the lab's precedent, the ten boards are the spec, and the Lab Workspace v2 prompt (`docs/lab/workspace-v2/PROMPT-LAB-WORKSPACE-V2.md`) supplies the laws and the gate structure. The canvas is copied into `pharmacy-workspace-v2-canvas/` beside this folder.

Laws carried over from the lab prompt:

- interface only: no new writes, tables or RLS changes; new read models are pure projections;
- nothing lost (parity);
- every old URL keeps working;
- rules are shown, never re-decided;
- two identifiers wherever a patient appears;
- "No data", 0 and "Not set" are three different things;
- red is for emergencies only, and nothing is green;
- one lagoon action per region;
- strings live in `content/` as draft;
- no new dependencies;
- en-GB dates.

Law 4 also applies: no role words, only cadres and places.

## Inventory (Q1)

The old interface has 40 route pages under `app/pharmacy`, listed in `inventory-routes.md`. Its 24 nav items are in `lib/pharmacy/nav.ts`, each behind its own flag and permission. The read-model inventory, checked against the code, is in `data-sources.md`.

## Where the boards and the repo disagree (resolved in GATE A §1)

| Board says                                              | Repo has                                                                                                       | Resolution                                                                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| "updates live" (Today, Window)                          | No pharmacy realtime channel. The queue ticks a clock and has a refresh button                                 | The words say "As of {time}", with a refresh link. A live channel is out of scope (a new subscription is not interface-only)        |
| Points table state "Downtime"                           | No "in downtime" state. Downtime periods are recorded only after they end                                      | The states are Live, Not live and Switched off                                                                                      |
| Shelf › Counts tab                                      | No list of counts. The stock page has a "Not counted" tab and `lastCounted`                                    | No Counts tab. The stock page's "Not counted" filter stays as a chip on Shelf › Stock                                               |
| Emergency doses: "15 matched, 3 without a prescription" | No matching of resus doses to prescriptions                                                                    | The card shows the doses list only. Matching would be a clinical rule, so it needs a CSO decision first                             |
| Shelf strip "Cold chain 2 fridges"                      | No temperature logging                                                                                         | Dropped                                                                                                                             |
| Clinical › Interventions "Record one"                   | No manual intervention writer. An intervention is a query                                                      | "Record one" is dropped. The card shows the existing report, and queries are sent from the prescription                             |
| Clinical › Reconciliation "not started"                 | Only opened reconciliations exist                                                                              | The card counts open and reopened ones. "Not started" is dropped                                                                    |
| Needs you › "queries answered"                          | An answer moves the line back to "to review". There is no separate stage                                       | Answered queries show in the Window queue's To review group, marked by the existing query state. They are not a separate inbox item |
| Week bars for Refills                                   | No refill history                                                                                              | No bars, and the words say "No earlier data"                                                                                        |
| Set-up "sign clinical content" permission               | `pharmacy.manage` signs (packs and content); the author may not be the first signer when another holder exists | The coded rule is shown, from `signerRoles` and `signRefusal`                                                                       |
| Plum for place                                          | DESIGN (Chroma): Pharmacy and lab share **grape**                                                              | Grape (`bg-tide-area-lab`). DESIGN wins                                                                                             |
| Network routing under Places and suppliers              | Not on this branch (Phase 4, `feat/pharmacy-network`)                                                          | There is no routing tab here, so the nav gap does not exist on this base                                                            |
| Going live tab                                          | Going live is run from hospital admin, not the pharmacy                                                        | A read-only list of point states, with the note that hospital admin switches points on                                              |

## Timed baselines and screenshots (Q4/Q5)

These follow the lab's harness proxy: the same fixture and the same scripted steps, old and new. The pilot keeps the human trial open.
