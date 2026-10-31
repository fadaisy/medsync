/* Sample data and the stock ledger for the prototype. Every name, batch, quantity and time is a sample;
   directions are placeholders. Balances are never stored: they are summed from movements, as in MedSync. */
(function () {
  const P = (window.P = window.P || {});
  const MIN = 60000;
  const NOW0 = new Date(2026, 9, 29, 10, 24, 0).getTime(); // Thursday 29 Oct 2026, 10:24 (sample clock)
  const LOAD = Date.now();
  P.NOW0 = NOW0;
  P.now = () => NOW0 + (Date.now() - LOAD);
  P.THIS_MONTH = "2026-10";

  P.PLACES = [
    { id: "store", name: "Main store", short: "Main store", kind: "store" },
    { id: "opd", name: "OPD dispensary", short: "OPD", kind: "dispensary" },
    { id: "w3", name: "Ward 3 · Medical", short: "Ward 3", kind: "ward" },
    { id: "mat", name: "Maternity", short: "Maternity", kind: "ward" },
    { id: "peds", name: "Paediatrics", short: "Paediatrics", kind: "ward" },
    { id: "epi", name: "EPI clinic (immunisation)", short: "EPI clinic", kind: "clinic" },
  ];
  P.REAL = P.PLACES.map((p) => p.id);
  P.place = (id) => P.PLACES.find((p) => p.id === id);
  P.placeName = (id) => {
    if (!id) return "—";
    if (id === "supplier") return "Supplier";
    if (id === "patient") return "Patient";
    if (id.startsWith("transit:")) return "On the way to " + P.place(id.slice(8)).short;
    if (id.endsWith(":q")) return P.place(id.slice(0, -2)).short + " · quarantine";
    return (P.place(id) || {}).name || id;
  };

  // code/codeExp: what a scan of the NMS box's 2D barcode returns in this prototype. null = no barcode on the box.
  P.MEDS = [
    { id: "amox", name: "Amoxicillin capsules", unit: "caps", pack: 100, amc: 2600, shelf: { store: "A1", opd: "B2" }, code: "AX26014", codeExp: "2028-02" },
    { id: "pcm", name: "Paracetamol tablets", unit: "tabs", pack: 100, amc: 5200, shelf: { store: "A1", opd: "B1" }, code: "PC26020", codeExp: "2028-06" },
    { id: "metro", name: "Metronidazole tablets", unit: "tabs", pack: 100, amc: 1500, shelf: { store: "A2", opd: "B1" }, code: null },
    { id: "metf", name: "Metformin tablets", unit: "tabs", pack: 100, amc: 1800, shelf: { store: "A2", opd: "B1" }, code: "MF26031", codeExp: "2028-05" },
    { id: "ctx", name: "Cotrimoxazole tablets", unit: "tabs", pack: 100, amc: 2100, shelf: { store: "A3", opd: "B2" }, code: "CT26011", codeExp: "2028-01" },
    { id: "ferr", name: "Ferrous sulphate + folic acid tablets", unit: "tabs", pack: 100, amc: 1900, shelf: { store: "A3", opd: "C1" }, code: "FF26022", codeExp: "2028-04" },
    { id: "ors", name: "Oral rehydration salts", unit: "sachets", pack: 50, amc: 520, shelf: { store: "B1", opd: "C1" }, code: "OR26044", codeExp: "2028-04" },
    { id: "ceft", name: "Ceftriaxone injection", unit: "vials", pack: 10, amc: 160, shelf: { store: "B2" }, code: "CF26009", codeExp: "2027-11" },
    { id: "gent", name: "Gentamicin injection", unit: "ampoules", pack: 10, amc: 90, shelf: { store: "B2" }, code: "GN26015", codeExp: "2027-12" },
    { id: "oxy", name: "Oxytocin injection", unit: "ampoules", pack: 10, amc: 70, cold: true, shelf: { store: "Cold room" }, code: "OX26019", codeExp: "2027-08" },
    { id: "morph", name: "Morphine injection", unit: "ampoules", pack: 10, amc: 20, controlled: true, shelf: { store: "CD cupboard" }, code: "MO26003", codeExp: "2028-01" },
    { id: "ns", name: "Sodium chloride 0.9% infusion", unit: "bottles", pack: 20, amc: 400, shelf: { store: "C1" }, code: "NS26004", codeExp: "2028-03" },
    { id: "rl", name: "Ringer's lactate infusion", unit: "bottles", pack: 20, amc: 300, shelf: { store: "C1" }, code: "RL26007", codeExp: "2028-01" },
    { id: "amlo", name: "Amlodipine tablets", unit: "tabs", pack: 100, amc: 1200, shelf: { store: "A2", opd: "B2" }, code: "AM26012", codeExp: "2028-05" },
    { id: "mgso4", name: "Magnesium sulphate injection", unit: "ampoules", pack: 10, amc: 40, shelf: { store: "B2" }, code: "MG26006", codeExp: "2027-10" },
    { id: "bcg", name: "BCG vaccine", unit: "doses", pack: 20, amc: 400, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "BC26003", codeExp: "2027-12" },
    { id: "bopv", name: "bOPV (oral polio) vaccine", unit: "doses", pack: 20, amc: 1600, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "OP26008", codeExp: "2027-06" },
    { id: "ipv", name: "IPV (inactivated polio) vaccine", unit: "doses", pack: 5, amc: 400, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "IP26004", codeExp: "2027-09" },
    { id: "penta", name: "Pentavalent (DTP-HepB-Hib) vaccine", unit: "doses", pack: 10, amc: 1200, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "PE26010", codeExp: "2027-11" },
    { id: "pcv", name: "Pneumococcal conjugate vaccine (PCV)", unit: "doses", pack: 4, amc: 1200, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "PC26115", codeExp: "2027-10" },
    { id: "rota", name: "Rotavirus vaccine", unit: "doses", pack: 1, amc: 800, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "RO26006", codeExp: "2027-08" },
    { id: "mr", name: "Measles-rubella (MR) vaccine", unit: "doses", pack: 10, amc: 800, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "MR26002", codeExp: "2027-07" },
    { id: "hpv", name: "HPV vaccine", unit: "doses", pack: 1, amc: 200, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "HP26001", codeExp: "2028-01" },
    { id: "td", name: "Td (tetanus-diphtheria) vaccine", unit: "doses", pack: 10, amc: 600, cold: true, vaccine: true, shelf: { store: "Cold room" }, code: "TD26005", codeExp: "2027-12" },
    { id: "diaz", name: "Diazepam injection", unit: "ampoules", pack: 10, amc: 30, controlled: true, shelf: { store: "CD cupboard" }, code: "DZ26002", codeExp: "2027-12" },
    { id: "peth", name: "Pethidine injection", unit: "ampoules", pack: 10, amc: 25, controlled: true, shelf: { store: "CD cupboard" }, code: "PT26004", codeExp: "2028-02" },
    { id: "omor", name: "Morphine oral solution 1 mg/mL", unit: "mL", pack: 500, amc: 3000, controlled: true, shelf: { store: "CD cupboard", opd: "CD box" }, code: "OM26010", codeExp: "2027-09" },
  ];
  /* Therapeutic classes, in the order the list shows them. */
  P.CLASSES = ["Antibiotics", "Analgesics", "Fluids & electrolytes", "Antihypertensives", "Anticonvulsants", "Antidiabetics", "Haematinics", "Obstetric (uterotonics)", "Vaccines"];
  const CAT = { amox: "Antibiotics", metro: "Antibiotics", ctx: "Antibiotics", ceft: "Antibiotics", gent: "Antibiotics", pcm: "Analgesics", morph: "Analgesics", peth: "Analgesics", omor: "Analgesics",
    ors: "Fluids & electrolytes", ns: "Fluids & electrolytes", rl: "Fluids & electrolytes", amlo: "Antihypertensives", mgso4: "Anticonvulsants", diaz: "Anticonvulsants",
    metf: "Antidiabetics", ferr: "Haematinics", oxy: "Obstetric (uterotonics)",
    bcg: "Vaccines", bopv: "Vaccines", ipv: "Vaccines", penta: "Vaccines", pcv: "Vaccines", rota: "Vaccines", mr: "Vaccines", hpv: "Vaccines", td: "Vaccines" };
  P.MEDS.forEach((m) => { m.cat = CAT[m.id] || "Other"; });
  /* Clinical reference per medicine: formulation, route, dosage, pharmacokinetics, brands.
     Standard reference values for the prototype; the real product takes these from the signed formulary (UCG / product leaflet). */
  const GENERIC = "Generic";
  const INFO = {
    amox: { strength: "500 mg capsule", form: "Oral capsule", routes: ["Oral"], iv: false, ivNote: "Oral only. There is no IV form of this product.",
      short: "500 mg–1 g every 8 h", dose: { adult: "500 mg–1 g every 8 hours", child: "25 mg/kg every 12 hours; 40 mg/kg every 12 hours for pneumonia", note: "Usual course 5 days. Reduce frequency if eGFR is under 30." },
      pk: { abs: "Well absorbed orally (about 75–90%); food has little effect", peak: "1–2 h", half: "1–1.5 h", metab: "Minimal", excr: "Kidneys, mostly unchanged" },
      brands: [GENERIC, "Amoxil"] },
    pcm: { strength: "500 mg tablet", form: "Oral tablet", routes: ["Oral"], iv: false, ivNote: "Oral only. IV paracetamol is a different product and is not stocked here.",
      short: "0.5–1 g every 4–6 h, max 4 g/day", dose: { adult: "0.5–1 g every 4–6 hours; maximum 4 g in 24 hours", child: "10–15 mg/kg every 6 hours; maximum 4 doses in 24 hours", note: "Use a lower maximum (2–3 g a day) in liver disease, regular alcohol use or low body weight." },
      pk: { abs: "Rapid; about 60–90% bioavailable", peak: "30–60 min", half: "2–3 h (longer in overdose or liver disease)", metab: "Liver: glucuronide and sulphate conjugation; a small fraction via CYP2E1 to NAPQI", excr: "Kidneys, as conjugates" },
      brands: [GENERIC, "Panadol"] },
    metro: { strength: "200 mg tablet", form: "Oral tablet", routes: ["Oral"], iv: false, ivNote: "Oral only. IV metronidazole (5 mg/mL infusion) is a separate product.",
      short: "400–500 mg every 8 h", dose: { adult: "400–500 mg every 8 hours", child: "7.5 mg/kg every 8 hours", note: "No alcohol during the course and for 48 hours after." },
      pk: { abs: "Over 90% bioavailable", peak: "1–2 h", half: "About 8 h", metab: "Liver (oxidation; active hydroxy metabolite)", excr: "Mainly urine (may turn it dark), some faeces" },
      brands: [GENERIC, "Flagyl"] },
    metf: { strength: "500 mg tablet", form: "Oral tablet", routes: ["Oral"], iv: false, ivNote: "Oral only.",
      short: "500 mg 1–2× daily, max 2 g/day", dose: { adult: "500 mg once or twice daily with meals, increased slowly; usual maximum 2 g a day", child: "Not for routine use: specialist only, from 10 years", note: "Avoid if eGFR is under 30; review the dose if 30–45. Withhold around iodinated contrast." },
      pk: { abs: "50–60% bioavailable; food slows absorption", peak: "2–3 h", half: "4–6 h (plasma)", metab: "Not metabolised", excr: "Kidneys, unchanged (tubular secretion)" },
      brands: [GENERIC, "Glucophage"] },
    ctx: { strength: "480 mg tablet (sulfamethoxazole 400 mg + trimethoprim 80 mg)", form: "Oral tablet", routes: ["Oral"], iv: false, ivNote: "Oral only.",
      short: "960 mg every 12 h", dose: { adult: "Treatment: 960 mg every 12 hours. HIV prophylaxis: 960 mg once daily", child: "Treatment: 24 mg/kg (combined) every 12 hours. Prophylaxis: by weight band", note: "Not under 6 weeks of age. Stop if a rash appears." },
      pk: { abs: "Near complete (90–100%)", peak: "1–4 h", half: "About 10 h (both components)", metab: "Liver: sulfamethoxazole acetylated, trimethoprim partly oxidised", excr: "Kidneys" },
      brands: [GENERIC, "Septrin", "Bactrim"] },
    ferr: { strength: "Ferrous sulphate 200 mg (about 60 mg iron) + folic acid 400 µg", form: "Oral tablet", routes: ["Oral"], iv: false, ivNote: "Oral only. IV iron is a different product.",
      short: "1 tab daily (prophylaxis)", dose: { adult: "Pregnancy prophylaxis: 1 tablet daily. Treating anaemia: 1 tablet 2–3 times daily", child: "Use a paediatric iron preparation: 3–6 mg/kg/day of elemental iron", note: "Best taken away from food, antacids and tetracyclines. Stools turn black." },
      pk: { abs: "10–35% of the iron absorbed in the duodenum; more when iron-deficient", peak: "2–4 h", half: "Not meaningful: iron is stored as ferritin", metab: "Built into haemoglobin and iron stores", excr: "Very little; lost in shed cells and bleeding" },
      brands: [GENERIC] },
    ors: { strength: "Low-osmolarity sachet, makes 1 litre", form: "Powder for oral solution", routes: ["Oral"], iv: false, ivNote: "Oral (or nasogastric). For severe dehydration use IV fluids instead.",
      short: "200–400 mL per loose stool", dose: { adult: "As much as wanted; about 200–400 mL after each loose stool", child: "Under 2 y: 50–100 mL, 2–10 y: 100–200 mL after each loose stool. Some dehydration: 75 mL/kg over 4 hours", note: "Give zinc with it for children. Throw away mixed solution after 24 hours." },
      pk: { abs: "Glucose-coupled sodium absorption in the small intestine", peak: "Rehydrates over about 4 h", half: "Not applicable", metab: "Not applicable", excr: "Kidneys" },
      brands: [GENERIC] },
    ceft: { strength: "1 g powder vial", form: "Powder for injection", routes: ["IV", "IM"], iv: true, ivNote: "IV: reconstitute 1 g in 10 mL water for injection; inject over at least 5 minutes, or infuse in 50–100 mL over 30 minutes. IM: reconstitute with 1% lidocaine, and never give that solution IV. Don't mix with calcium-containing fluids such as Ringer's lactate.",
      short: "1–2 g once daily", dose: { adult: "1–2 g once daily; meningitis 2 g every 12 hours", child: "50–80 mg/kg once daily; meningitis 100 mg/kg a day (maximum 4 g)", note: "Neonates: avoid if jaundiced or on IV calcium." },
      pk: { abs: "IM close to 100% bioavailable", peak: "IV: end of infusion; IM: 2–3 h", half: "6–9 h (once-daily dosing)", metab: "Not significantly metabolised", excr: "About a third to two thirds by the kidneys, the rest in bile" },
      brands: [GENERIC, "Rocephin"] },
    gent: { strength: "40 mg/mL, 2 mL ampoule (80 mg)", form: "Solution for injection", routes: ["IV", "IM"], iv: true, ivNote: "IV: slow injection over 3–5 minutes, or infuse in 50–100 mL over 20–30 minutes. The same ampoule can be given IM.",
      short: "5–7 mg/kg once daily", dose: { adult: "5–7 mg/kg once daily (ideal body weight if obese)", child: "7.5 mg/kg once daily. Neonates in the first week: 5 mg/kg (3 mg/kg if low birth weight)", note: "Narrow therapeutic range: check renal function. Ototoxic and nephrotoxic. Lengthen the interval in renal impairment." },
      pk: { abs: "Not absorbed orally; IM complete", peak: "IM 30–60 min; IV end of infusion", half: "2–3 h (longer in renal impairment and in neonates)", metab: "Not metabolised", excr: "Kidneys, unchanged (glomerular filtration)" },
      brands: [GENERIC, "Cidomycin"] },
    oxy: { strength: "10 IU/mL, 1 mL ampoule", form: "Solution for injection", routes: ["IM", "IV"], iv: true, ivNote: "IV: as an infusion in 0.9% saline or Ringer's lactate, or slow IV for the third stage. Never a rapid IV bolus (hypotension).",
      short: "10 IU IM after birth", dose: { adult: "PPH prevention: 10 IU IM (or slow IV) after the baby is born. PPH treatment: 20–40 IU in 1 L by IV infusion. Induction: low-dose IV infusion, titrated per protocol", child: "Not used", note: "Cold chain 2–8 °C. Monitor contractions and the fetal heart during an infusion." },
      pk: { abs: "IM: onset 3–7 min", peak: "IV: onset about 1 min", half: "3–5 min", metab: "Liver and kidney (oxytocinase in pregnancy)", excr: "Kidneys, little unchanged" },
      brands: [GENERIC, "Syntocinon"] },
    morph: { strength: "10 mg/mL, 1 mL ampoule", form: "Solution for injection", routes: ["IV", "IM", "SC"], iv: true, ivNote: "IV: dilute to 1 mg/mL and give slowly (about 1–2 mg a minute), titrating to pain. Keep naloxone at hand.",
      short: "IV 2.5–5 mg, titrate", dose: { adult: "IV 2.5–5 mg titrated, repeat every 4 hours as needed; IM/SC 5–10 mg every 4 hours", child: "IV 50–100 µg/kg every 4 hours; IM/SC 100–200 µg/kg every 4 hours", note: "Lower doses in the elderly and in renal or liver impairment. Watch respiratory rate and sedation." },
      pk: { abs: "IM/SC well absorbed", peak: "IV: onset about 5 min, peak about 20 min; IM peak 30–60 min", half: "2–3 h", metab: "Liver glucuronidation to M3G and active M6G", excr: "Kidneys (metabolites build up in renal failure)" },
      brands: [GENERIC] },
    peth: { strength: "50 mg/mL, 2 mL ampoule (100 mg)", form: "Solution for injection", routes: ["IM", "IV", "SC"], iv: true, ivNote: "IV: dilute and give slowly, 25–50 mg over several minutes. IM is the usual route in labour. Keep naloxone at hand for mother and baby.",
      short: "IM 50–100 mg 4-hourly", dose: { adult: "IM/SC 50–100 mg every 4 hours as needed; IV 25–50 mg slowly. Labour: 50–100 mg IM, repeat after 1–3 hours if needed, no more than 400 mg in 24 hours", child: "IM 0.5–2 mg/kg every 4 hours as needed", note: "Short-term use only: its metabolite norpethidine builds up and can cause fits, especially in renal impairment. Not for chronic pain." },
      pk: { abs: "IM well absorbed, onset 10–15 min", peak: "IM 30–60 min; IV about 5 min", half: "3–5 h (norpethidine 15–30 h)", metab: "Liver, to active norpethidine", excr: "Kidneys" },
      brands: [GENERIC] },
    omor: { strength: "1 mg/mL (5 mg in 5 mL), 500 mL bottle", form: "Oral solution", routes: ["Oral"], iv: false, ivNote: "",
      short: "2.5–5 mg every 4 h, titrate", dose: { adult: "Start 2.5–5 mg every 4 hours by the clock, with the same dose as needed for breakthrough pain; a double dose at bedtime can replace the night dose. Titrate daily to pain", child: "0.1–0.2 mg/kg every 4 hours, titrated (palliative care protocol)", note: "Always prescribe a laxative with it. Lower doses and longer intervals in renal impairment and the frail elderly. Measure with a syringe, not a spoon." },
      pk: { abs: "Oral bioavailability 20–40% (first-pass metabolism)", peak: "About 1 h; onset 20–30 min", half: "2–3 h", metab: "Liver glucuronidation to M3G and active M6G", excr: "Kidneys (metabolites build up in renal failure)" },
      brands: [GENERIC] },
    ns: { strength: "500 mL bottle", form: "Solution for IV infusion", routes: ["IV"], iv: true, ivNote: "IV infusion only. Check the bottle is intact and the fluid clear; set the rate from the fluid plan.",
      short: "per fluid plan", dose: { adult: "Shock: 500 mL–1 L bolus, then reassess. Maintenance and replacement per fluid plan", child: "Shock: 10–20 mL/kg bolus, then reassess. Severe acute malnutrition: follow its own fluid protocol", note: "Watch for fluid overload; large volumes cause hyperchloraemic acidosis." },
      pk: { abs: "IV: 100%", peak: "Immediate", half: "Not applicable: spreads through extracellular fluid within about 30 min", metab: "Not metabolised", excr: "Kidneys" },
      brands: [GENERIC] },
    rl: { strength: "500 mL bottle (Na 131, K 5, Ca 2, lactate 29 mmol/L)", form: "Solution for IV infusion", routes: ["IV"], iv: true, ivNote: "IV infusion only. Never in the same line as ceftriaxone (calcium precipitates) or with blood.",
      short: "per fluid plan", dose: { adult: "Shock: 500 mL–1 L bolus, then reassess. Replacement per fluid plan", child: "Shock: 10–20 mL/kg bolus, then reassess. Severe acute malnutrition: follow its own fluid protocol", note: "Contains potassium and calcium; balanced, so less acidosis than saline." },
      pk: { abs: "IV: 100%", peak: "Immediate", half: "Not applicable: spreads through extracellular fluid within about 30 min", metab: "Lactate is converted to bicarbonate in the liver", excr: "Kidneys" },
      brands: [GENERIC] },
    amlo: { strength: "5 mg tablet", form: "Oral tablet", routes: ["Oral"], iv: false, ivNote: "Oral only.",
      short: "5–10 mg once daily", dose: { adult: "5 mg once daily, increased to 10 mg if needed", child: "Specialist only: from 0.1 mg/kg once daily (maximum 10 mg)", note: "Full effect takes 1–2 weeks." },
      pk: { abs: "64–90% bioavailable", peak: "6–12 h", half: "30–50 h (once daily)", metab: "Liver (CYP3A4)", excr: "Urine, as metabolites" },
      brands: [GENERIC, "Norvasc"] },
    mgso4: { strength: "50% w/v, 10 mL ampoule (5 g)", form: "Solution for injection", routes: ["IV", "IM"], iv: true, ivNote: "IV: dilute the 4 g loading dose to 20% and give over 5–10 minutes; never a fast undiluted push. IM: 5 g of 50% deep into each buttock, with 1 mL of 2% lidocaine.",
      short: "4 g IV loading (eclampsia)", dose: { adult: "Severe pre-eclampsia / eclampsia: 4 g IV over 5–10 min plus 10 g IM (5 g each buttock), then 5 g IM every 4 hours for 24 hours", child: "Specialist only (e.g. acute severe asthma 40–50 mg/kg IV over 20 min)", note: "Antidote: calcium gluconate 10%, 10 mL IV over 10 minutes." },
      pk: { abs: "IM well absorbed", peak: "IV: immediate; IM: about 1 h", half: "About 4 h with normal kidneys", metab: "Not metabolised", excr: "Kidneys" },
      brands: [GENERIC] },
    diaz: { strength: "5 mg/mL, 2 mL ampoule (10 mg)", form: "Solution for injection", routes: ["IV", "Rectal"], iv: true, ivNote: "IV: slowly, about 5 mg (1 mL) a minute into a large vein, with airway support ready. Rectal: the injection solution can be given rectally (syringe without needle). Avoid IM: absorption is erratic.",
      short: "10 mg IV slowly", dose: { adult: "Status epilepticus: 10 mg IV slowly; repeat once after 10 minutes if needed", child: "0.3 mg/kg IV slowly or 0.5 mg/kg rectally (maximum 10 mg); repeat once after 10 minutes", note: "Two doses at most. If seizures continue, move to phenobarbital or phenytoin." },
      pk: { abs: "Rectal: rapid, about 90%; IM erratic", peak: "IV: 1–3 min; rectal: about 10 min", half: "20–50 h (active metabolite up to 100 h)", metab: "Liver (CYP3A4, CYP2C19) to active desmethyldiazepam", excr: "Kidneys" },
      brands: [GENERIC, "Valium"] },
    bcg: { strength: "0.05 mL per infant dose · 20-dose vial with diluent", form: "Freeze-dried powder + diluent", routes: ["Intradermal"], iv: false, ivNote: "Intradermal only, upper arm. Reconstitute with the diluent from the same manufacturer, kept as cold as the vaccine.",
      short: "At birth", dose: { adult: "Not routinely given to adults", child: "0.05 mL intradermal at birth (or first contact before 1 year)", note: "A small papule, then ulcer, then scar over 2–3 months is normal: no dressing or ointment." },
      pk: { abs: "Not applicable (vaccine)", peak: "Immunity develops over 6–12 weeks", half: "Not applicable", metab: "Not applicable", excr: "Not applicable" }, brands: ["Generic"],
      vac: { type: "Live attenuated bacterial (M. bovis BCG)", schedule: [["Birth", "1 dose"]], vial: "20 doses", open: "Discard 6 hours after reconstitution or at the end of the session, whichever comes first", freeze: false, light: true } },
    bopv: { strength: "2 drops per dose · 20-dose vial", form: "Oral drops", routes: ["Oral"], iv: false, ivNote: "Oral drops only: 2 drops on the tongue.",
      short: "Birth, 6, 10, 14 wk", dose: { adult: "Not routinely given to adults", child: "2 drops by mouth: OPV0 at birth, OPV1–3 at 6, 10 and 14 weeks", note: "If the child spits it out straight away, give the dose again." },
      pk: { abs: "Not applicable (vaccine)", peak: "Gut and serum immunity after the series", half: "Not applicable", metab: "Not applicable", excr: "Vaccine virus shed in stool for a few weeks" }, brands: ["Generic"],
      vac: { type: "Live attenuated virus (polio types 1 and 3)", schedule: [["Birth", "OPV0"], ["6 weeks", "OPV1"], ["10 weeks", "OPV2"], ["14 weeks", "OPV3"]], vial: "20 doses", open: "Opened vial can be kept up to 28 days if the multi-dose vial policy conditions are met (VVM, expiry, kept cold, no contamination)", freeze: false, light: false } },
    ipv: { strength: "0.5 mL per dose · 5-dose vial", form: "Suspension for injection", routes: ["IM"], iv: false, ivNote: "Intramuscular, anterolateral thigh. Never IV.",
      short: "14 weeks", dose: { adult: "Not routinely given to adults", child: "0.5 mL IM at 14 weeks, with OPV3 (further doses per the current UNEPI schedule)", note: "Can be given at the same visit as other vaccines, at a different site." },
      pk: { abs: "Not applicable (vaccine)", peak: "Antibodies in 2–4 weeks", half: "Not applicable", metab: "Not applicable", excr: "Not applicable" }, brands: ["Generic"],
      vac: { type: "Inactivated virus (polio types 1, 2, 3)", schedule: [["14 weeks", "IPV"]], vial: "5 doses", open: "Opened vial can be kept up to 28 days under the multi-dose vial policy", freeze: true, light: false } },
    penta: { strength: "0.5 mL per dose · 10-dose vial", form: "Liquid for injection", routes: ["IM"], iv: false, ivNote: "Intramuscular, anterolateral thigh. Never IV.",
      short: "6, 10, 14 wk", dose: { adult: "Not used in adults", child: "0.5 mL IM at 6, 10 and 14 weeks", note: "At least 4 weeks between doses. Shake test if freezing is suspected." },
      pk: { abs: "Not applicable (vaccine)", peak: "Antibodies after the 3-dose series", half: "Not applicable", metab: "Not applicable", excr: "Not applicable" }, brands: ["Generic"],
      vac: { type: "Inactivated / toxoid / subunit combination", schedule: [["6 weeks", "Penta 1"], ["10 weeks", "Penta 2"], ["14 weeks", "Penta 3"]], vial: "10 doses", open: "Opened vial can be kept up to 28 days under the multi-dose vial policy", freeze: true, light: false } },
    pcv: { strength: "0.5 mL per dose · 4-dose vial", form: "Suspension for injection", routes: ["IM"], iv: false, ivNote: "Intramuscular, anterolateral thigh (opposite leg to pentavalent). Never IV.",
      short: "6, 10, 14 wk", dose: { adult: "Not routinely given to adults", child: "0.5 mL IM at 6, 10 and 14 weeks", note: "Give in the other thigh from pentavalent at the same visit." },
      pk: { abs: "Not applicable (vaccine)", peak: "Antibodies after the 3-dose series", half: "Not applicable", metab: "Not applicable", excr: "Not applicable" }, brands: ["Generic", "Synflorix"],
      vac: { type: "Conjugate (pneumococcal polysaccharide on carrier protein)", schedule: [["6 weeks", "PCV1"], ["10 weeks", "PCV2"], ["14 weeks", "PCV3"]], vial: "4 doses", open: "Follow the label: the multi-dose vial policy applies only where the product allows it", freeze: true, light: false } },
    rota: { strength: "1.5 mL oral dose · single-dose tube", form: "Oral suspension", routes: ["Oral"], iv: false, ivNote: "Oral only: squeeze the whole tube slowly into the side of the mouth. Never inject.",
      short: "6, 10 wk", dose: { adult: "Not used in adults", child: "1.5 mL by mouth at 6 and 10 weeks", note: "Give early: the course should be completed in infancy. Don't repeat if the child spits or vomits." },
      pk: { abs: "Not applicable (vaccine)", peak: "Gut immunity after the series", half: "Not applicable", metab: "Not applicable", excr: "Vaccine virus shed in stool" }, brands: ["Generic", "Rotarix"],
      vac: { type: "Live attenuated virus (oral)", schedule: [["6 weeks", "Rota 1"], ["10 weeks", "Rota 2"]], vial: "1 dose", open: "Single dose: use once", freeze: true, light: false } },
    mr: { strength: "0.5 mL per dose · 10-dose vial with diluent", form: "Freeze-dried powder + diluent", routes: ["SC"], iv: false, ivNote: "Subcutaneous, upper arm. Reconstitute only with the matching diluent, kept cold.",
      short: "9 and 18 months", dose: { adult: "Catch-up campaigns only", child: "0.5 mL SC at 9 months and 18 months", note: "Fever and rash 7–12 days later are expected and mild." },
      pk: { abs: "Not applicable (vaccine)", peak: "Immunity in about 2 weeks", half: "Not applicable", metab: "Not applicable", excr: "Not applicable" }, brands: ["Generic"],
      vac: { type: "Live attenuated virus (measles + rubella)", schedule: [["9 months", "MR1"], ["18 months", "MR2"]], vial: "10 doses", open: "Discard 6 hours after reconstitution or at the end of the session, whichever comes first", freeze: false, light: true } },
    hpv: { strength: "0.5 mL per dose · single-dose vial", form: "Suspension for injection", routes: ["IM"], iv: false, ivNote: "Intramuscular, deltoid. Never IV. Have the girl sit for 15 minutes after (fainting).",
      short: "Girls at 10 years", dose: { adult: "Not in the routine programme", child: "0.5 mL IM for girls aged 10 (number of doses per the current UNEPI schedule)", note: "Observe seated for 15 minutes: fainting is common in adolescents." },
      pk: { abs: "Not applicable (vaccine)", peak: "Antibodies in about 1 month", half: "Not applicable", metab: "Not applicable", excr: "Not applicable" }, brands: ["Generic", "Gardasil"],
      vac: { type: "Recombinant virus-like particles", schedule: [["10 years (girls)", "HPV"]], vial: "1 dose", open: "Single dose: use once", freeze: true, light: false } },
    td: { strength: "0.5 mL per dose · 10-dose vial", form: "Suspension for injection", routes: ["IM"], iv: false, ivNote: "Intramuscular, upper arm (deltoid). Never IV.",
      short: "Pregnancy: Td1–Td5", dose: { adult: "Pregnant women and women of childbearing age: Td1 at first contact, Td2 4 weeks later, Td3 6 months later, Td4 and Td5 a year apart", child: "School-age boosters per the UNEPI schedule", note: "Two doses at least 2 weeks before delivery protect the newborn from neonatal tetanus." },
      pk: { abs: "Not applicable (vaccine)", peak: "Protective antitoxin about 2 weeks after Td2", half: "Not applicable", metab: "Not applicable", excr: "Not applicable" }, brands: ["Generic"],
      vac: { type: "Toxoid (tetanus + reduced diphtheria)", schedule: [["First contact", "Td1"], ["+4 weeks", "Td2"], ["+6 months", "Td3"], ["+1 year", "Td4"], ["+1 year", "Td5"]], vial: "10 doses", open: "Opened vial can be kept up to 28 days under the multi-dose vial policy", freeze: true, light: false } },
  };
  P.MEDS.forEach((m) => Object.assign(m, INFO[m.id]));
  P.GENERIC = GENERIC;
  /* Pharmacodynamics, adverse reactions, interactions and other considerations. Standard reference values, for the prototype. */
  const CLIN = {
    amox: { pd: { cls: "Aminopenicillin (β-lactam antibiotic)", mech: "Binds penicillin-binding proteins and blocks peptidoglycan cross-linking in the bacterial cell wall, so the cell lyses", effect: "Bactericidal, time-dependent killing (time above MIC matters). Broken down by β-lactamase" },
      adr: { common: "Diarrhoea, nausea, rash (very common in glandular fever)", serious: "Anaphylaxis, Stevens–Johnson syndrome, C. difficile colitis" },
      ix: [["Methotrexate", "Less is cleared; toxicity"], ["Warfarin", "INR may rise"], ["Allopurinol", "More rash"]],
      ci: "Penicillin allergy. Caution in renal impairment and glandular fever", preg: "Safe in pregnancy and breastfeeding", monitor: "Ask about penicillin allergy before every first dose" },
    pcm: { pd: { cls: "Non-opioid analgesic and antipyretic", mech: "Central COX inhibition (weak in peripheral tissue) and serotonergic pathways; resets the hypothalamic temperature set-point", effect: "Relieves pain and fever; little anti-inflammatory action; no effect on platelets or the stomach lining" },
      adr: { common: "Rare at normal doses", serious: "Liver failure in overdose (NAPQI); rare severe skin reactions; thrombocytopenia (rare)" },
      ix: [["Warfarin", "INR rises with regular use"], ["Carbamazepine, phenytoin, rifampicin, isoniazid", "More liver toxicity"], ["Alcohol", "More liver toxicity"]],
      ci: "Severe liver disease. Caution with chronic alcohol use, malnutrition, low body weight", preg: "Analgesic of choice in pregnancy and breastfeeding", monitor: "Total daily dose from all products, including combinations. Overdose: N-acetylcysteine" },
    metro: { pd: { cls: "Nitroimidazole antimicrobial", mech: "Reduced inside anaerobes and protozoa to reactive intermediates that break their DNA", effect: "Bactericidal against anaerobes, concentration-dependent; active against amoeba, Giardia and Trichomonas" },
      adr: { common: "Metallic taste, nausea, dark urine", serious: "Peripheral neuropathy (long courses), seizures, encephalopathy (rare)" },
      ix: [["Alcohol", "Disulfiram-like reaction: flushing, vomiting"], ["Warfarin", "INR rises markedly"], ["Lithium", "Lithium toxicity"], ["Phenytoin", "Phenytoin levels rise"]],
      ci: "Allergy to nitroimidazoles. Reduce the dose in severe liver disease", preg: "Use when clearly needed; avoid high-dose (2 g) single doses in pregnancy and breastfeeding", monitor: "Numbness or tingling on courses over 10 days" },
    metf: { pd: { cls: "Biguanide (oral antidiabetic)", mech: "Reduces glucose output from the liver (AMPK activation), improves insulin sensitivity, reduces gut glucose absorption", effect: "Lowers fasting and after-meal glucose; does not cause hypoglycaemia on its own; weight neutral" },
      adr: { common: "Nausea, diarrhoea, abdominal discomfort, metallic taste", serious: "Lactic acidosis (rare: renal failure, hypoxia, sepsis); vitamin B12 deficiency with long use" },
      ix: [["Dolutegravir (TLD)", "Metformin levels rise: keep to 1 g a day"], ["Iodinated contrast", "Withhold: risk of lactic acidosis"], ["Alcohol", "Lactic acidosis"], ["Steroids, thiazides", "Raise glucose"]],
      ci: "eGFR under 30, acute illness with dehydration, hypoxia or sepsis, severe liver disease, heavy alcohol use", preg: "Can be used in pregnancy under specialist advice; compatible with breastfeeding", monitor: "Renal function at least yearly, glucose or HbA1c, B12 if neuropathy or anaemia" },
    ctx: { pd: { cls: "Sulfonamide + dihydrofolate reductase inhibitor", mech: "Blocks two steps of bacterial folate synthesis: sulfamethoxazole inhibits dihydropteroate synthase, trimethoprim inhibits dihydrofolate reductase", effect: "Bactericidal together; also covers Pneumocystis, Toxoplasma and Isospora" },
      adr: { common: "Rash, nausea, vomiting", serious: "Stevens–Johnson syndrome/TEN, bone marrow suppression, hyperkalaemia, haemolysis in G6PD deficiency" },
      ix: [["Warfarin", "INR rises"], ["Methotrexate", "Bone marrow toxicity"], ["ACE inhibitors, spironolactone", "Hyperkalaemia"], ["Sulfonylureas", "Hypoglycaemia"], ["Phenytoin", "Phenytoin levels rise"]],
      ci: "Sulfonamide allergy, severe liver or renal disease, infants under 6 weeks. Caution in G6PD deficiency", preg: "Continue HIV prophylaxis in pregnancy per national guidelines. Breastfeeding: avoid if the baby is jaundiced, premature or G6PD-deficient", monitor: "Stop at the first rash. Full blood count and potassium on long or high-dose use" },
    ferr: { pd: { cls: "Haematinic (iron and folate)", mech: "Iron is built into haemoglobin, myoglobin and enzymes; folic acid supports DNA synthesis in red cell production", effect: "Reticulocytes rise in 5–10 days; haemoglobin about 2 g/dL in 3–4 weeks. Continue 3 months after it is normal to refill stores" },
      adr: { common: "Nausea, epigastric pain, constipation or diarrhoea, black stools", serious: "Iron poisoning in children who swallow tablets by accident" },
      ix: [["Antacids, calcium, tea, milk", "Less iron absorbed"], ["Tetracyclines, ciprofloxacin", "Less antibiotic absorbed: separate by 2 h"], ["Levothyroxine", "Less absorbed: separate by 4 h"]],
      ci: "Haemochromatosis, haemolytic anaemia, repeated transfusions. Not for anaemia that isn't from iron deficiency", preg: "Recommended in pregnancy and breastfeeding", monitor: "Haemoglobin after 3–4 weeks. Keep out of children's reach" },
    ors: { pd: { cls: "Oral rehydration therapy", mech: "Sodium–glucose co-transport (SGLT1) in the small intestine carries water with it, even during secretory diarrhoea", effect: "Corrects and prevents dehydration; does not shorten diarrhoea (zinc does)" },
      adr: { common: "Vomiting if given too fast: give small, frequent sips", serious: "Hypernatraemia if mixed too strong" },
      ix: [],
      ci: "Severe dehydration or shock (IV fluids first), paralytic ileus, persistent vomiting, unable to drink", preg: "Safe", monitor: "Dehydration signs and urine output. Mix with the right volume of clean water" },
    ceft: { pd: { cls: "Third-generation cephalosporin", mech: "Binds penicillin-binding proteins and blocks cell-wall synthesis; stable to many β-lactamases", effect: "Bactericidal, time-dependent; broad Gram-negative cover and good CSF penetration" },
      adr: { common: "Diarrhoea, pain at the injection site, rash, raised liver enzymes", serious: "Anaphylaxis, C. difficile colitis, biliary sludge, immune haemolytic anaemia (rare), calcium–ceftriaxone precipitates in neonates" },
      ix: [["IV calcium (incl. Ringer's lactate)", "Precipitates: never together in neonates; flush lines in others"], ["Warfarin", "INR may rise"]],
      ci: "Cephalosporin allergy or anaphylaxis to penicillin. Neonates who are jaundiced or on IV calcium", preg: "Considered safe in pregnancy and breastfeeding", monitor: "Allergy history; liver function on long courses" },
    gent: { pd: { cls: "Aminoglycoside", mech: "Binds the 30S ribosomal subunit so bacteria misread mRNA and make faulty proteins", effect: "Rapidly bactericidal, concentration-dependent, with a post-antibiotic effect (why once daily works); Gram-negative aerobes; synergy with β-lactams" },
      adr: { common: "Usually none at short courses", serious: "Ototoxicity: hearing and balance, can be permanent. Nephrotoxicity (usually reversible). Neuromuscular blockade" },
      ix: [["Furosemide", "More ototoxicity"], ["Vancomycin, amphotericin, cisplatin", "More nephrotoxicity"], ["Neuromuscular blockers", "Prolonged paralysis"]],
      ci: "Myasthenia gravis. Caution in renal impairment, existing hearing loss, the elderly", preg: "Avoid in pregnancy unless essential (fetal ototoxicity); compatible with breastfeeding", monitor: "Creatinine, and a trough level if over 48 h or renal impairment; hearing and balance" },
    oxy: { pd: { cls: "Uterotonic (posterior pituitary hormone)", mech: "Activates oxytocin receptors on the myometrium, raising intracellular calcium; also causes milk ejection", effect: "Rhythmic contractions at low doses, sustained contraction at high doses; more receptors near term" },
      adr: { common: "Nausea, vomiting", serious: "Uterine hyperstimulation (fetal distress, rupture), water intoxication and hyponatraemia with long infusions, hypotension and tachycardia after a rapid IV bolus" },
      ix: [["Misoprostol, dinoprostone", "Stronger effect: don't start together"], ["Halothane and other inhalational anaesthetics", "Weaker effect, arrhythmias"], ["Vasopressors", "Severe hypertension"]],
      ci: "For induction or augmentation: obstructed labour, fetal distress, malpresentation, placenta praevia, previous classical caesarean", preg: "Used at term and after birth only; compatible with breastfeeding", monitor: "Contractions, fetal heart, blood pressure and fluid balance during an infusion" },
    morph: { pd: { cls: "Opioid agonist (μ receptor)", mech: "Activates μ-opioid receptors in the brain and spinal cord, reducing pain transmission and perception", effect: "Analgesia, sedation, euphoria, respiratory depression, small pupils, slow gut" },
      adr: { common: "Nausea, vomiting, constipation, drowsiness, itching, urinary retention", serious: "Respiratory depression, hypotension, dependence" },
      ix: [["Benzodiazepines, phenobarbital, alcohol", "Deep sedation and respiratory depression"], ["Other opioids", "Additive effect"], ["MAO inhibitors", "Severe reactions"]],
      ci: "Acute respiratory depression, paralytic ileus. Caution in head injury, asthma, renal or liver impairment, the elderly", preg: "Use when needed; can depress the newborn's breathing if given near delivery. Breastfeeding: single doses are fine, watch the baby for sedation", monitor: "Respiratory rate, sedation and blood pressure. Antidote: naloxone 0.4 mg IV, repeat as needed" },
    peth: { pd: { cls: "Opioid agonist (μ receptor), synthetic", mech: "Activates μ-opioid receptors; shorter acting than morphine", effect: "Analgesia, sedation, respiratory depression; less smooth-muscle spasm than morphine" },
      adr: { common: "Nausea, vomiting, dizziness, sweating, drowsiness", serious: "Respiratory depression (also in the newborn when given 1–4 h before birth), fits from norpethidine, serotonin toxicity with MAO inhibitors" },
      ix: [["MAO inhibitors (and within 14 days of stopping)", "Serotonin toxicity, can be fatal: do not give"], ["Benzodiazepines, phenobarbital, alcohol", "Deep sedation and respiratory depression"], ["Other opioids", "Additive effect"]],
      ci: "Severe renal impairment, MAO inhibitors, acute respiratory depression. Avoid repeated doses", preg: "Used in labour. Neonatal breathing is most affected when given 1–4 hours before birth: have naloxone ready for the baby", monitor: "Respiratory rate, sedation, blood pressure; the newborn's breathing after delivery. Antidote: naloxone" },
    omor: { pd: { cls: "Opioid agonist (μ receptor)", mech: "Activates μ-opioid receptors in the brain and spinal cord, reducing pain transmission and perception", effect: "Analgesia, relief of breathlessness in palliative care, sedation, slow gut" },
      adr: { common: "Constipation (nearly everyone), nausea in the first days, drowsiness, dry mouth", serious: "Respiratory depression (rare with careful titration), confusion or myoclonus when metabolites build up" },
      ix: [["Benzodiazepines, phenobarbital, alcohol", "Deep sedation and respiratory depression"], ["Other opioids", "Additive effect"], ["Metoclopramide", "Fine together: often used for the nausea"]],
      ci: "Acute respiratory depression, paralytic ileus. Caution in renal or liver impairment", preg: "Use when needed; watch the newborn for sedation and withdrawal after long use", monitor: "Pain score, bowels, sedation. Count the bottle at each refill: amount used should match the dose and days" },
    ns: { pd: { cls: "Isotonic crystalloid", mech: "Expands extracellular fluid; about a quarter stays in the circulation", effect: "Restores circulating volume and sodium" },
      adr: { common: "Pain or phlebitis at the cannula site", serious: "Fluid overload and pulmonary oedema, hypernatraemia, hyperchloraemic acidosis" },
      ix: [],
      ci: "Fluid overload, heart failure, hypernatraemia (caution)", preg: "Safe", monitor: "Pulse, blood pressure, urine output, chest crackles; electrolytes if prolonged" },
    rl: { pd: { cls: "Balanced isotonic crystalloid", mech: "Expands extracellular fluid; lactate is turned into bicarbonate", effect: "Restores volume with less acidosis than saline" },
      adr: { common: "Pain or phlebitis at the cannula site", serious: "Fluid overload and pulmonary oedema, hyperkalaemia in renal failure" },
      ix: [["Ceftriaxone", "Calcium precipitates: never in the same line; never together in neonates"], ["Blood transfusion", "Calcium causes clotting in the line"]],
      ci: "Severe liver failure (lactate not cleared), hyperkalaemia, lactic acidosis", preg: "Safe", monitor: "Pulse, blood pressure, urine output, chest crackles; potassium in renal impairment" },
    amlo: { pd: { cls: "Calcium-channel blocker (dihydropyridine)", mech: "Blocks L-type calcium channels in arteriolar smooth muscle, so arterioles dilate", effect: "Lowers blood pressure and relieves angina, with a gradual, long-lasting onset" },
      adr: { common: "Ankle swelling, headache, flushing, palpitations", serious: "Symptomatic hypotension; gum overgrowth with long use" },
      ix: [["Simvastatin", "Myopathy: keep simvastatin to 20 mg"], ["Ritonavir, clarithromycin (CYP3A4 inhibitors)", "Amlodipine levels rise"], ["Rifampicin", "Amlodipine levels fall"]],
      ci: "Cardiogenic shock, severe aortic stenosis, unstable angina", preg: "In pregnancy nifedipine or methyldopa is usually preferred; considered compatible with breastfeeding", monitor: "Blood pressure, ankle swelling" },
    mgso4: { pd: { cls: "Anticonvulsant for eclampsia (magnesium salt)", mech: "Blocks NMDA receptors and calcium channels, reduces acetylcholine release, dilates cerebral vessels", effect: "Prevents and stops eclamptic seizures; also corrects low magnesium" },
      adr: { common: "Flushing, warmth, nausea, pain at the IM site", serious: "Magnesium toxicity: lost knee reflexes, respiratory depression, cardiac arrest" },
      ix: [["Nifedipine and other calcium-channel blockers", "Hypotension, neuromuscular block"], ["Neuromuscular blockers", "Prolonged paralysis"]],
      ci: "Myasthenia gravis, heart block. Hold the dose if urine output is under 30 mL/h", preg: "Drug of choice for eclampsia; compatible with breastfeeding", monitor: "Before every dose: knee reflex present, respiratory rate 16/min or more, urine 30 mL/h or more" },
    diaz: { pd: { cls: "Benzodiazepine", mech: "Enhances GABA-A receptor activity, opening chloride channels more often", effect: "Stops seizures; sedation, muscle relaxation, less anxiety" },
      adr: { common: "Drowsiness, unsteadiness, pain or thrombophlebitis at the IV site", serious: "Respiratory depression and apnoea, hypotension, paradoxical agitation" },
      ix: [["Opioids, alcohol, phenobarbital", "Deep sedation and respiratory depression"], ["Isoniazid, fluconazole", "Diazepam levels rise"], ["Rifampicin", "Diazepam levels fall"]],
      ci: "Respiratory depression, severe liver disease, sleep apnoea. Caution in the elderly", preg: "Single doses for seizures are appropriate; regular use near term causes a floppy, sedated newborn. Breastfeeding: avoid repeated doses", monitor: "Airway, respiratory rate, oxygen saturation if available" },
    bcg: { pd: { cls: "Live attenuated bacterial vaccine", mech: "Primes cell-mediated (T-cell) immunity against mycobacteria", effect: "Protects young children against severe TB: TB meningitis and miliary TB" },
      adr: { common: "Papule, small ulcer and scar at the site; mild lymph node swelling", serious: "BCG abscess or lymphadenitis; disseminated BCG in HIV-infected or immunodeficient infants" },
      ix: [["Immunosuppressants, high-dose steroids", "Risk of disseminated BCG"]], ci: "Symptomatic HIV infection or known immunodeficiency", preg: "Not given in pregnancy", monitor: "Check for a scar at later visits; report abscess or large nodes as AEFI" },
    bopv: { pd: { cls: "Live attenuated oral viral vaccine", mech: "Vaccine virus replicates in the gut, giving gut (IgA) and blood immunity", effect: "Prevents polio types 1 and 3 and stops spread in the community" },
      adr: { common: "None usually", serious: "Vaccine-associated paralytic polio (very rare)" },
      ix: [], ci: "Known severe immunodeficiency in the child (give IPV instead)", preg: "Not applicable", monitor: "Report acute flaccid paralysis immediately (AFP surveillance)" },
    ipv: { pd: { cls: "Inactivated viral vaccine", mech: "Induces blood antibodies against all 3 poliovirus types", effect: "Protects against paralytic polio, including type 2" },
      adr: { common: "Redness and soreness at the site", serious: "Anaphylaxis (very rare)" },
      ix: [], ci: "Anaphylaxis to a previous dose or a vaccine component", preg: "Not applicable", monitor: "Observe 15–30 minutes after vaccination" },
    penta: { pd: { cls: "Combination vaccine (toxoid, whole-cell pertussis, recombinant, conjugate)", mech: "Induces antibodies to diphtheria and tetanus toxins, pertussis, hepatitis B surface antigen and Hib polysaccharide", effect: "Protects against diphtheria, tetanus, whooping cough, hepatitis B and Hib disease" },
      adr: { common: "Fever, pain and swelling at the site, irritability", serious: "Anaphylaxis, febrile seizures, hypotonic-hyporesponsive episode (rare)" },
      ix: [], ci: "Anaphylaxis to a previous dose; encephalopathy within 7 days of a previous pertussis-containing dose", preg: "Not applicable", monitor: "Observe 15–30 minutes; advise paracetamol for fever, not before vaccination" },
    pcv: { pd: { cls: "Conjugate bacterial vaccine", mech: "Polysaccharide linked to a carrier protein gives a T-cell-dependent response in infants", effect: "Protects against pneumococcal pneumonia, meningitis and bacteraemia" },
      adr: { common: "Fever, pain and swelling at the site", serious: "Anaphylaxis (very rare)" },
      ix: [], ci: "Anaphylaxis to a previous dose or component", preg: "Not applicable", monitor: "Observe 15–30 minutes after vaccination" },
    rota: { pd: { cls: "Live attenuated oral viral vaccine", mech: "Vaccine virus replicates in the gut and induces mucosal immunity", effect: "Prevents severe rotavirus diarrhoea and dehydration" },
      adr: { common: "Mild diarrhoea, vomiting, irritability", serious: "Intussusception (very rare): vomiting, crying with pain, blood in stool" },
      ix: [], ci: "History of intussusception; severe combined immunodeficiency", preg: "Not applicable", monitor: "Tell carers the signs of intussusception and to return at once" },
    mr: { pd: { cls: "Live attenuated viral vaccine", mech: "Vaccine viruses replicate and induce lasting antibodies", effect: "Protects against measles and rubella (and congenital rubella syndrome)" },
      adr: { common: "Fever and mild rash 7–12 days after; pain at the site", serious: "Febrile seizure, low platelets (rare), anaphylaxis (very rare)" },
      ix: [["Immunoglobulin or blood products", "Weaker response: wait 3+ months"], ["Immunosuppressants", "Avoid live vaccine"]], ci: "Severe immunosuppression; pregnancy", preg: "Avoid in pregnancy (live vaccine)", monitor: "Use the matching diluent only; discard on time (toxic shock risk from old reconstituted vials)" },
    hpv: { pd: { cls: "Recombinant virus-like-particle vaccine", mech: "Virus-like particles induce neutralising antibodies to high-risk HPV types", effect: "Prevents HPV infection that causes most cervical cancer" },
      adr: { common: "Pain and swelling at the site, headache", serious: "Fainting (syncope) with falls; anaphylaxis (very rare)" },
      ix: [], ci: "Anaphylaxis to a previous dose or component", preg: "Not given in pregnancy", monitor: "Seated observation for 15 minutes" },
    td: { pd: { cls: "Toxoid vaccine", mech: "Inactivated toxins induce antitoxin antibodies", effect: "Protects mother and newborn against tetanus, and against diphtheria" },
      adr: { common: "Pain, redness and swelling at the site", serious: "Anaphylaxis (very rare); brachial neuritis (rare)" },
      ix: [], ci: "Anaphylaxis to a previous dose", preg: "Recommended in pregnancy", monitor: "Record each Td dose on the mother's card to complete Td1–Td5" },
  };
  P.MEDS.forEach((m) => Object.assign(m, CLIN[m.id]));
  P.med = (id) => P.MEDS.find((m) => m.id === id);

  // Ward and dispensary stock levels (top-up targets), a signed rule in the real product. Sample values.
  P.LEVELS = {
    opd: { amox: 600, pcm: 1200, metro: 300, metf: 800, ctx: 500, ferr: 600, ors: 150 },
    w3: { ceft: 40, gent: 20, morph: 10, pcm: 200 },
    mat: { oxy: 30, pcm: 100, ors: 30, ferr: 100, peth: 5 },
    peds: { ors: 50, pcm: 150, amox: 200 },
    epi: { bcg: 120, bopv: 400, ipv: 80, penta: 300, pcv: 300, rota: 200, mr: 200, hpv: 60, td: 150 },
  };
  P.WITNESSES = ["Pharmacy technician (on shift)", "In-charge pharmacist", "Second pharmacist"];
  /* Duty roster (sample names): who holds each witness role, and on which shift. day 08:00–17:00, night 17:00–08:00, call = 24 h on call. */
  const R = (name, cadre, shift) => ({ name, cadre, shift });
  P.ROSTER = {
    pharmacy: { "Pharmacy technician (on shift)": [R("P. Waiswa", "Pharmacy Technician", "day"), R("S. Nantongo", "Pharmacy Technician", "day"), R("I. Okot", "Pharmacy Technician", "night")],
      "In-charge pharmacist": [R("A. Kintu", "Principal Pharmacist", "day")], "Second pharmacist": [R("N. Babirye", "Pharmacist", "day"), R("D. Lubega", "Pharmacist", "night")] },
    w3: { "Second nurse on shift": [R("Nurse G. Apio", "Enrolled Nurse", "day"), R("Nurse T. Kato", "Registered Nurse", "day"), R("Nurse E. Ouma", "Registered Nurse", "night")],
      "Nurse in-charge": [R("Nurse in-charge R. Achan", "Senior Nursing Officer", "day")], "Doctor on duty": [R("Dr A. Okello", "Medical Officer", "day"), R("Dr R. Namukasa", "Consultant Physician", "call")] },
    mat: { "Second nurse on shift": [R("Midwife C. Auma", "Registered Midwife", "day"), R("Midwife B. Nalwoga", "Enrolled Midwife", "day"), R("Midwife P. Akot", "Registered Midwife", "night")],
      "Nurse in-charge": [R("Midwife in-charge J. Ayo", "Senior Nursing Officer", "day")], "Doctor on duty": [R("Dr S. Nakato", "Medical Officer", "day"), R("Dr P. Atim", "Obstetrician", "call")] },
    peds: { "Second nurse on shift": [R("Nurse H. Nabirye", "Registered Nurse", "day"), R("Nurse F. Odongo", "Enrolled Nurse", "night")],
      "Nurse in-charge": [R("Nurse in-charge M. Kyomugisha", "Senior Nursing Officer", "day")], "Doctor on duty": [R("Dr M. Achieng", "Medical Officer", "day"), R("Dr K. Ssali", "Paediatrician", "call")] },
  };
  P.shiftNow = () => { const h = new Date(P.now()).getHours(); return h >= 8 && h < 17 ? "day" : "night"; };
  P.onDuty = (place, role) => { const r = (P.ROSTER[place] || P.ROSTER.pharmacy)[role] || [], s = P.shiftNow(); return r.filter((x) => x.shift === s || x.shift === "call"); };
  P.ROLES = {
    pharmacist: "Pharmacist",
    storekeeper: "Store keeper",
    incharge: "In-charge pharmacist",
  };

  function seed() {
    const db = {
      v: 3, _ver: 0, seq: 1,
      settings: { role: "pharmacist", offline: false, place: "opd" },
      outbox: 0,
      batches: [
        { id: "amox-1", med: "amox", no: "AX24117", exp: "2026-12", brand: "Generic" },
        { id: "amox-2", med: "amox", no: "AX25203", exp: "2027-09", brand: "Amoxil" },
        { id: "pcm-1", med: "pcm", no: "PC25011", exp: "2027-06", brand: "Generic" },
        { id: "pcm-2", med: "pcm", no: "PC25144", exp: "2028-01", brand: "Panadol" },
        { id: "metf-1", med: "metf", no: "MF24210", exp: "2027-02", brand: "Glucophage" },
        { id: "metf-2", med: "metf", no: "MF25077", exp: "2028-03", brand: "Generic" },
        { id: "ctx-1", med: "ctx", no: "CT24301", exp: "2026-12", brand: "Septrin" },
        { id: "ferr-1", med: "ferr", no: "FF25019", exp: "2027-10", brand: "Generic" },
        { id: "ors-1", med: "ors", no: "OR25090", exp: "2027-11", brand: "Generic" },
        { id: "ceft-1", med: "ceft", no: "CF25031", exp: "2027-05", brand: "Rocephin" },
        { id: "gent-1", med: "gent", no: "GN24188", exp: "2027-01", brand: "Generic" },
        { id: "oxy-1", med: "oxy", no: "OX25066", exp: "2027-03", brand: "Syntocinon" },
        { id: "morph-1", med: "morph", no: "MO25012", exp: "2027-08", brand: "Generic" },
        { id: "ns-1", med: "ns", no: "NS25101", exp: "2028-02", brand: "Generic" },
        { id: "rl-1", med: "rl", no: "RL25088", exp: "2027-11", brand: "Generic" },
        { id: "amlo-1", med: "amlo", no: "AM25042", exp: "2028-04", brand: "Generic" },
        { id: "amlo-2", med: "amlo", no: "AM25160", exp: "2028-09", brand: "Norvasc" },
        { id: "mgso4-1", med: "mgso4", no: "MG25017", exp: "2027-09", brand: "Generic" },
        { id: "bcg-1", med: "bcg", no: "BC25118", exp: "2027-06", brand: "Generic", vvm: 1 },
        { id: "bopv-1", med: "bopv", no: "OP25204", exp: "2027-03", brand: "Generic", vvm: 2 },
        { id: "ipv-1", med: "ipv", no: "IP25077", exp: "2027-05", brand: "Generic", vvm: 1 },
        { id: "penta-1", med: "penta", no: "PE25141", exp: "2027-04", brand: "Generic", vvm: 1 },
        { id: "pcv-1", med: "pcv", no: "PC25090", exp: "2027-02", brand: "Synflorix", vvm: 1 },
        { id: "rota-1", med: "rota", no: "RO25033", exp: "2027-01", brand: "Rotarix", vvm: 1 },
        { id: "mr-1", med: "mr", no: "MR25062", exp: "2026-12", brand: "Generic", vvm: 2 },
        { id: "mr-2", med: "mr", no: "MR25188", exp: "2027-08", brand: "Generic", vvm: 1 },
        { id: "hpv-1", med: "hpv", no: "HP25011", exp: "2027-09", brand: "Gardasil", vvm: 1 },
        { id: "td-1", med: "td", no: "TD25097", exp: "2027-07", brand: "Generic", vvm: 1 },
        { id: "diaz-1", med: "diaz", no: "DZ25023", exp: "2027-12", brand: "Generic" },
        { id: "peth-1", med: "peth", no: "PT25031", exp: "2027-10", brand: "Generic" },
        { id: "omor-1", med: "omor", no: "OM25108", exp: "2027-04", brand: "Generic" },
      ],
      moves: [],
      rx: [
        { id: "r1", patient: "Sample patient 07", sex: "F", age: 34, from: "OPD clinic", since: NOW0 - 18 * MIN, dob: "14/03/1992", status: "waiting", lines: [{ med: "amox", qty: 15 }, { med: "pcm", qty: 18 }] },
        { id: "r2", patient: "Sample patient 12", sex: "M", age: 6, from: "Children's clinic", since: NOW0 - 12 * MIN, dob: "02/07/2020", status: "waiting", lines: [{ med: "ors", qty: 4 }, { med: "pcm", qty: 10 }] },
        { id: "r3", patient: "Sample patient 19", sex: "F", age: 27, from: "OPD clinic", since: NOW0 - 9 * MIN, dob: "21/11/1998", status: "waiting", lines: [{ med: "metro", qty: 21 }, { med: "ferr", qty: 30 }] },
        { id: "r4", patient: "Sample patient 03", sex: "M", age: 52, from: "Diabetes clinic", since: NOW0 - 6 * MIN, dob: "05/01/1974", status: "waiting", lines: [{ med: "metf", qty: 60 }] },
        { id: "r5", patient: "Sample patient 22", sex: "F", age: 45, from: "OPD clinic", since: NOW0 - 3 * MIN, dob: "30/08/1981", status: "waiting", lines: [{ med: "ctx", qty: 30 }, { med: "pcm", qty: 18 }] },
      ],
      owed: [
        { id: "o1", patient: "Sample patient 31", med: "metro", qty: 21, since: NOW0 - 26 * 60 * MIN, told: null, done: false, kind: "owed" },
        { id: "o2", patient: "Sample patient 14", med: "metro", qty: 15, since: NOW0 - 50 * 60 * MIN, told: null, done: false, kind: "owed" },
      ],
      requests: [
        { id: "rq1", ward: "mat", at: NOW0 - 104 * MIN, by: "Nurse in-charge, Maternity", status: "raised", lines: [{ med: "oxy", qty: 20 }, { med: "pcm", qty: 40 }, { med: "ferr", qty: 50 }] },
      ],
      transits: [],
      deliveries: [
        { id: "d1", supplier: "NMS", title: "NMS · cycle 4 order", ordered: "14 Oct", status: "expected", note: "", witness: null,
          lines: [{ med: "amox", packs: 10 }, { med: "pcm", packs: 20 }, { med: "metro", packs: 10 }, { med: "ors", packs: 4 }, { med: "oxy", packs: 5 }, { med: "morph", packs: 2 }] },
      ],
      counts: [],
      recalls: [],
      paperWitness: [],
      emergencies: [],
      orderDraft: {},
      sheets: [
        { id: "s3", label: "Sheet 3", when: "Yesterday, 14:10–15:05 (network down)", place: "opd",
          rows: [{ med: "pcm", qty: 18, batch: "pcm-1", who: "Row 1 · Sample patient 51" }, { med: "amox", qty: 15, batch: "amox-1", who: "Row 2 · Sample patient 52" }, { med: "ors", qty: 4, batch: "ors-1", who: "Row 3 · Sample patient 53" }],
          entered: [] },
      ],
      printer: null,
    };
    const at = NOW0 - 200 * MIN;
    const open = (batch, place, qty) => db.moves.push({ id: "m" + db.seq++, at, kind: "opening", med: batch.split("-")[0], batch, from: null, to: place, qty, by: "Opening balance (sample)" });
    [["amox-1", 600], ["amox-2", 2000], ["pcm-1", 3000], ["pcm-2", 5000], ["metf-1", 1500], ["metf-2", 2000], ["ctx-1", 1800], ["ferr-1", 2500], ["ors-1", 400], ["ceft-1", 120], ["oxy-1", 60], ["morph-1", 40], ["ns-1", 300], ["rl-1", 240], ["amlo-1", 1500], ["amlo-2", 500], ["mgso4-1", 30], ["diaz-1", 20]].forEach(([b, q]) => open(b, "store", q));
    [["ns-1", 40], ["rl-1", 30], ["amlo-1", 100], ["diaz-1", 5]].forEach(([b, q]) => open(b, "w3", q));
    [["ns-1", 20], ["rl-1", 30], ["mgso4-1", 10]].forEach(([b, q]) => open(b, "mat", q));
    [["amlo-1", 400]].forEach(([b, q]) => open(b, "opd", q));
    [["diaz-1", 5], ["ns-1", 10]].forEach(([b, q]) => open(b, "peds", q));
    [["peth-1", 30], ["omor-1", 1500]].forEach(([b, q]) => open(b, "store", q));
    open("peth-1", "mat", 5); open("omor-1", "opd", 500);
    [["bcg-1", 600], ["bopv-1", 2400], ["ipv-1", 500], ["penta-1", 1500], ["pcv-1", 1400], ["rota-1", 900], ["mr-1", 300], ["mr-2", 900], ["hpv-1", 250], ["td-1", 800]].forEach(([b, q]) => open(b, "store", q));
    [["bcg-1", 100], ["bopv-1", 240], ["ipv-1", 40], ["penta-1", 150], ["pcv-1", 120], ["rota-1", 90], ["mr-1", 60], ["hpv-1", 30], ["td-1", 100]].forEach(([b, q]) => open(b, "epi", q));
    [["amox-1", 180], ["amox-2", 300], ["pcm-1", 600], ["metf-1", 420], ["ctx-1", 260], ["ferr-1", 300], ["ors-1", 60]].forEach(([b, q]) => open(b, "opd", q));
    [["ceft-1", 12], ["gent-1", 4], ["morph-1", 6], ["pcm-1", 100]].forEach(([b, q]) => open(b, "w3", q));
    [["oxy-1", 8], ["pcm-1", 60], ["ors-1", 10], ["ferr-1", 50]].forEach(([b, q]) => open(b, "mat", q));
    [["ors-1", 20], ["pcm-1", 80], ["amox-2", 100]].forEach(([b, q]) => open(b, "peds", q));
    [["Sample patient 40", 15, 134], ["Sample patient 41", 21, 89], ["Sample patient 44", 15, 54]].forEach(([who, q, ago]) =>
      db.moves.push({ id: "m" + db.seq++, at: NOW0 - ago * MIN, kind: "handover", med: "amox", batch: "amox-1", from: "opd", to: "patient", qty: q, by: "Pharmacist (sample)", ref: "earlier", note: who }));
    return db;
  }
  P.seed = seed;

  /* ── persistence and change notification ── */
  const KEY = "medsync-pharmacy-rework-proto";
  /* Brand is part of the batch: it is what is printed on the box that came in. Sample brands for the opening batches. */
  const BATCH_BRAND = {"amox-1": "Generic", "amox-2": "Amoxil", "pcm-1": "Generic", "pcm-2": "Panadol", "metf-1": "Glucophage", "metf-2": "Generic", "ctx-1": "Septrin", "ferr-1": "Generic", "ors-1": "Generic", "ceft-1": "Rocephin", "gent-1": "Generic", "oxy-1": "Syntocinon", "morph-1": "Generic"};
  const listeners = new Set();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.v === 3) {
        d.batches.forEach((b) => { if (!b.brand) b.brand = BATCH_BRAND[b.id] || "Generic"; });
        /* medicines added to the sample later: bring in their batches and opening balances */
        const fresh = seed();
        fresh.batches.filter((b) => !d.batches.some((x) => x.id === b.id)).forEach((b) => {
          d.batches.push(b);
          fresh.moves.filter((m) => m.batch === b.id && m.kind === "opening").forEach((m) => d.moves.push({ ...m, id: "m" + d.seq++ }));
        });
        return d; } }
    } catch (e) { /* storage blocked: start fresh */ }
    return seed();
  }
  P.db = load();
  P.commit = () => {
    P.db._ver++;
    try { localStorage.setItem(KEY, JSON.stringify(P.db)); } catch (e) { /* fine: the prototype still works */ }
    listeners.forEach((f) => f());
  };
  P.reset = () => { P.db = seed(); P.db._ver = Date.now() % 100000; P.commit(); };
  P.subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };

  /* ── ledger ── */
  let cv = -1, cache = null;
  P.L = () => {
    const db = P.db;
    if (cv === db._ver && cache) return cache;
    const m = new Map();
    for (const mv of db.moves) {
      if (mv.to) m.set(mv.batch + "|" + mv.to, (m.get(mv.batch + "|" + mv.to) || 0) + mv.qty);
      if (mv.from) m.set(mv.batch + "|" + mv.from, (m.get(mv.batch + "|" + mv.from) || 0) - mv.qty);
    }
    cache = m; cv = db._ver;
    return m;
  };
  P.bal = (batch, place) => P.L().get(batch + "|" + place) || 0;
  P.batch = (id) => P.db.batches.find((b) => b.id === id);
  P.batchesOf = (med) => P.db.batches.filter((b) => b.med === med).sort((a, b) => (a.exp < b.exp ? -1 : 1));
  P.monthsTo = (exp) => { const [y, m] = exp.split("-").map(Number); return y * 12 + m - (2026 * 12 + 10); };
  P.expired = (b) => P.monthsTo(b.exp) <= 0;
  P.usable = (b) => !b.recalled && !P.expired(b);
  P.medAt = (med, place, all) => P.batchesOf(med).reduce((s, b) => s + (all || P.usable(b) ? P.bal(b.id, place) : 0), 0);
  P.medTotal = (med) => P.batchesOf(med).reduce((s, b) => s + (P.usable(b) ? P.REAL.reduce((t, p) => t + P.bal(b.id, p) + P.bal(b.id, "transit:" + p), 0) : 0), 0);
  P.batchTotal = (b) => P.REAL.reduce((t, p) => t + P.bal(b, p) + P.bal(b, "transit:" + p), 0);
  P.batchBrand = (b) => { const x = typeof b === "string" ? P.batch(b) : b; return (x && x.brand) || "Generic"; };
  P.fefo = (med, place, brand) => P.batchesOf(med).filter((b) => P.usable(b) && P.bal(b.id, place) > 0 && (!brand || P.batchBrand(b) === brand));
  P.qtyAt = (med, place, brand) => P.fefo(med, place, brand).reduce((s, b) => s + P.bal(b.id, place), 0);
  /* Brands actually on hand: at one place, or everywhere (including on the way) when no place is given. */
  P.brandsAt = (med, place) => {
    const map = new Map();
    P.batchesOf(med).filter(P.usable).forEach((b) => {
      const q = place ? P.bal(b.id, place) : P.batchTotal(b.id);
      if (q <= 0) return;
      const k = P.batchBrand(b), e = map.get(k) || { brand: k, qty: 0, batches: [] };
      e.qty += q; e.batches.push(b.id); map.set(k, e);
    });
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  };
  P.months = (med) => P.medTotal(med) / P.med(med).amc;
  P.allocate = (med, place, qty, brand) => {
    const out = []; let left = qty;
    for (const b of P.fefo(med, place, brand)) { if (left <= 0) break; const take = Math.min(left, P.bal(b.id, place)); out.push({ batch: b.id, qty: take }); left -= take; }
    return { parts: out, short: Math.max(0, left) };
  };

  P.who = () => "You (" + P.ROLES[P.db.settings.role].toLowerCase() + ")";
  P.move = (m) => {
    const db = P.db;
    const mv = { id: "m" + db.seq++, at: P.now(), by: P.who(), pending: db.settings.offline, ...m };
    if (!mv.brand && mv.batch) mv.brand = P.batchBrand(mv.batch);
    db.moves.push(mv);
    cv = -1; // balances change before the next commit
    if (db.settings.offline) db.outbox++;
    return mv;
  };
  P.setOffline = (off) => {
    const db = P.db;
    db.settings.offline = off;
    let sent = 0;
    if (!off) { db.moves.forEach((m) => { if (m.pending) { m.pending = false; sent++; } }); db.outbox = 0; }
    P.commit();
    return sent;
  };

  /* ── words ── */
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  P.MON = MON;
  P.expWord = (exp) => { const [y, m] = exp.split("-").map(Number); return MON[m - 1] + " " + y; };
  P.time = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  P.when = (ms) => {
    const d = new Date(ms), t = new Date(P.now());
    const days = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (days === 0) return "Today " + P.time(ms);
    if (days === 1) return "Yesterday " + P.time(ms);
    return d.getDate() + " " + MON[d.getMonth()] + " " + P.time(ms);
  };
  P.ago = (ms) => {
    const m = Math.max(0, Math.round((P.now() - ms) / MIN));
    if (m < 60) return m + " min";
    if (m < 60 * 24) return Math.floor(m / 60) + " h " + (m % 60) + " min";
    return Math.floor(m / 1440) + (m < 2880 ? " day" : " days");
  };
  P.q = (n, med) => n.toLocaleString("en-GB") + " " + P.med(med).unit;
  /* Pack sizes: the supplier's usual pack first, then the common ones; any other size can be typed. */
  P.PACKS = [100, 50, 25, 10];
  P.packSizes = (med) => [...new Set([P.med(med).pack, ...P.PACKS])].sort((a, b) => b - a);
  P.packsWord = (units, med, pack) => {
    const p = pack || P.med(med).pack, k = Math.floor(units / p), r = units % p;
    if (!k) return r + " loose";
    return k + (k === 1 ? " pack" : " packs") + " of " + p + (r ? " + " + r : "");
  };
  P.KIND = {
    opening: "Opening balance", receive: "Received", handover: "Handed over", issue: "Issued", confirm: "Ward confirmed",
    count: "Count change", quarantine: "Quarantined", emergency: "Emergency supply", downtime: "Paper sheet entry", returned: "Returned from ward", administer: "Given on the ward", vaccinate: "Vaccinated", transfer: "Moved between places", wastage: "Discarded",
  };
  P.SAMPLE_DOSE = "[sample directions]";
})();
