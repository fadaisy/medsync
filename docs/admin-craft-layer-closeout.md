# Superadmin workspace — craft layer closeout

**Branch:** `feat/superadmin-craft` → PR #5
**Scope:** Visual + interaction craft only. **Zero functional or security changes** to the surface defined in `prompts/superadmin-workspace-kickoff.md`. RLS, Edge Functions, four-eyes wiring, break-glass, audit log writes are all untouched.

This document is the GATE D sign-off note. The functional inventory still lives in `docs/superadmin-workspace-closeout.md`.

---

## What changed, by gate

### GATE A — Shell + ⌘K command palette

- `components/ui/sheet.tsx` — right/left-anchored slide-out primitive (base-ui Dialog), motion-reduce safe.
- `app/admin/_components/admin-shell.tsx` — persistent left sidebar (240px) + top bar (52px); operator identity + `MFA · AAL2` marker in the sidebar footer; ever-present "Superadmin console · Production" indicator in the top bar.
- `app/admin/_components/command-palette.tsx` — ⌘K palette built on base-ui Combobox inside base-ui Dialog (correct combobox/listbox ARIA + focus trap + Esc); navigation entries grouped `Navigate` + `Sensitive actions`.
- `app/admin/_lib/approvals-count.ts` — live count for the Approvals badge.

### GATE B — DataTable + slide-out detail panel

- `components/ui/data-table.tsx` — sticky header (gray-50, 10px overline), tight rows, mono+tabular-nums for IDs, controlled three-state sort with `aria-sort`, ↑↓ + Home/End focus navigation, `FilterChip` with `aria-pressed`, `Pill` mapped to DESIGN-medsync clinical colours, `DataTableEmpty` with explain-don't-dead-end.
- `app/admin/page.tsx` (Approvals) — unified queue of staff affiliations + hospital applications; row click → detail Sheet with evidence `dl`, three action modes (view → approve/reject → reason), reason ≥ 8 chars enforced by the Server Action, lazy signed-URL document opener.

### GATE C — DataTable + Sheet applied across Tenants / People / Audit; palette entity search

- `app/admin/_components/tenants/` — state filter chips, Activate action in the slide-out.
- `app/admin/_components/people/` — role pills, multi-action panel (Suspend / Reset MFA / Deactivate / Promote-to-SA); self-actions disabled; Promote-to-SA uses the sensitive-action visual envelope (amber surface, "what happens next" copy, **four-eyes pending banner stays visible** on partial success so the operator sees `Awaiting second superadmin approval (id: abc12345…)` before they close the panel).
- `app/admin/_components/audit/` — break-glass and four-eyes events visually distinct (sensitive Pill tone + amber icon); detail panel surfaces `request_id` / IP / UA for incident reconstruction.
- `app/admin/_components/command-palette.tsx` — extended with hospital + person entity search; empty query → nav only; typing → nav + entities (8 each).
- `app/admin/_lib/palette-entities.ts` — server-side prefetch (top 200 of each), failure-tolerant.

### GATE D — Polish + closeout

- `app/admin/_components/catalog/browser.tsx` — segmented control + dense DataTable + filter input (replaces the six stacked card sections).
- `app/admin/health/page.tsx` — refined 5-tile glance; each tile is now a link to its source surface; sensitive break-glass tile flagged with an amber left bar + `ShieldAlert` icon.
- `app/admin/_components/mobile-sidebar.tsx` — hamburger in the top bar at `< lg` opens the nav as a left-anchored Sheet; row click closes the sheet via `SheetClose`.
- This document.

---

## Accessibility (WCAG 2.2 AA)

| Surface              | Mechanism                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Command palette      | base-ui Combobox provides combobox/listbox + active descendant; Dialog provides aria-modal + focus trap + return-focus-to-trigger         |
| DataTable            | `aria-sort` on sortable `<th>`; rows are `tabIndex=0` + `onKeyDown` for ↑↓/Home/End/Enter/Space; selected row marked with `data-selected` |
| Sheet                | base-ui Dialog provides aria-modal + focus trap; Esc closes; focus returns to trigger                                                     |
| Sidebar              | `aria-current=page` on active link; `aria-label="Workspace navigation"` on the `<aside>`                                                  |
| Filter chips         | `aria-pressed`                                                                                                                            |
| Topbar env indicator | `aria-label="You are signed into the superadmin console"`                                                                                 |
| Mobile sidebar       | hamburger has `aria-label="Open navigation"`; Sheet inside is `aria-modal`                                                                |
| Icons                | every decorative icon is `aria-hidden`; semantic ones have `aria-label` on the parent button                                              |
| Focus rings          | every interactive element uses `focus-visible:ring-2 focus-visible:ring-teal-500/40`                                                      |

---

## Motion

- Single easing: `cubic-bezier(0.16, 1, 0.3, 1)` (= `ease-expo-out` Tailwind utility from DESIGN-medsync.md).
- Durations: 100ms hover / 150ms popup / 250ms sheet.
- Every animated surface gates on `motion-reduce:animate-none motion-reduce:duration-0`. macOS _Reduce motion_ → all transitions become instant; functional behaviour identical.

---

## Functional / security unchanged

Verified by inspection that the craft layer touches only:

- presentation components (`app/admin/_components/**`, `components/ui/{sheet,data-table}.tsx`)
- page-level server fetches that re-shape existing data into `*Item` types for the client tables
- the layout's role/AAL gate **kept identical** to GATE-A version

No changes to:

- RLS policies, migrations, Edge Functions (`supabase/{migrations,functions}/**`)
- four-eyes helper (`supabase/functions/_shared/four-eyes.ts`)
- audit-log writers (`supabase/functions/_shared/sa-audit.ts`)
- Server Actions' validation, edge-call body, audit-write semantics

The pre-craft commit on `main` for the same surfaces will produce byte-identical Edge-Function invocations.

---

## Pre-ship reminder

The kickoff §8 commitment still stands and is **independent of this craft work**:

> A second superadmin is added before go-live with real patients so four-eyes actually enforces.

Currently auto-satisfied with one SA. The UI exposes the auto-satisfied + awaiting-second-SA states distinctly so the moment a 2nd SA is added, the behaviour change is visually correct without further code.

---

## What's deferred (call-out for future gates)

- **Type-to-confirm modal** for the heaviest actions (deactivate-tenant, demote-superadmin, bulk-export). The current amber sensitive-action envelope conveys gravity; the typed confirmation layer goes in when the full step-up auth flow lands.
- **Bulk selection toolbar** for People + Audit. DataTable is wired for it but no current surface needs it (and any destructive bulk action must obey four-eyes).
- **Palette action items** (`Approve hospital X…`, `Suspend user Y…`). Currently the palette navigates only — pages own the action surface. Action items will route through the same safeguards once added.
- **Sentry / SMS / trend charts** on the Health page (kickoff Area 6 deferred list).

---

## Verifications

- `npm run build` — green, 27 routes
- `npx vitest run` — 71/71 pass
- Branch preview deployed and verified end-to-end (sign-in → /admin → Approvals → row → Sheet → Approve)

🤖 Generated alongside the GATE work.
