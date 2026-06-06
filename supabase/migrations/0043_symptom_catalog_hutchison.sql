-- 0043 — Symptom catalog: per-symptom analytical properties (Hutchison's).
--
-- ⚠️ GATED — apply with explicit, named CSO/owner authorization (same posture as
-- 0042). This is clinical-safety reference data: it encodes WHAT to ask for each
-- symptom. The CSO signs the catalogs + the symptom→property mapping.
--
-- WHY: 0042 seeded GENERIC shared properties (one `site`, one `character`, one
-- `associated_symptoms` list reused by every symptom). Because options are keyed
-- to a property — not to a (symptom, property) pair — chest pain offered "Head /
-- Generalised" sites and breathlessness listed "Breathlessness" as an associated
-- symptom. This migration replaces the generic sets with SYMPTOM-SPECIFIC
-- properties whose option-sets are drawn from Hutchison's Clinical Methods
-- (SOCRATES + the per-symptom site / character / radiation / timing / modifier /
-- associated-feature / red-flag menus). The old generic properties remain in the
-- table but are unmapped (orphaned → never shown).
--
-- Decision-support: surfacing the right attributes + a red-flag checklist is
-- structuring the history, not diagnosing. No differential/diagnosis labels are
-- captured — only the patient-elicitable property values.

-- ─── Demote the universal qualifiers that should be per-symptom ──────────────
-- `duration` stays common (every symptom has one). `onset`/`progression` become
-- mapped so a symptom can use a richer, specific version without a duplicate.
UPDATE public.symptom_property SET common = false WHERE code IN ('onset', 'progression');

-- Enrich the generic onset menu (used where a symptom-specific onset isn't).
INSERT INTO public.symptom_property_option (property_code, value, display, sort_order) VALUES
  ('onset','minutes','Over minutes',15),
  ('onset','hours_days','Over hours to days',18)
ON CONFLICT (property_code, value) DO NOTHING;

-- ─── New, symptom-specific properties ───────────────────────────────────────
INSERT INTO public.symptom_property (code, display, value_type, unit, common, sort_order, version, source) VALUES
  -- chest pain
  ('cp_site','Site','single_select',NULL,false,10,'2','Hutchison 2.1'),
  ('cp_character','Character','single_select',NULL,false,11,'2','Hutchison 2.1'),
  ('cp_radiation','Radiation','multi_select',NULL,false,12,'2','Hutchison 2.1'),
  ('cp_timing','Timing','single_select',NULL,false,13,'2','Hutchison 2.1'),
  ('cp_exac','Exacerbating factors','multi_select',NULL,false,14,'2','Hutchison 2.1'),
  ('cp_reliev','Relieving factors','multi_select',NULL,false,15,'2','Hutchison 2.1'),
  ('cp_assoc','Associated features','multi_select',NULL,false,16,'2','Hutchison 2.1'),
  ('cp_redflags','Red flags','multi_select',NULL,false,17,'2','Hutchison 2.1'),
  -- abdominal pain
  ('abdo_site','Site','single_select',NULL,false,20,'2','Hutchison 2.2'),
  ('abdo_character','Character','single_select',NULL,false,21,'2','Hutchison 2.2'),
  ('abdo_radiation','Radiation','multi_select',NULL,false,22,'2','Hutchison 2.2'),
  ('abdo_pattern','Pattern','single_select',NULL,false,23,'2','Hutchison 2.2'),
  ('abdo_exac','Exacerbating factors','multi_select',NULL,false,24,'2','Hutchison 2.2'),
  ('abdo_reliev','Relieving factors','multi_select',NULL,false,25,'2','Hutchison 2.2'),
  ('abdo_assoc','Associated features','multi_select',NULL,false,26,'2','Hutchison 2.2'),
  ('abdo_redflags','Red flags','multi_select',NULL,false,27,'2','Hutchison 2.2'),
  -- headache
  ('ha_site','Site','single_select',NULL,false,30,'2','Hutchison 2.3'),
  ('ha_character','Character','single_select',NULL,false,31,'2','Hutchison 2.3'),
  ('ha_onset','Onset','single_select',NULL,false,32,'2','Hutchison 2.3'),
  ('ha_timing','Timing / pattern','single_select',NULL,false,33,'2','Hutchison 2.3'),
  ('ha_assoc','Associated features','multi_select',NULL,false,34,'2','Hutchison 2.3'),
  ('ha_redflags','Red flags (SNOOP)','multi_select',NULL,false,35,'2','Hutchison 2.3'),
  -- breathlessness
  ('dysp_onset','Onset','single_select',NULL,false,40,'2','Hutchison 3.1'),
  ('dysp_pattern','Pattern','multi_select',NULL,false,41,'2','Hutchison 3.1'),
  ('dysp_mrc','Exertional limit (MRC)','single_select',NULL,false,42,'2','Hutchison 3.1'),
  ('dysp_exac','Exacerbating factors','multi_select',NULL,false,43,'2','Hutchison 3.1'),
  ('dysp_reliev','Relieving factors','multi_select',NULL,false,44,'2','Hutchison 3.1'),
  ('dysp_assoc','Associated features','multi_select',NULL,false,45,'2','Hutchison 3.1'),
  ('dysp_redflags','Red flags','multi_select',NULL,false,46,'2','Hutchison 3.1'),
  -- cough
  ('cough_character','Character','single_select',NULL,false,50,'2','Hutchison 3.2'),
  ('cough_duration2','Duration','single_select',NULL,false,51,'2','Hutchison 3.2'),
  ('cough_diurnal','Diurnal pattern','single_select',NULL,false,52,'2','Hutchison 3.2'),
  ('cough_sputum','Sputum','single_select',NULL,false,53,'2','Hutchison 3.2'),
  ('cough_assoc','Associated features','multi_select',NULL,false,54,'2','Hutchison 3.2'),
  ('cough_redflags','Red flags','multi_select',NULL,false,55,'2','Hutchison 3.2'),
  -- palpitations
  ('palp_rhythm','Rhythm (tap it out)','single_select',NULL,false,60,'2','Hutchison 3.3'),
  ('palp_onset','Onset / offset','single_select',NULL,false,61,'2','Hutchison 3.3'),
  ('palp_assoc','Associated features','multi_select',NULL,false,62,'2','Hutchison 3.3'),
  ('palp_redflags','Red flags','multi_select',NULL,false,63,'2','Hutchison 3.3'),
  -- oedema
  ('oed_distribution','Distribution / quality','single_select',NULL,false,70,'2','Hutchison 3.4'),
  ('oed_timing','Timing','single_select',NULL,false,71,'2','Hutchison 3.4'),
  ('oed_assoc','Associated features','multi_select',NULL,false,72,'2','Hutchison 3.4'),
  ('oed_redflags','Red flags','multi_select',NULL,false,73,'2','Hutchison 3.4'),
  -- syncope
  ('syn_trigger','Trigger / posture','single_select',NULL,false,80,'2','Hutchison 3.6 / 5.4'),
  ('syn_prodrome','Prodrome','single_select',NULL,false,81,'2','Hutchison 3.6 / 5.4'),
  ('syn_during','During the event','multi_select',NULL,false,82,'2','Hutchison 3.6 / 5.4'),
  ('syn_recovery','Recovery','single_select',NULL,false,83,'2','Hutchison 3.6 / 5.4'),
  ('syn_redflags','Red flags','multi_select',NULL,false,84,'2','Hutchison 3.6'),
  -- fever
  ('fever_assoc','Associated features','multi_select',NULL,false,90,'2','Hutchison 7.1'),
  ('fever_redflags','Red flags','multi_select',NULL,false,91,'2','Hutchison 7.1'),
  -- vomiting
  ('vom_content','Content of vomitus','single_select',NULL,false,100,'2','Hutchison 4.2'),
  ('vom_timing','Timing','single_select',NULL,false,101,'2','Hutchison 4.2'),
  ('vom_assoc','Associated features','multi_select',NULL,false,102,'2','Hutchison 4.2'),
  ('vom_redflags','Red flags','multi_select',NULL,false,103,'2','Hutchison 4.2'),
  -- diarrhoea
  ('diar_character','Character','single_select',NULL,false,110,'2','Hutchison 4.3'),
  ('diar_duration','Duration','single_select',NULL,false,111,'2','Hutchison 4.3'),
  ('diar_nocturnal','Nocturnal diarrhoea','boolean',NULL,false,112,'2','Hutchison 4.3'),
  ('diar_assoc','Associated features','multi_select',NULL,false,113,'2','Hutchison 4.3'),
  ('diar_redflags','Red flags','multi_select',NULL,false,114,'2','Hutchison 4.3'),
  -- dizziness / vertigo
  ('dizz_type','Type','single_select',NULL,false,120,'2','Hutchison 5.1'),
  ('dizz_timing','Duration / trigger','single_select',NULL,false,121,'2','Hutchison 5.1'),
  ('dizz_assoc','Associated features','multi_select',NULL,false,122,'2','Hutchison 5.1'),
  ('dizz_redflags','Red flags','multi_select',NULL,false,123,'2','Hutchison 5.1'),
  -- jaundice
  ('jaun_urine','Urine colour','single_select',NULL,false,130,'2','Hutchison 4.5'),
  ('jaun_stool','Stool colour','single_select',NULL,false,131,'2','Hutchison 4.5'),
  ('jaun_assoc','Associated features','multi_select',NULL,false,132,'2','Hutchison 4.5'),
  ('jaun_redflags','Red flags','multi_select',NULL,false,133,'2','Hutchison 4.5'),
  -- haemoptysis
  ('haem_quantity','Quantity / character','single_select',NULL,false,140,'2','Hutchison 3.5'),
  ('haem_assoc','Associated features','multi_select',NULL,false,141,'2','Hutchison 3.5'),
  ('haem_redflags','Red flags','multi_select',NULL,false,142,'2','Hutchison 3.5'),
  -- weight loss
  ('wl_appetite','Appetite','single_select',NULL,false,150,'2','Hutchison 4.6'),
  ('wl_amount','Amount','single_select',NULL,false,151,'2','Hutchison 4.6'),
  ('wl_assoc','Associated features','multi_select',NULL,false,152,'2','Hutchison 4.6'),
  ('wl_redflags','Red flags','multi_select',NULL,false,153,'2','Hutchison 4.6'),
  -- fatigue
  ('fat_type','Type','single_select',NULL,false,160,'2','Hutchison 7.2'),
  ('fat_assoc','Associated features','multi_select',NULL,false,161,'2','Hutchison 7.2')
ON CONFLICT (code) DO NOTHING;

-- ─── Option value-sets (per Hutchison's per-symptom menus) ───────────────────
INSERT INTO public.symptom_property_option (property_code, value, display, sort_order) VALUES
  -- chest pain
  ('cp_site','central_retrosternal','Central / retrosternal',10),('cp_site','left_precordial','Left precordial',20),('cp_site','lateral','Lateral / localised',30),('cp_site','anterior_wall','Anterior chest wall',40),('cp_site','epigastric','Epigastric / lower retrosternal',50),('cp_site','dermatomal','Dermatomal band (unilateral)',60),
  ('cp_character','crushing','Crushing / pressing',10),('cp_character','tearing','Tearing',20),('cp_character','pleuritic','Sharp / pleuritic',30),('cp_character','burning','Burning',40),('cp_character','stabbing','Stabbing',50),('cp_character','boring','Boring',60),
  ('cp_radiation','left_arm','Left arm',10),('cp_radiation','both_arms','Both arms / ulnar',20),('cp_radiation','jaw_neck','Jaw / neck / teeth',30),('cp_radiation','back','Interscapular / back',40),('cp_radiation','shoulder_tip','Shoulder tip',50),('cp_radiation','dermatome','Along a rib / dermatome',60),('cp_radiation','none','No radiation',70),
  ('cp_timing','exertional','Exertional, eased by rest <10 min',10),('cp_timing','rest_prolonged','Lasts >20 min at rest',20),('cp_timing','positional','Positional, days-long',30),('cp_timing','brief_stabs','Brief seconds-long stabs',40),
  ('cp_exac','exertion','Exertion',10),('cp_exac','inspiration','Inspiration / cough',20),('cp_exac','supine','Lying flat',30),('cp_exac','food','Food / recumbency',40),('cp_exac','palpation','Palpation / movement',50),
  ('cp_reliev','rest','Rest',10),('cp_reliev','gtn','GTN / nitrates',20),('cp_reliev','sitting_forward','Sitting forward',30),('cp_reliev','antacids','Antacids',40),
  ('cp_assoc','sweating','Sweating',10),('cp_assoc','nausea','Nausea / vomiting',20),('cp_assoc','breathless','Breathlessness',30),('cp_assoc','palpitations','Palpitations',40),('cp_assoc','syncope','Syncope',50),('cp_assoc','lightheaded','Light-headedness',60),
  ('cp_redflags','rest_20','Pain >20 min at rest',10),('cp_redflags','tearing_back','Tearing pain to back',20),('cp_redflags','unequal_pulses','Unequal arm pulses / BP',30),('cp_redflags','syncope','Syncope',40),('cp_redflags','unstable','Haemodynamic instability',50),('cp_redflags','pe_risk','Pleuritic + PE risk',60),
  -- abdominal pain
  ('abdo_site','ruq','Right hypochondrium (RUQ)',10),('abdo_site','epigastrium','Epigastrium',20),('abdo_site','luq','Left hypochondrium (LUQ)',30),('abdo_site','right_flank','Right flank / lumbar',40),('abdo_site','central','Umbilical / central',50),('abdo_site','left_flank','Left flank / lumbar',60),('abdo_site','rif','Right iliac fossa',70),('abdo_site','suprapubic','Suprapubic',80),('abdo_site','lif','Left iliac fossa',90),
  ('abdo_character','colicky','Colicky / gripping',10),('abdo_character','constant_sharp','Constant & sharp',20),('abdo_character','burning','Burning',30),('abdo_character','dull','Dull ache',40),('abdo_character','boring_back','Boring to back',50),
  ('abdo_radiation','back','To back',10),('abdo_radiation','loin_groin','Loin to groin',20),('abdo_radiation','shoulder_tip','Shoulder tip',30),('abdo_radiation','none','No radiation',40),
  ('abdo_pattern','colicky_restless','Colicky, restless (cannot lie still)',10),('abdo_pattern','constant_still','Constant, worse on movement (lies still)',20),('abdo_pattern','sudden_rigid','Sudden worst-ever then rigidity',30),('abdo_pattern','migratory_rif','Migratory: central to RIF',40),
  ('abdo_exac','movement','Movement / coughing',10),('abdo_exac','food','Food',20),('abdo_exac','defaecation','Defaecation',30),
  ('abdo_reliev','sitting_forward','Sitting forward',10),('abdo_reliev','defaecation','Defaecation',20),('abdo_reliev','antacids','Antacids',30),('abdo_reliev','food','Food',40),
  ('abdo_assoc','vomiting','Vomiting',10),('abdo_assoc','bowel_change','Change in bowel habit',20),('abdo_assoc','distension','Distension',30),('abdo_assoc','fever','Fever',40),('abdo_assoc','urinary','Urinary symptoms',50),('abdo_assoc','gynae','Gynae / PV bleeding',60),('abdo_assoc','jaundice','Jaundice',70),('abdo_assoc','gi_bleed','GI bleeding',80),('abdo_assoc','anorexia','Anorexia',90),('abdo_assoc','weight_loss','Weight loss',100),
  ('abdo_redflags','peritonism','Rigidity / guarding / rebound',10),('abdo_redflags','shock','Shock',20),('abdo_redflags','gi_bleed','GI bleeding',30),('abdo_redflags','pulsatile_mass','Pulsatile mass (AAA)',40),('abdo_redflags','pregnancy','Pregnancy + pain / bleeding',50),('abdo_redflags','obstruction','Absolute constipation + vomiting',60),
  -- headache
  ('ha_site','unilateral_temporal','Unilateral fronto-temporal',10),('ha_site','band','Bilateral band',20),('ha_site','one_eye','Around one eye',30),('ha_site','occipital_vertex','Occipital to vertex',40),('ha_site','temporal_tender','Temporal, scalp tender',50),('ha_site','generalised','Generalised',60),('ha_site','sinuses','Over sinuses (frontal / facial)',70),('ha_site','trigeminal','Trigeminal territory',80),
  ('ha_character','throbbing','Throbbing / pulsating',10),('ha_character','band','Tight band / pressing',20),('ha_character','lancinating','Sharp / lancinating',30),('ha_character','explosive','Explosive (thunderclap)',40),('ha_character','boring','Boring / deep',50),
  ('ha_onset','thunderclap','Thunderclap (peak <1 min)',10),('ha_onset','subacute','Subacute over days',20),('ha_onset','chronic','Chronic / recurrent',30),
  ('ha_timing','episodic_aura','Episodic with aura',10),('ha_timing','clusters','Clusters (same time / night)',20),('ha_timing','waking_valsalva','Worse on waking / Valsalva',30),('ha_timing','progressive','Progressive, new daily',40),
  ('ha_assoc','photophobia','Photophobia',10),('ha_assoc','phonophobia','Phonophobia',20),('ha_assoc','nausea','Nausea / vomiting',30),('ha_assoc','aura','Aura',40),('ha_assoc','neck_stiffness','Neck stiffness',50),('ha_assoc','visual','Visual disturbance',60),('ha_assoc','focal','Focal neurology',70),
  ('ha_redflags','systemic','Systemic (fever / weight loss)',10),('ha_redflags','neuro_deficit','Neuro deficit / reduced consciousness',20),('ha_redflags','sudden','Sudden / thunderclap',30),('ha_redflags','new_over_50','New onset age >50',40),('ha_redflags','positional','Positional / Valsalva / papilloedema',50),
  -- breathlessness
  ('dysp_onset','sudden','Sudden (minutes)',10),('dysp_onset','hours_days','Over hours to days',20),('dysp_onset','chronic','Chronic (weeks to months)',30),
  ('dysp_pattern','orthopnoea','Orthopnoea',10),('dysp_pattern','pnd','Paroxysmal nocturnal dyspnoea',20),('dysp_pattern','exertional','Exertional, progressive',30),('dysp_pattern','episodic_wheeze','Episodic wheeze (nocturnal)',40),('dysp_pattern','platypnoea','Platypnoea (worse sitting up)',50),
  ('dysp_mrc','mrc1','MRC 1 - strenuous exertion only',10),('dysp_mrc','mrc2','MRC 2 - hurrying / slight hill',20),('dysp_mrc','mrc3','MRC 3 - slower than peers',30),('dysp_mrc','mrc4','MRC 4 - stops after ~100 m',40),('dysp_mrc','mrc5','MRC 5 - housebound / breathless dressing',50),
  ('dysp_exac','exertion','Exertion',10),('dysp_exac','lying_flat','Lying flat',20),('dysp_exac','cold_air','Cold air',30),('dysp_exac','triggers','Allergens / triggers',40),
  ('dysp_reliev','rest','Rest',10),('dysp_reliev','sitting_up','Sitting up',20),('dysp_reliev','inhaler','Inhaler / bronchodilator',30),
  ('dysp_assoc','chest_pain','Chest pain',10),('dysp_assoc','cough','Cough',20),('dysp_assoc','sputum','Sputum',30),('dysp_assoc','wheeze','Wheeze',40),('dysp_assoc','haemoptysis','Haemoptysis',50),('dysp_assoc','fever','Fever',60),('dysp_assoc','ankle_swelling','Ankle swelling',70),('dysp_assoc','palpitations','Palpitations',80),
  ('dysp_redflags','at_rest','Breathless at rest',10),('dysp_redflags','cyanosis','Cyanosis',20),('dysp_redflags','accessory','Accessory muscle use',30),('dysp_redflags','single_word','Single-word speech',40),('dysp_redflags','silent_chest','Silent chest',50),('dysp_redflags','stridor','Stridor',60),('dysp_redflags','spo2','Falling SpO2',70),('dysp_redflags','exhaustion','Exhaustion',80),
  -- cough
  ('cough_character','dry','Dry / non-productive',10),('cough_character','productive','Productive',20),('cough_character','barking','Barking',30),('cough_character','bovine','Bovine',40),('cough_character','whooping','Whooping / paroxysmal',50),('cough_character','hacking','Hacking',60),
  ('cough_duration2','acute','Acute (<3 weeks)',10),('cough_duration2','subacute','Subacute (3-8 weeks)',20),('cough_duration2','chronic','Chronic (>8 weeks)',30),
  ('cough_diurnal','nocturnal','Nocturnal',10),('cough_diurnal','on_rising','On rising (with sputum)',20),('cough_diurnal','none','No pattern',30),
  ('cough_sputum','mucoid','Mucoid / clear',10),('cough_sputum','purulent','Purulent yellow / green',20),('cough_sputum','copious_foul','Copious, foul (cupfuls)',30),('cough_sputum','rusty','Rusty',40),('cough_sputum','pink_frothy','Pink frothy',50),('cough_sputum','blood_stained','Blood-stained',60),
  ('cough_assoc','sputum','Sputum',10),('cough_assoc','haemoptysis','Haemoptysis',20),('cough_assoc','breathless','Breathlessness',30),('cough_assoc','wheeze','Wheeze',40),('cough_assoc','fever','Fever',50),('cough_assoc','weight_loss','Weight loss',60),('cough_assoc','night_sweats','Night sweats',70),('cough_assoc','heartburn','Heartburn',80),('cough_assoc','nasal','Nasal symptoms',90),
  ('cough_redflags','haemoptysis','Haemoptysis',10),('cough_redflags','weight_loss','Weight loss / night sweats',20),('cough_redflags','progressive_sob','Progressive breathlessness',30),('cough_redflags','hoarseness','Hoarseness / bovine cough',40),('cough_redflags','stridor','Stridor',50),('cough_redflags','aspiration','Aspiration risk',60),
  -- palpitations
  ('palp_rhythm','regular_fast','Regular fast',10),('palp_rhythm','irregular','Irregularly irregular',20),('palp_rhythm','skips','Single skips / thumps',30),('palp_rhythm','slow_forceful','Slow forceful',40),
  ('palp_onset','sudden','Sudden on / off',10),('palp_onset','gradual','Gradual build & settle',20),('palp_onset','vagal','Stops with vagal manoeuvres',30),
  ('palp_assoc','chest_pain','Chest pain',10),('palp_assoc','breathless','Breathlessness',20),('palp_assoc','dizziness','Dizziness',30),('palp_assoc','syncope','Syncope',40),('palp_assoc','polyuria','Polyuria after',50),('palp_assoc','sweating_tremor','Sweating / tremor',60),('palp_assoc','heat_intolerance','Heat intolerance / weight loss',70),
  ('palp_redflags','syncope','Syncope / presyncope',10),('palp_redflags','exertion','During exertion',20),('palp_redflags','structural','Known heart disease',30),('palp_redflags','fhx_scd','Family history sudden death',40),('palp_redflags','sustained','Very fast sustained',50),
  -- oedema
  ('oed_distribution','bilat_dependent','Bilateral, pitting, dependent',10),('oed_distribution','bilat_periorbital','Bilateral, pitting, periorbital too',20),('oed_distribution','unilat_painful','Unilateral, painful, warm calf',30),('oed_distribution','nonpitting','Non-pitting, skin thickening',40),('oed_distribution','venous','Bilateral + venous skin changes',50),('oed_distribution','anasarca','Generalised (anasarca)',60),
  ('oed_timing','end_of_day','Worse end of day',10),('oed_timing','morning_face','Morning facial / periorbital',20),('oed_timing','chronic_skin','Chronic with skin change',30),
  ('oed_assoc','breathless','Breathlessness',10),('oed_assoc','orthopnoea','Orthopnoea / PND',20),('oed_assoc','raised_jvp','Raised JVP',30),('oed_assoc','weight_gain','Weight gain',40),('oed_assoc','oliguria','Reduced urine output',50),('oed_assoc','jaundice','Yellowing (jaundice)',60),
  ('oed_redflags','dvt','Unilateral painful (DVT)',10),('oed_redflags','angioedema','Facial / laryngeal swelling',20),('oed_redflags','rest_sob','Breathless at rest',30),('oed_redflags','rapid','Rapidly progressive',40),('oed_redflags','oliguria','Reduced urine output',50),
  -- syncope
  ('syn_trigger','standing','On / after prolonged standing',10),('syn_trigger','from_lying','On standing from lying',20),('syn_trigger','exertion','During exertion',30),('syn_trigger','head_turn','On head-turn / tight collar',40),('syn_trigger','no_warning','No warning / at rest',50),
  ('syn_prodrome','nausea_warmth','Nausea / warmth / greying vision',10),('syn_prodrome','palpitations','Palpitations',20),('syn_prodrome','aura','Aura (deja vu, smell)',30),('syn_prodrome','none','None',40),
  ('syn_during','jerking','Prolonged jerking',10),('syn_during','tongue_bite','Lateral tongue-bite',20),('syn_during','incontinence','Incontinence',30),('syn_during','pale_limp','Pallor / limp',40),
  ('syn_recovery','rapid','Rapid, oriented',10),('syn_recovery','prolonged','Prolonged confusion (post-ictal)',20),
  ('syn_redflags','exertion_supine','During exertion or supine',10),('syn_redflags','no_warning','No warning',20),('syn_redflags','palpitations','Palpitations preceding',30),('syn_redflags','structural','Structural heart disease',40),('syn_redflags','fhx_scd','Family history sudden death',50),('syn_redflags','injury','Injury from collapse',60),
  -- fever
  ('fever_assoc','rigors','Rigors / chills',10),('fever_assoc','night_sweats','Night sweats',20),('fever_assoc','cough','Cough',30),('fever_assoc','urinary','Urinary symptoms',40),('fever_assoc','diarrhoea','Diarrhoea',50),('fever_assoc','rash','Rash',60),('fever_assoc','neck_stiffness','Neck stiffness',70),('fever_assoc','sore_throat','Sore throat',80),
  ('fever_redflags','sepsis','Hypotension / tachycardia / confusion',10),('fever_redflags','meningism','Neck stiffness / photophobia / rash',20),('fever_redflags','immunocompromised','Immunocompromised / neutropenic',30),('fever_redflags','traveller','Returning traveller',40),('fever_redflags','murmur','New murmur',50),
  -- vomiting
  ('vom_content','undigested','Undigested food',10),('vom_content','bile','Bile-stained',20),('vom_content','faeculent','Faeculent',30),('vom_content','blood','Blood / coffee-grounds',40),
  ('vom_timing','early_morning','Early morning',10),('vom_timing','after_meals','During / soon after meals',20),('vom_timing','projectile','Projectile, >1 h after meals',30),
  ('vom_assoc','abdo_pain','Abdominal pain',10),('vom_assoc','headache','Headache',20),('vom_assoc','vertigo','Vertigo',30),('vom_assoc','distension','Distension / constipation',40),('vom_assoc','chest_pain','Chest pain / sweating',50),('vom_assoc','pregnancy','Pregnancy possible',60),
  ('vom_redflags','raised_icp','Projectile + headache',10),('vom_redflags','faeculent','Faeculent (obstruction)',20),('vom_redflags','blood','Coffee-ground / blood',30),('vom_redflags','dehydration','Dehydration / shock',40),
  -- diarrhoea
  ('diar_character','watery','Watery',10),('diar_character','bloody','Bloody',20),('diar_character','steatorrhoea','Fatty / pale / floating',30),('diar_character','mucus','Mucus',40),
  ('diar_duration','acute','Acute (<2 weeks)',10),('diar_duration','chronic','Chronic (>4 weeks)',20),
  ('diar_assoc','abdo_pain','Abdominal pain',10),('diar_assoc','fever','Fever',20),('diar_assoc','weight_loss','Weight loss',30),('diar_assoc','blood_mucus','Blood / mucus',40),('diar_assoc','vomiting','Vomiting',50),('diar_assoc','antibiotics','Recent antibiotics',60),
  ('diar_redflags','bleeding','Rectal bleeding / melaena',10),('diar_redflags','weight_loss','Weight loss',20),('diar_redflags','nocturnal','Nocturnal symptoms',30),('diar_redflags','dehydration','Dehydration',40),('diar_redflags','persistent','Persistent change >6 wks (age >50)',50),
  -- dizziness / vertigo
  ('dizz_type','vertigo','Vertigo (spinning)',10),('dizz_type','presyncope','Pre-syncope (about to faint)',20),('dizz_type','disequilibrium','Disequilibrium (unsteady)',30),('dizz_type','lightheaded','Vague light-headedness',40),
  ('dizz_timing','seconds_positional','Seconds, positional',10),('dizz_timing','minutes_hours','Minutes to hours',20),('dizz_timing','days_continuous','Days, continuous',30),('dizz_timing','with_focal','With focal neurology',40),
  ('dizz_assoc','hearing_loss','Hearing loss',10),('dizz_assoc','tinnitus','Tinnitus',20),('dizz_assoc','aural_fullness','Aural fullness',30),('dizz_assoc','nausea','Nausea / vomiting',40),('dizz_assoc','focal','Diplopia / dysarthria / ataxia',50),
  ('dizz_redflags','focal','Focal neurology',10),('dizz_redflags','deafness','New deafness + vertigo',20),('dizz_redflags','sudden','Sudden severe',30),('dizz_redflags','cannot_walk','Cannot stand / walk',40),
  -- jaundice
  ('jaun_urine','dark','Dark urine',10),('jaun_urine','normal','Normal urine',20),
  ('jaun_stool','pale','Pale stools',10),('jaun_stool','normal','Normal stools',20),
  ('jaun_assoc','pruritus','Itching (pruritus)',10),('jaun_assoc','ruq_pain','RUQ pain',20),('jaun_assoc','fever','Fever / rigors',30),('jaun_assoc','weight_loss','Weight loss',40),('jaun_assoc','cld','Stigmata of chronic liver disease',50),('jaun_assoc','travel','Recent travel / risk factors',60),
  ('jaun_redflags','cholangitis','RUQ pain + fever',10),('jaun_redflags','painless_wl','Painless + weight loss',20),('jaun_redflags','encephalopathy','Confusion (encephalopathy)',30),('jaun_redflags','gi_bleed','GI bleeding',40),
  -- haemoptysis
  ('haem_quantity','streaks','Streaks in sputum',10),('haem_quantity','frank','Frank blood',20),('haem_quantity','pink_frothy','Pink frothy',30),('haem_quantity','massive','Massive (>200 mL/24h)',40),
  ('haem_assoc','weight_loss','Weight loss',10),('haem_assoc','night_sweats','Night sweats',20),('haem_assoc','pleuritic','Pleuritic chest pain',30),('haem_assoc','breathless','Breathlessness',40),('haem_assoc','fever','Fever',50),('haem_assoc','telangiectasia','Epistaxis / telangiectasia',60),
  ('haem_redflags','massive','Massive volume',10),('haem_redflags','unstable','Haemodynamic compromise',20),('haem_redflags','hypoxia','Hypoxia',30),('haem_redflags','smoker','Smoker >40 + weight loss',40),('haem_redflags','pe_risk','PE risk factors',50),
  -- weight loss
  ('wl_appetite','good','Good appetite',10),('wl_appetite','poor','Poor appetite',20),
  ('wl_amount','under_5','Under 5% body weight',10),('wl_amount','over_5','Over 5% in 6 months',20),('wl_amount','unknown','Not sure',30),
  ('wl_assoc','night_sweats','Night sweats',10),('wl_assoc','fever','Fever',20),('wl_assoc','cough','Cough',30),('wl_assoc','diarrhoea','Diarrhoea',40),('wl_assoc','heat_intolerance','Heat intolerance',50),('wl_assoc','polyuria','Polyuria / polydipsia',60),('wl_assoc','low_mood','Low mood',70),
  ('wl_redflags','unintentional','Unintentional >5%',10),('wl_redflags','haemoptysis','Haemoptysis',20),('wl_redflags','gi_bleed','GI bleeding',30),('wl_redflags','lymphadenopathy','Lymphadenopathy',40),('wl_redflags','night_sweats','Night sweats',50),
  -- fatigue
  ('fat_type','physical','Physical fatigue',10),('fat_type','sleepiness','Sleepiness',20),('fat_type','low_mood','Low mood / motivation',30),('fat_type','weakness','Muscle weakness',40),
  ('fat_assoc','weight_change','Weight change',10),('fat_assoc','sleep','Poor sleep / snoring',20),('fat_assoc','anhedonia','Low mood / anhedonia',30),('fat_assoc','cardiac','Breathlessness / palpitations',40),('fat_assoc','cold_intolerance','Cold intolerance',50),('fat_assoc','polyuria','Polyuria / polydipsia',60)
ON CONFLICT (property_code, value) DO NOTHING;

-- ─── Re-map relevance: drop the generic mapping, install the specific one ────
-- (Common `duration` still auto-applies to every symptom.)
DELETE FROM public.symptom_property_map WHERE symptom_code IN (
  'chest_pain','dyspnoea','cough','palpitations','oedema','abdominal_pain','headache',
  'fever','weight_loss','dizziness','vomiting','diarrhoea','fatigue','syncope','haemoptysis','jaundice'
);

INSERT INTO public.symptom_property_map (symptom_code, property_code, required, sort_order) VALUES
  ('chest_pain','onset',false,10),('chest_pain','cp_site',true,20),('chest_pain','cp_character',true,30),('chest_pain','cp_radiation',false,40),('chest_pain','cp_timing',false,50),('chest_pain','severity',false,60),('chest_pain','cp_exac',false,70),('chest_pain','cp_reliev',false,80),('chest_pain','cp_assoc',false,90),('chest_pain','cp_redflags',false,100),
  ('abdominal_pain','onset',false,10),('abdominal_pain','abdo_site',true,20),('abdominal_pain','abdo_character',true,30),('abdominal_pain','abdo_radiation',false,40),('abdominal_pain','abdo_pattern',false,50),('abdominal_pain','severity',false,60),('abdominal_pain','abdo_exac',false,70),('abdominal_pain','abdo_reliev',false,80),('abdominal_pain','abdo_assoc',false,90),('abdominal_pain','abdo_redflags',false,100),
  ('headache','ha_onset',false,10),('headache','ha_site',false,20),('headache','ha_character',false,30),('headache','ha_timing',false,40),('headache','severity',false,50),('headache','ha_assoc',false,60),('headache','ha_redflags',false,70),
  ('dyspnoea','dysp_onset',false,10),('dyspnoea','dysp_pattern',false,20),('dyspnoea','dysp_mrc',false,30),('dyspnoea','progression',false,40),('dyspnoea','severity',false,50),('dyspnoea','dysp_exac',false,60),('dyspnoea','dysp_reliev',false,70),('dyspnoea','dysp_assoc',false,80),('dyspnoea','dysp_redflags',false,90),
  ('cough','cough_duration2',false,10),('cough','cough_character',true,20),('cough','cough_sputum',false,30),('cough','cough_diurnal',false,40),('cough','progression',false,50),('cough','cough_assoc',false,60),('cough','cough_redflags',false,70),
  ('palpitations','palp_onset',false,10),('palpitations','palp_rhythm',true,20),('palpitations','palp_assoc',false,30),('palpitations','palp_redflags',false,40),
  ('oedema','oed_distribution',true,10),('oedema','oed_timing',false,20),('oedema','progression',false,30),('oedema','oed_assoc',false,40),('oedema','oed_redflags',false,50),
  ('fever','fever_pattern',false,10),('fever','rigors',false,20),('fever','fever_assoc',false,30),('fever','travel',false,40),('fever','fever_redflags',false,50),
  ('weight_loss','wl_appetite',false,10),('weight_loss','wl_amount',false,20),('weight_loss','progression',false,30),('weight_loss','wl_assoc',false,40),('weight_loss','wl_redflags',false,50),
  ('dizziness','dizz_type',true,10),('dizziness','dizz_timing',false,20),('dizziness','dizz_assoc',false,30),('dizziness','dizz_redflags',false,40),
  ('vomiting','vom_content',false,10),('vomiting','vom_timing',false,20),('vomiting','vom_assoc',false,30),('vomiting','vom_redflags',false,40),
  ('diarrhoea','diar_duration',false,10),('diarrhoea','diar_character',false,20),('diarrhoea','diar_nocturnal',false,30),('diarrhoea','progression',false,40),('diarrhoea','travel',false,50),('diarrhoea','diar_assoc',false,60),('diarrhoea','diar_redflags',false,70),
  ('fatigue','fat_type',false,10),('fatigue','progression',false,20),('fatigue','severity',false,30),('fatigue','fat_assoc',false,40),
  ('syncope','syn_trigger',false,10),('syncope','syn_prodrome',false,20),('syncope','syn_during',false,30),('syncope','syn_recovery',false,40),('syncope','prior_episodes',false,50),('syncope','syn_redflags',false,60),
  ('haemoptysis','haem_quantity',false,10),('haemoptysis','severity',false,20),('haemoptysis','haem_assoc',false,30),('haemoptysis','haem_redflags',false,40),
  ('jaundice','jaun_urine',false,10),('jaundice','jaun_stool',false,20),('jaundice','jaun_assoc',false,30),('jaundice','jaun_redflags',false,40)
ON CONFLICT (symptom_code, property_code) DO NOTHING;
