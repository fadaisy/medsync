# Pharmacy Phase 3: user guide

Every part sits behind its own flag, and nothing acts until it is signed in **Clinical content**.

## Pharmacist reviewer

- **Clinical content.**
  - **Starting from a candidate set:** **Import candidate pairs** or **Import the AWaRe edition** creates drafts. The importer lists what it could not match.
  - **Editing:** **Edit** a pack, or add a **New pair**, then save it as a draft.
  - **Signing:** open a draft and **Sign**. You re-enter your password and code. An entry goes into force with two signers, or with one signer and the recorded exception.
- **Interventions.** Codes and outcomes of every query, with a CSV of the counts.
- **Reactions.**
  - **Recording:** **Record a suspected reaction** from a prescription's review page. Each suspected medicine is added to the allergy list as *suspected*.
  - **Reporting:** open the report, then print it or copy it. Submit it by the Authority's own route, then **Record as submitted** with the route and date, or close it with a reason.
- **Reconciliation.**
  - **The page:** open a reconciliation from **Reconciliation**. It shows the table and the discrepancies the signed rules find.
  - **Discrepancies:** explain each one with a signed reason, or add one the records cannot show.
  - **Confirming:** **Confirm the list** turns on once every row has a decision. Then **Print the patient's sheet**.

## Prescriber

- **Interactions.** The prescribing dialog shows one interaction line from the signed pairs, and you answer it once.
- **Medicines for home.** On the patient's page, choose **Medicines for home**, then **Prepare medicines for home**.
  - Decide every medicine. Stopping, pausing or changing a medicine needs a reason.
  - Prescribe changed and new medicines as usual, then mark them here.

## AMS committee

- **Stewardship.** Shows antibiotic courses from the last 30 days by AWaRe group, each figure with its count; started with no culture ordered; reviews due on the signed day; and Reserve antibiotics started. Nothing on the page stops an antibiotic.
- **What the committee signs:** the AWaRe pack and the antibiotic review settings (the days to each review), in Clinical content.

## Pharmacy in charge

- **Flags, set per hospital:**
  - `PHARMACY_INTERACTIONS`
  - `PHARMACY_INTERVENTION_REVIEW`
  - `PHARMACY_STEWARDSHIP`
  - `PHARMACY_REACTIONS`
  - `PHARMACY_RECONCILIATION`

  All are off in production while their wording is draft.
- **Before switching a flag on,** sign its content:
  - interactions: the pairs and the alert levels;
  - stewardship: the AWaRe pack and the review settings;
  - reactions: the reaction timelines;
  - reconciliation: the reconciliation rules.
- **Development override.** `PHARMACY_DEV_HOSPITALS` (ADR 0394) is a development override, not a legal answer. Unset it before any hospital treats real patients.
