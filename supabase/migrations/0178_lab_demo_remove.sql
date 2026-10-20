-- 0178 — Remove the lab demo (owner request, 20 Oct 2026; CSO Fadhul chose a hard delete). Supersedes 0157's
-- "demo data is not deleted". `lab_demo_remove(hospital, actor, dry_run)` deletes, in one transaction and only in a
-- hospital marked in `lab_demo_hospitals`, the rows provably made by the demo loader:
--
--  - demo patients (`lab_demo_patients`) and every record about them: intakes, encounters, orders, specimens, results,
--    reviews, critical alerts, delta flags, infection prevention alerts, referrals, consents, their accounts;
--  - demo staff: accounts with a `lab-demo-…@demo.medsync.invalid` address that are linked to this hospital, with their
--    affiliations, designations, operator grants and competencies;
--  - hospital rows carrying the demo's marks: devices "Demo …" / "DEMO-…" and their logs, QC, breakdowns and
--    nonconformities; stock items "Demo …" with lots, deliveries "DEMO-DN-…" and transactions; the EQA scheme, the
--    partner lab, downtime periods "Demo: …"; settings, ranges and critical response times drafted by demo staff.
--
-- Kept: the audit log (one row records the removal), the units filled from the catalogue research (research values,
-- entered by the lab lead), critical-call contacts (they name real staff), reserved blank downtime form numbers (a
-- number is never reused), and the loads, marked `removed_at`.
-- The append-only triggers of the touched tables are disabled for this transaction only; foreign keys stay on, so a
-- real record pointing at a demo row stops the whole removal. ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate -- 0178`).
-- Reverse: DROP FUNCTION public.lab_demo_remove(uuid, uuid, boolean);
--          ALTER TABLE public.lab_demo_loads DROP COLUMN removed_at;

ALTER TABLE public.lab_demo_loads ADD COLUMN IF NOT EXISTS removed_at timestamptz;

CREATE OR REPLACE FUNCTION public.lab_demo_remove(p_hospital uuid, p_actor uuid, p_dry_run boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pts uuid[];
  staff uuid[];
  people uuid[];
  devs uuid[];
  items uuid[];
  lots uuid[];
  cfgs uuid[];
  ranges uuid[];
  crvs uuid[];
  partners uuid[];
  schemes uuid[];
  periods uuid[];
  reports uuid[];
  alerts uuid[];
  ipcs uuid[];
  refs uuid[];
  ncs uuid[];
  summary jsonb;
  total bigint := 0;
  n bigint;
  r record;
  off text[] := '{}';
  t text;
  -- Every table a removal deletes from, or that a cascade from an account reaches.
  tabs text[] := ARRAY['critical_alert_events','critical_marks','critical_alerts','ipc_alert_actions',
    'patient_ipc_flag_events','ipc_alerts','delta_flags','lab_result_snapshots','result_acknowledgements',
    'clinical_observations','downtime_form_numbers','diagnostic_reports','lab_referral_events','lab_manifest_items',
    'lab_referrals','specimen_events','specimens','encounter_order_events','encounter_orders','encounters',
    'patient_intakes','consent_records','patient_profiles','staff_affiliations','department_heads',
    'hospital_designations','poct_operators','lab_competencies','user_roles','lab_eqa_rounds','lab_eqa_schemes',
    'lab_nc_events','lab_nonconformities','lab_qc_status','lab_qc_runs','lab_control_checks','lab_lots_in_use',
    'lab_breakdowns','lab_equipment_logs','lab_stock_transactions','lab_stock_lot_events','lab_stock_lots',
    'lab_deliveries','lab_stock_items','devices','lab_manifests','lab_partners','lab_signed_configs',
    'reference_range_bands','reference_range_versions','critical_response_versions','downtime_periods',
    'diagnostic_offerings','lab_demo_patients','clinical_phi_access_log','encounter_events',
    'patient_visit_summaries','clinical_documentation','admissions','bed_assignments','users'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lab_demo_hospitals WHERE hospital_id = p_hospital) THEN
    RAISE EXCEPTION 'This hospital is not a demo hospital.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT patient_user_id), '{}') INTO pts
    FROM lab_demo_patients WHERE hospital_id = p_hospital;
  SELECT coalesce(array_agg(u.id), '{}') INTO staff FROM users u
   WHERE u.email LIKE 'lab-demo-%@demo.medsync.invalid' AND NOT u.id = ANY(pts)
     AND (EXISTS (SELECT 1 FROM staff_affiliations a WHERE a.user_id = u.id AND a.hospital_id = p_hospital)
       OR EXISTS (SELECT 1 FROM hospital_designations d WHERE d.user_id = u.id AND d.hospital_id = p_hospital)
       OR EXISTS (SELECT 1 FROM lab_signed_configs c WHERE c.hospital_id = p_hospital
                   AND u.id IN (c.authored_by, c.lead_signed_by, c.cso_signed_by))
       OR EXISTS (SELECT 1 FROM reference_range_versions v WHERE v.hospital_id = p_hospital
                   AND u.id IN (v.authored_by, v.lead_signed_by, v.cso_signed_by))
       OR EXISTS (SELECT 1 FROM critical_response_versions v WHERE v.hospital_id = p_hospital
                   AND u.id IN (v.authored_by, v.lead_signed_by, v.cso_signed_by)));
  people := pts || staff;
  SELECT coalesce(array_agg(id), '{}') INTO devs FROM devices
   WHERE hospital_id = p_hospital AND model LIKE 'Demo %' AND serial LIKE 'DEMO-%';
  SELECT coalesce(array_agg(id), '{}') INTO items FROM lab_stock_items
   WHERE hospital_id = p_hospital AND name LIKE 'Demo %';
  SELECT coalesce(array_agg(id), '{}') INTO lots FROM lab_stock_lots
   WHERE hospital_id = p_hospital AND item_id = ANY(items);
  SELECT coalesce(array_agg(id), '{}') INTO cfgs FROM lab_signed_configs
   WHERE hospital_id = p_hospital AND authored_by = ANY(staff);
  SELECT coalesce(array_agg(id), '{}') INTO ranges FROM reference_range_versions
   WHERE hospital_id = p_hospital AND authored_by = ANY(staff);
  SELECT coalesce(array_agg(id), '{}') INTO crvs FROM critical_response_versions
   WHERE hospital_id = p_hospital AND authored_by = ANY(staff);
  SELECT coalesce(array_agg(id), '{}') INTO partners FROM lab_partners
   WHERE hospital_id = p_hospital AND name LIKE 'Demo %';
  SELECT coalesce(array_agg(id), '{}') INTO schemes FROM lab_eqa_schemes
   WHERE hospital_id = p_hospital AND name LIKE 'Demo %';
  SELECT coalesce(array_agg(id), '{}') INTO periods FROM downtime_periods
   WHERE hospital_id = p_hospital AND note LIKE 'Demo:%';

  summary := jsonb_build_object('patients', cardinality(pts), 'staff', cardinality(staff),
    'settings', cardinality(cfgs) + cardinality(ranges) + cardinality(crvs), 'equipment', cardinality(devs),
    'stock items', cardinality(items), 'partners', cardinality(partners), 'eqa schemes', cardinality(schemes),
    'downtime periods', cardinality(periods));
  IF p_dry_run OR NOT EXISTS (SELECT 1 FROM jsonb_each(summary) WHERE value::int > 0) THEN RETURN summary; END IF;

  -- ponytail: ALTER TABLE takes an exclusive lock on each table for the transaction (a second or two, every
  -- hospital waits); a per-row GUC bypass in each guard function would avoid it, at the cost of rewriting them all.
  SET LOCAL lock_timeout = '5s';
  FOR r IN SELECT c.relname, tg.tgname FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
            JOIN pg_namespace ns ON ns.oid = c.relnamespace
           WHERE ns.nspname = 'public' AND c.relname = ANY(tabs) AND NOT tg.tgisinternal AND tg.tgenabled = 'O'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', r.relname, r.tgname);
    off := off || (r.relname || '.' || r.tgname);
  END LOOP;

  SELECT coalesce(array_agg(id), '{}') INTO reports FROM diagnostic_reports
   WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  SELECT coalesce(array_agg(id), '{}') INTO alerts FROM critical_alerts
   WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  SELECT coalesce(array_agg(id), '{}') INTO ipcs FROM ipc_alerts
   WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  SELECT coalesce(array_agg(id), '{}') INTO refs FROM lab_referrals
   WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  SELECT coalesce(array_agg(id), '{}') INTO ncs FROM lab_nonconformities
   WHERE hospital_id = p_hospital AND (subject_device_id = ANY(devs)
      OR id IN (SELECT nc_id FROM lab_eqa_rounds WHERE scheme_id = ANY(schemes)));

  -- The patients' records, children first.
  DELETE FROM critical_alert_events WHERE alert_id = ANY(alerts); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM critical_marks WHERE alert_id = ANY(alerts) OR report_id = ANY(reports);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM critical_alerts WHERE id = ANY(alerts); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM ipc_alert_actions WHERE alert_id = ANY(ipcs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM patient_ipc_flag_events WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM ipc_alerts WHERE id = ANY(ipcs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM delta_flags WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_result_snapshots WHERE report_id = ANY(reports); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM result_acknowledgements WHERE report_id = ANY(reports);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM clinical_observations WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM downtime_form_numbers WHERE hospital_id = p_hospital
     AND (report_id = ANY(reports) OR downtime_period_id = ANY(periods));
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM diagnostic_reports WHERE id = ANY(reports); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_referral_events WHERE referral_id = ANY(refs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_manifest_items WHERE referral_id = ANY(refs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_referrals WHERE id = ANY(refs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM specimen_events WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM specimens WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM encounter_order_events WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM encounter_orders WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM patient_intakes WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM encounters WHERE hospital_id = p_hospital AND patient_user_id = ANY(pts);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM consent_records WHERE user_id = ANY(pts); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM patient_profiles WHERE id = ANY(pts); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_demo_patients WHERE hospital_id = p_hospital; GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- Demo staff.
  DELETE FROM staff_affiliations WHERE user_id = ANY(staff); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM department_heads WHERE user_id = ANY(staff); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM hospital_designations WHERE user_id = ANY(staff); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM poct_operators WHERE user_id = ANY(staff); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_competencies WHERE user_id = ANY(staff); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- The demo's hospital rows.
  DELETE FROM lab_eqa_rounds WHERE scheme_id = ANY(schemes); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_eqa_schemes WHERE id = ANY(schemes); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_nc_events WHERE nc_id = ANY(ncs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_nonconformities WHERE id = ANY(ncs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_qc_status WHERE device_id = ANY(devs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_qc_runs WHERE device_id = ANY(devs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_control_checks WHERE device_id = ANY(devs) OR item_id = ANY(items) OR lot_id = ANY(lots);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_lots_in_use WHERE device_id = ANY(devs) OR lot_id = ANY(lots);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_breakdowns WHERE device_id = ANY(devs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_equipment_logs WHERE device_id = ANY(devs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_stock_transactions WHERE item_id = ANY(items); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_stock_lot_events WHERE lot_id = ANY(lots); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_stock_lots WHERE id = ANY(lots); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_deliveries WHERE hospital_id = p_hospital AND note_number LIKE 'DEMO-DN-%';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_stock_items WHERE id = ANY(items); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM devices WHERE id = ANY(devs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_manifests WHERE partner_id = ANY(partners); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_partners WHERE id = ANY(partners); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM lab_signed_configs WHERE id = ANY(cfgs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM reference_range_bands WHERE version_id = ANY(ranges); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM reference_range_versions WHERE id = ANY(ranges); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM critical_response_versions WHERE id = ANY(crvs); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM downtime_periods WHERE id = ANY(periods); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM diagnostic_offerings WHERE hospital_id = p_hospital AND referred_to = 'Demo reference lab';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- The accounts last; anything else still pointing at one stops the removal.
  DELETE FROM user_roles WHERE user_id = ANY(people); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM users WHERE id = ANY(people); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM auth.users WHERE id = ANY(people); GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  FOREACH t IN ARRAY off LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', split_part(t, '.', 1), split_part(t, '.', 2));
  END LOOP;

  UPDATE lab_demo_loads SET removed_at = now() WHERE hospital_id = p_hospital AND removed_at IS NULL;
  summary := summary || jsonb_build_object('rows', total);
  INSERT INTO audit_log (actor_id, action, schema_name, table_name, record_id, after_data)
  VALUES (p_actor, 'delete', 'public', 'lab_demo_loads', p_hospital::text, summary);
  RETURN summary;
END $$;

REVOKE ALL ON FUNCTION public.lab_demo_remove(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lab_demo_remove(uuid, uuid, boolean) TO service_role;
