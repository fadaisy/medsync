# MedSync Book — Patient Booking Application

## Product Requirements Document + Claude Code Build Prompt

**Document ID:** MS-BOOK-PRD-001 · **Status:** Draft for CSO and founder sign-off · **Owner:** Usama Fadhul (Founder, Clinical Safety Officer)

> **What this document is.** The complete product definition for MedSync's patient-facing booking application: strategy, clinical safety design, functional specification, architecture, compliance, UX, and the gated Claude Code build prompt (Part 7).
>
> **Relationship to existing MedSync work.** `prompts/scheduling-appointments-prd.md` (the scheduling engine PRD) and `prompts/scheduling-ui-calendar-addendum.md` remain **authoritative for engine behaviour**: the appointment lifecycle, availability blocks, urgent-from-alert widening fallback, auto-confirm versus manual approval, and the arrival to queue to encounter handoff. This document specifies the **application layer** that sits on top of that engine and extends it in four specific directions: cross-facility discovery, a standalone thin-tenant mode, non-smartphone channels, and payments. Where this document appears to change engine behaviour, the engine PRD wins and the conflict is a `[GATE]` item, not a silent override.
>
> **Standing law that governs this build.** The engine-first law: no surface ships that reads or writes an engine which does not exist with real tables, real RLS, and passing tests. Red is reserved for clinical emergencies. No dosing content anywhere near a public surface. DPPA compliance is non-negotiable. ID requirements are non-blocking. An emergency affordance is persistent on every screen.

---

# PART 0 — THE SHAPE, IN ONE PAGE

**The product is two surfaces over one engine.**

|              | **MedSync Book**                               | **MedSync Desk**                              |
| ------------ | ---------------------------------------------- | --------------------------------------------- |
| Who          | Patients and their families                    | Facility front desk, clinic in-charge         |
| Form         | Expo app, responsive PWA, USSD, SMS            | Web console (Attio-grade shell)               |
| Job          | Find care, secure a place, arrive knowing when | Publish capacity, run the day, close the loop |
| Runs against | The MedSync scheduling engine                  | The same engine, tenant-scoped                |

**The single most important design decision.** MedSync Book does **not** sell appointment times. Most Ugandan outpatient care does not run on appointment times and pretending otherwise is how booking products die here. It sells **three kinds of capacity**, and the facility chooses which applies per service:

1. **Slot** — a real time (private clinics, specialist reviews, procedures, virtual consults).
2. **Session position** — a place in a named clinic session with a capacity cap and an honest arrival window ("Tuesday diabetes clinic, position 23, arrive 09:30 to 11:00"). This is the Ugandan public-OPD mode and the product's centre of gravity.
3. **Open queue ticket** — a same-day virtual ticket taken before leaving home, replacing the 5am physical queue.

All three resolve into the same `appointments` and `queue_entries` objects the engine already owns. Nothing about the engine is forked.

**The second most important decision.** The app is an **access** tool, never an **assessment** tool. It never asks what is wrong, never lists symptoms, never scores anything, never advises. It routes people to a place where clinical assessment happens, and it measures how long that took. Triage is the Tier 2 triage engine's job, on arrival, by a clinician. This line is what keeps the product outside medical-device regulation and is also, separately, the clinically correct division of labour.

**The strategic role.** The booking app is the cheapest possible first contract with a facility. A hospital will not buy a hospital operating system on a cold call. It will publish its clinic capacity for free, and once its patients are arriving through MedSync, the queue module, then triage, then the encounter record are incremental rather than existential. Booking is customer acquisition for the operating system, disguised as a product that stands on its own.

---

# PART 1 — STRATEGY AND BUSINESS CASE

## 1.1 The problem, stated honestly

The problem is not that Ugandan patients cannot pick a time. It is that **they cannot see capacity**, and the health system cannot see demand.

- Patients queue physically from before dawn at referral and district facilities, because arrival order is the only allocation mechanism that exists. A clinic visit costs a full day of work and transport spent partly on waiting.
- Nobody knows in advance whether the specialist is in. Clinician absence for teaching, theatre, ward rounds, travel or emergencies is routine, and the patient learns about it after travelling.
- There is no continuity. A chronic patient sees whoever is on the bench, so the longitudinal reasoning that NCD control depends on never accumulates in one clinician's head.
- Facilities cannot forecast. Staffing, drugs and consumables are planned against last month's tally, not next Tuesday's booked demand.
- Missed appointments are not measured, so the system cannot act on them. <cite index="70-1">Uganda's doctor-to-patient ratio has been reported at roughly 1:25,000, with a shortage of patient-centred models and little post-hospital follow-up for chronic patients</cite>, which means every wasted clinical hour is expensive in a way that is hard to overstate.

The monitoring gap and the adherence gap that MedSync exists to close both terminate in the same bottleneck: **the visit that did not happen, or happened too late**. Booking is the mechanism that converts a detected problem into a seen patient. Without it, monitoring produces alerts nobody can act on.

## 1.2 Why this is the right wedge

- **It is the only MedSync module a facility can adopt without changing clinical practice.** No new documentation burden, no retraining of clinicians, no data migration. Publishing a clinic timetable is an administrative act.
- **It produces immediate, visible value.** Shorter physical queues, fewer wasted journeys, a filled clinic session. All observable within one clinic day.
- **It is the acquisition surface for patients.** Everything else in MedSync requires the patient already to be inside a facility's system. Booking is how a person who has never heard of MedSync arrives inside it.
- **It generates the two datasets that make everything later defensible:** a facility and service directory, and a longitudinal record of who sought care where and when.

## 1.3 What this product is not

| Not                             | Because                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A second scheduling engine      | The engine exists. This is a client of it. Forking scheduling logic guarantees divergence and a clinical incident.                                                      |
| A symptom checker or triage app | Assessment output makes it a regulated medical device and puts unsupervised clinical judgement in a patient's hands.                                                    |
| A telemedicine marketplace      | MedSync does not employ clinicians or sell consultations. That is a different business with a different regulatory posture, and it is already occupied.                 |
| A doctor-rating site            | Public ratings of individual Ugandan clinicians invite defamation exposure and professional-council conflict for no clinical benefit. Facility-level service data only. |
| A payments company              | Payments are a feature of booking where the facility charges. MedSync does not hold patient funds any longer than settlement requires.                                  |

## 1.4 Competitive position

Uganda's digital health field is crowded on the **demand side**: <cite index="66-1">Rocket Health, founded in Kampala in 2012 and funded at Series A, runs an online platform combining medicine delivery, teleconsultation, laboratory testing, vaccination and clinic appointment booking</cite>, and <cite index="65-1">the category includes roughly two dozen Ugandan telemedicine startups such as Dokitari, KetiAi and Afro Health Connect</cite>. <cite index="69-1">The incumbent model is consultation-first and channel-rich, reachable by USSD, phone, SMS and WhatsApp</cite>.

Every one of these is a **provider**. They compete for the consultation itself. MedSync Book is **supply-side infrastructure**: it does not want the consultation, it wants to run the facility's capacity. That distinction matters commercially in three ways.

1. **No head-on fight with a funded incumbent.** A hospital that uses Rocket Health for teleconsults can still use MedSync to run its OPD.
2. **A different buyer.** The buyer is the hospital administrator or clinic owner, not the patient. Buyers with budgets and an operational pain.
3. **A defensible moat that compounds.** Directory coverage plus published capacity is a two-sided asset. Clinical depth (triage, monitoring, encounters) is not replicable by a generic booking startup, and generic booking is not replicable at MedSync's clinical fidelity by a marketplace.

**Reference models to learn from, not copy:** Zocdoc (directory plus booking, US), Doctolib (facility software plus patient app, EU), Practo (India, marketplace). The European model — sell software to the practice, give the app to the patient free — is the correct one for MedSync. The US marketplace model, where the platform charges per new patient, does not survive Ugandan price points.

## 1.5 Business model

**Who pays: facilities. Never patients.** Patient-side charging is regressive, suppresses exactly the adoption the clinical thesis depends on, and makes the MoH relationship harder. Patients pay only the facility's own consultation fee, where one exists, and only through the app if the facility opts in.

**Tiers (per facility, monthly, UGX, to be validated against willingness-to-pay research):**

