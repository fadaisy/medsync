# PROMPT: Lab Phase 4 — connect outward (referred tests and results back, exchange with partners, the analyser bridge, national connections when specified)

> **For Claude Code.** Work at the repo root on a new branch, `feat/lab-connect-outward`. Cut it from the branch where `feat/lab-quality-registers` (lab Phase 3) has merged.
>
> - **If Phase 2 or Phase 3 has not merged, STOP at Step 0.** This slice builds on:
>   - Phase 2: the test menu and availability (OM-\*), **To refer**, analyser profiles, the high-risk mark, the live channel `lab:{hospitalId}`;
>   - Phase 3: QC status at release and the hold (QH-\*), lots in use, nonconformities, rejection codes, HMIS 105 (10.4 manual cells, HM-6);
>   - Phase 1: units (UN-_), ranges (RR-_), criticals (CA-\*), amendments and correction alerts (CA-10), restricted classes, snapshots (Law 8).
>
>   Phase 3's flags may be off at a site; its code must be on the branch.
>
> - First, copy into `docs/lab/phase-4/`:
>   - this prompt;
>   - `LAB-PHASE-4-RESEARCH.md`.
>
> **Mode: gated.** There are thirteen steps, numbered 0–12, and each ends in a **STOP**.
>
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what earlier reads claimed. Verify every line. Build what Step 0 proves is missing, and reuse what it proves exists.
>
> **Three steps are conditional.** They are built only when Step 0 has the inputs in hand; otherwise they end in a written gap report and no code:
>
> - **Step 9**, a partner's electronic connection: needs a willing partner, its interface document and a signed agreement.
> - **Step 10**, the analyser bridge: needs the analyser maker's LIS interface document for the model on site.
> - **Step 11**, the national connections (IRRDS and ResTrack, A-LIS, the national Laboratory Data Repository): need a written specification from NHLDS or MoH, a data-sharing agreement and a test environment. **Nothing about these is public today** (H1–H4).
>
> **The CSO is Fadhul.** Nothing in this slice reaches a production hospital without the signatures this prompt names:
>
> - **The laboratory lead signs:**
>   - each partner's tests, codes, stated turnaround and requirements;
>   - each destination's packing checklist;
>   - each analyser's code and unit mapping;
>   - the shadow-run comparison before an analyser goes live.
> - **The data protection lead signs:**
>   - each partner's legal record and the list of fields sent to it;
>   - any cross-border partner's safeguards.
> - **The IPC lead signs** the high-risk referral wording.
> - **The CSO countersigns:**
>   - the matching rule and manual filing;
>   - the rule that referred results are flagged against the reference lab's printed range;
>   - every string a clinician reads in Appendix A;
>   - the hazard log.
> - **A security review** (GATE S) passes before any bridge or partner connection touches production.

---

## 0. What we are building, in one paragraph

A hospital lab cannot do everything. Viral load, EID, sickle cell, Xpert, thyroid tests, lipids when the analyser is down: these leave the building, and today they leave on paper. The specimen goes into a cool box with a handwritten list. Nobody can say where it is. The result comes back days later on paper, is typed into a new order or filed in a folder, and the doctor who asked may never see it. Inside the lab, results that an analyser already printed are typed again by hand.

This slice closes both gaps:

- **Referred tests:** send-out from To refer, a printed manifest with no patient names, tracking with overdue and lost, the result entered back **on the original order** with where it was done, the reference lab's units and range as printed, and the scan of the report.
- **Exchange:** one append-only message store for everything that comes in or goes out, with retries, dead letters and a **reconciliation queue**. Nothing files to a patient on a guess.
- **A partner's electronic connection** over FHIR R4 Task, for a reference lab that agrees and can.
- **The analyser bridge:** a small on-site service that reads ASTM or HL7 from one analyser, keeps every message before it acknowledges it, and posts **preliminary** results. A technologist still releases.
- **The national connections** (IRRDS and ResTrack, A-LIS, the national Laboratory Data Repository) **only when NHLDS or MoH gives a specification and an agreement**. Until then, paper and typed entry stay the path, and the slice is honest about it.

**Done when:**

