# ADR-0081 — Remove the v1 clerkship capture layer (NCD rebuild)

**Status:** Accepted (owner-directed, 2026-09-05). Built on `chore/remove-clerkship-v1`.
**Archived at:** tag `archive/clerkship-v1` → `fcaabc5` (pushed). Nothing was deleted from history.
**Retires the surface described by:** ADRs [0060](0060-clerkship-symptom-capture-engine.md)–[0080](0080-hypothesis-driven-review-of-systems.md). Those ADRs remain valid history; the code they describe no longer ships.
**No migration.** No schema change, no data change, no dropped table.

## Decision

The v1 clerkship **capture** layer is removed so the NCD-specific version can be built on a clean surface. The encounter **spine** underneath it stays, because working modules sit on it.

The cut is between _capturing_ a clerkship and _having an encounter_:

| Removed (38,507 lines)                                                                                               | Kept                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `lib/clerkship/` — symptom engine, ROS, six structured exams, catalogs, the reasoning agent, 17 sourced weight files | `db/schema/**`, `supabase/migrations/**` — untouched                                    |
| `app/doctor/encounters/[encounterId]/_components/` — the form, all tabs, panels, agent rail                          | `lib/encounter/{feature,assignment,record,orders,scope,access,handoff,workspace-scope}` |
| `app/doctor/encounters/[encounterId]/actions.ts` — the clerkship server actions                                      | `components/encounter/` — the shared patient record panel                               |
| `tests/clerkship/` (51 files), `tests/encounter/clerkship-input.test.ts`                                             | `investigations-panel.tsx` — lab orders/results, not clerkship                          |
| `docs/clinical/agent/`, `enriched-reasoning-maps.json`                                                               | `docs/clinical/ncd-defining-criteria-research.json` — input for v2                      |

**Still working, untouched:** lab worklist + result entry (ADR 0077), triage → doctor assignment, nurse resus, doctor/assigned, patient clinical records, admin catalog proposals.

## Two things this ADR exists to record

### 1. Existing clinical records stay readable — the reason `lib/encounter/clerkship.ts` survived

Clinical records are append-only. Three `clinical_documentation` rows already exist, and the patient record panel renders them through `deriveClinicalObjects`. Deleting the mapper with the engine would have made written clinical documents unreadable — not acceptable.

It survives because of a property worth stating: `deriveClinicalObjects` reads **only** `history.{allergies, medications, pmhItems}` and `synthesis.{differential, problems, investigations, disposition}`. It never reads into the exam, ROS or symptom payloads — those were nine **type-only** imports used as opaque field types. Replacing them with a local `V1Payload = Record<string, unknown>` let the entire v1 engine be deleted without a single record becoming unreadable.

The module is now marked **FROZEN**: it reads, nothing writes it, and NCD v2 defines its own shape.

### 2. Catalog governance was not clerkship code

`lib/clerkship/governance.ts` imported only `db`, `db/schema/symptom-catalog` and `logger` — zero coupling to the form. It is the super-admin proposal/approval flow for shared catalog contributions, and v2 will want it. Moved verbatim to **`lib/catalog/governance.ts`** (100% rename); the three `app/admin/catalog-proposals/` files were repointed.

## Deliberately left in place

- **Migrations and schema.** 0040 (encounter spine), 0045 (ROS catalog, 81 screens seeded), 0048 (drafts), 0049 (problem-list synthesis) are applied to the live project and immutable by project convention. `db/schema/clerkship-drafts.ts` and `clerkship-picklist.ts` now have no importers but stay, because schema mirrors the applied database. `db:check` reports no drift.
- **`clerkshipDraftsLive()`** — now unread. The table exists, so v2 can switch autosave back on without a migration. Annotated in place rather than deleted.
- **`encounter_symptom_observations` rows.** The v1 fan-out that wrote them is gone (nothing produces `hpcItems`/`ros` any more), but existing rows are untouched and still queryable.
- **`CLERKSHIP_AGENT_LIVE` / `AGENT_*_CSO_SIGNED`** env vars are now unread. Harmless set or unset.

## The encounter route

`/doctor/encounters/[encounterId]` still renders: patient header, allergies, encounter state, investigations/results, and the timeline. Where the form was, there is an **honest empty state** — "Being rebuilt for NCD care" — not a stub form. Nothing may imply clerking was captured when it was not.

## To restore

```
git checkout archive/clerkship-v1                     # browse the whole v1
git checkout archive/clerkship-v1 -- lib/clerkship    # lift a subtree back
```

The tag's message lists the full contents and line counts.

## Verification

tsc (app + Edge Functions) clean · eslint clean, **0 warnings** (the 6 pre-existing ones were in deleted exam components) · **781 tests pass, 0 failures** (357 clerkship tests removed with the layer) · `npm run build` compiles and both encounter routes still render.

## Follow-ups for NCD v2

- Build in a **new namespace** rather than re-using `lib/clerkship/` — the frozen reader keeps that name meaningful as "v1".
- `clinical_documentation.section_data` is **JSONB**, so a new capture shape needs **no migration**.
- Decide whether v2 reuses `symptom_catalog` (81 ROS screens, 19 must-not-miss, already seeded) or seeds an NCD-specific catalog.
- The removed reasoning agent's one durable asset was the 17 sourced, CSO-cited differential weight files. If v2 wants ranking, lift them from the archive rather than re-sourcing.