| Tier           | For                                             | Includes                                                                                                  | Pricing principle                                           |
| -------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Community**  | Public facilities, HC II–IV                     | Directory listing, session publishing, virtual queue, push reminders, SMS at cost                         | Free. Buys coverage, MoH goodwill, and the demand dataset.  |
| **Clinic**     | Private clinics, small hospitals                | Above plus slot mode, waitlist auto-fill, arrivals board, no-show reporting, one console user seat        | Low fixed monthly, priced below one avoided no-show per day |
| **Hospital**   | Private and PNFP hospitals, referral facilities | Above plus multi-department, session templates, capacity analytics, payments, API access, unlimited seats | Per-department or per-active-clinician                      |
| **OS upgrade** | Any of the above                                | Queue, triage, encounter, monitoring modules                                                              | The land-and-expand path. Booking is the door.              |

**Variable costs and how they are controlled.** SMS is the dominant variable cost and it scales with active patients, so the architecture is push-first with SMS as fallback, not SMS-first. Rules: one confirmation SMS per booking (the durable receipt), one reminder SMS only if push was not acknowledged, zero marketing SMS ever. USSD sessions on the postpaid, toll-free arrangement are a **facility-funded option**, not a platform cost — a facility choosing to make booking free for feature-phone patients pays for that choice. Every notification carries a cost attribution so unit economics are measurable per facility from day one.

**Revenue lines:** subscription (primary), transaction fee on facility-collected payments (secondary, small percentage, disclosed), SMS and USSD pass-through at cost-plus (neutral), and eventually anonymised, aggregated service-availability analytics for planning partners under an explicit, separately consented, ethics-reviewed arrangement (deferred, listed here so the consent architecture is built to permit it).

**What must be true for this to work.** Facilities must honour published capacity. A booking product whose bookings are ignored at the door dies in one week. This is not a software requirement but a contractual one, and it belongs in the facility agreement (see 5.6).

## 1.6 Success metrics

**North star: completed visits originating from a MedSync booking, per facility per week.** Not bookings. Not downloads. Completed visits, because that is the only number that means a patient actually received care.

| Layer                  | Metric                                                                                                    | Target direction                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Access                 | Median time from booking to being seen, by service                                                        | Down                                  |
| Access                 | Share of bookings made from feature-phone channels (USSD, SMS)                                            | Up — this is the equity metric        |
| Experience             | Median patient time on site, arrival to leaving                                                           | Down                                  |
| Experience             | Wait-estimate accuracy: predicted window versus actual call time                                          | Absolute error down                   |
| Efficiency             | Session fill rate (positions used ÷ positions published)                                                  | Up                                    |
| Efficiency             | No-show rate, and share of released capacity refilled from waitlist                                       | No-show down, refill up               |
| Continuity             | Share of chronic-service bookings made with the patient's previous clinician                              | Up                                    |
| Commercial             | Facilities publishing capacity weekly; conversion to paid tier; cost per booking (SMS plus USSD)          | Up, up, down                          |
| **Safety (guardrail)** | **Red-flag escape rate**: patients who booked a routine service and were triaged Red or Orange on arrival | **Monitored, never gamed. See 2.10.** |
| **Safety (guardrail)** | Share of booked arrivals triaged within the facility's target interval                                    | Up                                    |

---

# PART 2 — CLINICAL DESIGN AND SAFETY

This is the part of the document that makes the difference between a booking app and a safe booking app.

## 2.1 The access/assessment line

**Rule: MedSync Book collects the administrative reason for a visit. It never elicits, records, interprets or displays clinical information used to judge urgency.**

| Permitted (administrative)                                                                                                       | Prohibited (assessment)                                                            |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| "Which service?" from a controlled list of the facility's service lines                                                          | "What are your symptoms?"                                                          |
| "Is this a first visit or a follow-up?"                                                                                          | Symptom checklists, severity scales, duration questions                            |
| "Do you have a referral letter?"                                                                                                 | Any score, colour, category or priority derived from patient-entered clinical data |
| Free-text "anything the clinic should know before your visit", stored, never parsed, shown to the clinician, never used to route | Any routing, ranking or escalation driven by that free text                        |
| A static, identical-for-everyone emergency signpost                                                                              | "Based on what you described, you should…"                                         |

**Why the line sits exactly here.** The moment the application produces an output that a reasonable person would act on as a judgement about their clinical state, it is software performing a medical purpose and the regulatory characterisation changes, in Uganda and in every market MedSync would later enter. It also changes the negligence exposure: an assessment that under-triages is MedSync's failure, whereas a directory that offers a Tuesday clinic is not. The line is also clinically right. Self-reported symptom text is a poor triage input, and the correct place to triage is at the door, with vital signs, by someone who can act.

**The corollary that makes it safe rather than merely defensible:** because the app refuses to assess, it must be **aggressive about routing people to assessment**. That is the rest of this Part.

## 2.2 The three capacity modes

The facility configures each service as slot, session or open queue. The clinical and operational rationale for each:

### Slot mode

A named time with one patient. Correct for specialist review, procedures, antenatal appointments at a private facility, virtual consultations, and anywhere the clinician's time is genuinely allocable. Slot length and inter-slot buffer are department policy, set by HOD or admin, adjustable by the clinician within policy (engine PRD, unchanged).

### Session mode — the centre of the product

A **clinic session** is a named, dated block of care with a clinician or team, a service, a venue and a **capacity cap**: "Tuesday Diabetes Clinic, 08:00, Dr X and two nurses, cap 60."

- The facility splits capacity into a **booked allocation** and a **walk-in allocation** (for example 40/20). The split is explicit, published, and visible in the console.
- A booked patient receives a **position within the booked stream** and an **arrival window**, never a precise time.
- Booked and walk-in streams are interleaved at a facility-set ratio (for example 2:1) so the walk-in patient is not indefinitely displaced. Displacing walk-ins entirely would make the product an access barrier for the poorest patients, which is unacceptable.
- **Arriving early does not improve your position.** This must be stated in the confirmation message, enforced at the desk, and is the entire behavioural point of the feature.
- Overbooking factor is configurable per session and its effect on the wait estimate is **visible, not hidden**. A facility that overbooks 1.3x sees a wider predicted window, and so does the patient.

### Open queue mode

A same-day virtual ticket for services with no scheduled sessions. The patient takes a ticket remotely, sees the current position and live estimate, and travels when the estimate says to. Ticket validity rules (how long a position is held after being called) are facility policy with a safe default.

**All three produce the same engine objects.** Slot and session bookings are `appointments`; arrival in any mode produces a `queue_entry`; rooming produces an encounter. The booking app adds a capacity abstraction above the engine, not a parallel one beside it.

## 2.3 The reason-for-visit taxonomy

A controlled vocabulary, facility-extensible, deliberately administrative. Starter set in Appendix A. Design constraints:

- Every reason maps to exactly one **service line**, which maps to capacity. Reasons the facility does not offer are not shown.
- **No reason is a symptom.** "New problem" is a reason. "Chest pain" is not, and never appears as a selectable option.
- Reasons carry a **time-to-care policy** (2.4) and a **continuity default** (2.7).
- Reasons are the hook for later modules: "medicine refill" is the seam to e-pharmacy, "test results" is the seam to the encounter record, and neither is built here.

## 2.4 Time-to-care policy and the no-silent-wait rule

Each service line carries a facility-set **maximum acceptable lead time** (for example: follow-up, 30 days; new problem, 7 days; post-discharge review, 3 days).

**Rule: if no capacity exists within the policy window, the app never silently offers a date beyond it.** It presents, in this order:

1. Another clinician in the same service at this facility, within the window.
2. The same service at another facility in the directory, within the window, with distance and fee shown.
3. The same-day walk-in queue at this facility.
4. Only then, the next available date beyond the window, labelled plainly as beyond the facility's own target.

This is an **access** decision using facility-published policy. It contains no clinical judgement about the individual patient, and it is the single most valuable thing the product does for a sick person who does not know the system.

## 2.5 Emergency signposting

Two mechanisms, both static, both non-assessing, both CSO-signed.

**The persistent affordance.** An emergency control on every screen of every channel, reachable in one tap, leading to a static screen that signposts only: go to the nearest emergency unit, call these numbers, here is the nearest facility with an emergency unit from the directory. No questions, no symptom lists, no severity words, no "if you have X then Y" conditionals.

