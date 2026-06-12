-- 0048 — Clerkship working-draft autosave (W3, no-lost-work).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Additive only; safe + reversible (a single transient table).
-- The TypeScript feature is built against this schema and ships DARK behind
-- CLERKSHIP_DRAFTS_LIVE — set that flag to "1" only AFTER this migration is
-- applied (`npm run db:migrate`). Requires the encounter spine (0040) applied.
--
-- A MUTABLE per-(encounter, author) scratchpad holding the in-progress
-- ClerkshipInput between explicit saves — deliberately SEPARATE from the
-- append-only `clinical_documentation` version history, so debounced autosave
-- never spams the system-of-record. Transient form state, NOT system-of-record:
-- not versioned, not on the audited clinical timeline. Deleted on a successful
-- explicit save/finalise.

create table if not exists clerkship_drafts (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null,
  author_id    uuid not null,
  payload      jsonb not null,
  updated_at   timestamptz not null default now()
);

create unique index if not exists clerkship_drafts_encounter_author_unique
  on clerkship_drafts (encounter_id, author_id);
create index if not exists clerkship_drafts_encounter_idx
  on clerkship_drafts (encounter_id);

alter table clerkship_drafts enable row level security;

-- An author may touch ONLY their own draft. Privileged server writes use the
-- service client (bypasses RLS); these policies are defence-in-depth against any
-- direct client access.
create policy clerkship_drafts_select_own on clerkship_drafts
  for select to authenticated using (author_id = auth.uid());
create policy clerkship_drafts_insert_own on clerkship_drafts
  for insert to authenticated with check (author_id = auth.uid());
create policy clerkship_drafts_update_own on clerkship_drafts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy clerkship_drafts_delete_own on clerkship_drafts
  for delete to authenticated using (author_id = auth.uid());
