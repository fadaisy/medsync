-- 0260 — Remove the pharmacy demo (owner request, 28 Oct 2026). Supersedes 0250's "the demo is not deleted"; the same
-- hard delete the CSO chose for the lab demo (0178). `pharmacy_demo_remove(hospital, actor, dry_run)` deletes, in one
-- transaction and only in a hospital marked in `lab_demo_hospitals`, the rows provably made by the demo loader:
--
--  - demo people: the patients listed in `pharmacy_demo_patients` and the accounts with a
--    `pharmacy-demo-…@demo.medsync.invalid` address linked to this hospital (an affiliation, a signed pack, an attestation, a go-live or month-end approval);
--  - every row of the tables the demo writes that names one of those people (patient, actor, signer, author, …), and
--    every row that hangs off such a row and names nobody else (lines, batches, stockouts, snapshots, …);
--  - then the places the demo made (departments with its `demo-…` slug, wards `demo-ward-…`, carts "Demo …", their
--    dispensing points and pharmacy places), each only when nothing real still uses it; otherwise it is kept.
--
-- Kept: the audit log (one row records the removal) and the sign-in records of demo accounts it names as actors
-- (banned, an `.invalid` address; deleting them would rewrite the trail), the loads (marked `removed_at`), the
-- pharmacy settings and the cosign policy the demo set (they carry no demo mark); a real pack the demo retired stays
-- retired.
-- The triggers of the touched tables are disabled for this transaction only; foreign keys stay on, so a real record
-- pointing at a demo row stops the whole removal. ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate`).
-- Reverse: DROP FUNCTION public.pharmacy_demo_remove(uuid, uuid, boolean);
--          ALTER TABLE public.pharmacy_demo_loads DROP COLUMN removed_at;

ALTER TABLE public.pharmacy_demo_loads ADD COLUMN IF NOT EXISTS removed_at timestamptz;

CREATE OR REPLACE FUNCTION public.pharmacy_demo_remove(p_hospital uuid, p_actor uuid, p_dry_run boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pts uuid[];
  staff uuid[];
  people uuid[];
  depts uuid[];
  wards uuid[];
  carts uuid[];
  -- Every table the demo writes, children roughly before parents (the delete loop sorts out the rest).
  tabs text[] := ARRAY['pharmacy_refill_events','pharmacy_refill_request_lines','pharmacy_refill_requests',
    'pharmacy_repeat_instance_events','pharmacy_repeat_instances','prescription_renewal_requests',
    'prescription_repeat_authorisations','pharmacy_reconciliation_events','pharmacy_reconciliation_decisions',
    'pharmacy_reconciliations','pharmacy_reaction_events','pharmacy_reaction_medicines','pharmacy_reaction_reports',
    'pharmacy_ams_reviews','pharmacy_content_signatures','pharmacy_content_entries','pharmacy_period_difference_reasons',
    'pharmacy_period_snapshots','pharmacy_periods','pharmacy_order_comparisons','pharmacy_recall_ward_notices',
    'pharmacy_recall_events','pharmacy_recalls','pharmacy_write_offs','pharmacy_cart_checks','pharmacy_location_packs',
    'pharmacy_issue_confirmations','pharmacy_issues','pharmacy_requisition_lines','pharmacy_requisitions',
    'pharmacy_delivery_lines','pharmacy_deliveries','pharmacy_order_lines','pharmacy_orders',
    'pharmacy_controlled_entries','pharmacy_controlled_differences','pharmacy_look_backs','pharmacy_supply_corrections',
    'pharmacy_supply_reversals','pharmacy_supplies','pharmacy_handovers','pharmacy_identity_attempts',
    'pharmacy_line_events','pharmacy_query_events','pharmacy_queries','prescription_cancellations','pharmacy_slips',
    'pharmacy_print_events','paper_prescription_lines','paper_prescriptions','patient_collectors','pharmacy_stockouts',
    'pharmacy_stock_requests','pharmacy_stock_movements','pharmacy_count_lines','pharmacy_counts',
    'pharmacy_reorder_levels','pharmacy_batches','pharmacy_product_locations','pharmacy_product_points',
    'pharmacy_products','pharmacy_counterparties','pharmacy_pilot_notes','pharmacy_golive','pharmacy_location_golive',
    'pharmacy_briefings','downtime_form_numbers','downtime_drills','downtime_periods','pharmacy_signed_sets',
    'pharmacy_attestations','pharmacy_locations','resus_timeline_events','resus_episodes',
    'medication_administration_records','clinical_cosign_requests','encounter_order_events','encounter_orders',
    'allergies','medication_statements','prescriptions','admissions','encounters','pharmacy_demo_patients',
    'ward_in_charge_assignments','department_heads','user_roles','staff_affiliations','patient_profiles','users'];
  places text[] := ARRAY['pharmacy_locations','pharmacy_dispensing_points','crash_carts','hospital_wards',
    'hospital_departments'];
  people_tabs regclass[] := ARRAY['auth.users'::regclass, 'public.users'::regclass, 'public.patient_profiles'::regclass];
  t text;
  keys text;
  ucols text[];
  seed text;
  clean text;
  e record;
  r record;
  n bigint;
  total bigint := 0;
  grew boolean;
  pending text[];
  progress boolean;
  used boolean;
  kept int := 0;
  off text[] := '{}';
  summary jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lab_demo_hospitals WHERE hospital_id = p_hospital) THEN
    RAISE EXCEPTION 'This hospital is not a demo hospital.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT patient_user_id), '{}') INTO pts
    FROM pharmacy_demo_patients WHERE hospital_id = p_hospital;
  SELECT coalesce(array_agg(u.id), '{}') INTO staff FROM users u
   WHERE u.email LIKE 'pharmacy-demo-%@demo.medsync.invalid' AND NOT u.id = ANY(pts)
     AND (EXISTS (SELECT 1 FROM staff_affiliations a WHERE a.user_id = u.id AND a.hospital_id = p_hospital)
       OR EXISTS (SELECT 1 FROM pharmacy_signed_sets s WHERE s.hospital_id = p_hospital
                   AND u.id IN (s.authored_by, s.first_signer, s.second_signer))
       OR EXISTS (SELECT 1 FROM pharmacy_attestations a WHERE a.hospital_id = p_hospital
                   AND u.id IN (a.actor_user_id, a.attester_user_id))
       OR EXISTS (SELECT 1 FROM pharmacy_golive g WHERE g.hospital_id = p_hospital
                   AND u.id IN (g.requested_by, g.approved_by))
       OR EXISTS (SELECT 1 FROM pharmacy_location_golive g WHERE g.hospital_id = p_hospital
                   AND u.id IN (g.requested_by, g.approved_by))
       OR EXISTS (SELECT 1 FROM pharmacy_periods p WHERE p.hospital_id = p_hospital
                   AND u.id IN (p.closed_by, p.approved_by)));
  people := pts || staff;
  -- The demo's slug is 'demo-' + the name with non-word runs as '-' + up to six random characters (setup.ts).
  SELECT coalesce(array_agg(id), '{}') INTO depts FROM hospital_departments
   WHERE hospital_id = p_hospital
     AND slug ~ ('^demo-' || regexp_replace(lower(name), '\W+', '-', 'g') || '-[a-z0-9]{1,6}$');
  SELECT coalesce(array_agg(id), '{}') INTO wards FROM hospital_wards
   WHERE hospital_id = p_hospital AND slug ~ '^demo-ward-[0-9a-f]{8}$';
  SELECT coalesce(array_agg(id), '{}') INTO carts FROM crash_carts
   WHERE hospital_id = p_hospital AND label LIKE 'Demo %';

  -- Mark: rows naming a demo person, then rows hanging off marked rows that name nobody real, until nothing grows.
  CREATE TEMP TABLE IF NOT EXISTS pharmacy_demo_marks (tbl text, k text) ON COMMIT DROP;
  TRUNCATE pharmacy_demo_marks;
  CREATE TEMP TABLE IF NOT EXISTS pharmacy_demo_meta (tbl text PRIMARY KEY, pk text, seed text, clean text)
    ON COMMIT DROP;
  TRUNCATE pharmacy_demo_meta;
  CREATE TEMP TABLE IF NOT EXISTS pharmacy_demo_edges (tbl text, q text) ON COMMIT DROP;
  TRUNCATE pharmacy_demo_edges;
  FOREACH t IN ARRAY tabs LOOP
    SELECT string_agg('x.' || quote_ident(a.attname), ',' ORDER BY array_position(i.indkey::int2[], a.attnum)) INTO keys
      FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = ('public.' || t)::regclass AND i.indisprimary;
    IF keys IS NULL THEN RAISE EXCEPTION 'pharmacy_demo_remove: % has no primary key.', t; END IF;
    SELECT coalesce(array_agg(a.attname::text), '{}') INTO ucols
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.conrelid = ('public.' || t)::regclass AND cardinality(c.conkey) = 1
       AND c.confrelid = ANY(people_tabs);
    SELECT coalesce(string_agg(format('x.%I = ANY($1)', u), ' OR '), 'false'),
           coalesce(string_agg(format('(x.%I IS NULL OR x.%I = ANY($1))', u, u), ' AND '), 'true')
      INTO seed, clean FROM unnest(ucols) u;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'hospital_id') THEN
      seed := format('x.hospital_id = %L AND (%s)', p_hospital, seed);
    END IF;
    INSERT INTO pharmacy_demo_meta VALUES (t, keys, seed, clean);
    EXECUTE format('INSERT INTO pharmacy_demo_marks SELECT %L, ROW(%s)::text FROM public.%I x WHERE %s', t, keys, t, seed)
      USING people;
  END LOOP;
  -- A row hangs off demo data when one of its keys into these tables is set and every one that is set points at a
  -- marked row or at a place on the demo's departments, wards or carts (a line of a real count of a demo batch is not
  -- demo data). Those places are tagged 'place': they go with the departments below, not here.
  INSERT INTO pharmacy_demo_marks SELECT 'place', ROW(x.id)::text FROM pharmacy_locations x
   WHERE x.hospital_id = p_hospital
     AND (x.department_id = ANY(depts) OR x.ward_id = ANY(wards) OR x.crash_cart_id = ANY(carts));
  FOR e IN
    SELECT m.tbl, m.pk, m.clean,
           string_agg(format('(x.%I IS NULL OR x.%I IN (SELECT y.%I FROM public.%I y WHERE ROW(%s)::text IN
               (SELECT k FROM pharmacy_demo_marks WHERE tbl IN (%L, ''place''))))',
             a.attname, a.attname, pa.attname, pm.tbl, replace(pm.pk, 'x.', 'y.'), pm.tbl), ' AND ') AS parents,
           string_agg(format('x.%I IS NOT NULL', a.attname), ' OR ') AS anyp
      FROM pharmacy_demo_meta m
      JOIN pg_constraint c ON c.contype = 'f' AND c.conrelid = ('public.' || m.tbl)::regclass
           AND cardinality(c.conkey) = 1 AND NOT c.confrelid = ANY(people_tabs)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
      JOIN pharmacy_demo_meta pm ON ('public.' || pm.tbl)::regclass = c.confrelid
     GROUP BY m.tbl, m.pk, m.clean
  LOOP
    INSERT INTO pharmacy_demo_edges VALUES (e.tbl, format('INSERT INTO pharmacy_demo_marks SELECT %L, ROW(%s)::text
        FROM public.%I x WHERE (%s) AND %s AND %s
         AND ROW(%s)::text NOT IN (SELECT k FROM pharmacy_demo_marks WHERE tbl = %L)',
      e.tbl, e.pk, e.tbl, e.anyp, e.parents, e.clean, e.pk, e.tbl));
  END LOOP;
  LOOP
    grew := false;
    FOR e IN SELECT q FROM pharmacy_demo_edges LOOP
      EXECUTE e.q USING people;
      GET DIAGNOSTICS n = ROW_COUNT;
      grew := grew OR n > 0;
    END LOOP;
    EXIT WHEN NOT grew;
  END LOOP;

  SELECT jsonb_build_object('patients', cardinality(pts), 'staff', cardinality(staff),
      'prescriptions', count(*) FILTER (WHERE tbl = 'prescriptions'),
      'handovers', count(*) FILTER (WHERE tbl = 'pharmacy_handovers'),
      'products', count(*) FILTER (WHERE tbl = 'pharmacy_products'),
      'batches', count(*) FILTER (WHERE tbl = 'pharmacy_batches'),
      'records', count(*) FILTER (WHERE tbl <> 'place'),
      'places', cardinality(depts) + cardinality(wards) + cardinality(carts))
    INTO summary FROM pharmacy_demo_marks;
  IF p_dry_run OR (summary ->> 'records')::int + (summary ->> 'places')::int = 0 THEN RETURN summary; END IF;

  -- ponytail: ALTER TABLE takes a lock on each table for the transaction (a second or two, writes elsewhere wait);
  -- a per-row GUC bypass in each guard function would avoid it, at the cost of rewriting them all (as 0178).
  SET LOCAL lock_timeout = '5s';
  FOR r IN SELECT c.relname, tg.tgname FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
            JOIN pg_namespace ns ON ns.oid = c.relnamespace
           WHERE ns.nspname = 'public' AND c.relname = ANY(tabs || places) AND NOT tg.tgisinternal
             AND tg.tgenabled = 'O'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', r.relname, r.tgname);
    off := off || (r.relname || '.' || r.tgname);
  END LOOP;

  -- Delete: a table a real or not-yet-deleted row still points at waits for the next pass; when a pass deletes
  -- nothing, the first waiting table's foreign key error stops it all.
  pending := tabs;
  LOOP
    progress := false;
    FOREACH t IN ARRAY pending LOOP
      SELECT m.pk INTO keys FROM pharmacy_demo_meta m WHERE m.tbl = t;
      BEGIN
        EXECUTE format('DELETE FROM public.%I x WHERE ROW(%s)::text IN (SELECT k FROM pharmacy_demo_marks WHERE tbl = %L)',
          t, keys, t);
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
        pending := array_remove(pending, t);
        progress := true;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
      END;
    END LOOP;
    EXIT WHEN cardinality(pending) = 0;
    IF NOT progress THEN
      SELECT m.pk INTO keys FROM pharmacy_demo_meta m WHERE m.tbl = pending[1];
      BEGIN
        EXECUTE format('DELETE FROM public.%I x WHERE ROW(%s)::text IN (SELECT k FROM pharmacy_demo_marks WHERE tbl = %L)',
          pending[1], keys, pending[1]);
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        RAISE EXCEPTION 'A record that is not demo data still points at demo data (%)', SQLERRM
          USING ERRCODE = '23503', DETAIL = 'Waiting: ' || array_to_string(pending, ', ');
      END;
    END IF;
  END LOOP;
  -- An account the audit trail names as an actor stays (deleting it would rewrite the trail); it can never sign in.
  DELETE FROM auth.users u WHERE u.id = ANY(people)
     AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.actor_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM sa_audit_log a WHERE a.actor_id = u.id);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- The places the demo made, each only when nothing still points at it through a cascading or nulling key (a real
  -- head, a real ward's assignments) and no other key refuses; departments go leaves first.
  LOOP
    progress := false;
    FOR r IN
      SELECT 'pharmacy_locations' AS tbl, 'id' AS col, id FROM pharmacy_locations
       WHERE hospital_id = p_hospital AND (department_id = ANY(depts) OR ward_id = ANY(wards) OR crash_cart_id = ANY(carts))
      UNION ALL SELECT 'pharmacy_dispensing_points', 'department_id', department_id FROM pharmacy_dispensing_points
       WHERE department_id = ANY(depts)
      UNION ALL SELECT 'crash_carts', 'id', id FROM crash_carts WHERE id = ANY(carts)
      UNION ALL SELECT 'hospital_wards', 'id', id FROM hospital_wards WHERE id = ANY(wards)
      UNION ALL SELECT 'hospital_departments', 'id', id FROM hospital_departments WHERE id = ANY(depts)
    LOOP
      used := false;
      FOR e IN SELECT c.conrelid::regclass AS child, a.attname AS col FROM pg_constraint c
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                WHERE c.contype = 'f' AND c.confrelid = ('public.' || r.tbl)::regclass AND cardinality(c.conkey) = 1
                  AND c.confdeltype IN ('c', 'n', 'd')
      LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', e.child, e.col) INTO used USING r.id;
        EXIT WHEN used;
      END LOOP;
      CONTINUE WHEN used;
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tbl, r.col) USING r.id;
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
        progress := progress OR n > 0;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
      END;
    END LOOP;
    EXIT WHEN NOT progress;
  END LOOP;
  SELECT count(*) INTO kept FROM (
    SELECT id FROM crash_carts WHERE id = ANY(carts) UNION ALL SELECT id FROM hospital_wards WHERE id = ANY(wards)
    UNION ALL SELECT id FROM hospital_departments WHERE id = ANY(depts)) k;

  FOREACH t IN ARRAY off LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', split_part(t, '.', 1), split_part(t, '.', 2));
  END LOOP;

  UPDATE pharmacy_demo_loads SET removed_at = now() WHERE hospital_id = p_hospital AND removed_at IS NULL;
  summary := summary || jsonb_build_object('rows', total, 'places kept', kept);
  INSERT INTO audit_log (actor_id, action, schema_name, table_name, record_id, after_data)
  VALUES (p_actor, 'delete', 'public', 'pharmacy_demo_loads', p_hospital::text, summary);
  RETURN summary;
END $$;

REVOKE ALL ON FUNCTION public.pharmacy_demo_remove(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_demo_remove(uuid, uuid, boolean) TO service_role;
