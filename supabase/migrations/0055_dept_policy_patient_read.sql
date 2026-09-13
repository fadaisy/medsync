-- 0055 — department_scheduling_policy: readable by every signed-in user.
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- The same-day door on the phone reads a department's walk-in window straight
-- from this table (mobile/src/lib/booking.ts `fetchWalkInDepartments`), the
-- way the web reads it over Drizzle. `dept_policy_select_scoped` (0028) admits
-- staff and admins only, so for a patient PostgREST answers `[]` — not an
-- error — and the reader, which treats "no policy row" as "no restriction"
-- (ADR 0084 §14), shows every department open. `pt-declare-intake` then
-- refuses honestly, but the door has promised what the desk denies.
--
-- Opening hours are not a secret: they are what the sign at the gate says.
-- Nothing else on the row (slot length, buffer, auto-confirm default, reminder
-- lead) is about any person. Permissive policies OR together, so the staff
-- policy stays exactly as it is and this one admits the rest of
-- `authenticated`. Writes remain Edge-Function only (`ha-update-department-policy`).

CREATE POLICY dept_policy_select_authenticated ON public.department_scheduling_policy
  FOR SELECT TO authenticated
  USING (true);
