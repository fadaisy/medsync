-- 0173 — Lab test menu v2: the indicator source reads offerings by test (TM-3, TM-4; ADR 0350).
--
-- 0118's private.lab_indicator_source joined lab_test_services (the per-LOINC link this work removes). Redefined
-- with the one change: a row's section is its test offering's legacy unit, else the hub unit (A.3 code) of
-- section_override ?? test_catalogue.section. Everything else is 0118's text verbatim. Needs 0171 (section columns).
-- ADDITIVE and re-runnable (CREATE OR REPLACE). GATED: owner-applied (`npm run db:migrate`), after 0171 and 0172.

CREATE OR REPLACE FUNCTION private.lab_indicator_source(p_hospital uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (kind text, ref uuid, order_id uuid, patient_user_id uuid, restricted boolean, device_id uuid,
               section_id uuid, ward_id uuid, priority text, test_code text, at timestamptz,
               received_at timestamptz, due_at timestamptz, done_at timestamptz, flag boolean, bedside boolean,
               reason text, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH
  -- Released: the first final version of each in-house lab report; downtime results keep the form's times
  -- (released when resulted on paper, turnaround from collection, DT-7). Flag: corrected after release.
  rel AS (
    SELECT d.logical_id AS ref, d.order_id, d.patient_user_id, d.sensitivity = 'restricted' AS restricted,
           t.code AS test_code, coalesce(de.resulted_at, d.recorded_at) AS at,
           CASE WHEN de.report_id IS NOT NULL THEN de.collected_at
                ELSE (SELECT max(e.recorded_at) FROM public.specimen_events e
                       WHERE e.specimen_id = d.specimen_id AND e.kind = 'received') END AS received_at,
           EXISTS (SELECT 1 FROM public.diagnostic_reports a
                    WHERE a.logical_id = d.logical_id AND a.status IN ('amended','corrected')) AS flag,
           d.source = 'poc_staff' AS bedside
      FROM public.diagnostic_reports d
      JOIN public.test_catalogue t ON t.id = d.test_id
      LEFT JOIN public.downtime_entries de ON de.report_id = d.id
     WHERE d.hospital_id = p_hospital AND d.kind = 'lab' AND d.status = 'final' AND d.performer = 'in_house'
       AND coalesce(de.resulted_at, d.recorded_at) >= p_from AND coalesce(de.resulted_at, d.recorded_at) < p_to
       AND NOT EXISTS (SELECT 1 FROM public.diagnostic_reports f WHERE f.logical_id = d.logical_id
                          AND f.status = 'final' AND f.version < d.version)),
  -- Specimens received or rejected in the period (as HMIS 10.7 reads them). Flag: rejected.
  spe AS (
    SELECT e.specimen_id AS ref, s.order_id, s.patient_user_id, min(e.recorded_at) AS at,
           bool_or(e.kind = 'rejected') AS flag, max(e.reason_code) FILTER (WHERE e.kind = 'rejected') AS reason
      FROM public.specimen_events e JOIN public.specimens s ON s.id = e.specimen_id
     WHERE e.hospital_id = p_hospital AND e.kind IN ('received','rejected')
       AND e.recorded_at >= p_from AND e.recorded_at < p_to
     GROUP BY e.specimen_id, s.order_id, s.patient_user_id),
  -- Every label check at collection (Phase 2 ID-3). Flag: the label was not this order's (caught).
  ide AS (
    SELECT c.id AS ref, c.order_id, c.patient_user_id, c.recorded_at AS at, c.outcome <> 'match' AS flag,
           c.outcome AS reason
      FROM public.lab_identity_checks c
     WHERE c.hospital_id = p_hospital AND c.recorded_at >= p_from AND c.recorded_at < p_to),
  -- Critical alerts sent in the period (Phase 1), with the signed time and the acknowledgement.
  cri AS (
    SELECT a.id AS ref, coalesce(a.order_id, d.order_id) AS order_id, a.patient_user_id, a.restricted,
           a.sent_at AS at, a.due_at, a.acknowledged_at AS done_at
      FROM public.critical_alerts a LEFT JOIN public.diagnostic_reports d ON d.id = a.report_id
     WHERE a.hospital_id = p_hospital AND a.sent_at >= p_from AND a.sent_at < p_to),
  ords AS (
    SELECT o.id, o.priority, en.department_id AS ward_id, t.code AS test_code,
           o.sensitivity = 'restricted' AS restricted, sec.section_id
      FROM public.encounter_orders o
      JOIN public.encounters en ON en.id = o.encounter_id
      LEFT JOIN public.test_catalogue t ON t.id = o.test_id
      LEFT JOIN LATERAL (
        -- TM-3, TM-4: the test's own offering; its legacy unit, else the hub unit of its effective section.
        SELECT coalesce(f.section_id, u.id) AS section_id
          FROM (SELECT 1) one
          LEFT JOIN public.diagnostic_offerings f ON f.hospital_id = p_hospital AND f.kind = 'lab' AND f.code = t.code
          LEFT JOIN public.hospital_departments u ON u.hospital_id = p_hospital AND u.archived_at IS NULL
                AND u.parent_id IN (SELECT d.id FROM public.hospital_departments d
                                     WHERE d.hospital_id = p_hospital AND d.catalogue_code = 'LABORATORY')
                AND u.catalogue_code = CASE coalesce(f.section_override, t.section)
                                         WHEN 'immunology_serology' THEN 'serology_immunology'
                                         ELSE coalesce(f.section_override, t.section) END
         LIMIT 1) sec ON true
     WHERE o.hospital_id = p_hospital AND o.id IN (SELECT r.order_id FROM rel r UNION SELECT s.order_id FROM spe s
                                                   UNION SELECT i.order_id FROM ide i UNION SELECT c.order_id FROM cri c)),
  -- Lab equipment (the 0113 kinds, lib/lab/equipment-store.ts EQUIPMENT_KINDS), and breakdowns in the period.
  dev AS (
    SELECT v.id, v.model, v.section_id FROM public.devices v
     WHERE v.hospital_id = p_hospital AND v.kind IN ('analyser','centrifuge','fridge','freezer','incubator',
           'water_bath','microscope','pipette','thermometer','timer','safety_cabinet','other'))
  SELECT 'released', r.ref, r.order_id, r.patient_user_id, r.restricted OR coalesce(o.restricted, false), NULL::uuid,
         o.section_id, o.ward_id, o.priority, r.test_code, r.at, r.received_at, NULL::timestamptz, NULL::timestamptz,
         r.flag, r.bedside, NULL, NULL
    FROM rel r LEFT JOIN ords o ON o.id = r.order_id
  UNION ALL
  SELECT 'specimen', s.ref, s.order_id, s.patient_user_id, coalesce(o.restricted, false), NULL, o.section_id,
         o.ward_id, o.priority, o.test_code, s.at, NULL, NULL, NULL, s.flag, false, s.reason, NULL
    FROM spe s LEFT JOIN ords o ON o.id = s.order_id
  UNION ALL
  SELECT 'identity', i.ref, i.order_id, i.patient_user_id, coalesce(o.restricted, false), NULL, o.section_id,
         o.ward_id, o.priority, o.test_code, i.at, NULL, NULL, NULL, i.flag, false, i.reason, NULL
    FROM ide i LEFT JOIN ords o ON o.id = i.order_id
  UNION ALL
  SELECT 'critical', c.ref, c.order_id, c.patient_user_id, c.restricted OR coalesce(o.restricted, false), NULL,
         o.section_id, o.ward_id, o.priority, o.test_code, c.at, NULL, c.due_at, c.done_at,
         c.due_at IS NOT NULL AND c.done_at IS NOT NULL AND c.done_at <= c.due_at, false, NULL, NULL
    FROM cri c LEFT JOIN ords o ON o.id = c.order_id
  UNION ALL
  SELECT 'qc_run', q.id, NULL, NULL, false, q.device_id, v.section_id, NULL, NULL, NULL, q.run_at, NULL, NULL, NULL,
         q.decision = 'rejected', false, q.decision, q.concept_id
    FROM public.lab_qc_runs q LEFT JOIN public.devices v ON v.id = q.device_id
   WHERE q.hospital_id = p_hospital AND q.run_at >= p_from AND q.run_at < p_to
  UNION ALL
  SELECT 'device', v.id, NULL, NULL, false, v.id, v.section_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false,
         false, NULL, v.model
    FROM dev v
  UNION ALL
  SELECT 'breakdown', b.id, NULL, NULL, false, b.device_id, v.section_id, NULL, NULL, NULL, b.since, NULL, NULL,
         b.back_at, false, false, b.cause, v.model
    FROM public.lab_breakdowns b JOIN dev v ON v.id = b.device_id
   WHERE b.hospital_id = p_hospital AND b.since < p_to AND (b.back_at IS NULL OR b.back_at > p_from)
$$;
REVOKE ALL ON FUNCTION private.lab_indicator_source(uuid, timestamptz, timestamptz) FROM PUBLIC;
