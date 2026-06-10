-- 0047 — Reasoning discriminators: tap-options for the few features the curated
-- catalogs were missing, so the live clinical-reasoning re-ranking matches EXACTLY
-- (not just by keyword). GATED. CSO-signed reference data (ADR 0065).
--
-- Adds a per-presenting-complaint "Discriminating features" multi-select seeded
-- with the gap discriminators from the reasoning maps, mapped to the symptom(s)
-- the clinician taps. Additive only — does NOT touch the curated 0043 SOCRATES
-- properties. Reuses symptom_property / _option / _map (no new tables).
-- Decision-support; nothing auto-marked.

INSERT INTO public.symptom_property (code, display, value_type, common, sort_order, version, source) VALUES
  ('disc_chest_pain', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_dyspnoea', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_headache', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_abdominal_pain', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_palpitations', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_syncope', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_dizziness', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_jaundice', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_gi_bleeding', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_joint_pain', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_focal_weakness', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)'),
  ('disc_fatigue', 'Discriminating features', 'multi_select', false, 200, '1', 'Reasoning maps (ADR 0065)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.symptom_property_option (property_code, value, display, sort_order) VALUES
  ('disc_chest_pain', 'maximal_at_onset', 'Maximal at onset', 10),
  ('disc_chest_pain', 'postprandial', 'Postprandial', 20),
  ('disc_chest_pain', 'acid_taste', 'Acid taste', 30),
  ('disc_dyspnoea', 'pleuritic', 'Pleuritic', 10),
  ('disc_dyspnoea', 'gradual', 'Gradual', 20),
  ('disc_dyspnoea', 'situational', 'Situational', 30),
  ('disc_headache', 'maximal_at_onset', 'Maximal at onset', 10),
  ('disc_headache', 'new_headache_age_over_50', 'New headache age over 50', 20),
  ('disc_abdominal_pain', 'tearing', 'Tearing', 10),
  ('disc_abdominal_pain', 'epigastric', 'Epigastric', 20),
  ('disc_abdominal_pain', 'migrated_from_umbilicus', 'Migrated from umbilicus', 30),
  ('disc_abdominal_pain', 'exertional', 'Exertional', 40),
  ('disc_palpitations', 'persistent', 'Persistent', 10),
  ('disc_palpitations', 'situational', 'Situational', 20),
  ('disc_syncope', 'exertional', 'Exertional', 10),
  ('disc_syncope', 'no_prodrome', 'No prodrome', 20),
  ('disc_dizziness', 'on_standing', 'On standing', 10),
  ('disc_jaundice', 'right_upper_quadrant_pain', 'Right upper quadrant pain', 10),
  ('disc_gi_bleeding', 'haematemesis', 'Haematemesis', 10),
  ('disc_joint_pain', 'single_hot_swollen_joint', 'Single hot swollen joint', 10),
  ('disc_joint_pain', 'with_fever', 'With fever', 20),
  ('disc_joint_pain', 'acute', 'Acute', 30),
  ('disc_joint_pain', 'worse_with_use', 'Worse with use', 40),
  ('disc_joint_pain', 'migratory', 'Migratory', 50),
  ('disc_joint_pain', 'single_joint', 'Single joint', 60),
  ('disc_joint_pain', 'symmetrical_small_joints', 'Symmetrical small joints', 70),
  ('disc_joint_pain', 'brief_stiffness', 'Brief stiffness', 80),
  ('disc_focal_weakness', 'thunderclap', 'Thunderclap', 10),
  ('disc_focal_weakness', 'preceding_seizure', 'Preceding seizure', 20),
  ('disc_focal_weakness', 'isolated_facial_forehead_involved', 'Isolated facial (forehead involved)', 30),
  ('disc_fatigue', 'exertional', 'Exertional', 10)
ON CONFLICT (property_code, value) DO NOTHING;

INSERT INTO public.symptom_property_map (symptom_code, property_code, required, sort_order) VALUES
  ('chest_pain', 'disc_chest_pain', false, 200),
  ('pleuritic_chest_pain', 'disc_chest_pain', false, 200),
  ('dyspnoea', 'disc_dyspnoea', false, 200),
  ('exertional_dyspnoea', 'disc_dyspnoea', false, 200),
  ('wheeze', 'disc_dyspnoea', false, 200),
  ('headache', 'disc_headache', false, 200),
  ('abdominal_pain', 'disc_abdominal_pain', false, 200),
  ('palpitations', 'disc_palpitations', false, 200),
  ('syncope', 'disc_syncope', false, 200),
  ('dizziness', 'disc_dizziness', false, 200),
  ('jaundice', 'disc_jaundice', false, 200),
  ('haematemesis', 'disc_gi_bleeding', false, 200),
  ('rectal_bleeding', 'disc_gi_bleeding', false, 200),
  ('joint_pain', 'disc_joint_pain', false, 200),
  ('joint_swelling', 'disc_joint_pain', false, 200),
  ('weakness', 'disc_focal_weakness', false, 200),
  ('fatigue', 'disc_fatigue', false, 200)
ON CONFLICT (symptom_code, property_code) DO NOTHING;
