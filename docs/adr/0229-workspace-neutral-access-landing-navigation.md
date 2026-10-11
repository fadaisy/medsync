# ADR 0229 — Access, landing, navigation, flag, notice and shell as workspace-neutral modules

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, E-PH0-01, PA-8, NV-P2
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §2.7).

## Context

Lab Phase 0 built its permission map, landing resolver, navigation registry, flag with a production gate, notice and
shell, all hard-coded to the lab. The pharmacy needs every one of them.

## Decision

Generalise each **once**, with the lab rebuilt on the shared piece and its exports unchanged:

| Shared                                                                                          | Lab keeps                          |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| `lib/workspace-access/access.ts` (signed map → permissions)                                     | its headship rule for `lab.manage` |
| `lib/workspace-access/flag.ts` (`1` or a list; production refuses while safety copy is `draft`) | `LAB_WORKSPACE`                    |
| `lib/workspace-access/nav.ts` (registry)                                                        | its three items                    |
| `content/signed-copy.ts`                                                                        | its notice text                    |
| `components/medsync/{workspace-shell,workspace-nav,tab-list,caution-notice}.tsx`                | its markup, byte for byte          |
| `lib/auth/landing.ts` gains the `pharmacy` group and `active.pharmacy` (optional)               | its 37-row table                   |

The shared modules live in `lib/workspace-access/`; `lib/workspace/` is the doctor workspace's own folder.

## Consequences

- Every lab test passes unchanged except one design assertion that now reads the shared notice's source.
- The lab sidebar still does not light Worklist on a result screen; lighting on sub-paths is opt-in (the pharmacy's).

## Alternatives considered

Copying the lab's modules (two engines to keep in step).
