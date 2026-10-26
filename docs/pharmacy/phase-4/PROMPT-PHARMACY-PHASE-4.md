# PROMPT: Pharmacy Phase 4 — the network (repeats a prescriber authorises, refills prepared and collected, routing to a licensed partner pharmacy)

> **For Claude Code.** Work at the repo root on a new branch, `feat/pharmacy-network`, cut from the branch where `feat/pharmacy-dispensing` (pharmacy Phase 1) has merged **all three** of its merges.
> - Unlike Phases 2 and 3, this slice needs Phase 1's Step 9: the patient's medicine list, the refill date (ML-3), `getRefillStatus` (ML-5), the message renderer and the banned-term scan (MS-1 to MS-5). If Step 9 was deferred, **STOP at Step 0**.
> - **Phase 2** (`feat/pharmacy-stores`) is not required. Where it has merged, a prepared refill is held in a stock location of kind `prepared` (SA-1). Where it has not, Step 2 adds Phase 2's `pharmacy_locations` table with only the kinds this slice needs, in exactly Phase 2's shape, so the two merge cleanly.
> - **Phase 3** (`feat/pharmacy-clinical`) is not required. Where it has merged, a medicine under a stewardship review or with an unconfirmed reaction is never refilled without a clinician (RF-4).
> - **The patient's web pages** follow `PROMPT-PATIENT-WEB-TIDE.md` if it has merged, otherwise the patient pages on the branch.
>
> First copy this prompt into `docs/pharmacy/phase-4/`.
>
> **Mode: gated.** Eleven steps, numbered 0 to 10, each ending in a **STOP**. They are called steps because "Phase 4" names this slice of the pharmacy roadmap.
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what earlier phases should have left and what earlier reads claimed. Verify every line.
>
> **What this slice changes in earlier phases, on purpose** (each needs its test amended, listed at STOP 2):
> - **Phase 1 LO-4 and LO-9.** Repeat instances get their own outcomes (RI-1), and a line's total supplied quantity may exceed its first quantity only through instances. The `routed` outcome is added.
> - **Phase 1 SU-2.** A repeat hand-over locks the instance, not the closed line.
> - **Phase 1 Law 3 and SL-10.** A partner supply has no movement in the hospital's ledger (RT-5).
> - **Phase 1 LB-6.** Routing codes also resolve for the routed partner (RT-3).
> - **Phase 1 E-PH1-03, D-PH1-31 and its Definition of Done line ("no patient is told a medicine is held"),** superseded for prepared refills only (SA-1).
> - **Phase 2 LC-1 and LC-3.** A `prepared` location kind is added (SA-1).
>
> **The CSO is Fadhul.** This slice lets a patient receive medicines without a new clinic visit, and lets a pharmacy outside the hospital see a patient's name and medicines. Nothing reaches a production hospital without these signatures, on everything listed below:
> - **Fadhul**, as CSO;
> - **the named pharmacist reviewer** (roadmap D-PH-13);
> - **the pilot site's pharmacy in charge**;
> - **for partner routing, the hospital's own data-protection officer or legal adviser**.
>
> What they sign:
> - the repeat rules and the never-repeat list;
> - the routing list and the never-routed list;
> - the partner verification standard and agreement;
> - the patient consent wording;
> - every string staff, partners or patients read;
> - the permission map, version 5;
> - the hazard log (Section 14, Appendices A to D).
>
> **Three things must exist before GATE A can be signed:**
> - interim written answers to legal questions 1 and 2 (Appendix E; the full gating table is there);
> - a record of whether the **National Drug and Health Products Authority Act, 2026** has commenced (Appendix F);
> - the name of the person who will verify partner pharmacies.
>
> If any is missing at Step 1, say so at STOP 1 and wait.
>
> **How it merges.** Three merges on one roadmap phase:
> - Steps 0 to 5: repeats and refills at the hospital's own pharmacy.
> - Steps 6 to 8: the partner network.
> - Steps 9 and 10: messages, reports, hardening, going live.
>
> Refills can go live at a hospital without the network ever being switched on.

---

## 0. What we are building, in one paragraph

After Phases 1 to 3 the hospital supplies, stocks and reviews medicines well, but a patient on long-term treatment still comes back to clinic, queues, and sees a doctor only to be given the same prescription. When the hospital is out of stock, the patient leaves with a slip and walks the town. MedSync already knows when each supply will run out (Phase 1 ML-3), and every supply record can name a dispensing point outside the hospital (Phase 1 E-PH1-04). This slice closes the loop:

- **Repeats.** A prescriber may authorise further supplies of a long-term medicine on the prescription itself. They set how many, at what interval and until when, as the law reads (s.37(5) of the 2026 Act; Appendix F). Without that authorisation, a refill is a **renewal request** to a clinician, never a supply.
- **Refills.** The patient, or the pharmacy, asks for a refill when it falls due. The pharmacy prepares it against a prescription that still allows it and sets it aside for a stated time. The patient is told it is ready without the medicine being named, and it is handed over with the same identity checks as any supply.
- **The network.** Licensed partner pharmacies are registered:
  - the hospital checks each partner's licence and responsible pharmacist;
  - the hospital and the partner sign an agreement.

  A line the hospital cannot supply, or a refill the patient would rather collect nearer home, can be routed with the patient's consent to a partner. The partner sees only what it needs to supply, records the supply, and the hospital's line closes.

