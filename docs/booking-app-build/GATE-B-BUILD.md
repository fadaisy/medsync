# Gate A′ + Gate B build contract (READ IN FULL)

Repo /Users/airm1/Desktop/medsync, branch `feat/booking-app`. Authoritative inputs, in order:
1. docs/booking-app-gate-a-proposal.md — §5.2, §5.3, §5.4, §5.5, §5.6, §5.13, §10 rows A′ and B. Build EXACTLY those tables/columns.
2. docs/booking-app-prd.md — §2.2, §3.4, §4.4, §7.0, §7.2.
3. AGENTS.md (Next 16 — read node_modules/next/dist/docs before writing app code; Edge Function pattern; migrations immutable;
   ADR process; design system: DESIGN-medsync.md + skills; red = emergency only; headings 500).
4. docs/hospital-admin-integration-contract.md for console surfaces.

## Rulings assumed (record them in ADR 0087; do not re-decide)
- C2: capacity kinds `slot` | `session` | `open_queue` on `service_lines.capacity_mode`. Slot mode unchanged. DEFAULT for a
  NEWLY created service line = `session` (Part 8 #3). Backfilled lines for every existing department = `slot` (nothing shipped changes).
- C5: `appointments_reason_check` widened to Appendix A's 13 codes: follow_up, post_discharge, new_concern, refill, test_results,
  antenatal, immunisation, child_wellness, specialist_review, routine, procedure, counselling, second_opinion — PLUS the shipped
  `urgent_review` and `other` stay valid (0053 keeps urgent_review non-patient). `appointments_patient_reason_check` (origin<>'patient'
  OR reason<>'urgent_review') is untouched.
- C12: NO holds. No `held` status, no hold_expires_at.
- Part 8 #4: capacity_booked default = 60% of capacity_total (rounded up), interleave 2:1.
- Part 8 #5: Appendix A time_to_care defaults are stored as the column DEFAULT per reason family but flagged CSO-provisional in
  the migration comment; the backfilled slot lines get 30.
- C6: branch cut done. C8: the dark toggle STAYS (owner asked for it explicitly; ADR 0087 records it). CSO items (C3, C10, #5–#7,
  #12–#13): no code; arrival windows are STORED at confirmation (5.6) but nothing at Gate B renders them.

## Migration 0058 — `0058_service_lines_and_sessions.sql` (GATED header like 0056). Additive except the one flagged index re-scope.
Sections, in order:
1. `service_lines` per §5.2 (all columns; UNIQUE (hospital_id, slug); partial UNIQUE (hospital_id) WHERE is_default; index
   (hospital_id, active); RLS ENABLE+FORCE; policy `service_lines_select_authenticated FOR SELECT TO authenticated USING (true)`;
   `set_updated_at` trigger in the 0028 pattern — check the trigger function name used in 0028 and reuse it).
   Backfill: INSERT one row per `hospital_departments` row: name = department name, slug = department slug (or slugified name),
   capacity_mode='slot', time_to_care_days=30, reason_codes = ARRAY['follow_up','new_concern','refill','routine','other'],
   is_default=false. ON CONFLICT DO NOTHING.
2. `session_templates` per §5.4 (UNIQUE (service_line_id, weekday, start_minutes_local, valid_from); RLS: SELECT for
   hospital_admin/clinician/nurse at hospital — the `availability_blocks_select_scoped` shape from 0028:75-82 — plus superadmin).
3. `clinic_sessions` per §5.3 (every column incl. booked_count/next_position/status/cancelled_*; CHECKs; indexes; UNIQUE
   (template_id, starts_at) WHERE template_id IS NOT NULL; RLS: SELECT authenticated USING (status='published') + staff-at-hospital
   all rows + superadmin; `set_updated_at`).
4. `appointments` columns per §5.5/§5.6: idempotency_key text NULL + partial UNIQUE (patient_user_id, idempotency_key);
   channel text NOT NULL DEFAULT 'web' CHECK IN ('web','app','ussd','desk','system'); session_id uuid NULL FK clinic_sessions;
   position_number smallint NULL; UNIQUE (session_id, position_number) WHERE session_id IS NOT NULL;
   CHECK ((session_id IS NULL) = (position_number IS NULL)); arrival_window_start/end timestamptz NULL;
   booking_code text NULL + UNIQUE (hospital_id, booking_code).
5. Index re-scope: DROP INDEX appointments_no_double_booking; CREATE UNIQUE INDEX appointments_no_double_booking ON appointments
   (clinician_user_id, starts_at) WHERE session_id IS NULL AND status IN (the same five as 0028:235-237). Comment: the one
   non-additive step, flagged in Gate A §5.6; every shipped row has session_id NULL.
6. `appointments_reason_check` widened (DROP + ADD with the 15 codes above). Existing rows all satisfy it.
7. `sa_audit_log_action_check` re-issued (0056's list verbatim + 'update_service_line', 'update_session_template',
   'cancel_session', 'book_on_behalf'). Also add the same to `_shared/sa-audit.ts` SaAuditAction.
Drizzle: `db/schema/service-lines.ts` (serviceLines), `db/schema/clinic-sessions.ts` (sessionTemplates, clinicSessions),
appointments columns in `db/schema/scheduling.ts`, barrel exports. `npm run typecheck` green.

## Engine additions — `supabase/functions/_shared/slots.ts` (ZERO imports stays true)
- `export function startOfLocalDay(instant: Instant, timeZone: string): Date` — local midnight of the civil day containing
  `instant`, as an instant (use the existing localParts/instantAtLocal; DST-safe). And `endOfLocalDay` = start of next civil day.
- `export interface SessionTemplateRow { weekday: number; startMinutesLocal: number; durationMinutes: number; validFrom: string /*YYYY-MM-DD*/; validUntil: string | null }`
- `export function expandSessionTemplate(t: SessionTemplateRow, rangeStart: Instant, rangeEnd: Instant, timeZone: string): { startsAt: Date; endsAt: Date }[]`
  — every occurrence of the template's weekday inside [rangeStart, rangeEnd) ∩ [validFrom, validUntil], at start_minutes_local in
  the zone, using the same arithmetic as expandBlocks (never the host clock). Ascending. Pure.
- Tests in tests/scheduling/slots.test.ts: startOfLocalDay at 00:30 EAT (21:30Z previous day → Kampala midnight of the NEXT civil
  day = 21:00Z); expandSessionTemplate across a valid_from boundary and with valid_until; weekday 7 (Sunday) honoured.

## A′ hygiene (touches shipped files — owner OK assumed by "implement it")
(a) 23505 on `appointments_no_double_booking` → 409 "Someone just took this slot — pick another and try again." at
    pt-request-appointment (the insert error branch) and reschedule-appointment (its insert). 23505 on the new idempotency index
    → SELECT the existing row for (patient, key) and return it as 200 (same shape as the success response).
(b) Replace every `setUTCHours(0,…)` / `setHours(0,…)` "today" boundary in app/, lib/, supabase/functions/, mobile/src with
    `startOfLocalDay(now, DEFAULT_TIME_ZONE)` / `endOfLocalDay`. Find them: grep -rn "setUTCHours(0\|setHours(0" app lib supabase/functions mobile/src.
    mobile's own `startOfClinicDay` in mobile/src/lib/booking.ts becomes a call to the shared helper. Where a site's zone is
    genuinely the host's (none should be), say why in a comment.
(c) `ha-complete-encounter`: when the encounter has `appointment_id`, also UPDATE appointments SET status='completed' (if status in
    arrived/in_progress) in the same flow, audited under the existing verb.
(d) `ha-mark-no-show`: authorise any active/approved staff affiliation at the appointment's hospital (not only the clinician);
    add a reception action + button on the reception expected/arrivals surface where the appointment is listed (find the surface:
    app/reception/expected).

## Edge Functions (Gate B)
- `ha-upsert-service-line` — input {hospital_id, id?, department_id, name, slug?, capacity_mode, time_to_care_days,
  continuity_default, confidential, payment_posture, fee_ugx?, deposit_ugx?, reason_codes[], is_default, active}. Auth:
  hospital_admin at hospital OR superadmin (copy ha-update-department-policy's shape incl. requireHospitalAdminScope). Validate
  reason_codes ⊆ the 13 patient codes (never urgent_review). Upsert; audit `update_service_line` with before/after.
- `ha-upsert-session-template` — input {hospital_id, id?, service_line_id, clinician_user_id?, venue?, weekday 1..7,
  start_minutes_local, duration_minutes, capacity_total, capacity_booked?, interleave_booked?, interleave_walk_in?,
  overbooking_factor?, valid_from, valid_until?, active}. Same auth. Service line must be `session` mode and belong to the hospital;
  clinician (if set) must hold an active clinical affiliation at the hospital. Upsert; then MATERIALISE: expandSessionTemplate over
  [now, now+14d] and INSERT clinic_sessions rows copying the capacity columns, ON CONFLICT (template_id, starts_at) DO NOTHING
  (never overwrite a published instance). Deactivating a template cancels its FUTURE instances that have booked_count = 0 and
  leaves the rest (status stays published; console shows them). Audit `update_session_template`.
- Nightly materialisation: in `app/api/cron/cleanup-drafts/route.ts` (existing 02:00 cron), after the existing work, run the same
  expansion for every active template via Drizzle (server-side, service connection) — a shared pure helper means Deno and Next
  produce identical instances. Log counts. Idempotent.

## Console (Gate B) — `/hospital-admin/scheduling` gains two sections; reuse the HA shell + existing `policy-form.tsx` idioms
- "Service lines": table of the hospital's lines (name, department, mode chip, time-to-care, confidential, posture, default) with an
  editor (sheet/form) posting to a server action that calls `ha-upsert-service-line` via lib/supabase/edge.ts `callEdge`.
- "Clinic sessions": templates list (weekday, time, duration, cap, split, clinician) + editor → `ha-upsert-session-template`;
  under it "Next 14 days" — generated `clinic_sessions` (date, time, clinician, booked/cap, status) read via Drizzle.
- Tokens only; no red; headings 500; `text-heading-*` tokens; `/styleguide` tokens. Server Components + Server Actions (Next 16
  docs). Empty states written honestly ("No clinic sessions published yet").

## Tests + gates
- Pure tests only (no DB): slots.test.ts additions; a `tests/scheduling/reason-codes.test.ts` asserting the 13-code list used by the
  functions equals the migration's (parse the SQL file); a `tests/scheduling/session-allocator.test.ts` that asserts the allocator
  SQL string in `_shared/sessions-sql.ts` (export the UPDATE … RETURNING statement as a constant so both functions use one string)
  contains `booked_count < ceil(capacity_booked * overbooking_factor)` and `status = 'published'`.
- `npm run typecheck && npm run lint && npm run test` green; `cd mobile && npx tsc --noEmit && npx eslint src --max-warnings=0` green.
- ADR 0087 `docs/adr/0087-capacity-modes.md`: the rulings above, the index re-scope, and what Gate B does NOT do (no booking into
  sessions yet — that is Gate C; no cancel-session — Gate E).
