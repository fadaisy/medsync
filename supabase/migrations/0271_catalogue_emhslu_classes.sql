-- 0271 — The catalogue's classes, from the EMHSLU 2023 sections (MEDICINES-TAB.md §11).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0270. Data only, no schema change.
--
-- 0270 added class, group, ATC level 1 and sale category to cat_medicines, but nothing filled them, so every filter
-- in "Add from the catalogues" matched nothing. Each EMHSLU medicine's seed proposal (0251) carries the list's
-- printed section ("18.5 Insulins and medicines used for diabetes"). From it:
--   - pharm_group: the section as printed, number dropped;
--   - therapeutic_class: one of the app's classes (content/pharmacy-medicines.ts CLASSES), only where the whole
--     section is that class; mixed sections (antidotes, coagulation, palliative symptoms, …) stay empty;
--   - sources: the EMHSLU tag the seed never set.
-- ATC and sale category have no source yet and stay empty. Only empty fields are filled; an import wins.
WITH map(prefix, cls) AS (VALUES
  ('1','Anaesthetics'),('2.1','Analgesics'),('2.2','Analgesics'),('5','Anticonvulsants'),('6.1','Anthelmintics'),
  ('6.2.1','Antibiotics'),('6.2.2','Antibiotics'),('6.2.3','Antibiotics'),('6.2.4','Anti-TB'),('6.3','Antifungals'),
  ('6.4.1','Antivirals'),('6.4.2','Antiretrovirals'),('6.4.3','Antiretrovirals'),('6.4.4','Antivirals'),
  ('6.5.3','Antimalarials'),('8.1','Immunosuppressants'),('8.2','Antineoplastics (anticancer)'),
  ('8.3','Antineoplastics (anticancer)'),('10.1','Haematinics'),('12.3','Antihypertensives'),('12.3.1',NULL),
  ('12.6','Lipid-lowering'),('13','Dermatologicals'),('14.1','Eye and ear'),('16','Diuretics'),('17','Gastrointestinal'),
  ('18.1','Corticosteroids'),('18.2','Hormones and contraceptives'),('18.3','Hormones and contraceptives'),
  ('18.3.7',NULL),('18.4','Hormones and contraceptives'),('18.5','Antidiabetics'),('18.5.1',NULL),('18.5.2',NULL),
  ('18.6','Hormones and contraceptives'),('18.7','Hormones and contraceptives'),('18.8','Thyroid'),('19.3','Vaccines'),
  ('21','Eye and ear'),('22.1','Obstetric (uterotonics)'),('24','Psychiatric'),('25.1','Respiratory'),
  ('25.2','Antibiotics'),('26','Fluids and electrolytes'),('27','Vitamins and minerals'),('28.1','Eye and ear')
), seed AS (
  SELECT DISTINCT ON (p.payload->>'key') p.payload->>'key' AS key, p.payload->>'therapeuticClass' AS printed,
         substring(p.payload->>'therapeuticClass' from '^[0-9]+(?:\.[0-9]+)*') AS sec
    FROM public.cat_proposals p
   WHERE p.proposer_source = 'seed:emhslu' AND p.state = 'applied' AND p.payload->>'kind' = 'medicine'
   ORDER BY p.payload->>'key', p.created_at
), picked AS (
  SELECT s.key, s.printed,
         (SELECT m.cls FROM map m WHERE s.sec = m.prefix OR s.sec LIKE m.prefix || '.%'
           ORDER BY length(m.prefix) DESC LIMIT 1) AS cls,
         nullif(trim(regexp_replace(s.printed, '^[0-9.]+\s*', '')), '') AS grp
    FROM seed s
)
UPDATE public.cat_medicines c SET
  therapeutic_class = coalesce(c.therapeutic_class, p.cls),
  pharm_group = coalesce(c.pharm_group, CASE WHEN p.grp = upper(p.grp)
                  THEN upper(left(lower(p.grp), 1)) || substr(lower(p.grp), 2)
                  ELSE upper(left(p.grp, 1)) || substr(p.grp, 2) END),
  sources = CASE WHEN 'EMHSLU' = ANY (c.sources) THEN c.sources ELSE c.sources || 'EMHSLU'::text END
  FROM picked p
 WHERE c.key = p.key AND c.kind = 'medicine';
