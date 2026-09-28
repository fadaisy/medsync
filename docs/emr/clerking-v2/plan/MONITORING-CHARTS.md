# Monitoring charts opened by the Plan

**Status:** draft, for CSO review. Written 28 Sep 2026 alongside Prototype 7.
**Rule behind every chart:** a chart is *opened by something in the plan*, and it says what opened it. MedSync never flags a value on these charts automatically unless a signed rule does so. Thresholds drawn on a graph are reference lines for the reader, labelled with their source; lines marked "to verify" are drafts.

## 1. Why charts belong to the plan

The plan already contains the decisions that make a chart necessary. For example:
- "Observations hourly" means an observation chart.
- "Ringer's lactate 1000 mL over 8 h" means a fluid balance chart.
- "Glucose monitoring 4-hourly", or insulin, means a glucose chart.

Opening a chart by hand duplicates that decision and can be forgotten. So the plan opens the chart. The nurse fills it in, and the doctor reads it on the next review.

## 2. The rule table

| Chart | Opened by (any of) | Recorded by | How often | Graphs |
|---|---|---|---|---|
| **Observations and NEWS2** | Observation frequency set in the Plan; NEWS2 ≥ 1 at clerking | Nurse | The frequency chosen in the Plan | NEWS2 aggregate by hour, drawn over the RCP 2017 response bands. A small-multiple strip below it shows each vital sign. |
| **Temperature** | Leading or differential diagnosis is hypothermia or fever; core temperature ordered | Nurse | With each set of observations; core readings as taken | Line of temperature over time. Core readings are marked differently from peripheral ones. Reference line at 35 °C, labelled *to verify*. |
| **Fluid balance** | Any IV fluid prescription placed; AKI, sepsis, heart failure or DKA on the problem list (proposed) | Nurse | Hourly while IV fluids run or urine is measured; otherwise 4-hourly | (a) An hourly table: IV in, oral in, urine out, other out, running balance. (b) In and out by hour as bars above and below zero, with a running balance line. (c) Urine output per hour against 0.5 mL/kg/h × weight (the weight comes from the vitals). |
| **Capillary glucose** | Glucose monitoring frequency set; insulin, a sulfonylurea or IV glucose prescribed; glucose 5% or 10% as a fluid | Nurse | The frequency chosen | Points over time, joined. Reference line at 4.0 mmol/L (hypoglycaemia; JBDS 2023, already in the signed formulary). |
| **Medicine administration record (MAR)** | Any prescription placed | Nurse | Each scheduled time | A grid with one row per prescription and a cell per due time: *Due*, *Given hh:mm*, *Delayed*, *Omitted (reason)*, *Awaiting co-sign*. Fluids show as *Running*. |
| **Neurological observations (GCS)** *(later)* | GCS < 15, stroke, meningitis, seizures on the problem list | Nurse | As chosen | GCS line with pupils strip. |
| **Drug level** *(later)* | A drug flagged `narrowTherapeuticIndex` (gentamicin, vancomycin, phenytoin, digoxin) | Lab result | When resulted | Level against the verified target range, once verified. |

The "opened by" conditions marked *proposed* need the CSO's agreement. The first five rows are what the prototype shows.

## 3. The fluid balance chart in detail

**Rows**
- **IV in:** one row per running fluid. Its planned rate (mL/h) comes from the prescription, worked out as volume ÷ time. Drops per minute come from the giving set: 20 or 60 drops per mL.
- **Oral / NG in**
- **Urine out:** measured or not measured. "Not measured" is stated, never shown as zero.
- **Other out:** vomit, drain, stool.
- **Running balance:** the sum of the entries.

**Columns**
- Hourly, or 4-hourly, over a 24-hour chart day. The hospital sets when the chart day starts.

**Rules**
- A blank cell means *not recorded*. It is never counted as 0 mL.
- The running balance sums recorded entries only. It is never estimated.
- If an hour has a missing entry, the balance line shows a gap marker at that hour.
- A bolus is entered as its volume in the hour it ran.
- Changing a rate starts a new IV row segment, so the old rate is kept.

**Graphs**
1. **In and out by hour, with the running balance.**
   - In is drawn as bars above zero (IV plus oral), out as bars below zero (urine plus other).
   - The running balance is a line across both.
   - Shows at a glance whether the patient is filling up or drying out.
2. **Urine output per hour** against a dashed line at 0.5 mL/kg/h × weight.
   - For 58 kg that line is 29 mL/h.
   - The line is labelled "KDIGO oliguria threshold, to verify".
   - Hours below it are **not** flagged by MedSync unless a signed rule says so.

**24-hour summary row**
- Total in, total out, net balance, and hours with urine output below the reference line.
- It goes into the ward round note on request, never automatically.

## 4. Graph design rules (for the build)

- The graphs are built as SVG components in `components/emr/chart/` from `app/globals.css` tokens. There is no chart library in `package.json`, so do not add one without an ADR.
- Colour:
  - teal for the value line;
  - neutral greys for "out";
  - amber for reference lines;
  - the red-tinted band only for the NEWS2 7+ *emergency response* band, always with its label.
  - Colour is never the only signal: every band and line has a text label.
- The x axis is always clock time (Geist Mono). The y axis has three to four ticks. No gridlines beyond the reference lines.
- A value from clerking (for example, the 23:00 NEWS2 of 5) is drawn as a filled ink dot. Later nursing entries are drawn as teal dots, so the first value's origin is visible.
- **Empty state:** "No entries yet. The first nursing entry starts the graph." Do not draw a flat line at zero.
- **Accessibility:** each graph has `role="img"` and an `aria-label` that summarises the latest value and the trend in words. The table stays the source of truth: the graph is a view of it.
- **Motion:** none. Values appear; nothing animates in.

## 5. Storage (for the build)

- **Observations and temperature:** these already exist as `clinical_observations` (nurse workspace). Reuse them, using the vital-signs observation sets from ADR 0174.
- **MAR:** `medication_administration_records` exists with a `prescription_id` seam. Point it at `prescriptions.id`.
- **Fluid balance:** needs a new append-only table, `fluid_balance_entries`: id, hospital, patient, encounter, `kind` (iv_in, oral_in, urine_out, other_out), `volume_ml`, `measured` (bool), `recorded_at`, `recorded_by`, `prescription_id` (nullable), `state`. It needs RLS and an audit trigger. This is a **GATED** migration.
- **Chart registry:** add a small `monitoring_charts` table: encounter, kind, `opened_by` (a jsonb pointer to the plan item), frequency, `opened_at`, `closed_at`. The registry is what makes "opened by this plan" auditable. This is also **GATED**.

## 6. Open decisions for the CSO

1. The "opened by" conditions marked *proposed* in the table.
2. The reference lines marked *to verify* (35 °C; 0.5 mL/kg/h), and whether either should ever raise a flag.
3. The chart-day start time, and whether a 4-hourly fluid chart is allowed while IV fluids run.
4. Whether the ward-round note may include the 24-hour fluid summary on request.