**The interstitial.** When a patient selects a reason in the "new or worsening problem" family, a full-screen static card appears **before** the calendar: booking is for care that can wait; if this cannot wait, do not book, go now, here is where. One dismiss action continues to booking. Identical for every patient, every time. It intercepts at the exact decision point where a booking becomes a dangerous delay, without asking a single clinical question.

`[GATE — CSO]` The emergency numbers displayed must be confirmed against current MoH Emergency Medical Services guidance and, where the facility has its own emergency line, the facility record. **Do not hardcode an unverified number.** The emergency screen copy, and its translation into every supported language, requires explicit CSO sign-off before ship, and translation review before any non-English version is enabled.

## 2.6 The deterioration channel

The clinically riskiest state in any booking product is a patient who booked three weeks out and is deteriorating today. They have a MedSync relationship, which means they may wait rather than seek care, and that is a harm the product created.

**"My situation has changed"** is an action on every upcoming booking. It does not ask what changed. It does three things:

1. Shows the emergency signpost first.
2. Offers immediate access options: today's walk-in queue, the earliest slot in the service, or another facility with today's capacity.
3. For patients of a facility running the full MedSync OS, raises a **non-clinical flag** to the care team or clinic in-charge: "this patient has asked to be seen sooner." Not an alert, not a severity, not a triage output. A human sees it and decides.

The flag is a notification, not a clinical record. It is audited. It does not enter the encounter record.

## 2.7 Continuity as a first-class booking preference

For chronic services, continuity of care is a clinical outcome, not a convenience. The app encodes it:

- **Default for chronic service lines:** offer capacity with the clinician who last saw this patient for this service, before offering anyone else.
- The patient can always override, in one tap, without explanation, and overriding is never framed negatively.
- Where the previous clinician has no capacity within the time-to-care policy, access wins over continuity: a timely visit with someone else beats a delayed visit with the right person. This ordering is explicit and is a `[GATE — CSO]` decision.
- Continuity rate becomes a reportable facility metric, which is how a clinic in-charge discovers their chronic clinic has no continuity at all.

For patients not affiliated to a facility, no continuity data exists, and the app must not imply otherwise.

## 2.8 Identity: the booking record is not the clinical record

**Rule: a booking never writes into the clinical Master Patient Index. It creates a provisional record which a human reconciles at the facility.**

A wrong merge is a wrong chart, and a wrong chart kills people. Phone numbers in Uganda are shared within households, resold by telcos, and changed often. Name spelling varies between visits. Automatic matching on phone plus name is exactly the kind of convenience that produces a catastrophic identity error.

The model:

- **Booking identity** = verified phone number plus a self-declared name and date of birth or age. Non-blocking: no NIN, no formal ID, no email required. A refugee, a child, an elderly rural patient must be able to book.
- On arrival, reception sees the provisional record alongside **candidate matches** from the MPI, with the confidence basis shown, and **explicitly confirms or creates**. Never automatic. Never silent.
- Until reconciled, the booking carries no clinical data and grants no access to any clinical record.
- A reconciliation, once made, is audited and reversible only through a sensitive action.

This also closes a privacy hole: if booking auto-matched on phone number, whoever holds a recycled number could see another person's care history.

## 2.9 Proxy and household booking

Most Ugandan patients will be booked by someone else: a son with the only smartphone, a village health team member, a neighbour. Treating this as an edge case is a design error.

- **One account, many patients.** A person can hold a household list and book for any member.
- Each member is a distinct patient identity with its own record, name and age. The booker is recorded as the **booking agent** on every booking they make.
- **Minors** require a declared guardian relationship. The minor-and-guardian model is an open `[GATE A]` decision in the MedSync backlog and this feature is blocked on it.
- **Adults booked by a proxy** consent separately when they first interact directly with the platform. Until then, the proxy sees booking logistics only: date, place, service. Never clinical content, never history, never results.
- Removal of a member from a household list is one action and revokes the proxy's visibility immediately.

`[GATE — CSO and legal]` Proxy consent under DPPA for adults who did not themselves consent, and the age at which a minor's own consent is required for specific service lines (notably sexual and reproductive health), both need legal input before this ships. A sexual and reproductive health booking visible to a family member on a shared phone is a genuine safety risk. **Recommendation: service lines flagged `confidential` never appear in a proxy's view and generate no SMS to the booking phone.**

## 2.10 Safety telemetry: how the app audits its own risk

Because the app refuses to assess, it must measure whether that refusal is costing anyone.

**Red-flag escape rate.** For every patient who booked a routine service and was triaged Red or Orange on arrival, the pairing is recorded: reason booked, lead time waited, triage outcome. This is computed by the triage engine, not by the booking app, and it answers the only question that matters: _is self-booking sending acutely unwell people to the back of a queue?_

Rules for this metric:

- Reviewed by the CSO on a fixed cadence, with a documented threshold that triggers design review.
- **Never used to tighten the funnel by adding clinical questions.** If escapes rise, the correct responses are: sharper emergency signposting, shorter time-to-care policies, better walk-in prominence, facility education. Not a symptom checker.
- Also computed for a comparison stream of walk-in patients who never used the app, so the baseline is honest. If booked patients escape less often than walk-ins, the product is a safety improvement, and that is a finding worth publishing.

**Time-to-triage on arrival** for booked patients, per facility. A booking system that gets people through the door faster but leaves them unassessed on a bench has moved the problem, not solved it.

## 2.11 CSO sign-off gates

Nothing in the following list ships without a signed artifact from Fadhul as Clinical Safety Officer:

1. Emergency signpost copy, numbers, and every translation.
2. The reason-for-visit taxonomy, and the rule that no entry is a symptom.
3. Time-to-care policy defaults per service line, and the access-over-continuity ordering.
4. The deterioration channel's copy and its non-clinical flag semantics.
5. The identity reconciliation rule and its UI, including the prohibition on auto-merge.
6. Confidential service lines and their proxy-visibility exclusions.
7. The red-flag escape review threshold and response protocol.
8. All patient-facing copy in any language, before that language is enabled.

**Standing governance risk, restated:** Fadhul currently holds superadmin, CSO and audit-reviewer simultaneously. This is a documented, real weakness, not an implicit one. For this module the mitigation is that the red-flag escape review must be **co-signed by a second clinician** who is not Fadhul, named before launch.

---

# PART 3 — FUNCTIONAL SPECIFICATION

## 3.1 Users

| Persona                                                     | Reality                                                                                                       | What they need                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Chronic patient (Nakato, 58, hypertension and diabetes)** | Rural, feature phone, 40km from the regional referral hospital, low English literacy, travels with a relative | To know the clinic is running, to keep her place without leaving at 4am, to see the same clinician      |
| **Urban working patient (David, 31)**                       | Kampala, Android, data-conscious, cannot afford a lost workday                                                | A real time, a reliable reminder, to reschedule without a phone call                                    |
| **Family booker (Grace, 26)**                               | Books for her mother, her child and a neighbour from one phone                                                | One account, many people, no confusion about whose appointment is whose                                 |
| **Post-discharge patient**                                  | Discharged with a review date that exists only on a paper form                                                | The review booked before discharge, with a reminder that survives the paper                             |
| **Reception / records officer**                             | The single highest-leverage user; runs the door                                                               | An arrivals board, fast identity reconciliation, ability to book for callers and walk-ins               |
| **Clinician**                                               | Availability changes weekly; ward round overruns                                                              | Their real day, one place to see it, and the ability to cancel a session without abandoning 40 patients |
| **Clinic in-charge / HOD**                                  | Answerable for the clinic running                                                                             | Fill rate, no-shows, wait accuracy, and the ability to cancel and mass-rebook in one action             |
| **Hospital administrator**                                  | Buys the product                                                                                              | Utilisation, demand forecast, revenue from bookings, evidence it is working                             |

## 3.2 Core journeys

