-- 0252 — The signed forms and routes (catalogue slice Step 2; D-CAT-04; GATE A §4, signed by Fadhul 27 Oct 2026).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0251.
--
-- MedSync's own short en-GB lists: 40 dose forms and 15 routes. EDQM codes are not filled in: EDQM's account and
-- conditions of use are still open (O-3), so nothing here claims to be EDQM. A health supply takes no form or route.
-- Labels are as signed; a changed label is a new migration, never an edit here.
--
-- ADDITIVE and re-runnable: an existing code is left as it is.
-- Reverse: DELETE FROM public.cat_routes; DELETE FROM public.cat_dose_forms; (only before any medicine uses them).

INSERT INTO public.cat_dose_forms (code, label, status) VALUES
  ('tablet', 'Tablet', 'signed'),
  ('film_coated_tablet', 'Film-coated tablet', 'signed'),
  ('chewable_tablet', 'Chewable tablet', 'signed'),
  ('dispersible_tablet', 'Dispersible tablet', 'signed'),
  ('effervescent_tablet', 'Effervescent tablet', 'signed'),
  ('modified_release_tablet', 'Modified-release tablet', 'signed'),
  ('sublingual_tablet', 'Sublingual tablet', 'signed'),
  ('capsule', 'Capsule', 'signed'),
  ('modified_release_capsule', 'Modified-release capsule', 'signed'),
  ('oral_solution', 'Oral solution', 'signed'),
  ('oral_suspension', 'Oral suspension', 'signed'),
  ('syrup', 'Syrup', 'signed'),
  ('oral_drops', 'Oral drops', 'signed'),
  ('powder_for_oral_solution', 'Powder for oral solution', 'signed'),
  ('powder_for_oral_suspension', 'Powder for oral suspension', 'signed'),
  ('oral_powder_in_sachet', 'Oral powder in sachet', 'signed'),
  ('oral_gel', 'Oral gel', 'signed'),
  ('injection_solution', 'Injection solution', 'signed'),
  ('injection_suspension', 'Injection suspension', 'signed'),
  ('powder_for_injection', 'Powder for injection', 'signed'),
  ('powder_and_solvent_for_injection', 'Powder and solvent for injection', 'signed'),
  ('concentrate_for_infusion', 'Concentrate for infusion', 'signed'),
  ('infusion_solution', 'Infusion solution', 'signed'),
  ('cream', 'Cream', 'signed'),
  ('ointment', 'Ointment', 'signed'),
  ('gel', 'Gel', 'signed'),
  ('lotion', 'Lotion', 'signed'),
  ('paste', 'Paste', 'signed'),
  ('eye_drops', 'Eye drops', 'signed'),
  ('eye_ointment', 'Eye ointment', 'signed'),
  ('ear_drops', 'Ear drops', 'signed'),
  ('nasal_drops', 'Nasal drops', 'signed'),
  ('nasal_spray', 'Nasal spray', 'signed'),
  ('inhaler_pressurised', 'Inhaler (pressurised)', 'signed'),
  ('nebuliser_solution', 'Nebuliser solution', 'signed'),
  ('suppository', 'Suppository', 'signed'),
  ('pessary', 'Pessary', 'signed'),
  ('vaginal_cream', 'Vaginal cream', 'signed'),
  ('transdermal_patch', 'Transdermal patch', 'signed'),
  ('medicated_dressing', 'Medicated dressing', 'signed')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.cat_routes (code, label, status) VALUES
  ('oral', 'Oral', 'signed'),
  ('sublingual', 'Sublingual', 'signed'),
  ('buccal', 'Buccal', 'signed'),
  ('intravenous', 'Intravenous', 'signed'),
  ('intramuscular', 'Intramuscular', 'signed'),
  ('subcutaneous', 'Subcutaneous', 'signed'),
  ('intradermal', 'Intradermal', 'signed'),
  ('intraosseous', 'Intraosseous', 'signed'),
  ('topical', 'Topical (skin)', 'signed'),
  ('eye', 'Eye', 'signed'),
  ('ear', 'Ear', 'signed'),
  ('nose', 'Nose', 'signed'),
  ('inhaled', 'Inhaled', 'signed'),
  ('rectal', 'Rectal', 'signed'),
  ('vaginal', 'Vaginal', 'signed')
ON CONFLICT (code) DO NOTHING;
