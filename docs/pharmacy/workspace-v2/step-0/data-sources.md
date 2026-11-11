# Data sources for the boards (Step 0, checked in code)

EXISTS = a read returns it today. DERIVED = a new pure read model over existing tables (allowed under Law 1). NO = no source, so the board item is dropped (see STOP-0 §disagreements).

## Today

| Figure                           | State                        | Source                                                                                                                                                     |
| -------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue by stage, oldest per stage | EXISTS + DERIVED             | `getReviewQueue` rows (`stage`, `writtenAt`, `queriedSince`) → `computeReviewQueue` stageCounts; oldest = min `writtenAt` (min `queriedSince` for queried) |
| Arrived / supplied per hour      | DERIVED                      | `prescriptions.created_at` (in scope at the point), `pharmacy_handovers.supplied_at` at the point                                                          |
| Supplied today, 7 days           | DERIVED                      | `pharmacy_handovers.supplied_at` per local day; today = `countSuppliedToday`                                                                               |
| Not on the shelf, 7 days         | DERIVED                      | `pharmacy_line_events` kind `owed` / `buying_outside` per `occurred_at`                                                                                    |
| Out of stock, vital              | EXISTS (now); DERIVED (days) | `stockFigures().outVital` (null without the national list = "Not set"); `pharmacy_stockouts` ⋈ VEN `V` per day                                             |
| Refills to prepare               | EXISTS (now) / NO history    | `refillBoard` tab `to_prepare`                                                                                                                             |
| Look-back                        | EXISTS (now); DERIVED (days) | `getLookBack`; `pharmacy_look_backs.at`                                                                                                                    |
| Controlled differences           | EXISTS (now); DERIVED (days) | `getControlledRegister().differences`; `pharmacy_controlled_differences.recorded_at/closed_at`                                                             |
| Points table                     | EXISTS per point             | `getReviewQueue().points`, `computeReviewQueue` by `serves`, `countSuppliedToday` per point; states Live / Not live / Switched off (no downtime state)     |
| Medicines flow                   | EXISTS page by page          | `getDeliveriesPage`, `getIssuesPage`, `listPlaces(ward)`, `getCartsPage`, `getExpiryPage`, `listRecalls`, `monthEndReadiness`                              |
| Limits line                      | EXISTS                       | `interactionsStateFor` (pairs in force), `pharmacyChecksState().doseReferences {signed,total}`                                                             |

## Needs you

| Item                                | Source                                | Who acts                                    |
| ----------------------------------- | ------------------------------------- | ------------------------------------------- |
| Controlled difference open          | `getControlledRegister().differences` | close: `pharmacy.manage`                    |
| Look-back                           | `getLookBack`                         | `pharmacy.review`                           |
| Downtime sheets to enter            | `countSheetsToEnter`                  | `pharmacy.dispense`                         |
| Delivery still counting             | `getDeliveriesPage` state `counting`  | `pharmacy.store`                            |
| Requisition raised (to issue)       | `getIssuesPage().requisitions`        | `pharmacy.store` (or dispense at own point) |
| Issue to confirm                    | `getIssuesPage().toConfirm`           | `pharmacy.stock`                            |
| Reaction to submit (past due first) | `listReports` state `to_submit`       | `pharmacy.review`                           |
| Reconciliation open / reopened      | `listReconciliations`                 | `pharmacy.review`                           |
| Pack not signed                     | `packRows` (`signed === null`)        | sign: `pharmacy.manage`                     |

There is no source for "queries answered" as a separate stage, or for "reconciliation not started".

## Find

| Kind                           | Source                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Patient number → prescriptions | `findPrescriptions` (exact `patient_code`, 30 days)                                                                        |
| Slip code                      | `findSlipByCode`                                                                                                           |
| Prescription key               | `keyFilter`                                                                                                                |
| Batch number                   | DERIVED: `pharmacy_batches.batch_number` / `first_batch_number` at this hospital                                           |
| Patients supplied from a batch | DERIVED: `pharmacy_supplies.batch_id`, net of reversals (as `loadTraceBase`), identities through `identitiesFor` (audited) |
| Delivery note number           | DERIVED: `pharmacy_deliveries.note_number`                                                                                 |
| Requisition                    | NO number (uuid only): not searchable                                                                                      |

## Shelf, Window, Clinical, Set-up

- **Stock actions:** `recordCount`, `receiveStock`, `adjustStock`, `transferStock`, `requestStock`, `closeStockRequest` (all `pharmacy.stock`); `adjustControlled`, `transferControlled`.
- **Ready to hand over:** review rows with `stage === "ready"`.
- **Medicine history:** `getPatientMedicineList`; the review line's `suppliedEarlier`.
- **Clinical figures:** `listReconciliations`, `listReports`, `stewardshipData` + `reviewDue`, `queryFacts` → `interventionReport`.
- **Packs:** `packRows`, `PACK_TEXT[kind].whileUnsigned`, `signerRoles`, `PACK_NEED` (`pharmacy.manage` with a second, attested signer); clinical content `signRefusal`.
- **NO source:** a Counts list, emergency dose matching, cold chain, recording an intervention by hand, a live channel.