1. **Discover and book.** Open app → find facility or service → see published capacity → choose reason → emergency interstitial where applicable → choose clinician (continuity default) → choose slot, position or ticket → confirm identity → pay where required → receive confirmation by push and SMS.
2. **Book by USSD.** Dial code → language → facility (nearest by declared district, or saved) → service → next available session → confirm → SMS receipt. Under 6 menu levels, session-resumable.
3. **Reminder and confirmation loop.** Reminder at T-24h asks for confirmation. Unconfirmed bookings release at T-minus-X into the waitlist. Confirmed bookings get a T-2h arrival-window message.
4. **Arrive.** Patient taps "I have arrived" or reception marks arrival → queue entry created → live position → called → rooming hands off to the encounter.
5. **Reschedule or cancel.** One tap. Cancellation immediately offers the released capacity to the waitlist and thanks the patient plainly for freeing it.
6. **Session cancelled by the facility.** In-charge cancels with a reason → every affected patient notified by push and SMS with an automatic offer of the next equivalent session, pre-selected, one tap to accept. **Nobody is dropped silently. This is a hard requirement.**
7. **Urgent booking from a monitoring alert.** Engine behaviour, unchanged: alert fires, the widening fallback finds capacity, the patient receives a calm, explained proposal with one-tap acceptance.

## 3.3 Feature specification

### 3.3.1 Directory and discovery

- Facility records: name, MoH facility level (existing 14-option catalogue), ownership (existing 7-option catalogue, PNFP bureau sub-field), location to parish via the UBOS hierarchy with village free-text fallback, contact, emergency unit yes/no, services offered, fees where published, whether it accepts bookings.
- Search by service, by location, by "near me" (device location, **separately consented**, never required), and by facility name.
- **Verified badge** for facilities whose registration has been confirmed by MedSync (the hospital registration flow already exists).
- **Honesty rule:** a facility that has published no capacity for 14 days is shown as not currently accepting bookings. The directory never implies availability it cannot prove.
- Unverified or unregistered facilities may appear as information-only records with no booking affordance, provided the source of the record is shown. `[GATE A]` Decide whether the launch directory is registered-facilities-only. **Recommendation: registered-only at launch.** A directory of facilities that cannot be booked teaches patients the app does not work.

### 3.3.2 The booking flow

One decision per screen on mobile. Steps: reason → (emergency interstitial) → clinician → capacity → patient identity → payment → confirm.

- **Resumable.** A dropped connection never loses progress; the draft persists locally and resumes.
- **Capacity is held, not reserved, until confirmed**, with a short server-side hold (default 5 minutes) and a visible countdown. Holds expire cleanly.
- **Idempotent.** Every booking mutation carries a client-generated idempotency key. A retried submission on a flaky 2G connection must never produce two bookings. This is a correctness requirement, not an optimisation.
- **Confirmation is durable.** The SMS receipt is the artifact the patient shows at the desk, containing facility, service, date, position or time, arrival window, and a short booking code. It must be readable on a feature phone in one screen.

### 3.3.3 Waitlist and auto-fill

- Any patient offered capacity beyond their preferred date may join a waitlist for that service.
- Released capacity (cancellation, unconfirmed release, session expansion) is offered to the waitlist in order, with a short acceptance window, cascading to the next patient on expiry.
- Offers are throttled so a patient is never woken at night: no waitlist offers outside facility-set hours.
- Waitlist position is visible and honest; if a service's waitlist has never cleared, say so.

### 3.3.4 Reschedule, cancel, no-show

- Reschedule within facility policy, reason captured from a short list.
- Cancellation is one tap and is framed pro-socially: the released place goes to someone waiting.
- **No punitive automation. No auto-bans, no scores, no fees that function as punishment.** Repeated no-shows surface as an operational signal to the clinic, which may act humanely (a phone call often reveals a transport problem, not indifference). This follows from MedSync's wellbeing principles and is not negotiable in the build.
- A no-show is marked by the facility, never inferred by the system alone, because inference here is frequently wrong and the consequence lands on the patient.

### 3.3.5 Payments (optional per facility)

- Mobile money collection via MTN MoMo and Airtel Money through a Ugandan aggregator, plus card where the facility has a gateway. Cash-at-facility remains a first-class option and is the default.
- **Three payment postures per service:** none (public facilities), deposit (creditable against the consultation, refundable per policy), full prepayment.
- Refunds are automatic on facility-side cancellation, within a stated window, without the patient asking. Any manual refund is a sensitive, audited, four-eyes action.
- Payment failure never destroys the booking; it leaves it in `payment_pending` with a clear path, and facility policy decides whether the capacity is held.
- MedSync never holds patient funds beyond settlement. Reconciliation reports are per facility, daily.
- `[GATE A]` Aggregator selection, settlement terms, PCI-adjacent obligations, and whether MedSync is a payment intermediary requiring Bank of Uganda consideration. **This needs legal input before any payment code is written.**

### 3.3.6 Notifications

Push-first, SMS fallback, USSD-session confirmations inline. Full matrix in Part 4.

Content rules: never disclose the service line in an SMS to a shared phone for `confidential` services; never include clinical content of any kind; always include the facility name and booking code; always in the patient's chosen language.

### 3.3.7 Channels

| Channel                | Scope at launch                          | Notes                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Responsive web PWA** | Full                                     | The primary build. Mobile-first, installable, works on a low-end Android browser.                                                                                                                                                                                                                                                                              |
| **Expo app**           | Full, patient surfaces                   | Shares the Supabase backend directly per existing architecture. Push notifications live here.                                                                                                                                                                                                                                                                  |
| **USSD**               | Book, view next booking, cancel, confirm | <cite index="57-1">Shared code on MTN and Airtel is available immediately through Africa's Talking; a dedicated code requires allocation from the Uganda Communications Commission. Prepaid charges the end user per session; postpaid makes the service toll-free to the patient</cite>. **Recommendation: shared code, postpaid where a facility funds it.** |
| **SMS**                | Confirm, cancel, reminder replies        | Keyword-based, not conversational.                                                                                                                                                                                                                                                                                                                             |
| **WhatsApp**           | Deferred                                 | High adoption, but Business API cost and template approval make it a Phase 2 decision. Seam left clean.                                                                                                                                                                                                                                                        |
| **Call centre**        | Deferred                                 | A reception user booking on behalf of a caller already covers this.                                                                                                                                                                                                                                                                                            |

### 3.3.8 Patient booking record

A simple list: upcoming, past, cancelled. Each entry shows logistics only. **No clinical content appears in the booking app for a patient, ever, at launch**, because the open governance gate `CG` blocks mobile clinical PHI read until a signed governance artifact exists.

## 3.4 MedSync Desk — the facility console

For facilities not running the full OS. Attio-grade shell, desktop-first, reusing the hospital admin shell contract.

- **Capacity publishing:** session templates (recurring: "Diabetes Clinic, Tuesdays 08:00, cap 60, split 40/20"), one-off sessions, slot availability for named clinicians, blackout dates, holidays.
- **Today's board:** expected arrivals, arrived, in progress, seen, no-show. Position order for session mode. Live.
- **Identity reconciliation:** provisional bookings with candidate MPI matches, confirm or create, audited (2.8).
- **Cancel session:** reason, automatic mass notification, automatic rebooking offers, an explicit count of patients affected shown before confirmation. A sensitive action.
- **Book on behalf:** for callers and walk-ins. Audited. Patient notified.
- **Reports:** fill rate, no-show rate, wait accuracy, demand by service and day, released-and-refilled capacity, SMS spend.
- **Settings:** services offered, time-to-care policies, capacity splits, overbooking factor, payment posture, notification lead times, confidential service flags.

## 3.5 Role matrix

| Capability                       | Patient         | Booking agent (proxy) | Reception | Clinician          | HOD / in-charge    | Hospital admin | Superadmin            |
| -------------------------------- | --------------- | --------------------- | --------- | ------------------ | ------------------ | -------------- | --------------------- |
| Book for self                    | ✅              | —                     | —         | —                  | —                  | —              | —                     |
| Book for household member        | —               | ✅                    | —         | —                  | —                  | —              | —                     |
| Book on behalf of any patient    | —               | —                     | ✅        | ✅                 | ✅                 | —              | —                     |
| See own bookings                 | ✅              | logistics only        | —         | —                  | —                  | —              | —                     |
| Publish availability             | —               | —                     | —         | ✅ own             | ✅ department      | —              | —                     |
| Cancel a session                 | —               | —                     | —         | ✅ own             | ✅ department      | —              | —                     |
| Reconcile identity               | —               | —                     | ✅        | —                  | —                  | —              | —                     |
| Mark arrival / no-show           | ✅ self-arrival | —                     | ✅        | ✅                 | ✅                 | —              | —                     |
| Department policy and templates  | —               | —                     | —         | —                  | ✅                 | ✅             | —                     |
| Facility-level booking analytics | —               | —                     | —         | —                  | ✅ dept            | ✅ facility    | —                     |
| Cross-tenant aggregates, no PHI  | —               | —                     | —         | —                  | —                  | —              | ✅                    |
| Any routine clinical data access | ❌              | ❌                    | ❌        | per existing model | per existing model | ❌             | ❌ (break-glass only) |