**Done when** (the roadmap's two conditions, and three more):
- a patient on long-term treatment collects a refill without a new clinic visit;
- a "buy outside" line is closed by a supply recorded at a partner pharmacy;
- no repeat supply is made beyond what a prescriber authorised (test and audit query);
- no medicine on the never-routed list has ever been routed (test and audit query);
- every routing has a recorded consent and a partner whose licence was in date on that day.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap and the canvases. Report every disagreement at STOP 0.
2. **The plan:** the *MedSync Pharmacy Roadmap*, "Phase 4: The network" and the e-pharmacy section (https://claude.ai/artifact/WfJbaaKpAKVdYvu1Tmpxkn). Where this prompt departs from it, 5.12 says where and why.
3. **The UI reference:** boards **4.1 to 4.4** in *Pharmacy UI Preview · Tide* (https://claude.ai/artifact/72auX94F4FPogmCi32ELDf):
   - 4.1, the patient's refill page;
   - 4.2, refill requests at the pharmacy;
   - 4.3, the partner pharmacy's screen;
   - 4.4, where to collect.

   The shell and patterns come from *Pharmacy Phase 1 · Tide* (https://claude.ai/artifact/BMmzSYKf4CU8dYUUy2RtUY). The boards are previews to react to; 5.12 lists where this prompt overrules them. Every patient, medicine, count, price, pharmacy and date on them is an example.
4. **Design:**
   - If `feat/tide-everywhere` has merged its Step 2, build every screen with `components/tide/`.
   - The patient pages follow `PROMPT-PATIENT-WEB-TIDE.md`.
   - Otherwise, use the design system on the branch and record the gap at STOP 0.
   - `DESIGN-medsync.md` is authoritative.
5. **Prompts this builds on** (read the copies under `docs/`):
   - `PROMPT-PHARMACY-PHASE-1.md`:
     - outcomes (6.6, LO-4);
     - hand-over and identity (5.6, 6.8, D-PH1-16);
     - the slip and its verification code (5.5, LB-6);
     - the location-neutral supply record (E-PH1-04);
     - the patient list, refill date and messages (5.11, 6.11);
     - "nothing is held" (E-PH1-03), which this slice changes for prepared refills only (SA-1);
     - go-live (5.13);
     - who signs what (D-PH1-36);
     - Appendices A to E.
   - `PROMPT-PHARMACY-PHASE-2.md`: stock locations (LC-1 to LC-5), the ledger extensions (SL-12 to SL-18), recall (5.7), if merged.
   - `PROMPT-PHARMACY-PHASE-3.md`: stewardship reviews (AM-3, AM-6) and suspected reactions (AR-2), if merged.
   - `PROMPT-NCDSYNC-BUILD-v2.md`: the recall list, the SMS provider interface, template approval by two people.
   - `PROMPT-ONBOARDING-V2.md`: the clinical-staff path (council-anchored identity) that partner staff use.
   - `PROMPT-HOSPITAL-SERVICES-HUB.md`: four-eyes, print CSS only, "informs, never blocks".
   - `PROMPT-DOCTOR-WORKSPACE-UNIFIED.md`: the lane registry and the problem card, where renewal requests land.
   - The superadmin workspace prompt: approvals, tenants, four-eyes and break-glass, for registering partner pharmacies.
   - `PROMPT-PATIENT-WEB-TIDE.md`: the patient's web pages.
6. **Sources, read on 25 Oct 2026** (Appendix E lists them; re-verify at build time):
   - **The National Drug and Health Products Authority Act, 2026,** as published by Parliament. Passed 26 March 2026 at third reading; Parliament's bills page and a secondary source record 29 April 2026 as passed and assented. It repeals the National Drug Policy and Authority Act. It "shall come into force on a date appointed by the Minister, by statutory instrument" (s.1); **commencement was not confirmed.** Sections read:
     - s.28 (a pharmacy licence names a responsible pharmacist);
     - s.32 (dispensing "under the immediate supervision of a pharmacist");
     - s.35 and s.37(7) (class A1, A2 and B drugs not supplied without a pharmacist present);
     - s.37(3) to (5) (the content of a prescription; "may be presented without the physical presence of the person"; a prescription is fully dispensed after one supply unless it states the number of repeats and the intervals);
     - s.40 (records of drugs supplied).

     Electronic prescriptions, online sale and delivery are **not addressed** in the text read. Sections 88 onward, including the repeal, savings and transitional provisions (ss.119 and 120), were not read.
   - **The roadmap's January 2026 study** of 234 Kampala retail pharmacies: no enacted online-pharmacy regulations; draft guidelines on hold; "not considering licensing online-only pharmacies without a physical location". It was not re-opened for this prompt; the PMC copy was behind a verification page.
   - **The Community Retail Pharmacy Drug Distribution Point pilot at Kabale Regional Referral Hospital** (2022; ICAP CQUIN poster):
     - a private pharmacy chosen from ten within 1 to 2 km, under a service agreement;
     - stable clients on six-month ART refills;
     - refills recorded in the hospital's EMR-linked system;
     - a funded dispensing fee;
     - 294 clients by end September 2022, about 12 % of those eligible;
     - slow acceptance by health workers.

     The closest Ugandan precedent for partner routing.
   - **The TASO community drug distribution point model** (differentiated service delivery): two- to three-month pre-packed refills for clients stable on ART, with clinical review every six months; 4.28 % loss to follow-up against 16.5 % in facility care.
7. **Code:**
   - `app/pharmacy/**`, `lib/pharmacy/**`, every earlier pharmacy migration and test;
   - `lib/prescribing/**` (the dialog and its print);
   - the doctor workspace's lane registry and problem card;
   - `/patient/track/medications` and the patient web pages;
   - the onboarding clinical-staff path, the superadmin approvals module, tenant and organisation tables;
   - the message templates and the SMS provider interface;
   - the NCD recall list;
   - the four-eyes module, the signed-reference module, the print module, the feature-flag module;
   - `docs/NUMBERS.md`, `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface reads or writes an engine with real tables, real RLS and passing tests, built in an earlier step than the surface.
2. **A repeat is a prescriber's decision, written down.**
   - A refill is supplied only against a **repeat authorisation** a prescriber recorded on that prescription line: the number of further supplies, the minimum interval between them, and the date after which none may be supplied.
   - With no authorisation, or with none left, a refill request becomes a **renewal request** to a clinician. The pharmacy, the patient and the system never create, extend or reset a repeat.
   - A test enumerates every action and proves only a prescribing action writes an authorisation.
3. **The pharmacy never changes a prescription** (Phase 1 Law 2). A repeat authorisation is a record beside the prescription line, written through a prescribing action. A refill supply is a Phase 1 supply against that line.
4. **The interval is the prescriber's.** No repeat is supplied before the interval since the previous supply of that line has passed, less the signed tolerance (which may be zero).
   - An earlier supply needs a new prescription from a prescriber (a renewal, 5.3). Nothing else overrides the interval.
   - The minimum interval is at least the signed minimum interval (at least one day).
   - This is a hard stop, because the prescription's own terms set it (Appendix F, s.37(5)).
5. **Nothing is routed without consent, a licence and an agreement.** A line goes to a partner pharmacy only when **all** of these hold, checked under a lock at the moment of routing:
   - the patient (or their recorded proxy) has given consent for that routing to that pharmacy, in signed wording;
   - the partner's licence and responsible pharmacist are recorded and in date that day;
   - the hospital has an agreement with that partner, in force that day;
   - the medicine is on the hospital's routing list and not on the never-routed list.

   **Controlled drugs are never routed.**
6. **A partner sees the minimum.** For each routed line, a partner sees:
   - the patient's name, age and sex;
   - the medicine, form and strength;
   - the directions as written;
   - the quantity to supply;
   - the prescriber's name, cadre and council number;
   - the hospital, its pharmacy's phone, and the routing reference.

   It never sees a diagnosis, a problem, other medicines, results, the date of birth, the phone number, the MedSync number or any other record. A test proves the partner read returns these fields and no others.
7. **One supply per authorised quantity, wherever it happens.** The first supply belongs to the line, as in Phase 1. Each repeat after it is a **repeat instance** (RI-1), supplied once.
   - The hospital and the partner lock the same line, or the same instance, and the second attempt is refused with the first supply named.
   - A routing code works once.
   - A line or instance can be prepared or routed, never both.
8. **Holding is explicit and ends.** A prepared refill is the one case in which stock is set aside for a patient, reversing Phase 1 E-PH1-03 for refills only.
   - It is moved into a `prepared` location by a two-leg movement.
   - It is held for the signed number of days.
   - It is listed for release when that time passes.
   - It is released back to the shelf by a person, never by itself (Phase 1 Law 4).
   - The patient is told it is ready only while it is held.
9. **The right patient, at any pharmacy.** The Phase 1 identity rule (D-PH1-16) applies to every hand-over in this slice, at the hospital or at a partner.
   - The person says the patient's full name, and the date of birth or phone number on file is typed and compared on the server.
   - A collector named by the patient is recorded with their relationship.
   - The partner never sees the value it checks.
10. **The paper still applies until the law says otherwise.**
    - A partner supply is recorded against the patient's **printed prescription**, presented at the partner, carrying the routing code. MedSync's record is the verification and the closure, not the prescription, until legal question 1 is answered in writing.
    - A repeat is printed on the prescription in the signed wording.
11. **Informs, never blocks care.** Nothing in this slice prevents a prescriber prescribing, a patient attending clinic, or the window supplying a new prescription. **The only hard stops in this slice are:**
    - no repeat beyond the authorisation;
    - no repeat before its interval;
    - no routing without Law 5's four conditions;
    - no routing of a controlled drug;
    - no supply by a partner whose licence or agreement is not in force that day;
    - no second supply of the same authorised quantity;
    - no hand-over without identity;
    - no prepared refill handed over after release, after its batch expired or was blocked, or after the line was stopped, changed or cancelled;
    - no routing of a pharmacist-first line before a pharmacist's acceptance, and no routing of a programme medicine without an agreement naming the programme.
12. **No patient details off the platform** (Phase 1 Law 12).
    - Messages never name a medicine, a condition, a clinic or a prescriber.
    - A message may name the hospital by its message name and a partner pharmacy by its trading name, because neither reveals a condition. The CSO signs this reading (D-PH4-16).
    - The banned-term scan covers every new template.
13. **Neutral choice.** Partners are offered to a patient by distance or alphabetically, never ranked by any commercial relationship. Any interest MedSync, its owners or the hospital hold in a partner is disclosed on the partner's record and to the patient on the choosing screen (D-PH4-14).
14. **Red is a safety property.** This slice adds no red.
    - Past due, early, no repeats left, licence expiring, licence expired, declined and not collected are amber, each with an icon and a word.
    - Nothing is green.
15. **Behind flags, stack as found.**
    - Four per-hospital flags, off by default: `pharmacyRepeats`, `pharmacyRefills`, `pharmacyNetwork`, `pharmacyNetworkMessages`.
    - One platform flag, off by default: `networkRegistry`, the MedSync-level partner register.
    - With all off, behaviour matches the Phase 1 baseline.
    - TypeScript strict, no `any`, Zod on every action, AAL2, the house action contract.
    - No new dependency without stopping to flag it. Tokens only. Print with CSS only. Node 22 and pnpm. en-GB.
    - A pharmacy technician is never called a pharmacist. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU). The medicines regulator is the **National Drug Authority**, or, once the 2026 Act commences, the **National Drug and Health Products Authority**: one signed string, switched at commencement (Appendix F).

---

## 3. What earlier phases should have left, and what earlier reads claimed (verify every line at Step 0)

| # | Claim | Where | Matters for |
|---|---|---|---|
| P1 | Phase 1's three merges are in: outcomes, hand-over with identity, supply records naming a dispensing point and a supplying organisation, slips with verification codes, the patient list, refill dates, `getRefillStatus`, messages | `lib/pharmacy/**` | **Everything** |
| P2 | The supply record's supplying organisation can name an organisation that is not the prescribing hospital (E-PH1-04), with no schema change | Phase 1 7 | **Partner supply** |
| P3 | A refill date exists only from recorded days covered or a structured duration (ML-3). How many window supplies at the test hospital carry one was not counted | Phase 1 | **Refill due** |
| P4 | Whether prescriptions carry a structured quantity or duration is unconfirmed (Phase 1 R7, D-PH1-15) | prescriptions | Repeat quantity |
| P5 | The prescribing dialog stores per-line data beside a prescription through a check store, and prints the prescription | `lib/prescribing/**` | **Repeat authorisation and its print** |
| P6 | The doctor workspace registers lanes through a registry; whether a non-encounter worklist item (a request, not a visit) fits it was not read | doctor workspace | **Renewal requests** |
| P7 | The patient's web pages exist at `/patient/track/medications`; the Expo app is behind Gate CG | Phase 1 5.11 | Patient requests |
| P8 | Organisations: whether the platform can hold an organisation that is not a hospital (a partner pharmacy) with its own users, was not read | tenants, superadmin | **Partner register** |
| P9 | Onboarding's clinical-staff path anchors identity to a council registration; whether it can attach a user to a non-hospital organisation was not read | onboarding | Partner staff |
| P10 | The NCD recall list reads `getRefillStatus` if the registry is on the branch | NCDSync | Not collected |
| P11 | Phase 2's location model and `prepared` kind, if merged; otherwise absent | Phase 2 | Holding |
| P12 | Phase 3's stewardship reviews and suspected reactions, if merged | Phase 3 | Refill blocks |
| P13 | The patient record holds a phone number and the patient's consent to SMS; whether it holds a proxy or nominated collector was not read | patient | Collectors, messages |

---

## 4. Design direction

**Eight rules**
1. **The prescriber's terms are on the screen.** Every refill shows what was authorised, what is left, the interval and the end date, in words, next to the action.
2. **Due, not guessed.** "Due" comes from a recorded refill date; with none, the patient asks and the pharmacy checks the record. Nothing estimates a run-out from directions.
3. **Prepared means held.** If the patient is told it is ready, it is on a shelf with their name on it.
4. **No repeats left is a door, not a wall.** It becomes a renewal request a clinician sees, with the patient's history beside it, and the patient is told what happens next.
5. **The patient chooses where.** The hospital, or a partner they choose, after being told in plain words what the partner will see.
6. **A partner sees one line, not a record.**
7. **A code works once.** Every routed line has one code, printed on the patient's paper, and it stops working when supplied.
8. **Say what is not done.** No delivery. No payment taken or recorded for partners. No routing of controlled drugs. No online ordering from a pharmacy MedSync does not know.

**Budgets** (baseline at Step 0 where one exists; met by Step 10)

| Measure | Budget |
|---|---|
| A patient's refill request, from the medicines page to sent | ≤ 3 taps where the refill is allowed |
| Preparing a two-line refill at the pharmacy, all on the shelf | ≤ 6 interactions |
| Handing over a prepared refill | ≤ 5 interactions, the typed identifier counting as one |
| A partner's supply of a routed line, from code to recorded | ≤ 8 interactions |
| `recordPartnerSupply` on the server | p95 < 500 ms |
| Repeat supplies beyond an authorisation, or before its interval | 0 |
| Routings without consent, licence or agreement in force; controlled drugs routed | 0 |
| Fields beyond Law 6 returned to a partner | 0 |
| Second supplies of the same authorised quantity | 0 |
| Prepared refills released by themselves | 0 |

---

## 5. Interface specification

### 5.1 Navigation and flags
- **Pharmacy navigation** gains **Refills** (with counts by state) and, behind `pharmacyNetwork`, **Partners**.
- **The doctor's workspace** gains a **Renewal requests** item (registered through the lane registry) and a **Repeats** step in the prescribing dialog.
- **The patient's web pages** gain refill actions on the medicines page and a **Where to collect** page.
- **A partner pharmacy** has its own workspace at `/network`, with its own rail: Incoming · To supply · Supplied · Licence and staff.
- **The superadmin workspace** gains **Network** (behind `networkRegistry`): partner applications, verification, renewals, suspensions.

### 5.2 Repeats in the prescribing dialog (the prescriber's side)
Behind `pharmacyRepeats`.
- **A Repeats step** for each line, after the Check step. It is shown only for medicines the hospital's signed **repeat list** allows. It is never shown for:
  - a medicine on the never-repeat list (controlled drugs always; antibiotics and others as signed, D-PH4-03);
  - a line from the emergency path.
- **Fields, all typed by the prescriber:**
  - **further supplies** (whole number, from 0 to the signed maximum);
  - **at least … days apart** (whole number, at least the signed minimum interval);
  - **not after** (a date, at most the signed maximum period from today);
  - **review by** (optional date: the clinic visit by which the patient should be seen; shown to the pharmacy and the patient).
- **What the step says:**
  - *"After the first supply, the pharmacy may supply this {n} more times, at least {d} days apart, until {date}. You can stop the repeats at any time."*
  - The system computes no quantity and no date. Each supply's quantity is the prescription's quantity as written or as the dispenser types it (Phase 1 D-PH1-15).
- **The print.** The printed prescription carries, under the line, in signed wording: *"Repeats: {n}, at least {d} days apart, not after {date}. Prescriber: {name}, {council number}."* This is what s.37(5) asks of a prescription (Appendix F).
- **Stop the repeats.** On the problem card, a prescriber may end the authorisation at any time, with a reason. The line's remaining repeats show *"Stopped by {cadre} on {date}"*.
- **A changed or cancelled line** ends its repeats. A replacement line has none unless the prescriber authorises them again.

### 5.3 Renewal requests (the clinician's side)
Behind `pharmacyRefills`.
- **What creates one:**
  - a refill request for a line with no authorisation, no repeats left, or past its "not after" date;
  - a repeat blocked by Phase 3 (a stewardship review open on the medicine, or an unconfirmed suspected reaction to it);
  - the pharmacy's **Ask the clinic** on any refill request.
- **The list,** in the doctor's workspace, for clinicians who may prescribe for the patient at the hospital: patient (two identifiers) · medicine · last supplied · repeats used and authorised · review by · the patient's note (if any) · waiting since.
- **Answers** (each recorded, each told to the pharmacy and to the patient in signed wording):
  - **Renew:** opens the prescribing dialog with the line pre-loaded as a new prescription, including its Repeats step. Nothing is placed until the prescriber places it.
  - **Book a visit:** opens scheduling for the patient; the request closes as *"Visit needed"*.
  - **Decline, with a reason** from the signed list; the patient is told to contact the clinic.
- A request stays listed until answered (Phase 1 Law 4). Nothing renews by itself.

### 5.4 The patient's refill page (board 4.1) and where to collect (board 4.4)
Behind `pharmacyRefills`. **Web only** (Gate CG); the data contract is built so the Expo app can use it later.
- **On the medicines page,** each long-term medicine shows one of:
  - *"Next supply due around {date}"* (Phase 1 ML-3), with **Ask for my next supply** from the signed request window before that date;
  - *"You can ask for this now"*;
  - *"Your doctor needs to renew this before the next supply"*, with **Ask my clinic to renew it**;
  - *"Not refilled without seeing a clinician"*, for a medicine on the never-repeat list.

  Plus, where authorised: *"{n} more supplies allowed until {date}. Next review by {date}."* Strengths and quantities follow the Tide patient rule: `[strength]` and `[quantity]` until CSO-signed content allows them.
- **Ask for my next supply:**
  - choose the medicines;
  - optionally add a note (*"I have 3 days left"*);
  - choose **who will collect**: me, or a named person (name and relationship, saved for next time if the patient chooses);
  - choose **where** (5.4.1).
- **After asking:** the request's state in words (*"Sent"* · *"Being prepared"* · *"Ready to collect at {place}, until {date}"* · *"Sent to your clinic to renew"* · *"Not possible: {reason}. {What to do}."*). Nothing promises a time.
- **I need to talk to someone first** links to the existing contact route, or is absent if there is none.
- **The Help pill** stays in the top right (Tide).

#### 5.4.1 Where to collect (board 4.4)
- **The hospital's dispensing points** that serve refills, each with its opening times as text from the hub.
- **Partner pharmacies,** behind `pharmacyNetwork`:
  - those with an agreement with this hospital in force, whose licence is in date, and whose routing list covers every chosen medicine;
  - listed by district and then alphabetically (Law 13), with the area, opening times as text, and any disclosed interest;
  - **no stock and no price are shown**, because MedSync does not know a partner's stock or prices. The partner confirms before the patient travels (5.9).
- **Choosing a partner shows, before anything is sent**, in signed wording:

  > {Pharmacy} will see your name, age and sex, these medicines and how to take them, and your prescriber's name. It will not see anything else in your record. When you collect, it will ask your date of birth or phone number and MedSync will check it, without showing it to them. You will pay {Pharmacy} directly. Take your printed prescription with you.

  The patient ticks **I agree to {Pharmacy} seeing this**. That is the consent (RT-2). Without it, the partner cannot be chosen.
- A medicine that cannot be routed (never-routed list, controlled, not on the routing list) is shown as *"Collect this one at the hospital"*, and the request is split.

### 5.5 Refill requests at the pharmacy (board 4.2)
Behind `pharmacyRefills`.
- **Tabs:** To prepare · Needs the clinic · Prepared, waiting · Collected today · Not collected · With a partner. Each has a count.
- **Columns:**
  - Patient (two identifiers);
  - Medicines (with the stock summary);
  - What the prescription allows (*"{n} more supplies, at least {d} days apart, until {date}"*, or *"None left"*);
  - Last supply (date, and *"asked {n} days before it was due"* or *"{n} days after it was due"*, from the refill date if one exists);
  - Collect at;
  - Collector;
  - one action.
- **Early and late,** in words, amber with an icon, never blocking:
  - *Early* when asked before the interval allows. The request can only go to the clinic (Law 4).
  - *Late* when asked well after the refill date (by the signed late window). It is shown to the clinic as information (the patient may have run out), and the supply is not held up.
- **Prepare:** opens a review screen like Phase 1 5.3 for the refill's lines:
  - the repeat's terms;
  - the lane reasons that apply (Phase 1 lanes run on a refill as on any prescription; a pharmacist-first line needs a fresh pharmacist's acceptance for each repeat instance, D-PH4-21);
  - the batch, first to expire;
  - the quantity (as written, or typed by the dispenser);
  - days covered (Phase 1 SU, for the next refill date).
- **Set aside:** moves the quantity into the `prepared` location for the point (SA-1) with a label and a bag ticket (patient name, collection reference, held-until date). It does not hand anything over.
- **Hand over:** the Phase 1 hand-over (5.6), from the prepared stock, with identity per Law 9 and the named collector where recorded. The supply decrements the authorisation (RP-4).
- **Not collected:** a prepared refill past its held-until date is listed. **Release to the shelf** (a person, with a reason) moves it back. **Hold longer** (a person, with a reason, up to the signed number of extensions and the signed maximum) extends it. The clinic is told when the patient reaches the signed number of misses in a row, and, if the patient is in the NCD registry, the recall list shows it (P10).
- **Ask the clinic:** creates a renewal request (5.3) with the pharmacist's note.
- **Send to a partner:** routes the refill with the patient's recorded consent (5.8), only where the patient chose a partner or agrees at the window (recorded as consent given at the window, by whom).

### 5.6 The partner register (superadmin side)
Behind `networkRegistry`.
- **A partner pharmacy record:**
  - legal name, trading name;
  - pharmacy licence number, class and expiry, as on the licence;
  - premises address with district (UBOS hierarchy);
  - the responsible pharmacist's name and Pharmacy Board registration number, with the certificate's expiry if it has one;
  - phone, opening times (text);
  - **disclosed interests** (any ownership or commercial link to MedSync, its owners, or a hospital it partners with, in words);
  - status, a projection (PN-2): `applied` · `in_force` · `re-verification overdue` · `licence expired` · `suspended` · `withdrawn`.
- **Verification** (D-PH4-09): the verifier checks the uploaded licence and the responsible pharmacist's registration against the documents, and against the regulator's public records where one can be consulted, and records what was checked, how and when. A second approver confirms (four-eyes). **MedSync never says the regulator verified anything.** The record says *"Documents checked by MedSync on {date}"*.
- **Expiry:** the partner shows as *licence expired* from the day after the licence's expiry date, by the projection, not by a job that might fail. From that day it is offered to no patient and can record no supply (Law 11). Re-verification is due each year (the signed period) and at every licence renewal.
- **Suspension** (by MedSync or by any partnering hospital for its own agreement): with a reason; open routings return to the hospital's With a partner tab as *"Partner suspended: arrange supply"*.
- **Partner staff:** partner pharmacists and pharmacy technicians join through onboarding's clinical-staff path, anchored to their council registration, attached to the partner organisation, MFA on. A partner's responsible pharmacist approves its own staff; MedSync's verifier confirms the first one.

### 5.7 Agreements (hospital side)
Behind `pharmacyNetwork`, in the hospital admin's Departments and services area under Pharmacy.
- **An agreement with one partner:**
  - the reference of the signed service and data-sharing agreement (D-PH4-10), its dates, and who signed for each party;
  - **the routing list** for this partner: medicines from the hospital's routing list (D-PH4-04), never a controlled drug and never on the never-routed list;
  - which of the hospital's dispensing points may route to it;
  - whether refills, out-of-stock lines, or both may be routed;
  - **programme medicines** (for example antiretrovirals under a community retail pharmacy model) only where the agreement names the programme and its authority, signed by the CSO (D-PH4-05).
- Switched on with a second approver. A hospital can end an agreement at any time, with a reason; open routings return as in 5.6.

### 5.8 Routing a line (hospital side)
Behind `pharmacyNetwork`.
- **From the Phase 1 "not on the shelf" screen** (5.5 there): a fifth choice, **Route to a partner pharmacy**, shown only when the patient is present or has consented in the app, and at least one partner qualifies. A line may be routed from `ready`, `owed` or `buying_outside` (an earlier slip's verification code is voided and the reprint says which copy it replaces), and a repeat instance from `to_prepare`.
- **The quantity to route** is typed by the hospital dispenser from the prescription as written. A routing with no quantity is refused.
- **From a refill request:** when the patient chose a partner.
- **What the screen checks, in words, before Route:**
  - consent (who gave it and how: in the app, or at the window and recorded by whom);
  - the partner's licence and agreement in force today;
  - the medicine on that partner's routing list;
  - not controlled;
  - not already routed or supplied.

  Route stays off with the reason until each is met.
- **What routing does:**
  - the line's outcome becomes `routed` (a new Phase 1 outcome, LO-4 extended), with the partner named;
  - a **routing code** is issued (Phase 1 LB-6 rules: random, unambiguous, single use, no patient information);
  - the **printed prescription** or the not-supplied slip is printed or reprinted with the code and the partner's name, in signed wording: *"Routed to {Pharmacy}. Code {code}. This supply can be supplied once."*, and for a repeat *"Routed to {Pharmacy}. Code {code}. Repeat {k} of {n}: this supply can be supplied once, here."*
- **After routing,** the With a partner tab shows its state: *Sent* · *Accepted, the partner will supply* · *Accepted in part* · *Partner declined: {reason}* · *Supplied {date}* · *No answer after {window}*. Each state is told to the patient in signed wording if messages are on.
- **Withdraw a routing** (before supply, by the hospital, with a reason): the code stops working and the line returns to Open lines.

### 5.9 The partner's workspace (board 4.3)
Behind `pharmacyNetwork` for the routing hospital, at `/network`, for partner staff.
- **Incoming:** each routed line from each hospital, with only the fields in Law 6. **Accept** (in full or in part, with the quantity it can supply) or **Decline** with a reason from the signed list (not in stock · cannot supply this product · other). Answering is expected within the signed response window, shown to the partner. After the window, the hospital sees *"No answer"* and may withdraw; nothing moves by itself.
- **To supply:** accepted lines. **Look up by code** (scan or type).
- **Record the supply:**
  - **The person at the counter:** they say the patient's full name (tick), and the date of birth or phone number on file is typed and compared on the server (Law 9). The partner never sees the stored value. Attempts are capped **per routing** at the signed number, across every attempt by every partner user; on reaching it the routing locks, the hospital's pharmacy in charge is told, and every attempt is logged to the hospital. *"Identified another way"* follows Phase 1's route and is listed for the hospital's pharmacy in charge.
  - **The printed prescription with the code** was presented (tick, Law 10).
  - **What was supplied:** product (the partner's own, as text, with the registration number optional), batch, expiry, quantity. A different brand of the same medicine, form and strength is allowed; anything else is declined.
  - **Explained** (tick, with the language).
  - **The supplying pharmacist:** the signed-in user's name and registration. A technician's supply names the supervising pharmacist on duty (s.32), chosen from the partner's `network.supply` users.
  - **Record supply:** the hospital's line closes as `supplied` with the partner as supplying organisation (Phase 1 E-PH1-04), the patient's list shows *"Supplied by {Pharmacy}"*, the prescriber sees it on the problem card, and the code stops working. A part supply leaves the rest open with the hospital.
- **Supplied:** the partner's own record of what it supplied through MedSync, for its own books (s.40). It holds no other patient data.
- **Licence and staff:** the partner's licence and expiry, its responsible pharmacist, its staff, its agreements (which hospitals, which medicines), and a warning from the signed renewal window before expiry: *"Your licence expires on {date}. Upload the renewed licence to keep receiving prescriptions."*
- **What a partner can never do:** see a patient who has not been routed to it; search patients; route onward; change a prescription; record a supply without a code; record a controlled drug.

### 5.10 Messages
Behind `pharmacyNetworkMessages` and the hospital's live-SMS setting (Phase 1 MS-3). The new kinds, from approved templates (two-person approval), PHI-free (banned-term scan):

| Kind | Wording |
|---|---|
| Refill due (opt-in by the patient) | *"{Hospital} pharmacy: a medicine supply is due soon. You can ask for it in MedSync or at the pharmacy."* |
| Refill ready | *"{Hospital} pharmacy: your medicines are ready to collect until {date}. Bring your MedSync number."* Sent only while held |
| Sent to clinic | *"{Hospital}: your clinic has been asked to renew a medicine. We will tell you when it is done."* |
| Renewal answered | *"{Hospital}: your clinic has answered about your medicine. Open MedSync or call {phone}."* |
| Partner accepted | *"{Pharmacy} can supply your medicines. Take your printed prescription with you."* |
| Partner declined or no answer | *"{Pharmacy} cannot supply your medicines. Contact {Hospital} pharmacy on {phone}."* |
| Not collected | *"{Hospital} pharmacy: your medicines are still waiting until {date}."* Once only |

Each is sent once per event, never names a medicine, a quantity, a clinic or a condition, and fails loud (Phase 1 MS-5).

### 5.11 Reports
For the pharmacy in charge, the CSO and hospital admin (aggregates, no PHI):
- refills requested, prepared, collected, not collected, released, by month and point;
- renewal requests by answer, and median time to answer;
- repeats authorised and used;
- routings by partner and state, median time to accept and to supply;
- declines by reason;
- "buy outside" lines closed by a partner supply.

A CSV of counts for holders of `pharmacy.manage`, logged, with no identifiers.

### 5.12 Where this prompt departs from the roadmap and the boards
- **Refills need a repeat the prescriber authorised, or a renewal.** The roadmap says the pharmacy "prepares it against a valid prescription". Under s.37(5) of the 2026 Act a prescription is fully dispensed after one supply unless it states repeats and intervals, so the Repeats step and the renewal request are built here.
- **Board 4.1** shows strengths, quantities and "About 5 days left". The page shows `[strength]` and `[quantity]` until signed, and a due date only from a recorded refill date.
- **Board 4.2's** "Prescription allows 2 more supplies" is exactly what the authorisation stores; "Ran out about 12 days ago" is shown only from a recorded refill date.
- **Board 4.3** says the partner was "checked by MedSync … each year". The record says what was checked and how, and never that the regulator verified it.
- **Board 4.4** shows partner stock ("Both in stock") and a price. MedSync knows neither. The partner accepts or declines before the patient travels, and no price is shown.
- **"Ready from tomorrow, 10:00"** promises a time. The patient is told only when it is ready, and how long it is held.
- **No figure on any board is a signed value.**

---

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Repeat authorisations (`lib/prescribing/repeats.ts`)
- **RP-1** A repeat authorisation belongs to one prescription line version. It holds:
  - further supplies (n);
  - the minimum interval (d days);
  - the "not after" date;
  - the optional review-by date;
  - the prescriber, the time, and the signed rule version.

  It is written only by a prescribing action (Law 2), append-only, with `stopped` as a later event.
- **RP-2** Allowed only for medicines on the signed repeat list and not on the never-repeat list; n ≤ the signed maximum; "not after" ≤ today + the signed maximum period. Controlled drugs are never allowed (test).
- **RP-3** A line version change, a cancellation, a replacement, or a renewal placed from it (RN-3) ends the authorisation. `ended` is a **projection** over those events, not a row written by other actions; `stopped` is the only event besides the authorisation itself, written only by `stopRepeats`.
- **RP-4** **Remaining** = n − the number of repeat instances closed by a hand-over (at the hospital or a partner), net of reversals. Supply events are not counted: an instance split across two batches is one instance. A Phase 1 "recorded in error" correction reopens one.
- **RI-1** A **repeat instance** is a record (line version, ordinal k of n) created when a refill request is made for an `allowed` line. Its outcomes extend Phase 1 LO-4: `to_prepare` · `prepared` · `routed` · `supplied` · `released` · `closed` (with reason). Only one instance per line may be open at a time: a second request (the app and the window at once) attaches to the open one. Phase 1 SU-2, RT-3 and RT-5 lock the instance. Phase 1 LO-9's quantity cap applies per instance.
- **RP-5** **Next allowed** = the last supply's date + d − the signed tolerance (whole local days). A repeat supply before next allowed is refused (Law 4).
- **RP-6** `repeatStatus(line, at)` reads only the current, uncancelled line version, and returns `allowed` (with remaining and next allowed) · `too_early` (with the date) · `none_left` · `expired` · `stopped` · `blocked` (with the Phase 3 reason) · `not_allowed` (never-repeat or no authorisation). Pure; property tests:
  - supplies never exceed n;
  - no supply before next allowed;
  - after "not after", always `expired`.

### 6.2 Refill requests (`lib/pharmacy/refills.ts`)
- **RF-1** A refill request has: patient, lines, collector (self, or a named person with relationship), place (a point or a partner), channel (app, window, phone recorded by staff), note, and states `requested` · `to_prepare` · `needs_clinic` · `prepared` · `collected` · `not_collected` · `released` · `routed` · `closed` (with reason).
- **RF-2** On creation each line gets its `repeatStatus`. `allowed` lines create a repeat instance at `to_prepare`. `too_early` lines wait as `to_prepare`, labelled with the date preparation becomes possible, and cannot be prepared before it; they go to the clinic only if the pharmacy or the patient asks. Every other status creates a renewal request (RN-1), and the line goes to `needs_clinic`.
- **RF-3** **Early** (asked before next allowed) and **late** (asked more than the signed late window after the refill date) are labels from RP-5 and Phase 1 ML-3. Late never blocks.
- **RF-4** Where Phase 3 is merged, a line whose medicine has an open stewardship review for the patient, or an unconfirmed suspected reaction, is `blocked` and goes to the clinic.
- **RF-5** A request never closes by itself. A test advances the clock 60 days and finds every open request still open.

### 6.3 Set aside and prepared stock (`lib/pharmacy/prepared.ts`)
- **SA-1** Each dispensing point that serves refills has one `prepared` location (a new kind amending Phase 2 LC-1; in LC-3 it takes `set_aside_in`, `released_out`, `supplied`, `quarantined_out`, and nothing else). Setting aside is an internal transfer (Phase 2 LC-5), and a supply from `prepared` counts as consumption of its parent point (Phase 2 CN-1). A batch that expires before the held-until date cannot be set aside. Setting aside writes a two-leg movement (Phase 2 SL-12 pair semantics; this slice adds the kinds `set_aside_out` and `set_aside_in`, and `released_out` and `released_in`) per batch, first expiry first, under locks.
- **SA-2** Balances are keyed by location. Stock in a `prepared` location is excluded from the point's availability (AV), its stock-out projection (SL-9) and counts of its shelf, so a shelf count writes no correction for held stock (test). Phase 2's order adds it back as "held" in stock on hand.
- **SA-3** A prepared refill holds until the signed number of days after preparation. After that it is listed as `not_collected`; it moves only by a person's **Release** or **Hold longer** (once, to the signed maximum).
- **SA-4** Hand-over of a prepared refill supplies from the `prepared` location (Phase 1 SU, with `supplied` at that location), and re-runs `repeatStatus` and the line version under the instance lock. A released refill, one whose line was stopped, changed or cancelled, or one whose authorisation has expired cannot be handed over (Law 11); it is listed for release. A same-day reversal returns stock to the point's shelf, not to `prepared`.
- **SA-5** A batch recalled or quarantined while prepared (Phase 2 SL-14) blocks the hand-over; the held stock moves to quarantine (`quarantined_out` from `prepared`), and the refill is listed as *"Batch recalled: prepare again"*.
- **SA-6** Property test: every unit set aside is eventually supplied, released or quarantined; none is in two places.
- **SA-7** **Without Phase 2 merged**, Step 2 ships Phase 2's location migration verbatim (same number, same DDL, `pair_id` included), restricted to the `dispensing_point` and `prepared` kinds, and records it in `docs/NUMBERS.md` so Phase 2 later skips it. No other shape is allowed.

### 6.4 Renewal requests (`lib/pharmacy/renewals.ts`, read by the doctor workspace)
- **RN-1** A renewal request has: patient, line, reason (no authorisation · none left · expired · stopped · blocked · too early · asked by the pharmacy), the patient's or pharmacist's note, and states `open` · `renewed` (with the new prescription id) · `visit_needed` · `declined` (with reason) · `withdrawn`.
- **RN-2** It is answered only by a clinician who may prescribe for the patient at the hospital. The first answer wins.
- **RN-3** **Renew** is complete only when a new prescription is placed through the existing dialog; the request links to it, and the source line's authorisation ends in the same transaction (RP-3). The Repeats step shows any other live authorisation for the same medicine. A dialog opened and abandoned leaves the request open.
- **RN-4** It never closes by itself (test as RF-5).

### 6.5 The partner register (`lib/network/partners.ts`)
- **PN-1** A partner pharmacy is an organisation of kind `partner_pharmacy`, global to MedSync, with the fields in 5.6. One partner may have agreements with many hospitals.
- **PN-2** **In force on a date** = verified and confirmed, not suspended or withdrawn, licence expiry ≥ that date, re-verification not overdue (PN-3), the responsible pharmacist recorded, and, where the signed rule asks, their registration in date. Status is a pure projection, evaluated at every routing and every supply; no scheduled job is relied on.
- **PN-3** Re-verification due = last verification + the signed period, or the licence's expiry if earlier. Due and overdue are listed for the verifier; overdue makes the partner **not in force** (D-PH4-09).
- **PN-4** Verification and its confirmation are two different people (four-eyes), and neither may hold a disclosed interest in the partner. The same exclusion applies to `savePartnerAgreement`, `switchAgreementOn` and their second approver.
- **PN-5** Partner users belong to exactly one partner organisation, and hold `network.supply` (pharmacist) or `network.record` (technician, supply names the supervising pharmacist) or `network.admin` (the responsible pharmacist).

### 6.6 Agreements and routing (`lib/network/routing.ts`)
- **AG-1** An agreement is between one hospital and one partner, with the signed reference, dates, routing list, points, kinds (refills, out-of-stock lines) and programmes. In force on a date when within its dates, switched on, not ended.
- **RT-1** `canRoute(line, partner, at)` returns `ok` or each failed condition, in words:
  - consent recorded for this routing;
  - partner in force (PN-2);
  - agreement in force (AG-1) covering the line's point and kind;
  - the medicine on the agreement's routing list and the hospital's;
  - not on the never-routed list;
  - not controlled;
  - the line, or the repeat instance, not already prepared, routed, supplied or closed;
  - for a refill, `repeatStatus = allowed`, on the current, uncancelled line version;
  - for a pharmacist-first line, a pharmacist's acceptance of this version (and of this instance, D-PH4-21);
  - for a programme medicine, an agreement that names the programme and its authority (D-PH4-05);
  - a routed quantity recorded.
- **RT-2** **Consent** is an event per routing: who gave it (the patient, or a proxy recorded on the patient), how (in the app with the signed wording version, or at the window recorded by a named staff member), to which partner, for which lines, at what time. Withdrawn consent before supply withdraws the routing.
- **RT-3** `route` writes, under a lock on the line or instance, the `routed` outcome, the routing code (LB-6's generation rules; it resolves only for the routed partner and for the hospital's pharmacy staff, amending LB-6's resolver), the consent link and the partner, and voids any earlier slip code for the line; refuses on any RT-1 failure. A prepared instance must be released before it is routed, and `prepareRefill` refuses a routed one.
- **RT-4** The partner's answer: `accepted` (with quantity, at most the routed quantity), `partner_declined` (with reason; named so as not to collide with Phase 1's `declined` outcome). Response window shown; nothing changes when it passes. On `partner_declined`, withdrawal or RT-7, a line returns to the open outcome it was routed from (`owed` or `buying_outside`; a `ready` line returns to `ready`), and an instance to `to_prepare`.
- **RT-5** `recordPartnerSupply` checks, under the same line lock the hospital uses (Law 7), that:
  - the code is live;
  - the partner and agreement are in force today;
  - identity is confirmed (Law 9);
  - the paper was presented;
  - the quantity ≤ the quantity the partner accepted;
  - for a refill, `repeatStatus = allowed` on the current, uncancelled line version;
  - the line not cancelled or changed since routing.

  It writes a **partner supply**: a Phase 1 supply row with nullable product and batch keys and the partner's product, batch and expiry as text, allowed only when the supplying organisation is not the hospital. It writes no stock movement in the hospital's ledger, and Phase 1 Law 3 and the SL-10 property are amended to exempt exactly this case (a test proves the exemption applies nowhere else). It closes or part-closes the line or instance and kills the code. A second call is refused, naming the first supply.
- **RT-6** The partner read (`partnerLineView`) returns exactly Law 6's fields. A schema test fails if any other field is added.
- **RT-7** Each of these, in its own transaction, returns every unsupplied routed line or instance to the hospital (RT-4's return rule), with the reason, and kills its code:
  - withdrawing a routing (hospital);
  - the patient withdrawing consent;
  - `stopRepeats`;
  - an RP-3 change, cancellation or replacement;
  - suspending a partner;
  - pausing or ending an agreement.

### 6.7 Messages and reports
- **NM-1** The new kinds in 5.10 render through Phase 1's MS-1 renderer, given only the kind, the hospital's message name, the partner's trading name where the kind needs it, a date where it needs one, and the pharmacy's phone.
- **NM-2** The banned-term scan (MS-2) covers the new templates, with every partner's trading name added to the scan of every template that does not name a partner.
- **NM-3** Reports in 5.11 are projections with no identifiers; every figure returns its definition.

---

## 7. Data changes (only what GATE A approves; additive; numbers from the ledger)

Claim a block in `docs/NUMBERS.md` before writing any migration or ADR: 20 migration numbers and 12 ADR numbers above the highest on `main` and on every open branch.

**Prescribing**
- `prescription_repeat_authorisations` and `prescription_repeat_events` (`stopped` only; `ended` is a projection, RP-3), append-only, linked to the line version. **No column on the prescription row.**
- `pharmacy_repeat_instances` and their outcome events (RI-1).

**Refills and renewals**
- `pharmacy_refill_requests`, `pharmacy_refill_request_lines`, `pharmacy_refill_events`.
- `prescription_renewal_requests` and `prescription_renewal_events`.
- `patient_collectors` (the patient's named collectors), if the patient record has no such field (P13).

**Stock**
- The `prepared` location kind and the set-aside and release movement kinds (SA-1), on Phase 2's tables if merged, otherwise on the minimal `pharmacy_locations` described in the header.

**The network**
- `organisations` of kind `partner_pharmacy`, or a `partner_pharmacies` table if the organisation model cannot hold one (P8).
- `partner_licences` (number, class, expiry, document upload reference).
- `partner_pharmacists` (name, registration, expiry).
- `partner_verifications` (what was checked, how, by whom, confirmed by), append-only.
- `partner_interests` (disclosed interests).
- `partner_status_events`.
- `partner_agreements`, `partner_agreement_lines` (routing list), `partner_agreement_events`.
- `pharmacy_routings` (line or instance, partner, code, routed quantity, accepted quantity, consent, state).
- `pharmacy_partner_identity_attempts` (per routing).
- `pharmacy_routing_events`.
- `pharmacy_routing_consents`.
- Partner users through the existing user and membership tables with the `network.*` permissions.

**Line outcomes**
- `routed` added to Phase 1's outcome set (LO-4), with its transitions: to `supplied` (by the partner), to `owed` or `buying_outside` (on withdraw, decline, suspension), to `closed` (by a person).

**Signed sets** (per hospital unless stated):
- the repeat list and the never-repeat list;
- the repeat maxima (supplies, period) and the interval tolerance;
- the request window and the late window;
- the hold days, the number of hold extensions and the hold-longer maximum;
- the minimum repeat interval;
- the partner identity-attempt cap;
- the miss threshold for telling the clinic, and how many times "not collected" is sent;
- the routing list and the never-routed list;
- the response window;
- decline, release, renewal-decline and withdrawal reasons;
- consent wording, print wording and message templates;
- platform-level: the verification standard, the re-verification period and the licence renewal warning window.

**RLS probes:**

| Actor | Access |
|---|---|
| Hospital pharmacy staff, with the permission the action needs | As Section 8 allows |
| Prescriber who may prescribe for the patient | Write and stop repeat authorisations; read and answer renewal requests for their patients |
| The patient | Their own refill requests, renewal requests, collectors, routings and consents; create and withdraw their own |
| Partner pharmacy staff | `partnerLineView` for lines routed to their pharmacy, only while routed, accepted or supplied; their own supplies; their organisation's record. **Nothing else, including other partners' data** |
| MedSync network verifier (superadmin role) | Partner records, verifications, status; no patient data |
| Hospital admin | Agreements and settings; aggregates; no PHI |
| Lab staff, reception, other hospitals, superadmin without break-glass, anonymous | Denied |
| Any client, direct INSERT, UPDATE or DELETE | Denied everywhere |
| Any actor, UPDATE or DELETE on authorisations, routing events, consents, verifications, supplies | Denied, including the service-role path |

---

## 8. Server actions

All follow the house contract: Zod with a client key → `getUser()` → AAL2 → permission → scope (hospital, or partner organisation) → one transaction → PII-redacted log → audit → `{ id, serverTime }`.

| Action | Who may call it |
|---|---|
| `authoriseRepeats`, `stopRepeats` | The prescribing permission, for that patient |
| `requestRefill`, `withdrawRefillRequest`, `saveCollector` | The patient (or proxy); `requestRefill` also by `pharmacy.dispense` for a window or phone request |
| `prepareRefill`, `setAsideRefill`, `releasePrepared`, `holdPreparedLonger` | `pharmacy.dispense`; lane rules as Phase 1 |
| `handOverPrepared` | `pharmacy.dispense` (Phase 1 hand-over rules) |
| `askClinicToRenew` | `pharmacy.dispense`, `pharmacy.review`, the patient |
| `answerRenewal` (renew opens prescribing; book visit; decline) | The prescribing permission |
| `recordConsent`, `withdrawConsent` | The patient (or proxy) in the app; `pharmacy.dispense` at the window, naming the patient |
| `routeLine`, `withdrawRouting` | `pharmacy.dispense` at the routing point |
| `applyAsPartner`, `uploadPartnerDocument` | An authenticated applicant who has completed onboarding's council-anchored pharmacist path; becomes `network.admin` once the partner is verified |
| `confirmFirstPartnerStaff` | MedSync network verifier |
| `pauseAgreement` | `pharmacy.manage` + second approver |
| `lookupRoutingCode` | `network.supply`, `network.record` (rate-limited) |
| `checkPartnerIdentifier`, `recordPartnerIdentifiedAnotherWay` | `network.supply`, `network.record` (attempt cap per routing) |
| `verifyPartner`, `confirmVerification`, `suspendPartner`, `reinstatePartner` | MedSync network verifier; confirmation by a second one |
| `savePartnerAgreement`, `switchAgreementOn`, `endAgreement` | `pharmacy.manage` + hospital admin, second approver |
| `answerRouting` (accept, decline) | `network.supply`, `network.record` |
| `recordPartnerSupply` | `network.supply`; `network.record` naming the supervising pharmacist |
| `approvePartnerStaff` | `network.admin` |
| Every print (prescription with repeats, slip with code, bag ticket, refill label) | The permission of the record printed; logged |
| `getNetworkReport`, `downloadNetworkCounts` | `pharmacy.manage`, hospital admin (aggregates) |

A test enumerates every action and proves none writes to a prescription row, and that only `authoriseRepeats` (called inside the prescribing dialog's own transaction, including for a Renew) and `stopRepeats` write an authorisation or its events.

---

## 9. Steps and gates

**Three merges.**
- Steps 0 to 5: repeats and refills.
- Steps 6 to 8: the network.
- Steps 9 and 10: messages, reports, going live.

Between merges the slice runs at the test hospital only.

### Step 0: Discovery and baseline (no product changes)
- **Q1** Phase 1's three merges, Phase 2 and Phase 3 on the branch? Verify P1 to P13. **If Phase 1's Step 9 is missing, STOP.**
- **Q2** How prescriptions store quantity and duration (P4), and whether the dialog's print can carry a repeat line (P5).
- **Q3** Whether the lane registry can hold a request that is not a visit (P6).
- **Q4** Whether the organisation model can hold a partner pharmacy with its own users (P8, P9).
- **Q5** The patient record's phone, SMS consent and any proxy or collector fields (P13).
- **Q6** For the last 90 days at the test hospital:
  - window supplies with a refill date (ML-3), by medicine;
  - patients with two or more supplies of the same medicine;
  - "buy outside" lines and how many closed as reported by the patient.

  This sizes the slice for the CSO.
- **Q7** The 2026 Act's commencement and its savings and transitional provisions (ss.119 and 120), from a copy the lawyer provides (Appendix F).
- **Q8** Check that Playwright, axe, the visual harness, the fake clock and the RLS probe harness work. If not, STOP and flag.

**STOP 0.** Report Q1 to Q8 and screenshots of the prescribing dialog, the problem card, the patient's medicines page and the Phase 1 not-on-the-shelf screen.

### Step 1: GATE A proposal (documents only)
Write `docs/pharmacy/phase-4/gate-a-proposal.md`:
- the repeat authorisation (6.1) and its print, with the legal reading (Appendix F);
- the refill and renewal flows (6.2, 6.4) drawn end to end;
- the holding model (6.3);
- the partner register, verification standard and agreement template (6.5, 6.6, D-PH4-09, D-PH4-10);
- the consent wording and the partner read (Law 6);
- the permission map, version 5 (Appendix A);
- every pack (Appendix D) unsigned;
- every string (Appendix B) as `draft`;
- the hazard log (Appendix C);
- annotated wireframes from boards 4.1 to 4.4, corrected per 5.12;
- the decision table (Section 14) with a signature block;
- the ADR drafts.

**STOP 1.** Nothing proceeds without the signatures in the header and the legal answers.

### Step 2: Data layer
Migrations, triggers, RLS, probes. Scenarios:
- **S1** Every earlier pharmacy test passes unchanged, except the tests this slice amends on purpose (listed in the header), each listed at this STOP with its change.
- **S2** Every RLS probe row holds, including a partner user who tries to read another partner's routing, a patient's other records, and a line not routed to it.
- **S3** No UPDATE or DELETE succeeds on any immutable table.

**STOP 2.**

### Step 3: Engines (pure, no UI)
RP, RF, SA, RN, PN, AG, RT, NM. Scenarios:
- **S4** RP-6 properties hold.
- **S5** SA-6 property holds.
- **S6** RT-1 refuses each missing condition separately and names it.
- **S7** RT-6's schema test fails when a field is added to the partner read.
- **S8** PN-2 makes a partner not in force on the day after licence expiry with no job running.
- **S9** RF-5 and RN-4: nothing closes after 60 days.

**STOP 3.**

### Step 4: Repeats and renewals (behind `pharmacyRepeats`)
5.2, 5.3. Scenarios:
- **S10** A prescriber authorises 2 repeats, 28 days apart, until a date; the print carries the signed line.
- **S11** A controlled drug offers no Repeats step.
- **S12** Stopping repeats ends them at once.
- **S13** A changed line ends its repeats.
- **S14** A renewal request reaches the doctor's list; Renew opens a pre-loaded dialog and the request closes only when the new prescription is placed; Book a visit and Decline each close it and tell the patient's page.

**STOP 4.**

### Step 5: Refills at the hospital (behind `pharmacyRefills`). First merge.
5.4 (hospital places only), 5.5. Scenarios:
- **S15** A patient asks for an allowed refill in ≤ 3 taps.
- **S16** The pharmacy prepares and sets it aside; the shelf shows it held.
- **S17** The patient's page says ready until a date.
- **S18** Hand-over to a named collector with identity.
- **S19** A refill asked too early goes to the clinic; one asked late is supplied and the clinic sees "late".
- **S20** A prepared refill not collected is listed; Release returns it; a released refill cannot be handed over.
- **S21** A third supply on a two-repeat authorisation is refused.
- **S22** A supply before the interval is refused.
- **S22a** A refill split across two batches uses one repeat.
- **S22b** Two simultaneous requests (app and window) give one instance.
- **S22c** A shelf count while stock is prepared writes no correction for the held quantity.
- **S22d** A prepared refill whose line the prescriber stops is listed for release and cannot be handed over.
- **S23** With Phase 3 merged, a medicine with an open stewardship review goes to the clinic.
- **S24** With Phase 2 merged, a recall of a prepared batch blocks the hand-over.

**STOP 5.** Report scenarios, the tap and interaction counts, and screenshots.

### Step 6: The partner register (behind `networkRegistry`)
5.6. Scenarios:
- **S25** A partner applies, the verifier checks and a second confirms; a verifier with a disclosed interest cannot.
- **S26** A partner whose licence expired yesterday is not offered and cannot supply.
- **S27** Partner staff join through onboarding and see only their organisation.

**STOP 6.**

### Step 7: Agreements, consent and routing (behind `pharmacyNetwork`)
5.4.1, 5.7, 5.8. Scenarios:
- **S28** Where to collect lists only qualifying partners, by district then alphabet, with disclosed interests and no stock or price.
- **S29** Choosing a partner shows the signed consent; without it, nothing is sent.
- **S30** Routing refuses a controlled drug, a medicine off the routing list, and an expired agreement, each named.
- **S31** The reprinted prescription carries the code and partner.
- **S32** Withdrawing a routing kills the code and returns the line.

**STOP 7.**

### Step 8: The partner's workspace. Second merge.
5.9. Scenarios:
- **S33** A partner accepts in part, then supplies with identity and the paper.
- **S34** The hospital's line part-closes and the patient's list says "Supplied by {Pharmacy}".
- **S35** A second supply with the same code is refused, naming the first.
- **S35a** After `stopRepeats`, the partner's code no longer works.
- **S35b** A prepared instance cannot be routed, and a routed one cannot be prepared.
- **S35c** The identity-attempt cap per routing locks the routing and tells the hospital.
- **S36** A technician's supply names the supervising pharmacist.
- **S37** The partner read returns exactly Law 6's fields (network capture in the test).
- **S38** A partner cannot search patients or open an unrouted line (RLS and route tests).
- **S39** Suspending a partner returns its open lines.

**STOP 8.**

### Step 9: Messages and reports (behind `pharmacyNetworkMessages`)
5.10, 5.11. Scenarios:
- **S40** Every new template passes the banned-term scan, with partner names scanned where not allowed.
- **S41** "Refill ready" is sent only while held.
- **S42** "Not collected" is sent once.
- **S43** The reports equal a hand count over the fixture and carry no identifiers.

**STOP 9.**

### Step 10: Hardening and going live. Third merge.
- axe on every new route at 1440, 1024 and 390 (patient pages and the partner workspace at 390 first);
- the red and no-green tests;
- the budgets;
- the harness plans for boards 4.1 to 4.4;
- the user guides (patient, prescriber, pharmacy, partner, verifier);
- the hazard log, completed;
- ADRs;
- the final report.

**Going live** per hospital through Phase 1's go-live page, with a second approver:
- `pharmacyRepeats` after the repeat packs and print wording are signed and prescribers are briefed;
- `pharmacyRefills` after hold days and windows are signed and one refill has run end to end at the test hospital;
- `pharmacyNetwork` after the legal answers 3 and 5 are on record (and 6 for any programme medicine), at least one partner is verified with an agreement in force, and one routing has run end to end with a test partner;
- `networkRegistry` per platform after the verification standard is signed.

Scenarios:
- **S44** Each flag goes live only with its conditions.
- **S45** With all flags off, behaviour matches the Phase 1 baseline.

**STOP 10.** Report Section 13 and the Definition of Done.

---

## 10. Accessibility
- WCAG 2.2 AA. Patient pages and the partner workspace are designed at 390 first, 48 px targets on patient pages, 44 px on staff and partner desks.
- The consent text is read in full by assistive technology before the tick.
- Every state (early, late, held until, declined, expired licence) is words plus an icon, never colour alone.
- The routing code is printed large in mono and readable aloud letter by letter.

## 11. Budgets
As Section 4, plus: the partner workspace under 120 KB of JS gzipped (partners may be on slow connections); the patient refill page under 80 KB added.

## 12. Security, privacy, audit
- Every authorisation, request, consent, routing, partner read, supply, verification and print is audited.
- **The partner read is logged per open**, and the hospital's pharmacy in charge can see which partner opened which routed line and when.
- **Codes:** single use; random; not guessable; no patient data; rate-limited lookups (signed limit) with lockout, and lookups by partners only.
- **Data protection:** a routing shares personal data with a third party. Consent per routing (RT-2), the agreement's data-sharing terms (D-PH4-10), the minimum fields (Law 6), and the legal answer (Appendix E, question 3) are all required before `pharmacyNetwork` goes live.
- **The governance gap stays documented.** Fadhul holds superadmin, CSO and audit-reviewer roles. Any partner in which he or another MedSync owner has an interest is disclosed (Law 13), and that person does not verify or approve that partner, or any agreement with it.

## 13. Numbers to report at the final STOP

| Metric | Baseline | Target | Result |
|---|---|---|---|
| Refills collected without a new clinic visit, pilot period | 0 | Report | |
| Repeat supplies beyond authorisation or before interval | None | 0 | |
| Renewal requests answered, median time | None | Report | |
| Prepared refills released by a person, not collected | None | Report | |
| Prepared refills moved by themselves | None | 0 | |
| "Buy outside" lines closed by a partner supply | 0 | ≥ 1 at the pilot | |
| Routings without consent, licence or agreement in force | None | 0 | |
| Controlled drugs routed | None | 0 | |
| Fields beyond Law 6 returned to a partner | None | 0 | |
| Second supplies refused, and accepted | None | Report; 0 accepted | |
| Patient refill request, taps | None | ≤ 3 | |
| axe serious or critical | Step 0 | 0 | |
| Red added; anything green | None | 0 | |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| # | Decision | Recommendation |
|---|---|---|
| D-PH4-01 | What allows a refill | A repeat authorisation recorded by the prescriber on the line (number, minimum interval, not after), printed on the prescription; otherwise a renewal request. Never a pharmacy or system decision |
| D-PH4-02 | Repeat maxima | Signed per hospital: maximum further supplies and maximum period. None proposed. The DSD precedent (two- to six-month ART refills) is reference text, not a default |
| D-PH4-03 | The never-repeat list | Controlled drugs always; proposed also: antibiotics, medicines on the high-risk list unless the pharmacist reviewer signs an exception, and any medicine with an open Phase 3 review or suspected reaction for the patient |
| D-PH4-04 | The routing list | Per hospital, signed: medicines that may be routed, starting with the long-term NCD medicines the pilot site stocks. Controlled drugs never |
| D-PH4-05 | Programme medicines (antiretrovirals, TB medicines) | Never routed unless an agreement names the programme and its authority (as in the community retail pharmacy model), signed by the CSO |
| D-PH4-06 | Holding | A prepared refill is set aside in a `prepared` location for signed days, released only by a person; this reverses Phase 1 E-PH1-03 for refills only |
| D-PH4-07 | Early and late | Too early (before the interval less the signed tolerance) goes to the clinic; late is supplied and shown to the clinic |
| D-PH4-08 | Not collected | Listed after the hold; released or held longer by a person; the clinic told after a second miss in a row; the NCD recall list reads it |
| D-PH4-09 | Verifying partners | A named MedSync verifier checks licence and responsible pharmacist documents, against public records where one can be consulted, with a second approver; annual re-verification and at licence renewal; the record never claims regulator verification. **Name the verifier** |
| D-PH4-10 | The agreement | A service and data-sharing agreement per hospital and partner, drafted by the lawyer: minimum data, purpose, retention, no onward routing or marketing, breach notice, audit access, termination. MedSync is not a party unless the lawyer advises otherwise |
| D-PH4-11 | The paper at the partner | The printed prescription with the routing code is presented at the partner until legal question 1 allows an electronic-only routed prescription |
| D-PH4-12 | Who supplies at a partner | A pharmacist, or a technician under a named supervising pharmacist on duty (s.32) |
| D-PH4-13 | Payment at a partner | Between the patient and the partner. MedSync records no price and no payment for partner supplies |
| D-PH4-14 | Neutral listing and disclosed interests | By district then alphabetically; any interest of MedSync, its owners or the hospital disclosed on the partner record and on the choosing screen; an interested person never verifies or approves that partner. **This applies to any pharmacy Fadhul or MedSync owns** |
| D-PH4-15 | Partner staff identity | Onboarding's council-anchored clinical-staff path; MFA; the responsible pharmacist approves staff after MedSync confirms the first |
| D-PH4-16 | Names in messages | The hospital's message name and the partner's trading name may appear; never a medicine, quantity, clinic, prescriber or condition |
| D-PH4-17 | Delivery | Not in this slice (legal question 4) |
| D-PH4-18 | The e-pharmacy | Not in this slice. This slice builds its anchors: repeats, refills, the partner register, consent and single-use routing |
| D-PH4-19 | Regulator's name in copy | One signed string, "National Drug Authority" until the 2026 Act commences, then "National Drug and Health Products Authority" |
| D-PH4-20 | The permission map, version 5 | Appendix A: no new `pharmacy.*` permission; three `network.*` permissions for partner staff; a MedSync network verifier role |
| D-PH4-21 | Pharmacist-first repeats | Each repeat instance of a pharmacist-first line needs a fresh pharmacist's acceptance, at the hospital, before it is prepared or routed |
| E-PH4-01 | One supply record | Partner supplies are Phase 1 supply rows of a partner variant (RT-5), naming the partner as supplying organisation; no second table |
| E-PH4-02 | No partner stock | MedSync holds no partner stock or prices; the partner accepts or declines |
| E-PH4-03 | One code | A routed line has one single-use code |
| E-PH4-04 | Delivery | Three merges; refills live without the network |

## 15. Out of scope (leave clean seams)
- **The e-pharmacy:** online ordering from a pharmacy not in the network, delivery and couriers, online payment, MedSync operating a pharmacy, marketing to patients.
- **Not here at all:**
  - any automatic repeat or renewal;
  - repeats of controlled drugs;
  - partner stock or price feeds;
  - links to partners' own systems;
  - electronic-only prescriptions at a partner before the legal answer;
  - insurance claims;
  - the Expo app (Gate CG; the data contract stands as the seam);
  - telemedicine consultations for renewal (the renewal request is the seam).

## 16. ADRs (numbers from the ledger)
- Repeat authorisation as a prescriber's record beside the line, and its print.
- Renewal requests in the doctor's workspace.
- Holding prepared refills, and why it reverses E-PH1-03 only for refills.
- The partner register: verification, expiry by projection, disclosed interests.
- Consent per routing; the minimum partner read.
- Single-use routing codes and the shared supply lock.
- Messages that may name the hospital and the partner.
- The regulator's name across the 2026 Act's commencement.

## 17. Definition of Done
- [ ] A patient in the pilot collects a refill without a new clinic visit.
- [ ] A "buy outside" line is closed by a partner's recorded supply.
- [ ] No repeat beyond its authorisation or before its interval (test and audit query).
- [ ] No controlled drug routed; every routing has consent, a licence and an agreement in force (test and audit query).
- [ ] The partner read returns exactly the minimum fields (test).
- [ ] Nothing prepared moves by itself; nothing requested closes by itself (tests).
- [ ] axe clean; no red added; nothing green.
- [ ] Strings in `content/` as `draft`; no `*_COPY_STATUS` edited.
- [ ] User guides, ADRs, hazard log and final report exist. Each of the three diffs on `feat/pharmacy-network` is reviewable.

---

## Appendix A: Permission map, version 5 (for signature at GATE A)

Earlier versions stand. This slice adds no `pharmacy.*` permission.

| Who | New in this slice |
|---|---|
| Prescriber (existing permission) | Authorise and stop repeats; answer renewal requests |
| Pharmacist, pharmacy technician (`pharmacy.dispense`) | Prepare, set aside, release and hand over refills; route lines; record consent at the window |
| Pharmacy in charge (`pharmacy.manage`) | Agreements (with hospital admin); network reports |
| Partner responsible pharmacist (`network.admin`) | The partner's record, documents and staff |
| Partner pharmacist (`network.supply`) | Answer routings; record supplies |
| Partner pharmacy technician (`network.record`) | Answer routings; record supplies naming the supervising pharmacist |
| MedSync network verifier (superadmin role, two people) | Verify, confirm, suspend and reinstate partners; no patient data |
| Hospital admin | Agreements (with the pharmacy in charge), settings, aggregates; no PHI |
| The patient, or a recorded proxy | Request refills, name collectors, choose where, give and withdraw consent |
| Superadmin | Nothing new without break-glass, beyond the verifier role |

## Appendix B: Copy to be signed (all `draft`)

| Key | Text |
|---|---|
| Repeats step | After the first supply, the pharmacy may supply this {n} more times, at least {d} days apart, until {date}. You can stop the repeats at any time. |
| Repeats on the print | Repeats: {n}, at least {d} days apart, not after {date}. Prescriber: {name}, {council number}. |
| Repeats stopped | Stopped by {cadre} on {date}. |
| Patient, due | Next supply due around {date}. |
| Patient, can ask | You can ask for this now. |
| Patient, renew | Your doctor needs to renew this before the next supply. |
| Patient, never | Not refilled without seeing a clinician. |
| Patient, allowed | {n} more supplies allowed until {date}. Next review by {date}. |
| Patient, ready | Ready to collect at {place}, until {date}. |
| Patient, not possible | Not possible: {reason}. {What to do}. |
| Consent | {Pharmacy} will see your name, age and sex, these medicines and how to take them, and your prescriber's name. It will not see anything else in your record. When you collect, it will ask your date of birth or phone number and MedSync will check it, without showing it to them. You will pay {Pharmacy} directly. Take your printed prescription with you. |
| Consent tick | I agree to {Pharmacy} seeing this. |
| Collect here instead | Collect this one at the hospital. |
| Routed print | Routed to {Pharmacy}. Code {code}. This prescription can be supplied once. |
| Partner, minimum | You see only what is needed to supply this medicine. The patient's diagnosis, other medicines and results stay with the hospital. |
| Partner, licence warning | Your licence expires on {date}. Upload the renewed licence to keep receiving prescriptions. |
| Verified | Documents checked by MedSync on {date}. |
| Partner suspended | Partner suspended: arrange supply. |
| Messages | The seven kinds in 5.10 |

## Appendix C: Hazard log seed (complete at Step 1; close each with a test)

| # | Hazard | Control |
|---|---|---|
| H4-1 | A patient keeps getting a medicine nobody has reviewed | Authorisation with an end date and review-by; renewal, not extension; Law 2 |
| H4-2 | A medicine is supplied too often (stockpiling, diversion) | Interval hard stop (Law 4); RP-6 properties |
| H4-3 | A stopped or changed medicine is refilled | RP-3 ends repeats on change or cancellation |
| H4-4 | A refill continues an antibiotic or a medicine with a suspected reaction | Never-repeat list; RF-4 |
| H4-5 | The wrong person collects a prepared refill | Law 9 identity; named collectors; Phase 1 identified-another-way route |
| H4-6 | A patient is told medicines are ready that are not held | SA-1 to SA-4; message only while held |
| H4-7 | An unlicensed or lapsed pharmacy supplies a patient | PN-2 projection; S26 |
| H4-8 | A partner sees more of the record than it needs | Law 6; RT-6 schema test; per-open audit |
| H4-9 | The same line supplied twice, at the hospital and the partner | Shared lock; single-use code; Law 7 |
| H4-10 | A controlled drug routed outside | RT-1; never-routed list; test |
| H4-11 | Patients steered to a pharmacy for commercial reasons | Law 13; disclosed interests; interested people excluded from approval |
| H4-12 | A message reveals a condition through a medicine or pharmacy | NM-2 scan; D-PH4-16 |
| H4-13 | A renewal request is ignored and the patient runs out | Requests never close by themselves; listed with age; patient told what happens next |
| H4-14 | A routed code is guessed | Random code; lookups only by partners; rate limit and lockout |

## Appendix D: Sign-off packs (templates only; propose no clinical values)

| Pack | Signed by | While unsigned |
|---|---|---|
| Repeat list, never-repeat list, repeat maxima, interval tolerance | Pharmacist reviewer + CSO | No Repeats step is shown |
| Request window, late window | Pharmacy in charge + CSO | Patients can ask at any time; nothing is labelled early or late except by the interval |
| Hold days, number of extensions, hold-longer maximum, miss threshold, "not collected" message count | Pharmacy in charge | Refills cannot be set aside |
| Minimum repeat interval (at least one day), partner identity-attempt cap | Pharmacist reviewer + CSO | No Repeats step is shown; no routing can be supplied |
| Renewal decline reasons | CSO | Renewals can be answered only by Renew or Book a visit |
| Routing list, never-routed list, response window, decline and withdrawal reasons | Pharmacist reviewer + CSO (lists); pharmacy in charge (reasons, window) | Nothing can be routed |
| Verification standard, re-verification period, licence warning window (platform) | CSO + MedSync's legal adviser | No partner can be verified |
| Agreement template | Lawyer + CSO | No agreement can be switched on |
| Consent wording, print wording, patient copy, message templates (two-user approval) | CSO + pharmacist reviewer | The matching screen, print or message is unavailable |

## Appendix E: Legal questions, and sources (25 Oct 2026; re-verify at build time)

**Questions for the lawyer and the regulator, and what each gates:**

| Question | Needed before |
|---|---|
| 1, 2 | GATE A and `pharmacyRepeats` |
| 3, 5 | `pharmacyNetwork` |
| 4 | Any delivery (out of scope) |
| 6 | Any agreement that names a programme medicine |

1. Is an electronic prescription, or an electronic record of repeats, valid under the 2026 Act (s.37) and the Electronic Signatures Act? Until answered, the paper prescription is presented (D-PH4-11).
2. Does a repeat authorisation printed as in Appendix B satisfy s.37(5) ("the number of times and the intervals")? Must the "not after" date also appear? What is the position under the 1993 Act while the 2026 Act has not commenced?
3. Under the Data Protection and Privacy Act 2019, is per-routing consent in the signed wording a sufficient basis to share the Law 6 fields with a partner pharmacy, and must the hospital, the partner or MedSync register with the Personal Data Protection Office for this processing?
4. May a hospital or partner deliver medicines to a patient's home, or hand them to a courier? (Out of scope until answered.)
5. May a hospital pharmacy set aside dispensed medicines for later collection by a named collector, and may a partner supply against a prescription issued by another facility, under the hospital's and the partner's licences?
6. For programme medicines, which authority approves a community retail pharmacy distribution arrangement (D-PH4-05)?

**Sources:**
- *National Drug and Health Products Authority Act, 2026*, as published on Parliament's bills site (bill passed 26 March 2026; recorded as passed and assented 29 April 2026); sections 1, 2, 3, 28 to 32, 34, 35 to 40, 42, 43, 51 and 52 read; sections 88 onward not read.
- Parliament of Uganda, bills tracker for *The National Drug and Health Products Authority Bill, 2025*.
- *Optimizing the Community Retail Pharmacy Distribution Points*, Kabale RRH, ICAP CQUIN poster B25 (2022).
- *Community drug distribution points (CDDPs), Uganda*, differentiatedservicedelivery.org (TASO model).
- The roadmap's sources on online pharmacy services in Kampala (January 2026) and NDA's position, not re-opened.
- Not established: whether the 2026 Act has commenced; any online-pharmacy regulation since January 2026; a public, searchable register of licensed pharmacies or registered pharmacists that MedSync could consult.

## Appendix F: The law changed since Phases 1 to 3 (for the lawyer and the CSO)

Phases 1 to 3 cite the **National Drug Policy and Authority Act (1993)**. Parliament has since passed the **National Drug and Health Products Authority Act, 2026**, which repeals it and continues the National Drug Authority as the National Drug and Health Products Authority (s.3). It comes into force on a date the Minister appoints by statutory instrument (s.1), possibly provision by provision. Commencement was not confirmed on 25 Oct 2026.

What changes or needs re-reading across the pharmacy prompts, once it commences:
- **Phase 1:**
  - The controlled-drug sections, the prescription content rules and the record-keeping duty move to ss.35 to 40.
  - Section 39(1) requires a loss of class A1 or A2 drugs, or of their records, to be reported to the Authority within seven days. This should be added to Phase 1's controlled-drug differences and Phase 2's write-offs as a reporting reminder.
  - Section 37(4) allows a prescription to be presented without the patient present, which supports Phase 1's "someone else collects".
- **Phase 2:**
  - Section 34(1) requires labels to carry a unique identifier for traceability, which strengthens the case for Phase 2's scanning.
  - Section 42 sets recall powers; the NDA's 2017 recall guideline may be reissued.
- **Phase 3:** Section 52 requires health professionals to report adverse reactions "in the prescribed form". The Pharmacovigilance Regulations made under the 1993 Act need checking under ss.119 and 120 (savings).
- **Every phase:** Appendix E's legal questions should be re-asked against the 2026 Act. The regulator's name in copy switches at commencement (D-PH4-19). The Pharmacy Board of Uganda, under the Pharmacy and Drugs Act, is unaffected as far as the text read shows.
