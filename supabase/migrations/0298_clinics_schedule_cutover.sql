-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0298: clinics and schedule cut-over (docs/clinics-schedule/REPORT.md). The last settings the old clinic pages
-- edited move into the workspace, so `cs_publish` may now write them: on service_lines time to care, continuity,
-- reason codes, the hospital's default line and the deposit; on session_templates interleave, overbooking and
-- runs on holidays. The function is 0296's, unchanged except for these allow-list entries. No new table or column.

CREATE OR REPLACE FUNCTION public.cs_publish(
  p_hospital uuid, p_actor uuid, p_change_ids uuid[], p_ops jsonb, p_texts integer)
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  allow constant jsonb := '{
    "service_lines": ["name","slug","department_id","active","catalogue_code","audience","place_id","fee_ugx",
      "payment_posture","capacity_mode","archived_at","short_name","colour","room_place_ids","block_place_id","tier",
      "ages","patient_words","referral_required","fee_mode","fee_private_ugx","fee_overrides","booking_rules",
      "pay_options","team_user_ids","paused_at","paused_by",
      "time_to_care_days","continuity_default","reason_codes","is_default","deposit_ugx"],
    "session_templates": ["service_line_id","department_id","clinician_user_id","place_id","venue","weekday",
      "start_minutes_local","duration_minutes","capacity_total","capacity_booked","valid_from","valid_until","active",
      "repeat_every_weeks","nth_weekday","kind","slot_minutes","visit_minutes","walk_in_hold_pct",
      "break_start_minutes","break_end_minutes","place_ids","clinician_user_ids","places_set",
      "interleave_booked","interleave_walk_in","overbooking_factor","runs_on_holidays"],
    "hospital_places": ["name","building","kind","parent_id","tier","archived_at"],
    "staff_affiliations": ["fee_band","office_place_id","card_name","card_photo","card_consent_on","card_consent_by"],
    "desk_devices": ["label","kind","place","mine_service_line_ids","lock_minutes","created_by"],
    "service_closures": ["scope","department_id","service_line_id","starts_on","ends_on","reason","created_by",
      "lifted_at","lifted_by","part_start_minutes","part_end_minutes","booking_policy"],
    "availability_blocks": ["clinician_user_id","department_id","kind","starts_at","ends_at","recurrence","state",
      "notes","label","created_by_user_id","cover_user_id","booking_policy","decided_by","decided_at"],
    "hospital_holiday_decisions": ["holiday_id","decision","decided_by"],
    "hospital_fee_bands": ["band","general_ugx","private_ugx","version","proposed_by","approved_by","approved_at"]
  }';
  o jsonb; t text; v jsonb; cols text; n integer; vid uuid; k text; hit integer;
BEGIN
  IF (SELECT count(*) FROM public.schedule_changes
       WHERE id = ANY (p_change_ids) AND hospital_id = p_hospital AND status IN ('draft', 'scheduled'))
     <> coalesce(array_length(p_change_ids, 1), 0) THEN
    RAISE EXCEPTION 'cs_stale_changes' USING ERRCODE = 'P0001';
  END IF;
  FOR o IN SELECT * FROM jsonb_array_elements(p_ops) LOOP
    t := o->>'t';
    IF NOT allow ? t THEN RAISE EXCEPTION 'cs_table %', t USING ERRCODE = '42501'; END IF;
    v := coalesce(o->'v', '{}'::jsonb);
    FOR k IN SELECT jsonb_object_keys(v) LOOP
      IF NOT (allow->t) ? k THEN RAISE EXCEPTION 'cs_column %.%', t, k USING ERRCODE = '42501'; END IF;
    END LOOP;
    SELECT string_agg(format('%I', key), ',') INTO cols FROM jsonb_object_keys(v) AS key;
    IF o->>'op' = 'insert' THEN
      v := v || jsonb_build_object('id', o->>'id', 'hospital_id', p_hospital);
      SELECT string_agg(format('%I', key), ',') INTO cols FROM jsonb_object_keys(v) AS key;
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
                     t, cols, cols, t) USING v;
    ELSIF o->>'op' = 'update' AND cols IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) '
                     'WHERE id = $2 AND hospital_id = $3', t, cols, cols, t)
        USING v, (o->>'id')::uuid, p_hospital;
      GET DIAGNOSTICS hit = ROW_COUNT;
      IF hit <> 1 THEN RAISE EXCEPTION 'cs_missing %', o->>'id' USING ERRCODE = 'P0002'; END IF;
    ELSIF o->>'op' = 'delete' AND t = 'hospital_holiday_decisions' THEN
      EXECUTE format('DELETE FROM public.%I WHERE id = $1 AND hospital_id = $2', t) USING (o->>'id')::uuid, p_hospital;
    ELSE
      RAISE EXCEPTION 'cs_op %', o->>'op' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  SELECT coalesce(max(number), 0) + 1 INTO n FROM public.schedule_versions WHERE hospital_id = p_hospital;
  INSERT INTO public.schedule_versions (hospital_id, number, published_by, change_ids, texts_sent)
  VALUES (p_hospital, n, p_actor, p_change_ids, coalesce(p_texts, 0)) RETURNING id INTO vid;
  UPDATE public.schedule_changes SET status = 'published', version_id = vid WHERE id = ANY (p_change_ids);
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.cs_publish(uuid, uuid, uuid[], jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_publish(uuid, uuid, uuid[], jsonb, integer) TO service_role;