- every referred specimen has a record from To refer to its result, and its result returns on the original order;
- the lab can say, for any referral, where it is and whether it is overdue;
- HMIS 105 section 10.4 (referred, average turnaround, pending) comes from records;
- at the pilot site, one analyser's results arrive without typing, after a shadow run with no unexplained differences;
- no result has been filed to the wrong patient, and no message has been lost or filed twice;
- at an A-LIS site, no result is typed twice **once** the A-LIS specification and agreement exist (the roadmap's "done when"; until then, recorded as blocked, not as done).

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap, the research notes and the canvas. Report every disagreement at STOP 0.
2. **The plan.** The _MedSync Laboratory Roadmap_, version 2, section "Phase 4: Connect outward" (https://claude.ai/artifact/SQPdW66RcaAnu3QWQTYVTw).
   - It names: referred tests; exchange with A-LIS and the national repository (MoH and CPHL agreement); the analyser interface (on-site bridge, security review, one analyser at one site).
   - It also lists microbiology, blood bank, histopathology and billing hooks under Phase 4. **They are not in this prompt** (Section 15). Each gets its own.
   - **Site profiles:** at a public hospital whose lab runs **A-LIS**, MedSync does not rebuild the lab. It sends orders to A-LIS and takes results back (Step 11, when specified). Its own referral screens stay off there (D-LAB4-24).
3. **The research notes.** `docs/lab/phase-4/LAB-PHASE-4-RESEARCH.md`, compiled 13 Oct 2026, with sources and a confidence mark on each fact.
   - Part A: Uganda's sample transport network, IRRDS and ResTrack, how results come back, A-LIS, the LDR, HIE and registries, the Data Protection and Privacy Act 2019, VHF specimens.
   - Part B: ASTM (CLSI LIS01/LIS02), HL7 v2 and IHE LAW, LIVD, the analysers likely on site, the OpenELIS Analyzer Bridge pattern, FHIR R4 Task and OpenHIE lab workflows, barcodes, patient matching.
4. **The UI reference.** The design canvas _Lab Phase 4 UI Preview_ (https://claude.ai/artifact/3jJLEMRRhyezMTZPXeD8xN). It has artboards 1–10, and Section 5 names the artboard for each screen.
   - It is drawn in MedSync Chroma. Build with the design system in force on this branch.
   - Every patient, partner marked "example", barcode, form number, message, analyser code, unit mapping and turnaround on it is **an example, not a real or signed value**.
   - Where this prompt and the canvas differ, this prompt wins. The known differences are in 5.11.
5. **Earlier canvases**, for the screens this slice extends: result entry and released results (Phase 1), ordering and the doctor's results (Phase 2), the hold and nonconformity (Phase 3).
6. **Design documents and ADRs:**
   - `DESIGN-medsync.md`;
   - the hub's design notes (machines, statuses, referral, stated turnaround);
   - the lab Phase 0–3 ADRs;
   - any existing integration or FHIR notes.
7. **Prompts this builds on.** Read the copies under `docs/`.
   - `PROMPT-LAB-PHASE-3.md`: QC status and hold (QH-_), lots in use, nonconformities (NC-_), rejection codes, HMIS (HM-\*), the register's restricted-class rule.
   - `PROMPT-LAB-PHASE-2.md`: availability (OM-_), To refer, analyser profiles (AP-_), high-risk mark, live channel (LV-\*), the house contract.
   - `PROMPT-LAB-PHASE-1.md`: units, ranges, flags, criticals, amendments, downtime, snapshots, the red law, D-LAB1-12.
   - `PROMPT-HOSPITAL-SERVICES-HUB.md`: machines, statuses, referral fields, print CSS.
8. **Code to read:**
   - `app/lab/**`, the doctor's results and order views;
   - `lib/lab/**`, `lib/emr/**`, **`lib/emr/fhir.ts`** (H13);
   - the hub module (referral fields, stated turnaround);
   - storage buckets and their policies;
   - edge functions or API routes that accept outside calls, if any;
   - `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface reads or writes an engine with real tables, real RLS policies and passing tests. The engine is built in an earlier step than the surface. The bridge is built against a recorded-message test harness before it touches an analyser.

2. **One store per fact.**
   - A referral belongs to the **original order line and specimen**. Its result files on that order line. A returned result never creates a new order, a new specimen or a new patient.
   - Partners live in one register. A partner's tests, codes, stated turnaround, requirements and packing checklist live there and nowhere else.
   - Availability stays in the hub (Phase 2 OM-2). This slice reads it; it never writes "referred".
   - Every message in or out lives in one append-only message store, whatever the channel.

3. **No remembered numbers or codes.** None of the following comes from code, seeds or copy:
   - partner test codes, LOINC codes and analyser codes;
   - stated turnaround;
   - unit conversions (Phase 1 unit registry only);
   - reference ranges for referred results (the reference lab's, as printed or sent);
   - packing conditions;
   - protocol details for an analyser (from the maker's interface document).

   Operational settings (retry back-off, heartbeat interval, clock-skew warning, presence window for a second checker) are labelled operational, never clinical.

4. **Nothing files on a guess.** An incoming result files to a patient by itself only under the matching rule (MA-1, MA-2). Everything else waits in the reconciliation queue for a person. MedSync never creates a patient, an order or a specimen from an incoming message, and never picks the "closest" patient.

5. **Machines propose, people release.**
   - Analyser results land as **preliminary**. A technologist releases them, and Phase 3's QC hold applies exactly as for typed results.
   - Results from a partner's system land as **back, to file**, and a lab user files them (D-LAB4-11).
   - Results typed from paper are checked by a second person when one is on duty.

6. **Keep before acknowledging; never lose, never double.**
   - The bridge and every inbound endpoint store a message durably **before** they acknowledge it. An acknowledgement means "we hold it", not "it is filed".
   - Messages are never deleted. Dead letters are never purged.
   - Filing is idempotent: the same message, delivered twice, files once.

7. **The record keeps what was true.** Every result carries its **source** (typed here, interfaced, referred on paper, referred electronically) and its provenance:
   - for a referred result: the performing lab, its report number and time, who authorised it as printed, the unit and range as printed, who entered it and who checked it, or the message it came from;
   - for an interfaced result: the analyser, the message, the analyser's value beside any edited value, the QC status and lots at release (Phase 3).

8. **No connection without an agreement and a legal record.** Before any data goes to a partner electronically:
   - the legal basis is recorded (DPPA 2019 s.7(2); health data is special personal data under s.9);
   - a signed agreement is on file, with processor terms where the partner processes data for the hospital (s.21);
   - the hospital's PDPO registration is on file (s.29);
   - the list of fields sent is signed by the data protection lead (data minimisation);
   - for a partner outside Uganda, safeguards or the patient's consent are recorded (s.19).

   Paper referrals to public reference labs rest on the recorded basis and the field list; they need no new agreement (D-LAB4-19).

9. **No specification, no code.** The national connectors are built only from a written specification obtained from NHLDS or MoH, under a signed agreement, against a test environment. No scraping of portals or dashboards (vldash, IRRDS, LabRDS), no reuse of endpoints found in other projects' configuration, no reverse engineering.

10. **High-risk specimens never travel as routine.** A specimen with the Phase 2 high-risk mark cannot join a routine manifest or be handed to the hub rider's routine run. It follows the outbreak procedure; MedSync records the referral and its tracking and does not arrange the transport.

11. **Informs, never blocks care, except to protect the patient or the record.** The hard stops in this slice are:
    - filing a result that does not meet the matching rule;
    - releasing an interfaced result without a technologist (and Phase 3's QC hold);
    - a referred result in a unit the registry does not know;
    - a high-risk specimen on a routine manifest;
    - electronic sending to a partner without a complete legal record, or to a cross-border partner without safeguards or consent;
    - adding a specimen to a manifest before the destination's required identifiers and packing items are done.

    Everything else, such as overdue, a partner's review date passed or a bridge that has not been heard from, informs in words.

12. **Restricted classes stay restricted.** To refer, Referrals, the manifest, the reconciliation queue and the message view honour Phase 1 Law 12. A user without access sees "Restricted test" and no result. The manifest never carries patient names (MF-1).

13. **Red is a safety property.** Overdue, rejected by the reference lab, lost, retrying, dead letter, waiting for a match, unit differs and not connected are **amber or neutral**, with an icon and a word. Nothing in this slice is red except Phase 1's critical and out-of-range result styles, unchanged. Nothing is green: connected, delivered and matched are neutral chips with a check.

14. **Two identifiers everywhere** a patient appears, including the reconciliation comparison and the doctor's referred-result view.

15. **Behind flags, stack as found.**
    - Per-hospital flags, all off by default: `labReferral`, `labExchange`, `labAnalyserBridge`, `labNationalExchange`.
    - Electronic connection per partner, and per analyser, is a signed setting, not a flag.
    - With all flags off, behaviour matches the Phase 3 baseline.
    - Use the ORM, package manager, flag mechanism and tokens on the branch. TypeScript strict, no `any`. Zod on every action and every inbound parser. AAL2 for people; service identities for machines (12).
    - **No new dependencies without stopping to flag them.** The bridge is a separate deployable (D-LAB4-14); its dependencies are listed and reviewed at GATE S.

16. **en-GB.** The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it. Dates show as `13 OCT 2026`.

---

## 3. What earlier reads claimed (verify every line at Step 0)

| #   | Claim                                                                                                                                                                                                                                                                                                          | Where                                                     | Severity                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| H1  | **IRRDS** (Integrated Requests & Results Dispatch System, irrds.cphl.go.ug, NHLDS) takes digital test requests from more than 1,000 facilities. The testing lab's LIMS pulls the request "through APIs" by barcode and pushes results back. **No API documentation is public.**                                | APHL, 6 Aug 2026                                          | **Blocks Step 11**                     |
| H2  | **ResTrack** (sample tracking app) launched Feb 2026: rider dispatch, pickups, status in transit, ETA, chain of custody, turnaround. No public interface                                                                                                                                                       | APHL, 20 May and 6 Aug 2026                               | Blocks Step 11                         |
| H3  | **A-LIS** User Guide v3 (June 2021): samples tracked by ULIN + SampleID; a monthly **aggregate** JSON upload; no HL7, FHIR, REST or LOINC; analyser interfacing "planned". No newer guide or public API found                                                                                                  | CPHL PDF                                                  | Blocks Step 11                         |
| H4  | The **national Laboratory Data Repository** launched 3 Feb 2026; more than 100 labs connected by May 2026; standards not named; **no submission specification published**                                                                                                                                      | MoH, APHL                                                 | Blocks Step 11                         |
| H5  | UgandaEMR's sync module posts a VL order "REFER TO CPHL" as a FHIR-shaped `ServiceRequest` with a contained `Specimen` whose identifier is the CPHL barcode; pulls results by specimen identifier; code system `http://cphl.go.ug/fhir`; **payloads are not conformant FHIR**; endpoints are set at deployment | METS-Programme/openmrs-module-ugandaemr-sync, 10 Jul 2026 | Design precedent (barcode as join key) |
| H6  | Client registry endpoint in UgandaEMR config is **staging**; NIN system `http://health.go.ug/cr/nationalid`; facility identifier system `https://hmis.health.go.ug/` with the HMIS org-unit code                                                                                                               | same repo                                                 | Identifiers                            |
| H7  | Hub design (2013): one motorbike and rider per hub, each facility visited at least weekly, results from the previous visit returned on the next; 100 hubs (about 2016–2021)                                                                                                                                    | PLoS ONE 2013; ASLM 2021                                  | Turnaround and tracking model          |
| H8  | VL and EID results also return through the VL dashboard (print per facility) and **LabRDS** (web, USSD, SMS)                                                                                                                                                                                                   | vldash; ASLM 2023                                         | Paper/print path stays                 |
| H9  | TB Xpert results go through **LabXpert** (SMS to the requesting clinician), not GxAlert                                                                                                                                                                                                                        | Stop TB 2024                                              | Paper/print path stays                 |
| H10 | VHF confirmation in 2025 and May 2026 was at **CERSL, Wandegeya**. The 2026 response used an IRRDS Ebola request and ResTrack transport. **No Uganda VHF packing or transport SOP found online**                                                                                                               | WHO DON602; APHL                                          | High-risk wording                      |
| H11 | No Uganda-specific triple-packaging (UN3373) SOP found online; WHO _Guidance on regulations for the transport of infectious substances 2025–2026_ applies from 1 Oct 2025                                                                                                                                      | WHO                                                       | Packing checklist source               |
| H12 | DPPA 2019: s.7(2)(d) medical purposes; s.9 health data is special; s.19 processing outside Uganda; s.20 security; s.21 processor contract; s.23 breach notification "immediately"; s.29 registration with the purpose recorded (PDPO)                                                                          | Act 9 of 2019                                             | Legal record                           |
| H13 | `lib/emr/fhir.ts` already maps specimens and reports to FHIR                                                                                                                                                                                                                                                   | roadmap                                                   | Reuse                                  |
| H14 | Phase 2 delivered To refer as a list only, `availabilityFor` returning `referred` and `down_referred` with stated turnaround, and the live event `referred`                                                                                                                                                    | `lib/lab/**`                                              | Dependency                             |
| H15 | Phase 3 delivered HMIS 105 10.4 with **turnaround and pending entered by hand** (HM-6)                                                                                                                                                                                                                         | `lib/lab/hmis105.ts`                                      | Replaced here                          |
| H16 | **Dymind DH-615:** bidirectional HL7 over LAN (tender declaration); RS-232 also listed. Dymind's page calls it a 6-part differential with RET. HL7 version, messages, port and client/server role are in the maker's LIS document only                                                                         | MTender; dymind.com                                       | **Blocks Step 10 for this model**      |
| H17 | **Mindray BS-240:** RS-232, bidirectional; protocol (HL7 or ASTM, version) not confirmed from an open source                                                                                                                                                                                                   | Mindray brochure                                          | Blocks Step 10 for this model          |
| H18 | **Roche cobas c 111:** ASTM over two RS-232 ports; no Ethernet or HL7                                                                                                                                                                                                                                          | Roche brochure                                            | Driver choice                          |
| H19 | **OpenELIS Analyzer Bridge** (MPL-2.0): stores each frame before ACK; outbox RECEIVED → PENDING → RETRYING → DELIVERED or dead-message queue; content-hash de-duplication; one-time pairing then mutual TLS with pinning; time from ASTM R.13, else R.12, else import time                                     | GitHub README                                             | Reuse candidate (D-LAB4-14)            |
| H20 | IHE LAW (PaLM TF-2b Rev 11.0, 2024): LAB-27 QBP^Q11/RSP^K11, LAB-28 OML^O33/ORL^O34, LAB-29 OUL^R22/ACK^R22; HL7 v2.5.1; LOINC and UCUM. CLSI AUTO16-Ed2 (June 2026) is based on LAW. LIS01-A2 and LIS02-A2 are archived but technically valid                                                                 | IHE; CLSI                                                 | Driver design                          |
| H21 | FHIR R4 Task statuses (12) and the OpenHIE lab workflow (Task in a Bundle; the lab accepts or rejects; the EMR polls for completed Tasks)                                                                                                                                                                      | hl7.org; OpenHIE                                          | Status model                           |
| H22 | Kenya's Lab Order IG (draft) has a Referral Task for hub-and-spoke referral; no Uganda lab IG is published                                                                                                                                                                                                     | build.fhir.org; packages.fhir.org                         | Profile precedent                      |
| H23 | CLSI AUTO02: Code 128 for specimen barcodes                                                                                                                                                                                                                                                                    | CLSI                                                      | Barcodes                               |
| H24 | Phase 1 and 2 lab numbers (`L-000…`) are printed as Code 128 on labels                                                                                                                                                                                                                                         | Phase 2 label board                                       | Barcodes                               |

---

## 4. Design direction

**Eight rules**

1. **A specimen that leaves is still ours.** It stays on the original order and in the lab's sight until its result is back or a person has decided it is lost.
2. **Say where it is.** Every referral shows its last known place, who said so, and when it is expected back, in words.
3. **The paper still works.** A printed manifest, the reference lab's own forms, and a result typed from paper with the scan attached are first-class, not a fallback.
4. **The reference lab's numbers stay theirs.** Units and ranges as printed, flags against their range, both units shown.
5. **Hold, don't guess.** A result that does not clearly belong to one order waits for a person, with the reason in words and the values hidden.
6. **Keep everything, show what matters.** Every message is kept; the lab sees only what needs a person.
7. **The analyser types; the technologist decides.** Interfaced values are locked, their flags shown, and release is still a person's act.
8. **Honest about what is not connected.** "Not connected" says why and what the lab does instead.

**Budgets** (measured at Step 0 where a baseline exists; met by Step 12)

| Measure                                                                  | Budget                                      |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| Ten specimens from To refer to a sealed manifest                         | median ≤ 3 min in the timed trial           |
| Entering a five-component paper result with the scan                     | median ≤ 90 s, plus the second-person check |
| Inbound message stored and acknowledged (server)                         | p95 < 300 ms                                |
| Inbound message to filed, when it matches                                | p95 < 5 s                                   |
| Bridge: frame or message stored before ACK                               | p95 < 100 ms on the site hardware           |
| Results filed to the wrong patient                                       | 0                                           |
| Messages lost in the bridge kill and network-drop tests                  | 0                                           |
| Results filed twice after redelivery                                     | 0                                           |
| Interfaced versus typed values differing, unexplained, in the shadow run | 0                                           |
| Referrals with no record between To refer and result or a decision       | 0                                           |

---

## 5. Interface specification

Lab navigation after this slice:

- Worklist · Criticals · Released today · **To refer** · **Referrals** · Rejected · Downtime entry;
- Quality and Reports (unchanged from Phase 3);
- **Exchange:** Connections · Waiting for a match · Analysers · Partners;
- Set-up (unchanged).

Each item appears only when its flag is on and the viewer holds the permission. Counts in the navigation are live (LV-1 events gain `referral_updated`, `match_waiting`, `message_dead`; no PHI).

### 5.1 To refer: send specimens out (artboard 1)

- For `lab.refer`.
- **Segments:** All · Not done here · Analyser down · High risk, with counts.
- **Table:** a select box, specimen (lab number and type), patient (two identifiers), test, why referred (from the availability snapshot: not done here, analyser down since, national programme test), waiting time, usual destination (from the partner register).
  - Restricted tests show the Restricted chip, and "Restricted test" with no name to users without access.
  - High-risk specimens carry the Phase 2 high-risk tag and **cannot be selected for a routine send** (RF-7).
- **High-risk block** (amber, `lb-hr`) when a high-risk specimen is listed: Appendix A "High-risk referral". It offers **Record outbreak referral** (RF-7), never Add to manifest.
- **Send panel** for the selection:
  - destination (partners that take every selected test; a test the destination does not take greys out with the reason);
  - how it travels (from the partner's transport options);
  - **this destination needs**: each required external identifier per specimen, scanned (their form number or barcode). Scanning reads Code 128 and other symbologies the partner registers;
  - **packed as this destination asks**: the laboratory lead's signed checklist for that destination and specimen category;
  - **Print their forms** (only where the partner allows MedSync to print its form; otherwise the lab uses the partner's own paper form);
  - **Add to manifest** stays disabled, with the reason in words, until every identifier and every packing item is done (RF-6).
- Sending never cancels the order. The doctor's order line shows "Sent to {destination}" (RF-11).

### 5.2 Manifest (artboard 2, A4 portrait print)

- Manifest number with its Code 128 barcode; hospital and lab; destination; transport; packaging line; number of specimens and packages.
- **Table:** row number, our lab number, their identifier, specimen type, containers, test, collected. **No patient names, no clinical details** (MF-1).
- **Signature block:** packed and checked by (pre-filled with the user), handed to (courier or rider: name, signature, time), received at the destination (name, signature, time), condition on arrival (all intact, leaking, broken, missing; number received).
- Footer: Appendix A "Manifest footer".
- Reprints carry "Copy" and are audited (MF-4). Black on white, body at least 12 px.

### 5.3 Referrals: tracking and overdue (artboard 3)

- For `lab.refer` (read) and lab users.
- **Tiles:** sent this month, results back, waiting for a result (with overdue count), average sent-to-result-back per destination, rejected by the reference lab. Every number opens the referrals behind it. "No data" is never 0.
- **Table:** referral, patient, test, destination, sent, **Now**, expected.

  | Now                         | Chip                  |
  | --------------------------- | --------------------- |
  | Packed, waiting for courier | Dashed                |
  | With the rider or courier   | Neutral               |
  | At the hub                  | Neutral               |
  | At the reference lab        | Neutral               |
  | Testing                     | Neutral               |
  | Result back                 | Neutral with a check  |
  | Overdue {n} days            | Amber with a clock    |
  | Rejected: {reason}          | Amber with a triangle |
  | Lost                        | Dark amber            |
  | Handed to the outbreak team | Neutral (high risk)   |
  | Cancelled                   | Dashed                |

- "Expected" is the partner's stated turnaround added to the sent time (RF-5). Without a stated turnaround it says "Not stated" and the referral is never overdue.
- **Side panel** for the selected referral: the five-step tracker (sent, with rider, at hub, at the reference lab, result), with late steps in amber; the event timeline, each event with **who said so and from what** (a person from the rider's log, the signed manifest, a partner message id); actions **Record an update**, **Note a call**, **Recollect and resend**, **Mark lost**.
- Footnote: the counts fill HMIS 105 section 10.4 (6.9).

### 5.4 Enter a result returned on paper (artboard 4)

- Opened from a referral (never free-standing; RB-1).
- **Header:** the Referred tag, the referral number, sent date, manifest.
- **Identity:** patient name and two identifiers, our lab number, their form number. A match line compares the report's form number, name and date of birth (typed by the user from the paper) with the referral. A disagreement stops entry and offers the reconciliation path (RB-2).
- **Report details:** reported by (partner), their report number, reported on, authorised by as printed.
- **Results table** per component the referral covers: result as printed, **unit as printed** (from the unit registry; an unknown unit cannot be released and shows "Ask the laboratory lead to add {unit}"), **their range as printed**, flag against their range, **in this hospital's unit** (converted by the registry, labelled "converted", or "Same unit").
- **Scan** of the paper report, required before release (RB-6).
- **Checked against the paper by:** a second lab user (RB-7). When no second person is on duty, the result releases marked "Entered by one person" and a check task opens for the next shift.
- **Release to the doctor.** Critical limits apply as for any result (RB-5).

### 5.5 What the doctor sees (artboard 5)

- In the doctor's results list, referred results carry the **Referred** tag in the "Done at" column.
- **Result card:** values with the range shown being the reference lab's; free T4-style dual units where converted; the **provenance block** (sky tint): done at, their report number and time, authorised by as printed, "Ranges are theirs, as printed", entered by and checked by (or "From {partner}'s system, message {id}"); **Open the original report**.
- **Sent out, waiting:** the clinician's own patients' referrals with Now and Expected, overdue in amber with "lab following up".
- Restricted tests follow Phase 1 Law 12.

### 5.6 Connections and message queue (artboard 6)

- For `lab.exchange.manage` (laboratory lead) and read-only for lab users without the raw-message view.
- **Tiles:** delivered today (in, out), retrying (oldest), needs a person, waiting for a match.
- **Connections list:** each analyser bridge, each partner connection, and each national connection, with state and a sentence:
  - Connected · last heard {time};
  - Retrying · since {time};
  - Not connected: {why} and what the lab does instead (Appendix A);
  - Not used here (A-LIS at a site whose lab runs on MedSync).
- **Messages:** Not delivered (default) and All today. Columns: message, way, partner, about (no PHI: "Result, form RL-55031"), state, last try.
- **Side panel** for a dead letter: reason, received time ("stored before it was acknowledged"), "Filed: nowhere", the message (PHI masked unless the raw view is opened with an audited reason), actions **Ask the partner**, **Fix the mapping, then retry**, **Set aside with a reason**.

### 5.7 Results waiting for a match (artboard 7)

- For `lab.match.resolve`.
- **Rule note** at the top: Appendix A "Matching rule".
- **Table:** arrived, from, number in the message, why it is here (MA-3 reason in words).
- **Comparison card:** each check (their number, name, date of birth, hospital number, test) in the result versus the order it names, with Same, Differs or Cannot compare. **Values stay hidden** until a decision (MA-5).
- **Actions:** Ask the reference lab (primary), File after confirming, Not ours, send back.
- **File after confirming:** how it was confirmed (corrected report received, phone call with the name recorded), second person, reason. The doctor sees Appendix A "Filed after mismatch".
- For analyser items: **Receive the specimen, then file** (not received), **Keep as unordered** or **Set aside** (not ordered), **Open the analyser mapping** (unit differs, code unmapped).
- **This month:** filed by themselves, waited here, filed after confirming, sent back, oldest waiting.

### 5.8 Analysers (artboard 8)

- For `lab.analyser.manage`; read-only for lab users.
- **Bridge card:** name and place, Connected or Not heard since {time}, paired (when, by whom), secure link, held on the bridge not yet sent, certificate renews, time zone, "if the internet drops" sentence.
- **Analysers table:** analyser (linked to its hub machine), cable, protocol (from the maker's document; "Waiting for {maker}'s interface document" when missing), now (Results come in · Typed by hand · Planned · Shadow run day {n} of {m}), last result.
- **Code mapping** per analyser (versioned, signed): analyser code, files to, unit sent, unit expected, check (Matches · Unit differs, not filed · Kept, not filed). Footer: Appendix A "Mapping source".
- **Clock note** when the analyser's clock differs from the bridge's beyond the operational threshold.
- **How results arrive:** preliminary until released; control samples go to quality control; order download off until confirmed (AB-12).
- **Pair a new bridge:** one-time code shown once, expires (operational), locks after repeated failures.

### 5.9 Analyser results, preliminary until released (artboard 9)

- Extends Phase 1 result entry for a specimen whose values came from an analyser.
- **Header chips:** "From {analyser} · preliminary", the Phase 3 QC status chip.
- **Match line:** "Sample {lab no.} was received at {time} and has {test} ordered. Filed to this patient."
- **Table:** component, value (locked), unit, this lab's range, flag (this lab's signed ranges), **analyser says** (its own flag text).
  - Unit differs or unmapped: the row shows "Not filed: unit differs" and accepts a typed value.
  - Changing a locked value needs a reason; the analyser's value stays beside it (AB-10).
- **Analyser flag notes** in words where the lab lead has signed a meaning for that flag (e.g. suspected platelet clumps: "Look at a blood film before releasing"). An analyser flag with no signed meaning shows its text only.
- **Actions:** Rerun, Release all but {component}, Release.
- **Side:** "As the analyser sent it" (shortened raw lines, PHI-free for this view), the message id and stored time; "The analyser's own ranges and flags are shown for reference"; **Recorded with the result**: analyser, QC at release, lots, source "Interfaced, not typed".

### 5.10 Partners, agreements and data sent (artboard 10)

- For `lab.manage` (tests, requirements, packing) and `dp.lead` (legal record, field list).
- **Partners table:** partner and kind, how results come back, agreement state, data leaves Uganda, connection.
- **Tests and turnaround** for the selected partner: our test, their code, their stated turnaround, what they need. An unmapped test shows "Map before sending" and cannot be sent to that partner.
- **What we send them** (field list, signed): identity fields, test and specimen fields, the doctor's clinical question (opt-in), and the fixed line "Diagnosis, phone number, address: never sent".
- **Legal record:** basis (DPPA 2019 s.7(2) letter), agreement and review date, processor terms, cross-border safeguards or consent rule, the hospital's PDPO registration, breach contact.
- Changing the field list or the legal record needs the data protection lead's signature.

### 5.11 Known differences from the canvas

- Artboard 1 shows "Send 2 specimens" while the manifest on artboard 2 lists three. Both are examples; a third was added later.
- Artboard 10 shows the private lab "Connected" while artboard 6 shows it "Retrying". Build: the partner row shows "Connected · retrying since {time}" when its outbox is retrying.
- The analyser codes, units and raw lines on artboards 8 and 9 are examples. Real codes come from the maker's document (AB-9).
- The free T4 conversion on artboards 4 and 5 is an example. Conversions come from the unit registry only.
- Artboard 8 shows a one-year certificate. The validity is operational and set at GATE S (ITI-19 recommends no more than two years).
- Out-of-range values use Phase 1's out-of-range style. That style is unchanged by this slice.

---

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Referrals (`lib/lab/referral.ts`)

- **RF-1** A referral is created only from a specimen on To refer (availability `referred` or `down_referred`, or a test the hub marks as a national programme test). It links the order line(s), the specimen and one partner.
- **RF-2** One referral per specimen per destination. When one tube must go to two destinations, the lab records an **aliquot**: a child specimen with its own lab number and `parent_specimen_id`. Each aliquot has its own referral.
- **RF-3** States and their FHIR R4 `Task.status` (FX-2):

  | Referral state  | Task.status | businessStatus            |
  | --------------- | ----------- | ------------------------- |
  | draft           | draft       | —                         |
  | packed          | requested   | packed                    |
  | handed_over     | requested   | in transit                |
  | at_hub          | requested   | at hub                    |
  | received_by_lab | received    | specimen received         |
  | accepted        | accepted    | —                         |
  | rejected        | rejected    | reason                    |
  | in_progress     | in-progress | testing                   |
  | on_hold         | on-hold     | reason                    |
  | completed       | completed   | result back               |
  | failed          | failed      | could not be done, reason |
  | lost            | failed      | lost                      |
  | cancelled       | cancelled   | —                         |

  Allowed transitions are a table in code with a test per edge. Terminal states: completed, failed, lost, cancelled, rejected (rejected leads to a new referral after recollection, never back to packed).

- **RF-4** `referral_events` are append-only. Each carries `source`: `person` (user, and the document they read from: rider log, phone call, signed manifest), `partner_message` (message id), or `system`. A later event never overwrites an earlier one; the state is derived from events in event-time order, with ties broken by sequence (EX-7).
- **RF-5** `expected_by = sent_at + partner_test.stated_turnaround` (the partner states the unit: hours, days, working days, with its calendar). No stated turnaround → `expected_by = null`, shown "Not stated", never overdue. `overdue = now > expected_by` and the state is not terminal. Overdue is computed, never stored.
- **RF-6** Adding to a manifest requires every external identifier the partner requires for that test and every packing item on the partner's signed checklist for that specimen category. The check is server-side.
- **RF-7** A high-risk specimen (Phase 2) cannot be added to a routine manifest or a routine transport. It gets an **outbreak referral**: partner of kind `outbreak`, no manifest, events recorded by people, a required note of who was informed (IPC lead, district surveillance focal person). The UI never offers the rider.
- **RF-8** **Cancel** is the placer's act: cancelling the order line requests cancellation of its referral. Before handover, the referral is cancelled. After handover, a cancellation is sent (or a call noted) and the destination decides; a result that still comes back files with "Cancelled by the doctor after sending".
- **RF-9** **Rejected by the reference lab:** the reason is recorded against the Phase 3 rejection codes; the ordering clinician is told (Appendix A "Rejected by reference lab"); To refer offers **Recollect** when a new specimen is received.
- **RF-10** **Lost** needs the last known event, a note of the call made, and a person with `lab.refer`. It opens a Phase 3 nonconformity and tells the ordering clinician, who decides on recollection. With `labQc` off, the nonconformity engine still records it (Phase 3 E-LAB3-07 is generic).
- **RF-11** Sending never cancels or changes the order. The order line shows the referral's Now to the doctor.
- **RF-12** Restricted classes follow Phase 1 Law 12 on every list, count and export.

### 6.2 Manifests (`lib/lab/manifest.ts`)

- **MF-1** A manifest belongs to one partner and one transport. It lists our lab number, their identifier, specimen type, containers, test, collected time. **Never patient names, never clinical details, never diagnosis.**
- **MF-2** The manifest number prints as Code 128 (AUTO02). Scanning it at a receiving MedSync site, or in Tracking, opens it.
- **MF-3** States: `open → sealed → handed_over → received | discrepancy`.
  - Sealed: printed and every item ready (RF-6). Sealed manifests cannot change; a missed specimen goes on a new manifest.
  - Handed over: courier or rider name and time recorded (the paper signature stays on the print). All referrals on it move to `handed_over`.
  - Received: from the signed copy returned, a phone note, or a partner message, with condition and number received. Any leaking, broken or missing item marks `discrepancy` and opens a nonconformity.
- **MF-4** Every print and reprint is audited. Reprints carry "Copy".

### 6.3 Results back (`lib/lab/referral-results.ts`)

- **RB-1** A returned result files on the **original order line and specimen** of its referral. It never creates an order, specimen or patient.
- **RB-2** Paper entry starts from the referral. The user types the report's identifier, name and date of birth from the paper; the engine compares them with the referral (exact after normalisation: case, spacing, name order). A disagreement refuses entry and opens a reconciliation item (MA-6 path).
- **RB-3** For each component:
  - value as printed (number, or coded text for qualitative results);
  - **unit as printed**, which must exist in the Phase 1 unit registry (UN-\*). Unknown → cannot be released; the lab lead adds the unit (with its conversions, if any) through the registry's signed path;
  - **range as printed**, stored as text and, where it parses, as low and high;
  - **flag computed from the printed range** (D-LAB4-09). No printed range → no flag, shown "No range printed";
  - the value in this hospital's unit, **only** through a registry conversion, labelled "converted".
- **RB-4** The partner's range, unit and authorisation are snapshotted on the result (Law 8). This hospital's reference ranges are never applied to a referred result.
- **RB-5** Phase 1 critical limits apply to referred results in the hospital's unit, through the same call and acknowledgement flow. If the reference lab called the ward, the user records it (who, when, to whom).
- **RB-6** A scan or photograph of the paper report is required before release. Stored in a private bucket, hospital-scoped, virus-scanned if the branch has scanning, opened through signed URLs with audit.
- **RB-7** **Second-person check:** if another user with result-entry permission has been active in this lab within the presence window (operational), the release needs their check. Otherwise the result is released marked "Entered by one person" and a check task opens for the next shift; the check, when done, clears the marker or opens an amendment.
- **RB-8** Provenance stored per result: source (`referred_paper` or `referred_electronic`), partner, their report number, report time, authorised-by as printed, entered by, checked by or the check task, message id for electronic results.
- **RB-9** A corrected report from the partner follows Phase 1 amendments and correction alerts (CA-10). The old values and the old scan are kept.
- **RB-10** Electronic results from a partner land as **back, to file**. A lab user files them with one action that shows the match, units and ranges (D-LAB4-11). Nothing from a partner is released to the doctor without a lab user's act in this slice.

### 6.4 Message store and connectors (`lib/exchange/**`)

- **EX-1** `exchange_messages` is append-only: id, hospital, partner or bridge, direction, channel (`fhir`, `hl7v2`, `astm`, `file`, `manual_note`), content type, raw payload (encrypted at rest; large payloads in private storage with a hash), SHA-256 content hash, external message id, received or created at, and the parsed-time zone assumption (EX-8).
- **EX-2** **Store before acknowledge.** Every inbound endpoint writes the message in a committed transaction, then returns success. A failure to store returns an error so the sender retries. The success response means "held", never "filed".
- **EX-3** **De-duplication:** unique on (sender, external message id) when the sender gives one, and on content hash. A duplicate is acknowledged, recorded as a duplicate event, and not processed again.
- **EX-4** **Outbox:** `pending → sending → delivered`, or `retrying` with exponential back-off and jitter (operational settings, with a cap), then `dead` after the attempt limit. A person can retry or set aside with a reason. Dead messages are never purged.
- **EX-5** **Inbound processing** states, each an appended event: `received → parsed → matched → filed`, or `waiting_match` (MA-3), or `unreadable` (dead, with the parse error).
- **EX-6** **Idempotent filing:** results filed from a message are keyed by (message hash, component). Re-processing returns the same rows.
- **EX-7** **Order of events:** a status from a partner applies only if its event time and sequence are later than the last applied; an earlier one arriving late is stored and shown in the timeline, not applied.
- **EX-8** **Times:** each sender's times are stored as given, with the zone assumed (configured per sender, default Africa/Kampala) and the parsed UTC. Skew between a sender's clock and the server beyond the operational threshold raises a note on Connections or Analysers.
- **EX-9** No PHI in application logs. The raw view of a message is for `lab.exchange.manage`, needs a reason, and is audited.
- **EX-10** Each connection is an **adapter** implementing one interface: `send(referralBundle)`, `receive(raw) → parsed`, `poll()` where the partner is pull-only, `ack(…)`, and a versioned, signed mapping table. Adapters are pure over their inputs except for the transport they declare.

### 6.5 Matching (`lib/exchange/match.ts`)

- **MA-1** **Partner result** files by itself only when:
  - its identifier (their form or accession number, or our lab number echoed back) maps to **exactly one** open referral in this hospital; **and**
  - **either** name and date of birth agree (exact after normalisation) **or** the hospital number agrees.
- **MA-2** **Analyser result** files by itself only when:
  - its sample id maps to **exactly one** specimen in this hospital that has been **received** in the lab; **and**
  - the analyser code maps (signed mapping) to a component on that specimen's open order; **and**
  - the unit sent matches the mapping's expected unit; **and**
  - that component has not been released (a released component goes to the amendment path, never overwritten).
- **MA-3** Anything else waits with one reason code: `not_found`, `not_received`, `demographics_disagree`, `ambiguous`, `not_ordered`, `already_released`, `unit_differs`, `code_unmapped`, `partner_not_enabled`.
- **MA-4** Never create a patient, order or specimen from a message. Never pick between candidates.
- **MA-5** Values are hidden in the queue and the comparison until the item is filed or marked not ours.
- **MA-6** **File after confirming** needs `lab.match.resolve`, the confirmation type (corrected report, phone call with the name of the person spoken to), a second person, and a reason. The result carries "Filed by hand after a mismatch" to the doctor.
- **MA-7** **Not ours** keeps the message, sends a notice to the partner where a channel exists, or records the call.
- **MA-8** **Analyser control samples:** sample ids that match the analyser's registered QC material lots (Phase 3 `qc_material_lots`) route to Phase 3 as QC run values with `source = interfaced`. They never reach a patient. A QC id that matches no registered lot waits as `not_found`.
- **MA-9** A specimen received after its analyser result arrived (`not_received`) can be filed by **Receive the specimen, then file**, which runs MA-2 again.

### 6.6 The analyser bridge (`bridge/` as a separate deployable; `lib/exchange/analyser.ts` on the server)

- **AB-1** The bridge runs on site (a small PC or the lab server), talks to analysers by serial or network, and talks to MedSync only **outbound** over HTTPS. Nothing listens on the internet.
- **AB-2** **Drivers**, each configured by a **driver profile** written from the maker's interface document for that model and firmware:
  - **ASTM** low level (LIS01 / E1381): ENQ, ACK, NAK, EOT; frame numbers modulo 8; checksum validated; NAK on a bad checksum; abort after the profile's failure limit; timeouts from the profile. Record level (LIS02 / E1394): H, P, O, R, C, Q, L records; delimiters from the H record.
  - **HL7 v2 over MLLP**: framing `0x0B … 0x1C 0x0D`; enhanced acknowledgement where the profile says so; LAW messages (OUL^R22, OML^O33, QBP^Q11) where the analyser supports them; ORU^R01 and other vendor variants as the profile says.
  - A file-drop driver for analysers that export files.
- **AB-3** **Store before ACK** on the bridge: each valid ASTM frame or HL7 message is committed to the bridge's durable store before the ACK (or `MSA|AA`) is sent. An ENQ acknowledgement opens a session only. A transmission without its EOT is held as incomplete; the analyser resends.
- **AB-4** **Bridge outbox** to MedSync with the EX-4 states, back-off and dead letters, shown on the bridge's local page and mirrored on Analysers.
- **AB-5** **De-duplication** by content hash (EX-3); an identical retransmitted frame is acknowledged and not stored twice.
- **AB-6** **Security** (GATE S):
  - pairing with a one-time code generated by the laboratory lead, expiring, locking after repeated failures;
  - then **mutual TLS with pinned certificates** for the bridge-to-MedSync channel, **or** SMART Backend Services (client credentials with a signed JWT, `system/` scopes for exactly the endpoints the bridge needs, tokens no longer than 5 minutes, no refresh tokens). D-LAB4-15 picks one;
  - the bridge has a service identity that can write only to the inbound exchange endpoint for its hospital and read only its own mapping and configuration. It can read no PHI.
- **AB-7** **Time:** the result time is the analyser's completed time (ASTM R.13; HL7 OBX-19, or as the profile says), else the start time, else the receipt time with a "time from receipt" mark. The bridge's zone is configured; skew is checked (EX-8).
- **AB-8** **Results land preliminary** on the matched specimen (MA-2). The analyser's own flags are stored as text and shown. Its ranges are stored and shown for reference, never used for flagging.
- **AB-9** **Mapping** per analyser (versioned, signed by the laboratory lead, from the maker's document): code → component, unit sent → registry unit. Unmapped codes and differing units are kept and shown, never filed.
- **AB-10** **Edits:** changing an interfaced value needs a reason; both values are stored; the doctor sees the released value.
- **AB-11** **Release** is a technologist's act. Phase 3's QC hold (QH-\*) applies; lots in use are snapshotted.
- **AB-12** **Order download** (host query, LAW LAB-27/28) stays off until the maker's document confirms the messages and a test on site passes. When on, it sends only received specimens with open orders for tests that analyser runs.
- **AB-13** **Health:** a heartbeat (operational interval). Not heard from beyond the threshold → the laboratory lead is notified, Analysers shows "Not heard since {time}", and Phase 1's downtime entry is the path.
- **AB-14** **Shadow run** before live: for the period the lab lead signs (D-LAB4-16), interfaced results land but are not filed; the technologist types as today; a daily comparison lists every difference. Live needs zero unexplained differences and the lab lead's signature.
- **AB-15** **Build or reuse** (D-LAB4-14): Step 1 evaluates the OpenELIS Analyzer Bridge (MPL-2.0) against AB-1–AB-13. If adopted, it runs unmodified in a container and MedSync accepts its FHIR output through an adapter; any change to its files is published under MPL-2.0. If not, build a minimal bridge that follows the same pattern.

### 6.7 FHIR mapping (extend `lib/emr/fhir.ts`)

- **FX-1** **Outbound referral:** a FHIR R4 transaction Bundle with:
  - `Task` (intent `order`, status `requested`, `basedOn` and `focus` the ServiceRequest, `for` the Patient, `owner` the partner Organization, `input` the Specimen, `identifier` our referral number);
  - `ServiceRequest` (code: the partner's code from the signed mapping, and LOINC only where the mapping holds one);
  - `Specimen` (identifiers: our lab number and the partner's form number; type; collection time; `parent` for aliquots);
  - `Patient` with **only** the fields on the partner's signed field list (PT-3).
- **FX-2** **Inbound status:** `Task.status` maps to the referral state by the RF-3 table; `businessStatus` and `statusReason` are stored as text.
- **FX-3** **Inbound result:** `DiagnosticReport` with `Observation`s: value, unit (UCUM code when given, and the text unit), `referenceRange` as given, `performer`, `issued`. RB-3 and RB-4 apply as for paper.
- **FX-4** **Codes:** LOINC is used only where the catalogue and the partner both hold it in a signed mapping. No LOINC code is invented or inferred. LIVD files from analyser makers may be imported as **drafts** for the lab lead to sign.
- **FX-5** **Identifiers:** the hospital number with the hospital's system URI; the NIN with `http://health.go.ug/cr/nationalid` only when the field list includes it and the NIN is recorded (H6: verify the system is current).
- **FX-6** **Facility:** the hospital's HMIS org-unit code with `https://hmis.health.go.ug/` (H6: verify).
- **FX-7** **Validation:** outbound resources validate against base R4 (and the partner's profile when given). Inbound resources that parse under the partner's profile are accepted even if not base-conformant (H5 shows this is common) and flagged as such.

### 6.8 Partners and data protection (`lib/exchange/partners.ts`)

- **PT-1** **Register:** name, kind (`national_reference`, `public_lab`, `private_lab`, `abroad`, `outbreak`, `hub`), contacts, transport options, tests offered (our test → their code, stated turnaround with unit, required identifiers, specimen requirements), packing checklist per specimen category, how results come back.
- **PT-2** **Legal record:** basis (enum mapped to DPPA s.7(2) letters), agreement file with signed and review dates, processor terms (s.21) yes or no, cross-border (s.19) yes or no with the safeguard document or "per-patient consent", the hospital's PDPO registration reference and renewal date (s.29), breach contact (s.23).
- **PT-3** **Field list** per partner, versioned and signed by the data protection lead. Diagnosis, phone number and address are never on it. The clinical question is opt-in per partner.
- **PT-4** **Gate:** a partner's electronic connection can be enabled only when PT-2 is complete and the agreement is signed. Sending to an `abroad` partner is refused unless safeguards are recorded or the referral carries the patient's recorded consent.
- **PT-5** **Paper referrals** need the basis recorded. The field list governs what MedSync prints on any form it prints.
- **PT-6** **Review date passed** or PDPO registration expired: amber on Partners and Connections, the laboratory lead and data protection lead are notified; sending continues (inform) unless D-LAB4-20 decides otherwise.

### 6.9 HMIS 105 section 10.4 from records (extend `lib/lab/hmis105.ts`)

- **HM-14** For each 10.4 row in the signed mapping (Phase 3 HM-\*): **number referred** = referrals handed over in the month for tests mapped to that row; **average turnaround** = mean of (result back − handed over) for referrals completed in the month, in the unit the form uses; **pending** = referrals handed over and not terminal at the end of the month.
- **HM-15** The definition of turnaround is confirmed with the Division of Health Information at Step 0 (Q14). If it differs, the definition follows the form; the alternative is shown alongside, labelled.
- **HM-16** When `labReferral` has been on for the whole month, these cells come from records and Phase 3's manual cells for them are retired for that month. Otherwise they stay manual with the Phase 3 note.
- **HM-17** Outbreak referrals and cancelled referrals are excluded unless the signed counting rules say otherwise; rejected referrals count once as referred.

### 6.10 National connections (GATE N; `lib/exchange/national/**` only after the gate)

- **NX-1** Nothing in this section is coded until GATE N holds: a written specification, a signed data-sharing agreement, a test environment and a named contact at NHLDS or MoH.
- **NX-2** When it holds, each national system becomes an adapter (EX-10) on the same message store, matching rule and partner register. No second pipeline.
- **NX-3** **A-LIS site:** MedSync sends orders to A-LIS and takes results back; it does not rebuild A-LIS's stock, QC, registers or HMIS. Phase 3 flags and `labReferral` stay off there.
- **NX-4** **IRRDS and ResTrack:** the CPHL barcode is the join key (as in H5); ResTrack events map to RF-3 states; results file by MA-1.
- **NX-5** **LDR:** what is sent (aggregate or patient-level), how often and in what format follows the specification and the agreement only.
- **NX-6** **Until then:** CPHL referrals use CPHL's paper form and the hub rider; results from the VL dashboard printout, LabRDS or LabXpert SMS are entered as paper results with the printout or a screenshot attached, and the source named.

---

## 7. Data changes (only what GATE A approves; additive; next free migration numbers)

**Partners**

- `partners` (kind, contacts, transport options, how results return).
- `partner_tests` (our test, their code, stated turnaround value and unit, required identifiers, specimen requirements; versioned, signed).
- `partner_packing_items` (per specimen category; signed).
- `partner_legal` (basis, agreement file, dates, processor terms, cross-border, safeguards, PDPO reference, breach contact; versioned, signed by `dp.lead`).
- `partner_field_lists` (versioned, signed by `dp.lead`).
- `partner_connections` (adapter, endpoint, credentials reference in the secrets store, enabled, signed).

**Referrals**

- `referrals` (order lines, specimen, partner, external identifiers, current state as a cached projection).
- `referral_events` (append-only).
- `manifests`, `manifest_items`, `manifest_prints` (append-only).
- `specimens.parent_specimen_id` (aliquots).

**Results**

- On result components: `source` enum (`typed`, `interfaced`, `referred_paper`, `referred_electronic`), `provenance` JSON, `partner_range_snapshot` JSON, `interfaced_value` and `edit_reason` (interfaced only).
- `result_attachments` (private bucket path, hash, uploaded by, at).
- `transcription_checks` (result, checker or task, state).

**Exchange**

- `exchange_messages` (append-only).
- `exchange_events` (append-only state transitions for both directions).
- `exchange_outbox` (projection of the latest outbound state).
- `match_items` (reason, candidate, state) and `match_resolutions` (append-only).

**Analysers**

- `analyser_bridges` (hospital, place, paired at and by, certificate fingerprint or client key id, last heard).
- `analyser_links` (hub machine, bridge, driver profile reference, state: typed, shadow, live, paused).
- `analyser_driver_profiles` (versioned; from the maker's document; file reference).
- `analyser_code_maps` (versioned, signed).
- `analyser_flag_meanings` (analyser flag text → signed note; optional).
- `shadow_comparisons` (day, specimen, component, typed, interfaced, explained by).

**HMIS**

- No new tables; 10.4 cells computed (HM-14) and marked `source = records` in the Phase 3 snapshot.

**Permissions**

- `lab.refer` (send out, manifests, record updates).
- `lab.refer.result` (enter returned results; defaults to holders of result entry).
- `lab.match.resolve`.
- `lab.exchange.manage` (laboratory lead: retry, set aside, raw view with reason).
- `lab.analyser.manage` (pair bridges, sign mappings, start shadow and live).
- `dp.lead` (data protection lead: legal record and field lists).
- Service identities: `svc.bridge:{bridgeId}`, `svc.partner:{partnerId}` (write to inbound exchange for their hospital; read their own configuration; no PHI).

**RLS probes** for every new or changed object:

| Actor                                                                                                                                                  | Access                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Lab staff, same hospital, with the permission                                                                                                          | As the permission allows. Restricted classes per Phase 1 Law 12                                                                         |
| Laboratory lead                                                                                                                                        | All lab actions above, raw message view with reason, mappings, shadow sign-off                                                          |
| Data protection lead (`dp.lead`)                                                                                                                       | Partners' legal record and field lists; no patient rows unless they also hold a lab role                                                |
| Clinician                                                                                                                                              | Referral state and referred results on orders they may open; the scan through a signed URL; nothing else here                           |
| Hospital admin                                                                                                                                         | Partners list without legal files, referral counts in aggregate; **no patient rows**                                                    |
| Bridge or partner service identity                                                                                                                     | Insert into inbound exchange for its own hospital; read its own configuration; **no reads of patient, order, result or other messages** |
| Staff of another hospital                                                                                                                              | Denied                                                                                                                                  |
| Superadmin without break-glass                                                                                                                         | Denied                                                                                                                                  |
| Anonymous                                                                                                                                              | Denied                                                                                                                                  |
| Any client, direct INSERT, UPDATE or DELETE                                                                                                            | Denied everywhere                                                                                                                       |
| Any actor, UPDATE or DELETE on `referral_events`, `manifest_prints`, `exchange_messages`, `exchange_events`, `match_resolutions`, `shadow_comparisons` | Denied, including the service-role path                                                                                                 |

---

## 8. Server actions and endpoints

The house contract applies to every write by a person:

`'use server'` → Zod with an idempotent client key → auth (`getUser()`) → AAL2 → permission → hospital-scope check → one transaction → PII-redacted log → audit row → `{ id, serverTime }`.

Notification failures never throw.

| Group        | Actions                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Partners     | `savePartner` · `savePartnerTests` · `signPartnerTests` · `savePackingItems` · `signPackingItems` · `saveLegalRecord` · `signLegalRecord` · `saveFieldList` · `signFieldList` · `enableConnection` · `disableConnection`                                                 |
| Referrals    | `createReferral` · `createAliquot` · `addToManifest` · `sealManifest` · `printManifest` · `recordHandover` · `recordReferralEvent` · `recordManifestReceipt` · `requestCancel` · `markLost` · `recordOutbreakReferral`                                                   |
| Results back | `startReferredResult` · `saveReferredResult` · `attachReport` · `checkTranscription` · `releaseReferredResult` · `fileElectronicResult`                                                                                                                                  |
| Exchange     | `retryMessage` · `setAsideMessage` · `openRawMessage` (reason, audited)                                                                                                                                                                                                  |
| Matching     | `fileAfterConfirming` · `markNotOurs` · `receiveThenFile` · `keepAsUnordered`                                                                                                                                                                                            |
| Analysers    | `createPairingCode` · `revokeBridge` · `saveDriverProfile` · `saveCodeMap` · `signCodeMap` · `saveFlagMeaning` · `startShadow` · `explainDifference` · `signShadow` · `goLive` · `pauseAnalyser` · `releaseInterfaced` (extends Phase 1 release) · `editInterfacedValue` |

**Machine endpoints** (route handlers or edge functions; not server actions):

- `POST /api/exchange/inbound/{hospital}/{sender}`: authenticated as the sender's service identity (AB-6 or partner credentials); Zod-parsed envelope; **EX-2 store before acknowledge**; returns `{ messageId, duplicate }`.
- `GET /api/exchange/bridge/config`: the bridge's own mapping and profile versions.
- `POST /api/exchange/bridge/heartbeat`.
- Outbound sending runs in a worker (the branch's job mechanism, or a scheduled function) that reads the outbox; never in a request path.

Signing actions require a fresh second factor and refuse a signer who authored the draft's last change when a second person is available (D-LAB1-12 carries over).

---

## 9. Steps and gates

### Step 0 — Discovery and baseline (no product changes)

**Answer and report:**

- **Q1** Are `feat/lab-one-menu` and `feat/lab-quality-registers` merged? List the Phase 2 and 3 engines and tables this slice uses (availability, To refer, analyser profiles, high-risk mark, LV-1, QC status and hold, lots in use, nonconformities, rejection codes, HMIS 10.4 cells). **If not, STOP.**
- **Q2** Confirm or correct H1–H24, each with its file, line or source.
- **Q3** **The pilot site's referrals today**, from its paper registers or referral book for the last 90 days, with patient details absent:
  - destinations, and tests per destination;
  - volume per destination per week;
  - the forms each destination uses (photograph blank forms);
  - transport (hub rider days, courier, own driver);
  - how and when results come back, and where they are filed now;
  - how many results never came back, if the book shows it.
- **Q4** The hub rider's real schedule for this site, and who signs for specimens at handover.
- **Q5** **Write to NHLDS** (draft in Appendix E), copied to the Division of Health Information, asking for:
  - the IRRDS and ResTrack interface specification, test environment and onboarding steps;
  - the A-LIS interface, if any, for order and result exchange;
  - the LDR submission specification and onboarding;
  - the data-sharing agreement template and who signs it.

  Record the date sent and any answer. **This does not block Steps 1–10.** It decides Step 11.

- **Q6** **A first electronic partner:** does any reference lab the site uses offer an electronic interface (FHIR, HL7, a portal API)? If yes, obtain its document, a test environment and its agreement template. If none, Step 9 builds against the simulator only and stays disabled.
- **Q7** **The first analyser:** the exact model and firmware on site (for the DH-615, confirm the model and differential mode, H16), physical ports, whether a network point exists, and **the maker's LIS interface document** from the maker or the local distributor. If the document cannot be obtained, Step 10 is a gap report.
- **Q8** **Site for the bridge:** where it would run, power and UPS, the lab network, outbound internet, who holds the hardware.
- **Q9** `lib/emr/fhir.ts`: what it maps today, its FHIR version and its tests.
- **Q10** Storage: a private bucket and policies for report scans; virus scanning if any; image size limits.
- **Q11** **Data protection:** the hospital's PDPO registration (number, purposes, renewal); who the data protection lead is; any existing agreements with reference labs; whether any partner processes data outside Uganda.
- **Q12** **High-risk referrals at this site:** who packs and carries VHF specimens, who the IPC lead and the district surveillance focal person are, and what the site's outbreak procedure says. If the site has no written procedure, record that; the wording in Appendix A is signed by the IPC lead before `labReferral` turns on.
- **Q13** Job runner or scheduled functions on the branch (for the outbox worker); how route handlers authenticate machines today, if at all.
- **Q14** HMIS 105 10.4: the columns on the verified form (Phase 3 Q3) and the Division of Health Information's definition of turnaround for referred tests.
- **Q15** Playwright, axe and a fake-clock utility. If Playwright or axe is missing, STOP and flag.

**Baseline:**

- Screenshots of To refer, the doctor's order view and results, and the hub's referral fields.
- **Failing tests** that reproduce:
  - a specimen that leaves To refer has no further record;
  - a returned result can only be entered as a new order (or not at all);
  - a result could be released with a range that is not the performing lab's.

  Do not fix them yet.

**STOP 0.** Report Q1–Q15, the prompt-versus-repo differences, the letter sent, the inputs in hand for Steps 9, 10 and 11, the failing tests and the baseline.

### Step 1 — GATE A proposal (documents only)

Write `docs/lab/phase-4/gate-a-proposal.md`. It contains:

- annotated wireframes of every screen in Section 5, starting from the canvas;
- the referral state machine (RF-3) and the manifest states (MF-3) as diagrams and tables with worked examples, including lost, rejected, cancelled after handover and a late status arriving out of order;
- the message store, outbox and inbound processing flows (EX-\*), with the store-before-acknowledge sequence for HTTPS, HL7 and ASTM;
- the matching rule (MA-1, MA-2) with a worked example for every reason code;
- the FHIR mapping (FX-\*) with an example Bundle out and in, validated;
- **the bridge decision** (D-LAB4-14): the OpenELIS Analyzer Bridge evaluated against AB-1–AB-13, its licence obligations, its dependencies, and build-or-reuse with reasons;
- **the security design** for GATE S: identities, pairing, mTLS or signed JWT, scopes, secrets, certificate rotation, what an attacker on the lab network could and could not do;
- the schema diff, the RLS probe plan, the service-identity model;
- **the sign-off packs** (Appendix C) pre-filled only from the site's current practice (Q3, Q4, Q12) and the sources. Propose no turnaround, no codes, no ranges;
- every string in Appendix A, with its status;
- **the hazard log** (Appendix B), each with cause, effect, control, the test that proves the control, and the residual risk;
- the test plan (including the bridge kill and network-drop tests and the shadow run), the rollout plan per flag, the user-guide outline and the ADR drafts;
- the decision table (Section 14) with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions.

### Step 2 — Data layer

- Approved migrations, append-only triggers, flags, permissions, service identities, the private bucket and its policies, RLS probes.

**STOP 2.** Report the migration diff, the RLS probe table (every object × every actor, including service identities), and the append-only proofs.

### Step 3 — Engines (pure, no UI)

Build Sections 6.1–6.9 with tests:

- every rule ID covered;
- the RF-3 transition table, edge by edge, and event ordering (EX-7);
- RF-5 with stated turnaround in hours, days and working days, and with none;
- MA-1 and MA-2 on every reason code, with two-hospital fixtures;
- normalisation for name comparison (case, spacing, order), with a fixture of near-misses that must **not** match;
- EX-3 de-duplication and EX-6 idempotent filing;
- RB-3 unit and range handling, including no printed range and an unknown unit;
- FX-1 Bundles validating against base R4; FX-3 parsing of a non-conformant but profiled message;
- HM-14 on a fixture month, with an expected-output file reviewed by a person.

**STOP 3.** Report test counts, the rule coverage table and the HM-14 fixture review.

### Step 4 — Partners register and legal record (behind `labReferral`)

Build Partners (5.10): register, tests and turnaround, packing checklists, legal record, field lists, signatures.

Scenarios:

- **S1** The laboratory lead adds the private reference lab, its tests and codes, and signs them. An unmapped test shows "Map before sending".
- **S2** The data protection lead records the basis, agreement and field list and signs. Diagnosis cannot be added to a field list.
- **S3** An `abroad` partner without safeguards: a referral to it is refused with the reason; with a recorded consent on the referral, it is allowed.
- **S4** A partner's review date passes: amber on Partners; both leads notified; sending continues (or stops, per D-LAB4-20).

**STOP 4.** Report scenario results and screenshots against artboard 10.

### Step 5 — Send-out (behind `labReferral`)

Build To refer's send panel, aliquots, manifests, printing, handover, receipt and the outbreak referral.

Scenarios:

- **S5** Two specimens to the private lab: Add to manifest stays disabled until both form numbers are scanned and every packing item is ticked; then it adds, seals and prints. The timed run meets the budget.
- **S6** The printed manifest carries no patient names, carries the Code 128 manifest number, and reprints say "Copy".
- **S7** Handover records the rider's name and time; every referral moves to "With the rider". The doctor's order line shows "Sent to {destination}".
- **S8** One tube for two destinations: an aliquot with its own lab number and label; two referrals.
- **S9** A high-risk specimen cannot be selected for a routine send; **Record outbreak referral** records who was informed and moves it to "Handed to the outbreak team".
- **S10** A user without HIV access sees "Restricted test" on To refer and on the manifest preview, never the test name or patient.
- **S11** The signed manifest returns with one tube broken: discrepancy recorded, nonconformity opened, the affected referral marked and the doctor told.

**STOP 5.** Report scenario results, the manifest print at 100 %, and screenshots against artboards 1 and 2.

### Step 6 — Tracking, overdue, lost and the doctor's view (behind `labReferral`)

Build Referrals (5.3), the doctor's view (5.5), cancel, rejected, lost, recollect.

Scenarios:

- **S12** A referral with a stated turnaround of 2 days, handed over on Monday at 10:00, is expected on Wednesday at 10:00; on Thursday at 11:00 (fake clock) it shows "Overdue 1 day" in amber, to the lab and to the doctor.
- **S13** No stated turnaround: "Not stated", never overdue.
- **S14** Updates from the rider's log book record the person and the source; the timeline shows who said so.
- **S15** A status from a partner dated earlier than the last applied one is stored, shown in the timeline, and not applied (EX-7).
- **S16** The reference lab rejects a specimen as haemolysed: the doctor is told; To refer offers Recollect after a new specimen is received; HMIS counts it once.
- **S17** The doctor cancels after handover: a cancellation is noted; a result that still returns files with "Cancelled by the doctor after sending".
- **S18** Mark lost needs the last known event and a call note; it opens a nonconformity and tells the doctor.
- **S19** Every tile number opens its referrals; an empty month shows "No data", not 0.

**STOP 6.** Report scenario results and screenshots against artboards 3 and 5.

### Step 7 — Results back on paper, and HMIS 10.4 (behind `labReferral`)

Build 5.4, provenance, transcription checks, amendments from partners, and HM-14–HM-17.

Scenarios:

- **S20** A thyroid result typed from paper: units and ranges as printed, flag against the printed range, conversion through the registry, scan attached, second-person check, released. The doctor sees the provenance block and opens the scan.
- **S21** The typed name or date of birth disagrees with the referral: entry is refused and a reconciliation item opens.
- **S22** A unit not in the registry blocks release with "Ask the laboratory lead to add {unit}".
- **S23** No printed range: no flag, "No range printed".
- **S24** A printed value beyond this hospital's critical limit in the same unit starts the Phase 1 critical call.
- **S25** Alone on duty: released marked "Entered by one person"; the next shift's check clears it, or opens an amendment if it differs.
- **S26** A corrected report from the reference lab follows the amendment path; the old values and scan are kept; the doctor gets a correction alert.
- **S27** A VL result from a dashboard printout is entered as a paper result with the printout attached and the source named.
- **S28** HMIS 10.4 for a fixture month from records equals the hand count of the same referrals; the Phase 3 manual cells are retired for that month.

**STOP 7.** Report scenario results, the timed entry trial, screenshots against artboard 4, and the HM-14 comparison.

### Step 8 — Exchange core and reconciliation (behind `labExchange`)

Build the inbound endpoint, the message store, the outbox worker, inbound processing, matching, the reconciliation queue (5.7) and Connections (5.6). Build a **partner simulator** (test only) that sends and receives FHIR and HL7 messages, including malformed, duplicated, out-of-order and wrong-patient cases.

Scenarios:

- **S29** A message is stored before the acknowledgement; killing the server between store and process loses nothing; on restart it processes once.
- **S30** The same message delivered three times files once; the duplicates are recorded.
- **S31** The outbox retries with back-off when the partner is down and delivers when it returns; past the attempt limit, the message is dead and shown under Needs a person.
- **S32** A result whose form number matches but whose name and date of birth differ waits with `demographics_disagree`; values are hidden; filing after confirming needs the confirmation type, a second person and a reason.
- **S33** A form number that matches two referrals waits as `ambiguous`; nothing is picked.
- **S34** No message ever creates a patient, order or specimen (asserted across the whole simulator suite).
- **S35** The raw view of a message needs a reason and is audited; no PHI appears in application logs (log scan).
- **S36** A service identity cannot read any patient, order, result or other message (RLS probe).

**STOP 8.** Report scenario results, the simulator suite, the log scan and the RLS probes.

### Step 9 — A partner's electronic connection (conditional; partner enabled by signed setting)

**Only if Q6 found a partner with a document, a test environment and a signed agreement.** Otherwise write `docs/lab/phase-4/partner-gap.md` and STOP.

Build the FHIR R4 Task adapter (FX-\*) for that partner against its test environment.

Scenarios:

- **S37** A referral goes out as a validated Bundle with only the fields on the signed list; the partner's Task status updates move the referral (RF-3 table).
- **S38** A result comes back, matches by MA-1, lands as "Back, to file", and a lab user files it; the doctor sees "From {partner}'s system".
- **S39** Disabling the connection stops sending at once; paper continues.
- **S40** GATE S has passed for this partner's credentials and endpoint before production.

**STOP 9.** Report scenario results against the partner's test environment and the GATE S record.

### Step 10 — The analyser bridge (conditional; behind `labAnalyserBridge`)

**Only if Q7 produced the maker's interface document for the model on site.** Otherwise write `docs/lab/phase-4/analyser-gap.md` (what is missing, from whom) and STOP.

Build or adopt the bridge (D-LAB4-14), the driver profile for the one analyser, pairing, the outbox, the server side, Analysers (5.8) and interfaced result entry (5.9). Test first against **recorded messages** (from the maker's document or captured on site with patient data replaced) and a serial or TCP simulator.

Scenarios:

- **S41** Frames with a bad checksum are NAKed and resent; the record is stored once.
- **S42** Pulling the network for an hour: results are kept on the bridge and delivered in order when it returns; none lost, none doubled.
- **S43** Killing the bridge process mid-transmission: the incomplete transmission is not filed; the analyser's resend files once.
- **S44** A result for a specimen not yet received waits as `not_received`; **Receive the specimen, then file** files it.
- **S45** An unmapped code and a unit mismatch are kept and shown on Analysers; neither reaches a patient.
- **S46** A control sample's result goes to Phase 3 QC as an interfaced run value, evaluated by the Westgard rules, never to a patient.
- **S47** An interfaced haemoglobin while QC has failed on that analyser is held exactly as a typed one (Phase 3 QH-2).
- **S48** Editing an interfaced value needs a reason; both values are kept.
- **S49** The analyser's clock is set 4 minutes behind: the skew note appears; result times are the analyser's completed time.
- **S50** **Shadow run** for the signed period: daily comparison lists every difference; live needs zero unexplained and the lab lead's signature.
- **S51** GATE S passes: pairing, mutual authentication, scopes, no inbound port from the internet, dependency review.

**STOP 10.** Report scenario results, the kill and drop test logs, the shadow comparison, and the GATE S record.

### Step 11 — National connections (conditional; behind `labNationalExchange`; GATE N)

**Only if Q5 produced, for a given system, a written specification, a signed data-sharing agreement, a test environment and a named contact.** For each system without all four, write `docs/lab/phase-4/national-gap.md` with what was asked, when, of whom, and the answer, and STOP. **No code.**

Where a system clears GATE N:

- build its adapter (NX-2) on the existing store, matching and partner register;
- at an A-LIS site, turn on order and result exchange and verify that no result is typed twice over a two-week trial (NX-3);
- for IRRDS and ResTrack, the CPHL barcode is the join key (NX-4);
- for the LDR, send exactly what the specification and agreement say (NX-5).

**STOP 11.** Report per system: built or gap, test environment results, and the agreement on file.

### Step 12 — Hardening and documentation

- axe on every new route; keyboard paths; reduced motion.
- Load: 500 inbound messages in a minute from the simulator; the budgets in Section 11.
- Security: GATE S findings closed; secrets in the secrets store; certificate rotation rehearsed; revoking a bridge or partner takes effect at once.
- The hazard log closed with tests; user guides (send-out, tracking, results back, reconciliation, analysers, partners); ADRs; the final report.

**STOP 12.** Report Section 13 and the Definition of Done.

---

## 10. Accessibility, motion, colour

- WCAG 2.2 AA. Targets at least 44 × 44 px on touch.
- **The tracker** names each step and its state in text ("At CPHL: not confirmed, late"), not by colour or bar alone.
- **The comparison table** says Same, Differs or Cannot compare in words with an icon.
- **Locked interfaced values** announce "from the analyser, locked"; the edit needs an explicit control.
- **Scanning fields** accept typing; the result of a scan is announced.
- **Status chips** are words with icons; never colour alone. The live navigation counts update politely (`aria-live="polite"`), never steal focus.
- **Colour:** teal for actions and focus; the lab hue for active navigation; amber and dark amber for overdue, rejected, lost, retrying, needs a person, waiting for a match, unit differs; sky tint for referred provenance; neutral chips for connected, delivered, matched and result back; **no red fills, no green**.
- **Print** (manifest): black on white, body at least 12 px, rules at least 1 px, barcode at a scannable size tested with the site's scanners.

## 11. Performance budgets

| Measure                                                   | Budget                                         |
| --------------------------------------------------------- | ---------------------------------------------- |
| `POST /api/exchange/inbound` store and acknowledge        | p95 < 300 ms                                   |
| Inbound message to filed (match)                          | p95 < 5 s                                      |
| Outbox worker pick-up after enqueue                       | p95 < 10 s                                     |
| `createReferral` + `addToManifest`, 10 specimens (server) | p95 < 800 ms                                   |
| Referrals page, one month                                 | p95 < 2 s TTFB                                 |
| Bridge store before ACK on site hardware                  | p95 < 100 ms                                   |
| Bridge memory and disk                                    | report; disk alarm before the store fills      |
| Added JS on `/lab` and the doctor's views                 | report each; flag anything above 40 KB gzipped |

## 12. Security, privacy, audit

- AAL2 on every person route here. Hospital scope on every read and write.
- **Machines** authenticate as service identities (AB-6): mutual TLS with pinned certificates or signed-JWT client credentials, least-privilege scopes, short tokens, no refresh tokens, credentials in the secrets store, revocable at once.
- **Nothing listens on the internet at the site.** The bridge connects outbound only. Analyser ports are on the lab network only.
- **Audited** with actor, time and hospital: every referral event, manifest print and receipt; every result entered, checked, released or filed; every raw message view; every match resolution; every mapping, profile and field-list signature; every pairing, revocation, shadow sign-off and go-live; every partner connection change.
- **Data protection:** the legal record per partner (PT-2) before any electronic sending; field lists minimise what leaves; manifests carry no names; cross-border sending is refused without safeguards or consent; breach handling follows s.23 (notify the PDPO immediately) with the partner's breach contact on file.
- **Retention:** messages and scans are kept with the clinical record's retention; no purge job in this slice.
- The governance gap stays documented: Fadhul holds the superadmin, CSO and audit-reviewer roles at once. D-LAB1-12 applies to every signature in this slice.

---

## 13. Numbers to report at the final STOP

| Metric                                                                      | Baseline | Target | Result |
| --------------------------------------------------------------------------- | -------- | ------ | ------ |
| Referred specimens with no record between To refer and a result or decision | Step 0   | 0      |        |
| Referred results filed on the original order                                | Step 0   | 100 %  |        |
| Referred results released without a scan (paper)                            | —        | 0      |        |
| Referred results flagged against this hospital's range                      | Step 0   | 0      |        |
| Results filed to the wrong patient (all sources)                            | —        | 0      |        |
| Patients, orders or specimens created from a message                        | —        | 0      |        |
| Messages lost in kill and drop tests                                        | —        | 0      |        |
| Results filed twice after redelivery                                        | —        | 0      |        |
| Interfaced results released without a technologist                          | —        | 0      |        |
| Interfaced results released through a QC hold without an override           | —        | 0      |        |
| Shadow-run differences unexplained at go-live                               | —        | 0      |        |
| High-risk specimens on a routine manifest                                   | —        | 0      |        |
| Electronic sends to a partner without a complete legal record               | —        | 0      |        |
| Patient names on a manifest                                                 | —        | 0      |        |
| HMIS 10.4 cells differing from the hand count, unexplained                  | —        | 0      |        |
| Clinical numbers or codes in code, seeds or copy                            | —        | 0      |        |
| National connectors coded without GATE N                                    | —        | 0      |        |
| Hazards without a control and a test                                        | —        | 0      |        |
| Rule IDs without a test                                                     | —        | 0      |        |
| RLS probes passed (including service identities)                            | —        | 100 %  |        |
| axe serious or critical                                                     | S0       | 0      |        |
| Red fills or green on new routes                                            | —        | 0      |        |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| #         | Decision                                    | Recommendation                                                                                                                                                                                                                                                                |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-LAB4-01 | Scope of this slice                         | Referrals and results back; the exchange core; one partner connection if available; one analyser at one site; national connections only past GATE N. Microbiology, blood bank, histopathology and billing are separate prompts                                                |
| D-LAB4-02 | Where a referred result lives               | On the original order line and specimen, never a new order (RB-1)                                                                                                                                                                                                             |
| D-LAB4-03 | Referral status model                       | RF-3 states mapped to FHIR R4 Task.status, so the same model serves paper, partners and national systems                                                                                                                                                                      |
| D-LAB4-04 | Overdue                                     | From the partner's stated turnaround for the test; none stated → never overdue. Labelled the partner's figure, not a clinical target                                                                                                                                          |
| D-LAB4-05 | Manifest content                            | Lab numbers, partner identifiers, specimen, containers, test, collected time. No patient names or clinical details. Code 128 manifest number                                                                                                                                  |
| D-LAB4-06 | Lost specimens                              | A person marks lost with the last known event and a call note; a nonconformity opens; the doctor decides on recollection                                                                                                                                                      |
| D-LAB4-07 | High-risk specimens                         | Never on a routine manifest or run; outbreak referral recorded with who was informed; wording signed by the IPC lead (Appendix A)                                                                                                                                             |
| D-LAB4-08 | Paper results                               | Entered from the referral, as printed, with the scan required and a second-person check when one is on duty; otherwise "Entered by one person" with a next-shift check                                                                                                        |
| D-LAB4-09 | Ranges and flags for referred results (CSO) | The reference lab's printed or sent range; this hospital's ranges never applied. No range printed → no flag. Critical limits still apply in the hospital's unit                                                                                                               |
| D-LAB4-10 | Units                                       | As printed, which must exist in the unit registry; conversion only through the registry; both shown                                                                                                                                                                           |
| D-LAB4-11 | Electronic results from partners            | Land as "Back, to file"; a lab user files them in this slice. Automatic filing to the doctor is a later decision after three months with no mismatches                                                                                                                        |
| D-LAB4-12 | Matching rule (CSO)                         | MA-1 and MA-2 exactly; everything else to the reconciliation queue; never create, never pick; values hidden until a decision; manual filing with confirmation, second person and reason                                                                                       |
| D-LAB4-13 | Message store                               | Append-only, store before acknowledge, de-duplicate by sender id and content hash, dead letters never purged                                                                                                                                                                  |
| D-LAB4-14 | Bridge: build or reuse                      | Evaluate the OpenELIS Analyzer Bridge (MPL-2.0) first; adopt unmodified if it meets AB-1–AB-13 and GATE S; otherwise build a minimal bridge on the same pattern                                                                                                               |
| D-LAB4-15 | Bridge authentication                       | Mutual TLS with pinned certificates and a one-time pairing code (as the OpenELIS bridge does); SMART Backend Services signed JWT as the alternative where TLS termination prevents client certificates                                                                        |
| D-LAB4-16 | Shadow run                                  | Two weeks or 200 specimens, whichever is later, with zero unexplained differences, signed by the laboratory lead before go-live                                                                                                                                               |
| D-LAB4-17 | First analyser                              | The analyser at the pilot site whose maker's interface document is in hand first. Haematology (DH-615, network) is the likely first if its document arrives; chemistry on serial follows                                                                                      |
| D-LAB4-18 | Order download to analysers                 | Off in this slice unless the maker's document and an on-site test confirm it (AB-12)                                                                                                                                                                                          |
| D-LAB4-19 | Legal basis                                 | DPPA s.7(2)(d) medical purposes for referral; s.7(2)(b)(i) public duty for national reporting; s.9 position reviewed by the hospital's counsel; agreements and processor terms (s.21) for electronic partners; paper referrals to public reference labs need no new agreement |
| D-LAB4-20 | Review date passed                          | Inform and notify; stop electronic sending 30 days after the review date unless renewed (operational, set by the data protection lead)                                                                                                                                        |
| D-LAB4-21 | Field lists                                 | Signed per partner; diagnosis, phone and address never sent; clinical question opt-in                                                                                                                                                                                         |
| D-LAB4-22 | Cross-border partners                       | Refused unless safeguards are documented or the referral records the patient's consent (s.19)                                                                                                                                                                                 |
| D-LAB4-23 | National connections                        | Built only past GATE N (written spec, signed agreement, test environment, named contact). Letter to NHLDS at Step 0. No scraping, no unofficial endpoints                                                                                                                     |
| D-LAB4-24 | A-LIS sites                                 | MedSync sends orders to A-LIS and takes results back once specified; it does not rebuild A-LIS; `labReferral` and Phase 3 flags stay off there                                                                                                                                |
| D-LAB4-25 | HMIS 10.4                                   | From records when `labReferral` was on for the whole month; turnaround definition confirmed with the Division of Health Information                                                                                                                                           |
| D-LAB4-26 | Rollout order                               | `labReferral` (paper, at the pilot site) → `labExchange` (simulator, then the first partner if any) → `labAnalyserBridge` (one analyser, shadow, then live) → `labNationalExchange` only past GATE N                                                                          |
| E-LAB4-01 | Engine                                      | The exchange is a generic module (`lib/exchange/**`) that later modules (pharmacy, radiology, the national HIE) reuse                                                                                                                                                         |
| E-LAB4-02 | Adapters                                    | One interface for every connection; mappings versioned and signed as data                                                                                                                                                                                                     |
| E-LAB4-03 | The bridge                                  | A separate deployable with its own release and dependency review; it holds no PHI at rest beyond its durable message store, which is encrypted and pruned only after delivery confirmation plus a retention window set at GATE S                                              |

## 15. Out of scope (leave clean seams)

**Roadmap Phase 4, separate prompts:**

- **microbiology** (staged reports, organisms and antibiotics, antibiogram, HMIS 10.6 AMR, and later the Phase 5 IPC feed);
- **blood bank** (group and crossmatch, unit issue and traceability, transfusion reactions);
- **histopathology and cytology** (narrative reports, never auto-released to patients);
- **billing hooks** (prices on the single test menu, when a billing module exists).

**Not here:**

- automatic filing of partner results to the doctor without a lab user (D-LAB4-11);
- order download to analysers (unless D-LAB4-18 is met);
- LIVD import beyond drafts;
- patient-facing referral status or results (roadmap Phase 5);
- SMS to patients;
- DHIS2 or eHMIS push (HMIS stays print and CSV);
- courier or rider apps of MedSync's own (ResTrack exists; connect to it past GATE N);
- the client registry and NIN lookup (H6 shows only a staging endpoint);
- the mobile (Expo) app (Gate CG).

## 16. ADRs (next free numbers)

- Referrals on the original order; the status model mapped to FHIR Task.
- Manifests without patient names.
- Results back: provenance, the reference lab's units and ranges, scans, the second-person check.
- The exchange module: append-only store, store before acknowledge, outbox, de-duplication.
- The matching rule and the reconciliation queue.
- The analyser bridge: build or reuse, drivers from makers' documents, shadow run.
- Machine identities and authentication.
- Partners' legal records and field lists under the DPPA.
- National connections behind GATE N.

## 17. Definition of Done

- [ ] H1–H24 confirmed or corrected and recorded. The letter to NHLDS is sent and its answer recorded.
- [ ] Every referred specimen has a record from To refer to its result or a decision. Manifests print without names. High-risk specimens never join a routine manifest.
- [ ] Overdue, rejected, cancelled and lost behave as specified; the doctor sees where the specimen is.
- [ ] Referred results file on the original order with provenance, the reference lab's units and ranges, the scan, and a second-person check or its marker.
- [ ] HMIS 10.4 comes from records and matches the hand count.
- [ ] The message store keeps everything, acknowledges only after storing, never files twice, and the reconciliation queue holds everything the matching rule does not file. No message creates a patient.
- [ ] Step 9 is built and tested against a partner, or its gap report exists.
- [ ] Step 10: one analyser is live after a signed shadow run, or the gap report exists. Interfaced results are preliminary until released, and the QC hold applies.
- [ ] Step 11: each national system is built past GATE N, or its gap report exists. No national code without GATE N.
- [ ] GATE S passed for every machine connection in production.
- [ ] No clinical number or code exists in code, seeds or copy.
- [ ] Every rule ID has a test. RLS probes are green, including service identities. Append-only tables hold.
- [ ] axe clean. No red fills or green. Reduced motion honoured.
- [ ] S1–S51 pass (conditional steps: their scenarios, or the gap report). With all flags off, behaviour matches the Phase 3 baseline.
- [ ] The hazard log is complete and signed. User guides, ADRs and the final report exist. The diff on `feat/lab-connect-outward` is reviewable.

---

## Appendix A — Copy to be signed (all `draft` until signed; the CSO signs those a clinician reads; the IPC lead signs the high-risk lines)

| Key                       | Text                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order line, sent          | Sent to {destination} on {date}. Expected about {date}.                                                                                                                                                                                                                                                                                                                                                     |
| Order line, overdue       | Sent to {destination} on {date}. Overdue since {date}; the lab is following up.                                                                                                                                                                                                                                                                                                                             |
| Order line, not stated    | Sent to {destination} on {date}. The lab has no stated turnaround for this test.                                                                                                                                                                                                                                                                                                                            |
| Rejected by reference lab | {Destination} could not test the {specimen}: {reason}. A new sample is needed.                                                                                                                                                                                                                                                                                                                              |
| Lost                      | The {specimen} sent to {destination} on {date} has not arrived. The lab has opened an investigation. Please decide whether to take a new sample.                                                                                                                                                                                                                                                            |
| Cancelled after sending   | Cancelled by the doctor after sending.                                                                                                                                                                                                                                                                                                                                                                      |
| Provenance, paper         | Done at {partner}. Their report {number}, {time}, authorised by {name as printed}. Ranges are theirs, as printed. Entered from the paper report by {user}, checked by {user}.                                                                                                                                                                                                                               |
| Provenance, one person    | Entered by one person. A second check is due.                                                                                                                                                                                                                                                                                                                                                               |
| Provenance, electronic    | From {partner}'s system, message {id}. Ranges are theirs. Filed by {user}.                                                                                                                                                                                                                                                                                                                                  |
| Filed after mismatch      | Filed by hand after a mismatch, confirmed with {partner} by {method}.                                                                                                                                                                                                                                                                                                                                       |
| No range printed          | No range printed.                                                                                                                                                                                                                                                                                                                                                                                           |
| Unknown unit              | {Unit} is not in this hospital's unit list. Ask the laboratory lead to add it.                                                                                                                                                                                                                                                                                                                              |
| Matching rule             | A result files by itself only when its sample or form number matches an open order and one more thing agrees. Anything else waits here. MedSync never creates a patient from a result and never guesses.                                                                                                                                                                                                    |
| High-risk referral        | {Lab no.} is a high-risk specimen. Do not add it to a routine manifest or give it to the hub rider. Follow the outbreak procedure: it is packed as Category A by trained staff and goes to the national reference laboratory by the arranged transport. Tell the infection prevention lead and the district surveillance focal person now. MedSync records the referral; it does not arrange the transport. |
| Manifest footer           | No patient names on this sheet. Patient details are on each request form inside the package.                                                                                                                                                                                                                                                                                                                |
| Add to manifest disabled  | Scan {n} more form numbers and tick {m} packing items first.                                                                                                                                                                                                                                                                                                                                                |
| Map before sending        | {Test} has no code for {partner}. Ask the laboratory lead to map it.                                                                                                                                                                                                                                                                                                                                        |
| Not connected, CPHL       | Needs onboarding with NHLDS, a data-sharing agreement and their interface specification. Until then: their paper form, the hub rider, and results entered by hand.                                                                                                                                                                                                                                          |
| Not connected, LDR        | No submission specification is published yet.                                                                                                                                                                                                                                                                                                                                                               |
| Not used here, A-LIS      | This hospital's lab runs on MedSync.                                                                                                                                                                                                                                                                                                                                                                        |
| Interfaced preliminary    | From {analyser}, preliminary. A technologist releases it.                                                                                                                                                                                                                                                                                                                                                   |
| Interfaced edited         | Changed from the analyser's {value} by {user}: {reason}.                                                                                                                                                                                                                                                                                                                                                    |
| Unit differs              | Not filed: the analyser sent {unit}; this test expects {unit}.                                                                                                                                                                                                                                                                                                                                              |
| Mapping source            | Codes and units come from the maker's interface document, never from memory.                                                                                                                                                                                                                                                                                                                                |
| Clock skew                | The {analyser} clock is {n} minutes {behind or ahead}. Result times use the time the analyser finished, so set the analyser's clock.                                                                                                                                                                                                                                                                        |
| Bridge not heard          | Bridge {name} not heard since {time}. Results are kept on the bridge if it is running. Type results from the analyser's printout until it returns.                                                                                                                                                                                                                                                          |
| Cross-border refused      | {Partner} processes data outside Uganda. Record the patient's consent or the safeguards before sending.                                                                                                                                                                                                                                                                                                     |
| No data                   | No data                                                                                                                                                                                                                                                                                                                                                                                                     |

## Appendix B — Hazard log seed (complete each at Step 1; close each with a test)

For each hazard: cause, effect, control built, the test that proves the control, and residual risk.

1. A referred specimen is lost and nobody notices; the patient waits or is never re-tested.
2. A result returns and is filed to a new order the doctor never opens.
3. A returned result is filed to the wrong patient (wrong form number on the report, swapped tubes).
4. A referred result is flagged against this hospital's range and misread.
5. A unit is misread (mg/dL taken as mmol/L) on a typed referred result.
6. A typed referred result has a transcription error.
7. A critical referred result is not called.
8. A high-risk specimen travels on the routine run and exposes the rider and the hub.
9. A manifest left in a vehicle exposes patients.
10. An analyser result files to the wrong specimen because the sample id was mistyped at the analyser.
11. An analyser result is released without a technologist, or through a failed QC.
12. An unmapped code or a different unit reaches a patient's record.
13. A control sample's result files to a patient, or a patient's to QC.
14. The bridge acknowledges and then loses a message.
15. Redelivery files a result twice, or overwrites a released result.
16. An out-of-order status makes a completed referral look in transit.
17. The analyser's clock is wrong and turnaround or result times mislead.
18. A compromised bridge or partner credential reads or writes patient data.
19. Data goes to a partner without a legal basis, agreement or field list; or outside Uganda without safeguards.
20. More is sent than the partner needs (diagnosis, phone number).
21. A national connector is built from an unofficial endpoint and breaks or leaks.
22. HMIS 10.4 misreports referrals, turnaround or pending.
23. A corrected report from the reference lab is not applied, or overwrites without a trace.
24. The reconciliation queue grows unattended and results never reach doctors.
25. Restricted results appear on lists, manifests or the queue to users without access.

## Appendix C — Sign-off packs (templates only; pre-fill only from the site's current practice and the sources; propose no values)

- **Partner tests.** Partner, our test, their code, stated turnaround and its unit, required identifiers, specimen requirements, source (their price list or test guide, with date), laboratory lead.
- **Packing checklist.** Destination, specimen category, items (triple packaging, UN3373 Category B mark, forms between the second layer and the outer box, temperature as the destination asks), source (WHO 2025–2026 transport guidance; the destination's instructions), laboratory lead.
- **Legal record.** Partner, basis (DPPA s.7(2) letter), agreement and dates, processor terms, cross-border and safeguards, PDPO registration, breach contact, data protection lead.
- **Field list.** Partner, fields, clinical question yes or no, data protection lead.
- **Analyser mapping.** Analyser, firmware, maker's document reference and version, each code to component and unit, flag meanings signed, laboratory lead.
- **Shadow run.** Analyser, period, specimens, differences and their explanations, laboratory lead.
- **High-risk wording.** Site outbreak procedure reference, who packs, who carries, who is informed, IPC lead.
- **HMIS 10.4.** Rows mapped, turnaround definition and its source (Division of Health Information), counting rules, laboratory lead and HMIS focal person.

## Appendix D — Sources checked (13 Oct 2026; re-verify at build time)

Full notes, quotes and confidence marks are in `docs/lab/phase-4/LAB-PHASE-4-RESEARCH.md`.

**Uganda**

- APHL, "Digital transformation of Uganda's Ebola outbreak response through IRRDS and ResTrack", 6 Aug 2026: https://aphl.org/resources/resource-detail/digital-transformation-of-uganda-s-ebola-outbreak-response-through-irrds-and-restrack-systems
- APHL, "Creating more modern laboratory systems in Uganda", 20 May 2026: https://aphl.org/resources/resource-detail/creating-more-modern-laboratory-systems-in-uganda
- IRRDS integrated dashboard: https://irrds.cphl.go.ug/integrated-dashboard
- MoH, LDR launch, 3 Feb 2026: https://cphl.go.ug/node/279 and https://cphl.go.ug/ldr ; APHL Lab Matters, Summer 2026
- A-LIS User Guide v3 (June 2021): https://cphl.go.ug/web/sites/default/files/2024-10/ALIS%20User%20Guide.pdf
- Kiyaga et al., PLoS ONE 2013;8(11):e78609 (hub design): https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0078609
- NHLDS hub riders, 6 Sep 2023: https://cphl.go.ug/node/350
- ASLM/NHLDS, LabRDS (Dec 2023): https://aslm.org/wp-content/uploads/2024/04/Timely-Access-Utilization-of-Laboratory-Test-Results-Using-LabRDS-in-Uganda.pdf
- VL dashboard: https://vldash.cphl.go.ug
- Stop TB, Uganda connectivity (LabXpert), Feb 2024: https://www.stoptb.org/sites/default/files/uganda_connectivity_project_summary_feb24.pdf
- UgandaEMR sync module (METS-Programme/openmrs-module-ugandaemr-sync), commit of 10 Jul 2026
- Makerere, handover of 16 systems to MoH, Apr 2026: https://news.mak.ac.ug/2026/04/mak-transitions-100-million-digital-health-systems-assets-to-health-ministry/
- Health Information and Digital Health Strategic Plan 2020/21–2024/25: https://extranet.who.int/cpcd/sites/default/files/public_file_repository/uga_uganda_health-information-digital-health-strategic-plan_2020-2025.pdf
- Data Protection and Privacy Act 2019: https://www.ulii.org/akn/ug/act/2019/9 ; PDPO registration: https://www.pdpo.go.ug/register/
- WHO DON602 (Bundibugyo, May 2026): https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON602
- WHO, Guidance on regulations for the transport of infectious substances 2025–2026: https://www.who.int/publications/i/item/9789240120822

**Standards**

- CLSI LIS01-A2, LIS02-A2, AUTO16-Ed2, AUTO02-A2, AUTO12-A: https://clsi.org/shop/standards/lis01/ , /lis02/ , /auto16 , /auto02/ , /auto12/
- IHE PaLM TF-2b Rev 11.0 (LAW): https://ihe.net/uploadedFiles/Documents/PaLM/IHE_PaLM_TF_Vol2b.pdf
- IHE ITI-19 Authenticate Node: https://profiles.ihe.net/ITI/TF/Volume2/ITI-19.html
- SMART Backend Services: https://hl7.org/fhir/smart-app-launch/backend-services.html
- FHIR R4 Task and workflow management: https://hl7.org/fhir/R4/task.html , https://hl7.org/fhir/R4/workflow-management.html
- OpenHIE laboratory workflows: https://guides.ohie.org/arch-spec/introduction/laboratory-work-flows/order-laboratory-test
- HL7 LIVD IG: https://hl7.org/fhir/uv/livd/2024Jan/
- Kenya Lab Order IG (draft): https://build.fhir.org/ig/IntelliSOFT-Consulting/Kenya-LabOrder-IG/artifacts.html
- OpenELIS Analyzer Bridge: https://github.com/DIGI-UW/openelis-analyzer-bridge
- Beckman Coulter LIS vendor information C03112 (ASTM implementation detail): https://www.beckmancoulter.com/download/file/wsr-228138/C03112AE?type=pdf
- ONC SAFER Guides 6 and 8 (2025): https://healthit.gov/wp-content/uploads/2025/01/Safer-Guide-6.-Patient-Identification-Final.pdf
- Dymind DH-615: https://www.dymind.com/en-US/products/94 ; Roche cobas c 111 brochure; Mindray BS-230/240 brochure

## Appendix E — Letter to NHLDS (draft for the hospital to send at Step 0)

> **To:** The Commissioner, National Health Laboratory and Diagnostic Services, Ministry of Health
> **Copy:** Division of Health Information
> **Subject:** Request for interface specifications and onboarding: IRRDS, ResTrack, A-LIS and the National Laboratory Data Repository
>
> {Hospital name}, {HMIS facility code}, uses MedSync for its clinical and laboratory records. We refer specimens through the national sample transport network and wish to:
>
> 1. create requests and receive results through IRRDS, and receive sample-tracking events from ResTrack, so that results return to the requesting clinician without retyping;
> 2. where a partner facility's laboratory runs A-LIS, exchange orders and results with it;
> 3. submit laboratory data to the National Laboratory Data Repository as the Ministry requires.
>
> We request: the interface specifications and data standards for each system; access to a test environment; the onboarding and certification steps; the data-sharing agreement template and the signatory; and a technical contact.
>
> We will exchange only the fields the specification requires, under the Data Protection and Privacy Act 2019. Our registration with the Personal Data Protection Office is {number}.
>
> {Name, title, contact}
