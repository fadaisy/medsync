-- 0118 — Lab reports and quality indicators: the indicator source rows and their aggregates (Lab Phase 3 Step 10,
-- §6.12 QI-1..QI-4, §5.13; GATE A §12 "Indicator drill-down (definer functions)", D-LAB3-26, E-LAB3-06).
--
-- One definition of what each indicator counts, in SQL, read two ways:
--   private.lab_indicator_rows(from, to)                    the source rows WITH record and patient ids, for lab
--                                                           readers only (drill-down, Law 7);
--   private.lab_indicator_counts(from, to, now, targets)    numbers only (no id, no patient, no time of any one
--                                                           event), for the lab, the In-Charge, the HMIS focal
--                                                           person and the hospital admin (Law 10).
-- The arithmetic the lab page does on the rows (lib/lab/indicators.ts) and the counts below are the same rules;
-- tests/emr-db/lab-reports.test.ts holds them equal. Computed at read time, no month cache (QI-3, P13).
-- `targets` is the lab's stated turnaround per test in minutes, parsed by the caller from the hub (TA-*).
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0118`).

-- Internal: never granted. Every source row of the period for one hospital.
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
        SELECT f.section_id FROM public.lab_test_services ls
          JOIN public.diagnostic_offerings f ON f.hospital_id = ls.hospital_id AND f.kind = 'lab'
                                            AND f.code = ls.offering_code
         WHERE ls.hospital_id = p_hospital AND ls.test_code = t.code LIMIT 1) sec ON true
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

-- QI-4: the records behind every number, for lab readers of the reader's hospital only.
DROP FUNCTION IF EXISTS private.lab_indicator_rows(timestamptz, timestamptz);
CREATE FUNCTION private.lab_indicator_rows(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (kind text, ref uuid, order_id uuid, patient_user_id uuid, restricted boolean, device_id uuid,
               section_id uuid, ward_id uuid, priority text, test_code text, at timestamptz,
               received_at timestamptz, due_at timestamptz, done_at timestamptz, flag boolean, bedside boolean,
               reason text, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM private.lab_indicator_source(private.current_hospital_id(), p_from, p_to)
   WHERE (SELECT private.lab_reader())
$$;

-- QI-2..QI-4, Law 10: the same rules as numbers only. NULL for anyone but the lab, the In-Charge, the focal person
-- and the hospital admin of the reader's hospital. Minutes are whole and floored (TA-8); percentiles are nearest
-- rank (percentile_disc), as the engine's.
CREATE OR REPLACE FUNCTION private.lab_indicator_counts(p_from timestamptz, p_to timestamptz,
                                                        p_now timestamptz, p_targets jsonb)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH r AS (
    SELECT * FROM private.lab_indicator_source(private.current_hospital_id(), p_from, p_to)
     WHERE (SELECT private.lab_reader() OR private.hmis_designated() OR private.hospital_admin_reader())),
  rel AS (
    SELECT r.*, greatest(0, floor(extract(epoch FROM r.at - r.received_at) / 60)) AS minutes,
           (p_targets ->> r.test_code)::int AS target
      FROM r WHERE r.kind = 'released'),
  tat AS (
    SELECT rel.section_id, count(*) AS n,
           percentile_disc(0.5) WITHIN GROUP (ORDER BY rel.minutes) AS p50,
           percentile_disc(0.9) WITHIN GROUP (ORDER BY rel.minutes) AS p90,
           array_remove(array_agg(DISTINCT rel.target), NULL) AS targets,
           GROUPING(rel.section_id) = 1 AS total
      FROM rel WHERE rel.received_at IS NOT NULL GROUP BY ROLLUP (rel.section_id)),
  rej AS (
    SELECT r.reason, r.ward_id, count(*) AS n FROM r WHERE r.kind = 'specimen' AND r.flag GROUP BY 1, 2),
  cri AS (SELECT r.* FROM r WHERE r.kind = 'critical' AND r.due_at IS NOT NULL),
  down AS (
    SELECT d.ref AS device_id, d.label,
           coalesce(sum(greatest(0, extract(epoch FROM least(coalesce(b.done_at, p_now), p_to, p_now)
                                                    - greatest(b.at, p_from)))) / 3600, 0) AS hours
      FROM r d LEFT JOIN r b ON b.kind = 'breakdown' AND b.device_id = d.ref
     WHERE d.kind = 'device' GROUP BY d.ref, d.label)
  SELECT CASE WHEN private.lab_reader() OR private.hmis_designated() OR private.hospital_admin_reader()
  THEN jsonb_build_object(
    'released', (SELECT count(*) FROM rel),
    'bedside', (SELECT count(*) FROM rel WHERE rel.bedside),
    'corrected', (SELECT count(*) FROM rel WHERE rel.flag),
    'withTarget', (SELECT count(*) FROM rel WHERE rel.received_at IS NOT NULL AND rel.target IS NOT NULL),
    'late', (SELECT count(*) FROM rel WHERE rel.received_at IS NOT NULL AND rel.minutes > rel.target),
    'tat', coalesce((SELECT jsonb_agg(jsonb_build_object('sectionId', tat.section_id, 'n', tat.n, 'p50', tat.p50,
                                                        'p90', tat.p90, 'targets', to_jsonb(tat.targets),
                                                        'total', tat.total))
                       FROM tat), '[]'),
    'specimens', (SELECT count(*) FROM r WHERE r.kind = 'specimen'),
    'rejected', (SELECT count(*) FROM r WHERE r.kind = 'specimen' AND r.flag),
    'rejections', coalesce((SELECT jsonb_agg(jsonb_build_object('reason', rej.reason, 'wardId', rej.ward_id,
                                                               'n', rej.n)) FROM rej), '[]'),
    'checks', (SELECT count(*) FROM r WHERE r.kind = 'identity'),
    'mismatches', (SELECT count(*) FROM r WHERE r.kind = 'identity' AND r.flag),
    'alerts', (SELECT count(*) FROM cri),
    'inTime', (SELECT count(*) FROM cri WHERE cri.flag),
    'ackMedian', (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM cri.done_at - cri.at) / 60)
                    FROM cri WHERE cri.done_at IS NOT NULL),
    'runs', (SELECT count(*) FROM r WHERE r.kind = 'qc_run'),
    'runsRejected', (SELECT count(*) FROM r WHERE r.kind = 'qc_run' AND r.flag),
    'devices', (SELECT count(*) FROM down),
    'downtime', coalesce((SELECT jsonb_object_agg(down.device_id, down.hours) FROM down), '{}')
  ) END
$$;

REVOKE ALL ON FUNCTION private.lab_indicator_rows(timestamptz, timestamptz),
                      private.lab_indicator_counts(timestamptz, timestamptz, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lab_indicator_rows(timestamptz, timestamptz),
                          private.lab_indicator_counts(timestamptz, timestamptz, timestamptz, jsonb)
  TO medsync_clinical_reader;