## 3.6 Edge cases and failure modes

| Situation                                            | Required behaviour                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clinician absent, session not cancelled              | In-charge can cancel or reassign; if a session's clinician is unset at T-12h, the console raises it. The app never shows a session with no clinician as bookable. |
| Facility loses internet on clinic day                | Desk works from a locally cached arrivals list; arrivals queue locally and sync. Position order is deterministic from booking order, so it survives offline.      |
| Patient books at two facilities for the same day     | Allowed. The system does not police patient choice. Both facilities see only their own booking.                                                                   |
| Duplicate bookings from a retried request            | Prevented by idempotency key.                                                                                                                                     |
| Two patients accept the last position simultaneously | Server-side atomic capacity decrement. The loser sees a clear message and the next options, never a silent failure.                                               |
| Patient arrives without a phone or code              | Reception searches by name, phone or booking code. Absence of the phone never blocks care.                                                                        |
| Phone number changes or is recycled                  | Re-verification on change; old bookings stay with the patient identity, not the number. A new holder of a recycled number sees nothing.                           |
| Session over-runs, positions slip                    | Estimates update live; a patient whose window has moved by more than a threshold gets a proactive message. Silence here is the thing patients hate most.          |
| Patient in the waitlist is offered a slot at 23:00   | Blocked by quiet-hours throttle.                                                                                                                                  |
| A facility never honours positions                   | Detectable: booked-arrival-to-called time diverges from the estimate. Surfaced to the account owner as a relationship issue, then a contractual one.              |

---

# PART 4 — TECHNICAL ARCHITECTURE

## 4.1 Relationship to existing engines

| Engine                              | Tier | Status        | This module's relationship                                                                                                                                                                                                                                   |
| ----------------------------------- | ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scheduling / appointments           | 2    | Built         | **Consumed.** Availability, appointment lifecycle, urgent-from-alert, queue handoff all reused unchanged.                                                                                                                                                    |
| Patient entry points, handling flow | 2    | Built         | **Consumed.** Booking is an entry point; presence lifecycle already modelled.                                                                                                                                                                                |
| Triage engine v2                    | 2    | Built         | **Downstream.** Booking hands arrivals to triage. Booking never calls triage logic.                                                                                                                                                                          |
| Receptionist workspace              | 4    | Built         | **Extended** with the reconciliation and arrivals surfaces.                                                                                                                                                                                                  |
| Notifications                       | 3    | **Stubbed**   | **Hard dependency.** Build against the defined interface; SMS via Africa's Talking, push via Expo. If the engine is not built, this module's reminder and mass-cancellation features are not shippable beyond a stub. **This is the critical path blocker.** |
| Encounter / EMR                     | 3    | Next to build | **Seam only.** Rooming hands off. Booking writes nothing clinical.                                                                                                                                                                                           |
| Monitoring / vitals                 | 3    | Stubbed       | **Seam only,** already defined by the engine PRD's `triggered_by_alert_id`.                                                                                                                                                                                  |
| E-pharmacy                          | 5    | Not started   | **Seam only.** The `medicine refill` reason is the join point. Do not build.                                                                                                                                                                                 |

**Sequencing recommendation.** The notifications engine is a true prerequisite for the booking app's value, not a nice-to-have: a booking product without reliable reminders loses most of its measurable benefit, given that <cite index="27-1">text-message reminders improve attendance at healthcare appointments compared with no reminders (risk ratio 1.10, 95% CI 1.03 to 1.17), are as effective as phone-call reminders, and cost less per attendance</cite>. **Build notifications before or alongside this module.** This is consistent with the master roadmap, which already places notifications third in Tier 3.

## 4.2 Data model (new tables, proposed — schema review at Gate A)

```
facility_directory_entries   -- public-facing facility record; level, ownership, geo, services, verified
service_lines                -- per facility: name, capacity_mode, time_to_care_days,
                                continuity_default, confidential flag, payment_posture, fee
clinic_sessions              -- dated instance: service_line, clinician(s), venue, start,
                                capacity_total, capacity_booked_share, overbooking_factor, status
session_templates            -- recurrence rules that generate clinic_sessions
booking_requests             -- the app-layer intent: channel, reason, requested capacity,
                                idempotency_key, hold_expires_at, status
session_positions            -- position_number, arrival_window, appointment_id
waitlist_entries             -- service_line, patient, preferred_window, offer state
provisional_patients         -- booking identity; NEVER the MPI; reconciliation state
booking_agents               -- proxy relationships, consent basis, revocation
payment_intents              -- provider, amount, state machine, refunds, reconciliation ref
notification_dispatches      -- event, channel, template, cost attribution, delivery receipt
ussd_sessions                -- session state, resumable, expiring
```

Every table: RLS on, tenant-scoped, append-only audit via the existing trigger, additive migrations only, schema proposal before migration.

**Encryption.** Provisional patient names, phone numbers and free-text notes are personal data and use the existing app-level AES-256-GCM path. Capacity, session and directory data are not personal and are not encrypted, which keeps the discovery surface fast.

## 4.3 Lifecycle and FHIR mapping

MedSync stores its own statuses and maps at the API boundary. It does not store literal FHIR, consistent with the existing FHIR-compatible-not-FHIR-native decision. <cite index="51-1">The FHIR AppointmentStatus value set provides proposed, pending, booked, arrived, fulfilled, cancelled, noshow, entered-in-error, checked-in and waitlist</cite>, which maps cleanly:

| MedSync status              | FHIR AppointmentStatus | Note                                        |
| --------------------------- | ---------------------- | ------------------------------------------- |
| `held`                      | `proposed`             | Server-side capacity hold, pre-confirmation |
| `requested`                 | `pending`              | Manual-approval clinics                     |
| `confirmed`                 | `booked`               |                                             |
| `waitlisted`                | `waitlist`             |                                             |
| `arrived`                   | `arrived`              | Creates the queue entry                     |
| `checked_in`                | `checked-in`           | Reception-verified, identity reconciled     |
| `in_progress` / `completed` | `fulfilled`            | Encounter engine owns the clinical side     |
| `cancelled` / `declined`    | `cancelled`            | Reason captured                             |
| `no_show`                   | `noshow`               | Facility-marked only                        |
| `void`                      | `entered-in-error`     | Sensitive action                            |

Capacity exposes as FHIR `Schedule` and `Slot`; the facility as `Location` and `Organization`; a service line as `HealthcareService`; a clinician as `PractitionerRole`. <cite index="46-1">FHIR's current published version is 5.0.0, with Release 6 still in ballot</cite>, so **target R4 for maximum interoperability with existing Ugandan systems and keep the mapping layer versioned** so an R5 or R6 profile is a configuration change, not a rewrite.

**Uganda alignment.** The mapping must conform to the MoH Health Information Exchange and Interoperability Guidelines and the Digital Health Enterprise Architecture, Standards and Knowledge Guidelines, which <cite index="35-1">set out how Uganda's defined standards are to be applied to digital health systems, alongside the Health Data Protection, Privacy and Confidentiality Guidelines aligned to the Data Protection and Privacy Act and its 2021 Regulations</cite>. A DHIS2 aggregate-reporting seam (attendance counts by service, never patient-level) is left clean and not built.

## 4.4 Concurrency and correctness

- **Capacity decrement is atomic** at the database level. No application-level check-then-write.
- **Idempotency keys** on every booking, cancellation and payment mutation, retained long enough to cover realistic retry windows on poor connections.
- **Holds expire server-side**, never client-side, with a sweeper.
- **Position numbers are assigned at confirmation**, are stable, and are never renumbered by cancellations (gaps are fine; renumbering destroys the patient's mental model and the SMS they are holding).
- **All times stored UTC, rendered EAT.** Timezone-safety is a test gate, not a hope.

## 4.5 Performance and offline budgets (enforced at Gate H)

| Budget                                                | Target                                                            | Why                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Booking route JS, gzipped                             | ≤ 120 KB                                                          | 2G and data cost                            |
| First contentful paint, simulated 3G, low-end Android | ≤ 3 s                                                             |                                             |
| Time to interactive, same                             | ≤ 5 s                                                             |                                             |
| Full booking flow data cost                           | ≤ 300 KB                                                          | A patient must not pay meaningfully to book |
| Offline                                               | Draft persistence, resumable flow, queued submission on reconnect |                                             |
| USSD round trip                                       | ≤ 2 s per menu step                                               | Session timeouts are brutal                 |
| Directory search                                      | ≤ 500 ms p95                                                      |                                             |

## 4.6 Notification matrix (abbreviated)

| Event                           | Patient                 | Facility                 | Channels                         |
| ------------------------------- | ----------------------- | ------------------------ | -------------------------------- |
| Booking confirmed               | ✅ receipt              | board update             | push + SMS                       |
| Confirmation request T-24h      | ✅                      | —                        | push, SMS if no push ack         |
| Arrival window T-2h             | ✅                      | —                        | push, SMS on opt-in              |
| Capacity released to waitlist   | ✅ offer                | —                        | push + SMS, quiet hours enforced |
| Session cancelled               | ✅ with rebooking offer | ✅                       | push + SMS, **always both**      |
| Window shifted beyond threshold | ✅                      | —                        | push + SMS                       |
| Position called                 | ✅                      | ✅                       | push, in-app                     |
| Payment received or refunded    | ✅                      | ✅                       | push + SMS                       |
| Deterioration flag raised       | —                       | ✅ in-charge / care team | in-app + push                    |

## 4.7 Security

Inherits the platform model without exception: RLS everywhere, Edge Function pattern for sensitive writes (Zod, `getUser()`, role check, tenant check, PII-redacted log, audit entry, typed response), MFA for all facility users, append-only audit immutable to superadmin, no routine superadmin PHI access, four-eyes on dangerous actions.

Module-specific additions:

- **Rate limiting and abuse control** on booking creation per phone and per IP. A booking endpoint is a free SMS-sending machine for an attacker, and SMS costs money.
- **OTP throttling and lockout** on phone verification.
- **Enumeration protection** on the directory and on booking-code lookup.
- **USSD and SMS webhooks** are authenticated and signature-verified; an unauthenticated USSD callback is a public write endpoint.
- **Payment webhooks** verified by signature, processed idempotently, reconciled daily against provider records.

---

# PART 5 — COMPLIANCE AND GOVERNANCE

## 5.1 Data protection

Uganda's regime is the binding one. <cite index="9-1">The Data Protection and Privacy Act, Cap. 97 sets out the principles every data collector, processor or controller must follow: accountability, fairness, lawfulness, purpose limitation and minimality, with collection and processing generally requiring the data subject's consent for a specified purpose</cite>. Note the citation form: the 2019 Act is now **Cap. 97** in the revised edition, and MedSync documents should use that form.

**Registration is mandatory and is a launch blocker.** <cite index="11-1">Under Section 29, registration with the Personal Data Protection Office is mandatory for every data collector, processor and controller handling personal data in Uganda, with no minimum-size threshold</cite>, and <cite index="10-1">registered entities must submit an annual compliance report to the Office within 90 days after the end of each financial year, with failure to register or renew constituting an offence</cite>. <cite index="5-1">Registration must be renewed annually, and the Office has confirmed that a controller need not seek advance permission for each cross-border transfer but must maintain records of the legal basis, safeguards and justification, available for inspection</cite>.

**Operational consequences for this module:**

- MedSync must be PDPO-registered before the first patient books. Add: registration, annual renewal, annual compliance report, information security policy and data retention policy as named artifacts (both policies are required at application).
- Every third-party processor in the booking path (SMS gateway, USSD aggregator, payment aggregator, push service, hosting) needs a documented processing basis, and any data leaving Uganda needs the transfer record described above.
- The existing rejection of the email-photo-fetch pattern as a cross-border transfer violation stands and generalises: **no patient identifier goes to a foreign service without a recorded justification.**

## 5.2 Consent architecture

Four independently declinable consents, none bundled:

1. **Service consent** — necessary to book. Explains what is collected, who sees it, retention.
2. **Communication consent** — SMS and push for booking logistics. Declining means in-app only, and the app says plainly that this makes missed appointments more likely.
3. **Location consent** — for "near me". Declining falls back to district selection. Never required.
4. **Secondary use consent** — anonymised, aggregated service-demand analytics. Separately declinable, refusable without any loss of function. Epidemiological use of location data specifically requires its own consent, per standing MedSync policy.

Proxy consent, minor consent and confidential service lines per 2.9, pending legal input.

## 5.3 Ministry of Health approval

<cite index="43-1">Uganda's MoH guidelines for the introduction of digital health solutions require solutions and innovations to undergo an approval process, beginning with registration capturing preliminary information and assessment against the Digital Health Solutions Assessment Criteria, with submissions made through the Digital Health Technical Registry electronic portal, and validated guidelines endorsed through the Ministry's Health Information Innovation and Research Technical Working Group and senior management</cite>.

**Action:** treat MoH registration and DHSAC assessment as a parallel workstream starting now, not at launch. Approval timelines are not under MedSync's control and the assessment will ask for exactly the artifacts this document names (architecture, interoperability approach, data protection posture, clinical governance). Prepare them once, use them twice.

Uganda's governing digital health instrument at the time of writing is <cite index="31-1">the Health Information and Digital Health Strategic Plan 2020/21 to 2024/25</cite>, now past its period; MedSync should track its successor and align the booking module's interoperability claims to whatever replaces it.

## 5.4 Not a medical device: the positioning and what would break it

MedSync Book performs no medical purpose. It does not diagnose, does not prognose, does not recommend treatment, does not prioritise patients by clinical state. It is an administrative access tool.

**Things that would break this, and are therefore prohibited without a full regulatory reassessment and CSO approval:**

- Any question about symptoms, severity, duration or clinical history in the booking flow.
- Any ordering, ranking, colour or priority derived from patient-entered clinical data.
- Any advice output, however hedged.
- Any automated interpretation of the free-text "anything the clinic should know" field.
- Any integration that pipes patient-entered text into the triage engine.

This prohibition is enforced by test, not just by policy: an invariant test asserts that no booking-flow field feeds any scoring or routing function.

## 5.5 Retention and deletion

- Booking records: retained per Uganda's clinical record-keeping requirements where reconciled to a patient, since they evidence care-seeking. `[GATE — legal]` confirm the applicable period.
- Unreconciled provisional records: short retention, then deletion. A person who booked once and never attended should not be held indefinitely.
- USSD session state: minutes.
- Notification content: metadata retained for delivery audit and cost attribution; message bodies not retained beyond a short window.
- Patient-initiated deletion requests honoured per DPPA, subject to clinical retention where reconciled, with the reason explained plainly.

## 5.6 The facility agreement

A booking product's biggest failure mode is contractual, not technical. The facility agreement must contain:

- A commitment to honour published capacity and booked positions.
- A commitment to publish cancellations through the console rather than turning patients away at the door.
- Data processing terms naming MedSync's role (processor for facility-held clinical data, controller for platform account data — `[GATE — legal]` confirm this split, it is not obvious and it determines who answers to the PDPO for what).
- Service levels for notification delivery, and honesty about SMS delivery being best-effort.

## 5.7 Risk register

| Risk                                                               | Severity     | Mitigation                                                                                                       |
| ------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| A patient delays emergency care because they booked                | **Critical** | Emergency interstitial, persistent affordance, deterioration channel, time-to-care policy, red-flag escape audit |
| Wrong identity reconciliation produces a wrong chart               | **Critical** | No auto-merge, human confirmation, candidate display with basis, audited and reversible                          |
| Confidential service booking exposed on a shared phone             | High         | `confidential` service flag, proxy exclusion, no service name in SMS                                             |
| Facility ignores bookings, product loses credibility               | High         | Contractual commitment, honoured-position telemetry, account management                                          |
| Notifications engine not ready                                     | High         | Module is gated on it; do not ship reminders against a stub                                                      |
| SMS cost overruns unit economics                                   | Medium       | Push-first, one receipt plus one conditional reminder, per-facility cost attribution, rate limiting              |
| PDPO registration not complete at launch                           | High         | Start now; it is a named launch blocker                                                                          |
| Payment intermediary status attracts regulatory attention          | Medium       | Legal review before any payment code                                                                             |
| Overbooking makes estimates dishonest, patients stop trusting them | Medium       | Overbooking factor visibly widens the predicted window                                                           |
| Directory shows facilities that do not book                        | Medium       | Registered-only at launch; 14-day staleness rule                                                                 |

---

# PART 6 — DESIGN AND UX

## 6.1 System

MedSync design system without exception: monochrome plus teal-600 and teal-900, Neue Haas Grotesk with Fira Code for codes and numbers, 4px grid, bracket section numbers. **Red is reserved for clinical emergencies** and in this module appears in exactly one place: the emergency affordance and interstitial. Not on cancellations, not on errors, not on no-shows. This is enforced by invariant test.

Clinical surfaces are permanently light. The patient app is a clinical-adjacent surface and is light-only.

## 6.2 Responsive approach

The existing patient responsive primitives are reused, not rebuilt: `ResponsivePanel`, `ResponsiveTable`, `MobileTabBar`, `BottomActionBar`, the step-wizard wrapper, the project date picker. The booking flow is the wizard's second consumer. Any new primitive this module needs is built into the shared set, not locally.

Desk is desktop-first on the Attio shell. Book is mobile-first; the desktop layout is the enhancement, not the origin.

## 6.3 Designing for the actual user

- **One decision per screen.** No compound forms on mobile.
- **Icons plus text, never icons alone.** Icon-only navigation fails across literacy levels.
- **Numbers big and monospaced.** Position number and booking code are the two things a patient will read aloud to a relative and show at a desk.
- **Dates in full, never relative-only.** "Tuesday 22 September" not "in 9 days".
- **Every wait estimate is a range with a stated basis,** and shows "estimate not available yet" rather than a fabricated number when data is thin. Fabricated estimates destroy trust faster than no estimate.
- **Tap targets ≥ 44px, single column, bottom-anchored primary action.**
- **The confirmation screen is printable and screenshot-friendly,** because that is what patients actually do.

## 6.4 Language

English at launch. Luganda next, then by district demand. **Clinical and safety copy (the emergency signpost above all) is translated by a qualified translator and reviewed against back-translation before that language is enabled.** No machine translation of safety copy. A language is either fully enabled or not offered; a half-translated interface is worse than English.

## 6.5 Accessibility

WCAG 2.2 AA across both surfaces. Reduced-motion safe. Screen-reader tested on the booking flow specifically. Contrast verified against the teal tokens, not assumed.

---

# PART 7 — CLAUDE CODE BUILD PROMPT

> **For Claude Code.** Build the MedSync booking application per Parts 1 to 6 above. This is an **application layer over the existing scheduling engine**. Do not fork, duplicate or reimplement scheduling logic. Read `prompts/scheduling-appointments-prd.md` and `prompts/scheduling-ui-calendar-addendum.md` first; they are authoritative for engine behaviour. **No design system in this prompt** — visuals come from `DESIGN-medsync.md` and the `frontend-design` skill. **Stop at every `[GATE]`.**

## 7.0 Integration directive

Extend, do not disturb. Reuse the Phase 0 Edge Function pattern (Zod → `getUser()` → role check → tenant check → action → PII-redacted log → audit entry → typed response). Every new table gets RLS, audit and tests. Schema proposal before migration; additive migrations only; never alter a shipped migration. Reuse the hospital-admin shell integration contract for Desk surfaces and the superadmin aggregate pattern for platform metrics. Branch `feat/booking-app`, reviewable diffs, conventional commits, TypeScript strict, no `any`. All existing tests green at closeout.

## 7.1 Preconditions — stop and report if any is missing

Phase 0; onboarding and the reference-data layer; hospital registration and verification; the scheduling engine with its availability, appointment and queue objects; the patient responsive primitives; the project date picker; receptionist workspace; triage engine v2 (for the arrival handoff and the escape metric); **the notifications engine or its formally defined interface**. If notifications are not built, build against the interface and **do not ship any reminder, waitlist-offer or mass-cancellation feature against a stub** — report this and stop.

## 7.2 Hard rules for this module

1. **No clinical assessment anywhere in the booking path.** No symptom input, no severity, no scoring, no routing from patient-entered clinical text. Enforced by an invariant test.
2. **No auto-merge into the MPI.** Provisional records only; human reconciliation; audited.
3. **Red only on the emergency affordance and interstitial.** Invariant test.
4. **Every booking mutation is idempotent** and capacity decrements are atomic.
5. **Nobody is dropped silently.** Every cancellation or capacity change notifies every affected patient with an alternative.
6. **No punitive automation** on no-shows or cancellations.
7. **Times stored UTC, rendered EAT.** Tested.
8. **Push-first, SMS fallback,** with per-dispatch cost attribution.

## 7.3 Gates

**[GATE A] — Scope, schema, seams.** Produce schema proposals for every table in 4.2; the capacity-mode abstraction over the engine's objects; the FHIR mapping layer; the notification interface contract; the payment posture model. Confirm the open decisions in Part 8. **Stop for schema review before any migration.**

**[GATE B] — Capacity model and Desk publishing.** Session templates, clinic session generation, capacity splits, overbooking factor, slot mode, blackouts. Console UI on the Attio shell. Real data, real RLS, tests. **Stop.**

**[GATE C] — The booking flow (web PWA).** Directory and discovery, reason taxonomy, emergency interstitial, continuity-default clinician selection, capacity selection for all three modes, identity capture, hold-and-confirm with idempotency. Mobile-first using existing primitives. Tested 360px to desktop. **Stop.**

**[GATE D] — Lifecycle, arrival and reconciliation.** Full status machine mapped to FHIR; arrival by patient self-check-in and by reception; queue entry creation; identity reconciliation UI with candidate matches; handoff seam to the encounter engine; no-show marking. Audited throughout. **Stop.**

**[GATE E] — Notifications, waitlist, cancellation.** Confirmation loop, reminders with SMS fallback, release-and-refill, waitlist offers with quiet hours, session cancellation with mass rebooking offers, window-shift alerts. Cost attribution per dispatch. **Stop.**

**[GATE F] — Low-bandwidth channels.** USSD menu flow (book, view, cancel, confirm) with resumable sessions and signature-verified webhooks; SMS keyword handling; language selection. Africa's Talking integration, shared code. **Stop.**

**[GATE G] — Payments and Expo app.** Mobile money collection, deposit and refund state machine, webhook verification and idempotency, daily reconciliation report. Expo patient surfaces with push. **Payments do not start until the Part 8 legal decision is resolved.** **Stop.**

**[GATE H] — Safety telemetry, analytics, closeout.** Red-flag escape pairing with triage outcomes; time-to-triage for booked arrivals; fill rate, no-show, wait accuracy, continuity rate; Desk reports; superadmin cross-tenant aggregates with no PHI. Then the full regression: performance budgets from 4.5 measured and reported as numbers; responsive pass; WCAG 2.2 AA; reduced-motion; timezone tests; tenant isolation and role-access tests; the two invariant tests (no-assessment, red-reserved); rate limiting verified; ADRs written (capacity model, identity reconciliation, FHIR mapping, channel strategy); CHANGELOG and README. **Stop for sign-off.**

## 7.4 Definition of done

- [ ] Three capacity modes working over the existing engine, with no scheduling logic duplicated
- [ ] Booking flow live on PWA and Expo, mobile-first, within the stated performance budgets (numbers reported)
- [ ] USSD and SMS booking working end to end on the shared code
- [ ] Emergency affordance on every screen; interstitial on new-problem reasons; both CSO-signed
- [ ] Identity reconciliation human-confirmed, audited, no auto-merge, proven by test
- [ ] Notifications with push-first, SMS fallback, quiet hours, cost attribution
- [ ] Session cancellation notifies and re-offers to every affected patient, proven by test
- [ ] Waitlist release-and-refill working, with throttling
- [ ] Payments (if unblocked) with verified webhooks, idempotent processing, automatic refunds, daily reconciliation
- [ ] Desk console: publishing, arrivals board, reconciliation, cancellation, reports
- [ ] Safety telemetry live: red-flag escape pairing and time-to-triage
- [ ] Invariant tests passing: no-assessment, red-reserved
- [ ] FHIR mapping layer with R4 target and versioned profiles
- [ ] Tenant isolation and per-role access proven by test; no decrypted PHI beyond need
- [ ] WCAG 2.2 AA; all existing tests green; reviewable diff on `feat/booking-app`

---

# PART 8 — OPEN DECISIONS FOR FADHUL, WITH RECOMMENDATIONS

Resolve at `[GATE A]` unless marked otherwise.

1. **Standalone or tenant-only at launch?** Should MedSync Desk be sold to facilities not running the MedSync OS? _Recommendation: yes, and it is the whole strategic point. A thin-tenant facility record with booking-only scope, upgradeable in place._
2. **Directory scope at launch.** Registered facilities only, or a broader informational directory? _Recommendation: registered only. A directory full of unbookable facilities teaches patients the product does not work._
3. **Default capacity mode.** _Recommendation: session mode as the default for new facilities, slot mode opt-in. Most facilities cannot honour precise times and will discredit the product trying._
4. **Booked/walk-in split default and interleave ratio.** _Recommendation: 60/40 booked-to-walk-in, interleaved 2:1, both facility-adjustable. Protects walk-in access, which is an equity requirement._
5. **Time-to-care policy defaults per service line.** _Recommendation: I have proposed starting values in Appendix A; these need your clinical sign-off, not mine._ **CSO decision.**
6. **Access over continuity when they conflict.** _Recommendation: access wins, with continuity offered as the first option whenever it fits the window._ **CSO decision.**
7. **Confidential service lines.** Which services are excluded from proxy visibility and from SMS naming? _Recommendation: sexual and reproductive health, HIV, mental health, and any service the facility flags. Needs your call and legal input on minors._ **CSO plus legal.**
8. **Payments: proceed or defer?** _Recommendation: defer to Gate G and only after legal advice on payment intermediary status. Launch with cash-at-facility and a `payment_posture` field ready. Payments are not what makes this product valuable and they carry disproportionate regulatory drag._
9. **USSD funding model.** Prepaid (patient pays per session) or postpaid (facility funds, toll-free)? _Recommendation: offer both; make postpaid a paid-tier feature. A facility that wants rural patients booking will pay for it, and patient-paid USSD suppresses exactly the users the equity metric tracks._
10. **WhatsApp at launch?** _Recommendation: no. High adoption but template approval and per-conversation cost make it a Phase 2 decision once booking volumes justify it._
11. **Second clinician for red-flag escape co-review.** Who? _This must be named before launch and cannot be you._ **Governance.**
12. **Minor and guardian model.** Still open in the MedSync backlog and this module is blocked on it for proxy booking of children. **CSO plus legal.**
13. **Emergency numbers to display.** Must be verified, not assumed. **CSO.**
14. **Data controller/processor split** between MedSync and facilities, which determines PDPO answerability. **Legal.**
15. **Referral booking (Phase 2).** The directory plus capacity makes cross-facility referral booking natural: a referring clinician books the receiving facility's slot and the patient leaves with a real appointment rather than a letter. _Recommendation: keep the seam clean, do not build now, and treat it as the highest-value Phase 2 extension. Closing Uganda's referral loop is a genuine health-system contribution and a strong MoH conversation._

---

# PART 9 — OUT OF SCOPE AND CLEAN SEAMS

Do not build, but leave the join point clean: e-pharmacy refill fulfilment (the `medicine refill` reason is the seam); tele-consultation tooling (the virtual type flag exists; video and messaging are a separate module); cross-facility referral scheduling (Phase 2, see above); insurance and scheme eligibility checking; laboratory and imaging appointment types beyond simple service lines; wearables; any clinical content in the patient app pending governance gate CG.

---

# APPENDIX A — Reason-for-visit starter taxonomy

Administrative only. No entry is a symptom. Time-to-care values are **proposals requiring CSO sign-off.**

| Reason                       | Service family     | Proposed max lead time | Continuity default | Emergency interstitial   |
| ---------------------------- | ------------------ | ---------------------- | ------------------ | ------------------------ |
| Routine follow-up            | Chronic care       | 30 days                | On                 | No                       |
| Post-discharge review        | Chronic / acute    | 3 days                 | On                 | No                       |
| New or worsening problem     | General OPD        | 7 days                 | Off                | **Yes**                  |
| Medicine refill              | Pharmacy / chronic | 7 days                 | On                 | No                       |
| Test or scan results         | Diagnostics        | 7 days                 | On                 | No                       |
| Antenatal visit              | Maternal           | 7 days                 | On                 | No                       |
| Child immunisation           | Child health       | 14 days                | Off                | No                       |
| Child wellness / growth      | Child health       | 14 days                | Off                | No                       |
| Specialist review (referred) | Specialty          | 14 days                | Off                | No                       |
| Screening or check-up        | Preventive         | 30 days                | Off                | No                       |
| Procedure or dressing        | Procedural         | 7 days                 | On                 | No                       |
| Counselling or support       | Psychosocial       | 14 days                | On                 | No — flag `confidential` |
| Second opinion               | Specialty          | 14 days                | Off                | No                       |

# APPENDIX B — Metric definitions

- **Completed visit**: a booking that reached `fulfilled` with a linked encounter or, for non-OS facilities, a facility-marked completion.
- **Time to care**: `first_seen_at` minus `booking_created_at`, by service line, reported as median and 90th percentile.
- **Wait-estimate error**: absolute difference between the midpoint of the predicted arrival window and the actual call time.
- **Fill rate**: positions used divided by positions published, per session.
- **Refill rate**: released capacity subsequently taken by a waitlisted patient, divided by total released capacity.
- **Continuity rate**: chronic-service bookings with the patient's previous clinician for that service, divided by all chronic-service bookings where that clinician had any published capacity in the window.
- **Red-flag escape rate**: patients booked to a non-urgent service who were triaged Red or Orange on arrival, divided by all booked arrivals triaged, computed by the triage engine, compared against the same rate for non-booked walk-ins.
- **Cost per booking**: total SMS plus USSD spend divided by confirmed bookings, per facility per month.

# APPENDIX C — References

**Regulatory and policy**

- Data Protection and Privacy Act, Cap. 97 (Uganda), and Data Protection and Privacy Regulations 2021
- PDPO registration obligation under Section 29, annual renewal and annual compliance reporting: https://globaladvisoryexperts.com/how-to-register-with-pdpo-uganda/ and https://cramanya.com/publications/personal-data-protection-office-registration-in-uganda
- PDPO position on cross-border transfer record-keeping (Google LLC decision, 18 July 2025): https://privacymatters.dlapiper.com/2025/08/uganda-data-protection-regulator-clarifies-compliance-requirements-for-offshore-entities/
- Uganda MoH, Guidelines for the Introduction of Digital Health Solutions (DHSAC, DHTR portal, HIIRE TWG): https://library.health.go.ug/index.php/file-download/download/public/1886
- Uganda MoH Health Information Exchange and Interoperability Guidelines; Health Data Protection, Privacy and Confidentiality Guidelines; Digital Health Enterprise Architecture, Standards and Knowledge Guidelines: https://library.health.go.ug/category/health-information-systems
- Uganda Health Information and Digital Health Strategic Plan 2020/21–2024/25: https://library.health.go.ug/health-information-systems/digital-health/uganda-health-information-and-digital-health-strategic

**Clinical evidence**

- Gurol-Urganci I, de Jongh T, Vodopivec-Jamsek V, Atun R, Car J. Mobile phone messaging reminders for attendance at healthcare appointments. Cochrane Database of Systematic Reviews, CD007458: https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD007458.pub3/references
- WHO. Guideline: recommendations on digital interventions for health system strengthening. Geneva, 2019 — targeted client communication, including appointment reminders: https://www.ncbi.nlm.nih.gov/books/NBK541898/

**Technical**

- HL7 FHIR: Appointment, AppointmentResponse, Schedule, Slot, HealthcareService, PractitionerRole. Current published release 5.0.0; R6 in ballot: https://hl7.org/fhir/
- Africa's Talking USSD in Uganda, shared and dedicated codes, prepaid and postpaid: https://help.africastalking.com/en/articles/8167020-ussd-uganda

**Market**

- Uganda telemedicine landscape and incumbent positioning: https://tracxn.com/d/explore/telemedicine-startups-in-uganda
