# ADR 0084 — Two doors stay; the labels, the horizon, and the surfaces behind them change

**Status:** Accepted — patient-facing clinical-safety copy, pending CSO sign-off (2026-09-12)

**Partially supersedes [ADR 0034](0034-book-or-queue-choice-point.md).** Section by section, so nobody has to guess:

| ADR 0034                                                       | Becomes                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| §1 declaration is a status, not an entry type                  | **Stands**, and is now validated in the wild                                                                                          |
| §2 walk-in hours = booking hours                               | **Superseded.** Walk-ins are open by default; a scheduling policy _narrows_ the window, its absence does not close it (§14)           |
| §3 `pt-*` Edge Function shape                                  | **Stands**                                                                                                                            |
| §4 same-dept reconciliation                                    | **Stands**                                                                                                                            |
| §5 self-cancel while `declared`                                | **Stands**                                                                                                                            |
| §6 position only, no wait estimate                             | **Stands and is extended** — never a bare last place, counted from presence not intent (§6, §7), and the 30s refresh is revised (§15) |
| Presentation — two co-equal doors named after their mechanisms | **Replaced** (§1, §2)                                                                                                                 |

**Migrations:** one additive for §12 (`appointments.reason`), one additive for §3 (`hospitals.emergency_phone`, nullable, no default). None for the entry point.

## Context

Booking is the first MedSync feature to reach real patients at Mulago, so this decision ships rather than sits. The product owner asked whether to collapse the post-hospital-selection choice into one entry that asks WHEN ("today / soon / a specific date") and routes behind the scenes, and asked that the answer come from research rather than instinct. Six angles were surveyed; 66 findings with sources and per-finding transfer assessments are in [`docs/booking-entry-points-research.md`](../booking-entry-points-research.md). The assistant that proposed the rework favoured one door going in. It was right that something was broken and wrong about which thing.

The draft of this ADR was then attacked twice — once on clinical safety, once on field reality. Twenty-one findings came back. Seventeen changed the document; four are rejected in writing at the end. Neither review argued for collapsing.

**The addressable population, stated first, because everything below is scoped by it.** Patient signup requires an email address and a 12-character password (`app/signup/patient/_components/form.tsx`). There is no SMS transport (`lib/triage/notify.ts` logs and returns), no USSD, no PWA, no assisted path, and reception can check in a declared intake but cannot declare one on a patient's behalf (`app/reception/actions.ts`). Uganda's installed base is roughly 32M feature phones against ~20.5M smartphones on ~64.6M subscriptions. **At launch the app is the minority channel into a hospital that will keep working without it.** "Primary door" in this ADR means primary _within the app_. It does not mean the main way patients reach Mulago, and no claim here should be read as saying so.

## Decision

**Keep two doors — the collapse is not supported — rewrite both labels to name the act instead of the mechanism, make the same-day door primary in the layout rather than in an assertion, replace the self-rating emergency question with named symptoms above both doors, cap the booking horizon at 14 days in the patient Edge Function, stop asking the patient to pick a clinician or guess a department, and remove every number and promise the system cannot actually stand behind.**

### Why the count is not the question

Three of six angles argued for keeping two, one argued for one, and two said the count is not where the harm lives. Counting them would be the wrong synthesis, because the two that declined to vote are the ones that found the defect.

"One door or two" decomposes into three independent questions, and the evidence answers them differently:

| Question                       | What the evidence says                                                                                                                                                                                        | Change?      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| How many doors?                | Two flat, labelled buttons on one screen is the shallowest structure available. Nothing documents it as a hazard; the collapse's third answer is deeper, not shallower.                                       | **No**       |
| What do the doors _say_?       | Both current labels name a mechanism the patient does not think in. This is the documented hazard, and it is orthogonal to the count.                                                                         | **Yes — §2** |
| How far ahead does booking go? | Lead time manufactures non-attendance: 9.1% no-show at 0–2 weeks against 38.3% at 6 months in the high-baseline arm. The most actionable number in the corpus, and it has nothing to do with the entry point. | **Yes — §8** |

The one-door instinct was tracking something real and mislocated it. The flow-mechanics angle's own case for collapsing is that a long calendar is fragile over sparse capacity and that the two doors "advertise a distinction the underlying capacity cannot deliver" — and the remedy that follows from _its own evidence_ is to shorten the horizon until the distinction is honest, not to hide the entry. Capping at 14 days does that. Collapsing would have left the fragile calendar in place and painted over the seam.

The anti-patterns angle names the real hazard precisely: the documented failure is asking patients to choose between options they cannot distinguish. "Am I coming today?" is a fact a patient can answer; "is my problem urgent?" is not. The doors are not that failure. The _words_ are, and — as the field review established — so is the department radio list one tap behind them. Fix the words, and fix the screen the words lead to.

### Which evidence we are discounting, and why

A Zocdoc pattern is not authority for a Ugandan public referral hospital, and saying so removes most of the corpus.

- **Zocdoc, Solv, CVS MinuteClinic — discounted entirely on the one-door question.** Each collapses walk-in into a slot because it can convert unscheduled demand into appointments, add staff, and turn people away. Mulago's OPD cannot: demand exceeds schedulable capacity, so "today" cannot honestly be rendered as a time. Zocdoc additionally charges providers $35–$110+ per new-patient booking and auctions placement above organic results — its ranked-list chrome exists to allocate patients among competing sellers. One hospital, rotating cover, no ratings data, no ad inventory. That pattern has nothing to do here.
- **GOV.UK "one thing per page" — discounted as evidence anywhere.** Its author, asked for quantitative backing, replied "I wish we had some easy-to-share quant data on this as well, but I'm not aware of any." It is UK civil-service craft convention, and it would in any case put the choice on its own page, which is what we already have.
- **Choice overload — discounted, and must not be cited for §9.** The jam effect does not survive meta-analysis (63 conditions, 50 experiments, N=5,036, mean effect ≈ zero). Defaulting the clinician is justified on delegation and rota reality, never on this.
- **MobiCare (Mbarara) — discounted despite being Ugandan.** 100% smartphone ownership, 100% internet use, five private hospitals in a university town. What does transfer: the incumbent behaviour is a phone call to a person (69%), so a booking screen competes with calling, not with a web form.

**NHS 111 is the closest usable analogue** and gets weight accordingly: free at point of use, mixed literacy, walk-in-capable population, capacity-constrained, and — the load-bearing part — split from booking _because a triage decision and a scheduling decision carry different clinical governance_. NHS England classifies 111 online as a Class 1 medical device; the appointment journey is not one. The regulatory framing is a UK artefact; the boundary it draws is the boundary MedSync's own "decision support, never autonomous" rule draws. NHS England also refuses a single digital front door outright and names vulnerable patients as the reason. The one place it does not transfer is the fallback: NHSE can assume a phone answered in core hours. Ours is the building — which is why §3 now carries a number as well as a destination.

**The evidence we weight heaviest is African and Ugandan.** A Nigerian public-hospital audit where 90.9% of 350 patients held appointments and 8.18% arrived on time; South African DNA rates of 20–40% with "confusion over the date" in the top three causes; Uganda's national HIV data — 10.7% of visits missed, 74.9% of patients missing at least one, in the best-organised, best-funded, most appointment-native service in the country; and Mulago's assessment centre at a median 346 minutes, 95% of it waiting, worse after 11:00, rising 3–4 minutes per additional patient in the queue. Patients queue from 4am precisely to defeat scheduled times. The same-day act is the native one. The calendar is the import.

---

## The decisions

### 1. Two doors, asymmetric — and "primary" is a layout change, not an assertion

One screen, two labelled buttons, one level deep. The same-day door is visually and hierarchically primary; the booking door is a secondary action beneath it.

The HCI4D evidence usually recruited for "fewer choices" is about **depth**, not width: Medhi et al. measured a 4-level nested tree against a flat list (25s vs 65.5s per task, 100% vs 80% correct, n=20) and recommended "straight lists whenever possible, or very shallow hierarchies". Two buttons on one screen _is_ a flat list of two. The collapse's third answer — "a specific date" — opens month → week → day → time plus date entry, on which the LMIC literature is silent and which the dawn-anchored Luganda clock makes actively hazardous. Collapsing trades a one-level branch for a deeper one.

**Labels, never icons.** Action icons are documented as misread (a utensils icon intended as "washing dishes" read as "the kitchen"). Today both doors carry the **same** `calendar` icon (`app/patient/page.tsx`) — two different acts, one glyph. Each door gets a distinct, subordinate icon or none; the label carries the meaning.

**Two corrections to the draft, both against this ADR's own argument.** (a) On `/patient/hospitals` the asymmetry currently runs the _wrong way_: booking is the `default` (primary) button and the queue is `secondary`. The draft claimed equal weight; it is worse than equal. (b) On `/patient` the doors live in the `<aside aria-labelledby="quick-actions">`, which on mobile collapses to one column **in source order** — after the greeting, the hero, today's doses, upcoming visits and recent readings. You cannot make a door primary by declaring it primary while the layout puts it last on the target device. **Making the same-day door primary is a DOM-order change on `/patient` and a variant swap on `/patient/hospitals`, and neither is optional.**

### 2. The literal first screen

The words below are the decision, not an illustration of it. They appear on `/patient` (quick actions), on the primary-hospital card in `/patient/hospitals`, and at the head of both door pages.

```
Mulago National Referral Hospital

┌──────────────────────────────────────────────────────────┐
│ ⚠  If you are very sick now, do not use this page.       │
│    Go to the hospital's emergency entrance. They see     │
│    the sickest people first.                             │
│                                                          │
│    Very sick means things like: chest pain or pressure · │
│    trouble breathing · weakness on one side · a fit ·    │
│    bleeding that will not stop · a child who will not    │
│    wake.                                                 │
│                                                          │
│    [ Call 0800 XXX XXX ]   ← only when a verified number │
│                              exists for this hospital    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Coming to the hospital today                            │  ← primary, full width
│                                                          │
│  We save your place in line. You will be seen in turn.   │
│  We cannot tell you the hour.                            │
└──────────────────────────────────────────────────────────┘

  Ask for a day — the clinic confirms                         ← secondary
  Choose from the days the clinic has open.
```

Every word is load-bearing:

- **"Coming to the hospital today"** names the act — travelling there and waiting. "Join today's queue" names a data structure. **Not first person.** 76.1% of women in one Ugandan cohort owned a phone while 92.7% had access to one; the declaring device and the arriving person routinely differ, and "I am coming" tapped by a daughter on her father's logged-in account declares the daughter. Confirmation names the account holder — _"We saved a place for Yusuf"_ — which is the same string §11's identity-matching requirement needs anyway.
- **"You will be seen in turn. We cannot tell you the hour."** The draft said "It is a place, not a time" — an English rhetorical antithesis, and the first construction lost when a relative paraphrases it aloud. The concrete version survives translation and says the same thing. At Mulago the line genuinely re-orders by acuity, so implying a time promise is worse here than in the US products whose copy we borrowed the idea from.
- **"Ask for a day — the clinic confirms."** Booking is approval-required unless the clinician has `autoConfirm` (`booking-wizard.tsx`). Door B's real output is frequently not a day — it is a request. A label promising a day, silently degrading to a request, is the same fabrication class §12 polices in scarcity counters. And **not** "come back": a first-time patient cannot come back.
- **No count on this screen.** The draft put _"12 people are ahead right now"_ here and called it "a real number we already hold". It is not. The queue is department-scoped — `aheadByDept` in `app/patient/queue/page.tsx` groups by `receiving_department_id`, and there is no hospital-wide line to be twelfth in. The draft broke this ADR's own no-fabricated-data rule in the clause that invoked it. See §6 for where a number is honest.
- **No jargon anywhere in the flow, not just on the buttons.** The draft's claim — "nothing in either button says _queue_, _appointment_, _book_, _slot_, or _intake_" — was true of three surfaces and false one tap in, where the legend reads `DEPARTMENT`, the submit reads **"Join today's queue"**, and the footer offers **"Book a future visit."** The rule governs the whole flow to confirmation.
- **One POST per door**, completing on one round trip and surviving a dropped connection. 1GB of data has historically cost a Ugandan around 8% of monthly income against a 2% affordability target; a chatty flow is a charge, not just a delay.

### 3. The emergency case: named symptoms, one destination, one number, no question

Someone having a stroke should be in neither door.

**Placement.** Above both doors, first thing on the screen, on all three surfaces. Not beside the form and not below the existing-intake cards where it currently sits (`app/patient/queue/page.tsx`) — a patient mid-stroke may be on the booking page.

**It names symptoms; it does not ask the patient to rate themselves.** The draft's heading was "Very unwell right now?" and it justified refusing a red-flag list by citing laypeople at 47.3–62.4% accuracy and patient–clinician agreement at kappa 0.166 / 0.07. Every one of those figures measures patients **rating their own urgency** — which is exactly what "Very unwell right now?" asks. The corpus's own contrast is that the Belgian ODISSEE platform reached 85.6% on level-of-care _"because it asked clinical questions rather than asking the patient to rate urgency."_ The draft selected the instrument the evidence indicts and rejected the one it favours, using the evidence against the one it kept. The research's own transfer note is blunter still: _"neither door count substitutes for a red-flag safety net."_

The conflation was between _naming_ red flags and _running_ a red-flag engine. MDCG/MHRA qualify software that signposts a next step **from symptom input**. A static, clinician-authored list above one unconditional destination takes no input, writes nothing, branches nowhere — the draft's own test, "an instruction that makes no decision cannot under-triage anyone", is satisfied by naming the symptoms. A man with forty minutes of crushing chest pain who has decided it is indigestion will ratify his own judgement against a self-rating; he may **recognise** a named symptom.

**It still does not route, ask, or write.** No checklist, no checkbox, no branch, no button that files anything, no state. Unconditional statement, named examples, one destination.

**The symptom list is CSO-authored and CSO-signed, not engineer-authored** — same rule as drug doses. The list above is the shape and the register, not the ratified content.

**A number beside the destination.** "Go to the emergency entrance" is the entire intervention for someone on a shared phone, at night, 30 km out, with no transport money — and for the common case, a relative holding the phone, there is nothing to act on but travel. So: a `tel:` link (one tap, works in a feature-phone browser, costs no data). `hospitals` has no phone column; `hospital_applications.main_phone` carries the value upstream. Additive nullable `hospitals.emergency_phone`, populated per hospital during activation. **Until a number is verified for a given hospital, the block shows the destination alone and no number** — inventing or guessing one here would be the exact failure §12 forbids, on the highest-stakes instruction in the product.

**No unverifiable promise about the emergency department.** The draft said the team there "sees the sickest people first, and no one waits in line". Live code says the same. MedSync holds no data about the emergency entrance and Mulago's ED queues; the one Ugandan triage datapoint in the corpus cuts the other way (Kalongo's rollout left urgent patients trending **+5.62 min**). A daughter who takes her father there on the app's word, finds thirty people waiting, and concludes the app lied will take him home. "They see the sickest people first" stands. **"no one waits in line" is deleted here and at `app/patient/queue/page.tsx`.**

**It is not red.** Red is reserved for genuine emergencies on clinical surfaces (`DESIGN-medsync.md`); a permanent red band on a patient's home screen trains the patient to discount red exactly where red must keep meaning something. Amber ring, plain background, the words carrying the meaning — never colour alone.

**Honestly labelled:** we found no evidence that emergency disclaimers change behaviour, or where to place them. This is reasoned design, not proven practice, and it is first on the measurement list.

### 4. No router, and that is a feature

A silent "today / soon / a date" router would become a clinical mechanism in its own right, requiring monitoring, incident reporting and an audited record of every routing decision — the overhead the simpler-UI argument implicitly promises to avoid. HSSIB's August 2026 national investigation into a digital routing layer in the NHS found 30 examples of near misses and patient harm, including delays to cancer care, "where implementation has not been adequately designed or monitored". Hidden adjudication has its own documented cost: patients report feeling "fobbed off" when a system decides their request opaquely, and the burden falls hardest on those least able to phrase a need in the system's vocabulary — which is our population. Two visible doors have nothing to audit.

### 5. The department stops being a question the patient has to answer

The same-day door's next screen is a mono-uppercase `DEPARTMENT` legend over a **required** radio list of internal department names, each priced by queue length (`${d.ahead} ahead right now`). Two things are wrong with it, and this ADR is about to send more people through it.

**It asks the harder clinical question while §9 removes the easier one.** Choosing between two IM registrars is choosing between equivalents. Choosing Cardiology over General Medicine is a differential. At a national referral hospital, a self-referring walk-in with three weeks of cough and weight loss not knowing which clinic is his is the normal case, not the edge case.

**And it prices each clinical destination by wait**, which is the documented anti-pattern the draft cited to argue the _doors_ are not that failure — "decisions were based on efficiency and convenience rather than an assessment of severity or clinical need" — while missing that the screen behind the primary door is exactly that. "Cardiology · 34 in line" against "General Medicine · 4 in line" is a wait-shopping instrument for a patient with exertional breathlessness.

**Decision:** default to the hospital's general outpatient / assessment department — which mirrors the building, where everyone passes assessment first — with the rest behind a plain disclosure for returning patients who know their clinic ("I was told to go to a specific clinic"). No count on any department until the department is fixed.

**Prerequisite, named because it is not free:** a general-OPD / assessment department row must exist at Mulago and be marked as the default. If it does not, creating it precedes this change.

### 6. A number appears only where it is true, labelled as what it measures

`app/patient/queue/[intakeId]/page.tsx` counts rows in _this_ intake's department with `arrived_at` earlier than this intake's. That is genuinely "ahead of you", and it is the **only** place the phrase is honest.

`aheadByDept` on the picker is the department's total `declared | arrived | awaiting_triage` count for today. It includes people already past you and people who have not arrived. Nobody is ahead of someone who has not joined.

- Pre-department surfaces (`/patient`, `/patient/hospitals`, the entry screen): **no count.**
- The department picker, after §5's default is applied: **"N in line now"** — labelled as what is measured.
- The ticket page: **"N ahead of you"**, and **never a bare last place**. Last position roughly doubles the probability of abandoning a queue, and here abandoning means leaving untreated.
- Still no wait estimate, ever (ADR 0034 §6). A 190-patient RCT found estimates made no difference to satisfaction (3.51 vs 3.49, P=0.962), and a 2026 JAMIA discrete-event model of three Hong Kong EDs (317,519 visits) found an inaccurate estimate at full adoption raised system-wide average wait by 96%. The contrary authority — Maister's "uncertain waits feel longer" — is a 1985 practitioner essay with no empirical base, and the vendor blogs demanding an estimate are citing it rather than evidence. Maister's concern is answered with **explanation**: sicker patients go first, the order changes, the record is append-only.

### 7. The order behind the door is fixed before the door is made primary

Two defects in the ordering the same-day door feeds. Both are prerequisites, not follow-ups, because this ADR multiplies the traffic through them.

**(a) The priority sort is inverted.** `lib/triage/worklist.ts` and `lib/intake/queries.ts` both order by `desc(patientIntakes.priorityHint)`. `priority_hint` is `text` with values `'routine' | 'high' | 'urgent'`; descending text collation gives **urgent → routine → high**. Reception's one pre-triage escalation control sorts _last_. Meanwhile `pt-declare-intake` and one path in `ha-check-in-patient` hard-code `priority_hint: "routine"` on every row they create. At 08:40 a walk-in with visible respiratory distress is overridden to `high`; thirty patients who declared from home overnight check in as `routine`; the escalated patient sits at position 31.

Replace the text sort with an explicit rank at **both** call sites — they are the only two — and pin it with one test asserting a `high` row precedes a `routine` row with an earlier arrival:

```sql
CASE priority_hint WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END
```

**(b) Precedence must follow presence, not intent.** `patient_intakes.arrived_at` defaults to `now()` and `pt-declare-intake` inserts without it, so on a declared row it stamps the _declaration_. `ha-check-in-patient` sets `status='arrived'` and `checked_in_at=now()` and **never updates `arrived_at`**. `checked_in_at` is currently written on every transition and read only to print a timestamp. So a patient who declares at 06:10 and arrives at 13:00 precedes a patient registered at the desk at 07:30, all day. Nothing about their acuity earned that, and the app sold them a place in a line they were not standing in.

Order and count on `coalesce(checked_in_at, arrived_at)` — correct for staff-created rows (`checked_in_at` is NULL, `arrived_at` is the physical arrival) and for declared→arrived rows alike. And **a `declared` row is not a position among present patients**: it counts toward "N in line now" as a declaration of intent, and it does not take precedence over anyone physically at the hospital.

### 8. The booking horizon is 14 days, enforced in `pt-request-appointment` and nowhere else

No-shows rise monotonically with lead time: 9.1% at 0–2 weeks against 38.3% at 6 months in the resident-clinic arm of a 46,655-appointment analysis — the arm that matches us, being a teaching hospital, trainee-staffed, with a high baseline. The model predicts a ~60% reduction if every appointment were booked within two weeks, and the authors recommend open-access scheduling outright.

Why 14 and not 30 or 90: the 0–2 week band is the floor of the measured curve, and our baseline is worse than UVA's, not better — 8.18% on-time arrival in the Nigerian audit, 74.9% of Ugandan HIV patients missing at least one visit in our best-run service. A date three months out is less plannable in Kampala than in Virginia, not more: transport cost and informal work dominate. And under cover-and-rotate we cannot honestly promise a named clinician's Thursday in March.

**Where the enforcement goes, and where it must not.** Beside the existing `ends_at > starts_at` guard in `supabase/functions/pt-request-appointment/index.ts`. **Not** as a CHECK on `appointments`, and **not** in `lib/scheduling/`. The no-show gradient measures _patient-held_ lead time; a schema constraint or a shared-library guard would also block clinician-created and system-created recall — `system-propose-urgent-appointment` inserts into `appointments` directly — and an NCD review is precisely such a row. Confined to the patient function, the cap creates no dead end for recall at all.

**Citation correction, load-bearing.** The 14-day horizon is `LOOKAHEAD_DAYS = 14` in `app/patient/book/page.tsx`, not in the wizard. The wizard's `maxDate` is the _defaulted clinician's last open day_ — so with §9 defaulting the clinician, a label promising "the next 2 weeks" is false whenever that clinician has three slots on Tuesday and nothing after. **The label names real availability ("Choose from the days the clinic has open"), not the horizon.** The horizon is a rule, not a promise.

**The cost, stated plainly:** NCD review intervals are one to three months and cannot be expressed as a patient-initiated booking. A review due beyond 14 days is a due-date on the care plan plus a plain SMS when the window opens, and the patient books inside it — the open-access pattern the same authors recommend. That is a named follow-up, not a solved problem. (The draft attributed "one to three months" to ADRs 0082/0083; neither states it. The interval is a guideline matter and will be cited from the guideline when the recall path is specified.)

### 9. The patient stops choosing a clinician

Default the assignment to the department's covering clinician; let the patient change it if they want to. Justified on delegation and rota reality: of 104 Choose & Book patients, 53% were booked inside the surgery (83% of those by the GP, not the patient), 36% by phone, and 11% online themselves — in a system with far better connectivity and literacy than ours. Proxy booking will be more common here, not less.

What we sell is **informational** continuity, not relational: "the next clinician has your record." Relational continuity is genuinely valuable — 18 of 22 studies across nine countries found significant mortality reductions with continuity of doctor care — but it is a sustained relationship, not a first-time pick from a grid, and a cover-and-rotate referral hospital cannot offer it. The one kind we can deliver is the one patients rated higher for routine visits anyway (7.8 days' willingness to wait, against 4.2 for relational). "Pick a doctor" survives only as a returning-patient affordance.

Nothing from the marketplace pattern comes with it: **no star ratings** (they raise selection probability 22.47% while objective quality scores do nothing, and on day one every clinician has zero reviews — seeding them is fabricated data), **no review counts**, **no "years of experience" badge** (52% of 62 evaluations found performance _decreasing_ with years in practice — the badge points the patient at the wrong clinician), **no service cart**, **no "checkout" verb on a clinical action**.

### 10. No clock numerals on the patient surface, and the date input goes

**The draft's fix did not fix the bug it cited.** It prescribed writing every time "with its day-part anchor ('8 in the morning')". The hazard is that the **numeral itself is offset by six**: Luganda and Swahili use a dawn-anchored clock, _ssawa bbiri_ is literally "two" and denotes 8:00am. An English day-part word disambiguates AM from PM — which was never the failure mode — and leaves the numeral to be re-read against the local convention, where "8 in the morning" plausibly parses toward 2pm.

**Decision: day-part only on the patient surface** — "morning session", "afternoon session", plus "come when the clinic opens". Where a numeral is genuinely unavoidable, print both conventions. **And the rule extends past the two entry screens**, which is where the draft stopped: the wizard's confirm step and the appointments list render `toLocaleString(…, hour: "numeric")` today, and the confirmation is the screen most likely to be read aloud to someone.

**The date input is replaced by day chips.** `booking-wizard.tsx` uses `<input type="date">`, which on low-end Android WebViews degrades to a typed `yyyy-mm-dd` field. The research names date entry with low-literacy LMIC users as "the single most consequential hole in the literature" for this decision. §1 rejects the one-door collapse partly because "a specific date" opens a calendar — and then the draft left that calendar inside door B. With a 14-day horizon there is no need for a date widget at all: render at most 14 day chips ("Today / Tomorrow / Thu 18 Sep"), only for days the clinic actually has open. That is the flat list the HCI4D evidence endorses, and it deletes code.

### 11. Nothing promises what no transport can deliver

Three live strings promise a notification through a channel that does not exist (`lib/triage/notify.ts` logs and returns; `lib/env.ts` is "populated when SMS goes live"):

- `app/patient/book/page.tsx`, zero-clinician state — "we'll notify you when slots open."
- `booking-wizard.tsx` confirm step — "You'll get a notification when they confirm or change it."
- The declared-intake form's closed state, which exits to `/patient/book` behind a **primary-styled** button.

All three are deleted or rewritten. This ADR's own rule forbids them.

**The third is the dangerous one and gets its own instruction.** A patient who has already declared _today_ must never be offered a future date as the primary or only exit. When every department a patient can reach is inside a scheduling policy that has closed for the evening — 19:40 on a Saturday, two days of worsening breathlessness — the current screen answers with a date picker. That is under-triage by routing, in the direction the corpus says is the dangerous one (kappa 0.07; 20.6% of patients expect a _lower_ priority than they are assigned). **The primary exit is the hospital:** _"Go to the hospital. Reception can register you when you arrive; the emergency entrance is open at all hours."_ — the last clause only where someone has verified it. Booking demotes to a plain text link. The unconditional "Not coming today? Book a future visit instead" footer on `app/patient/queue/page.tsx` is deleted outright.

**And check-in must match on patient identity, not on who holds the phone.** Reception's declared list renders `{d.patientCode ?? "Unknown patient"}` — a code, a timestamp, a department, a complaint. The code exists only on the patient's phone, which may be a relative's, at home, or flat. A clerk who cannot match the row creates a fresh walk-in; the declared row becomes a ghost and the patient is counted twice. The declared list must carry enough to identify a person at the desk. Names are encrypted and `reception/find` searches `patient_code` only, so this **is** the audited operational-decrypt ticket already reserved in `lib/reception/queries.ts` — not a small change, and a **prerequisite** of making the same-day door primary rather than a consequence of it. The end-of-day disposition of declared-but-never-arrived rows is assigned to reception on `/reception/expected`, not left as an observation.

### 12. The honesty principle generalises to the booking calendar

ADR 0034 §6 forbids an invented wait estimate. The same rule now covers slot scarcity: **no "2 slots left", no "3 people viewing", no countdowns, ever.** The UK CMA took enforcement action against the six largest hotel booking sites over exactly this pressure-selling pattern and all six gave undertakings. UK statute does not bind a Ugandan deployment — the clinical reason is the binding one. A frightened patient at a national referral hospital with no alternative provider is the worst possible target for manufactured urgency, and manufacturing urgency is the one thing this product must never do.

**`urgent_review` leaves the patient-selectable reasons.** It is already absent from the wizard's visible list but still accepted by `app/patient/book/actions.ts` and permitted by the CHECK in `db/schema/scheduling.ts`. A patient-picked "urgent" is not a triage signal (kappa 0.166 / 0.07), yet it sits beside the system-driven `system_urgent` origin under a near-identical name — two values with completely different evidential weight, one query away from being misread by a future worklist or dashboard. Additive migration, per the immutability rule; existing rows keep their value.

### 13. Reminders: one-way SMS, with reschedule wired

The contract the dispatcher must meet when it lands. Plain one-way SMS, not two-way and not in-app push: one-way SMS on appointment attendance shows OR 2.03 (95% CI 1.40–2.95) across 12 trials and 6,448 participants, every one sub-Saharan — though low-risk-of-bias trials showed OR 1.36, so plan on the smaller number. Two-way conversational messaging showed no attendance benefit at all (RR 1.03, 0.95–1.12). Build the cheap one.

A reminder without an embedded way out makes things worse: in a 1,500-slot NHS QI series, texts with no cancellation route cut DNAs to 8.1% while pushing short-notice cancellations from 0.6% to 7.2%, and only 20 of 35 freed slots were reused for want of a clerk. So: **reschedule above cancel, one tap from the SMS, slot released automatically with no human in the loop.** The barrier that study found — "not enough credit in the phone to call to cancel" — is a daily reality here.

### 14. Walk-ins are open by default (ratifying an undocumented revision of ADR 0034 §2)

ADR 0034 §2 made a `departmentSchedulingPolicy` row the gate: departments without one read as "closed for walk-in". Both `pt-declare-intake` and `app/patient/queue/page.tsx` now implement the opposite — walk-ins open by default, a policy _narrowing_ the window when present — with only a code comment recording it ("policy-as-gate made the feature unusable for any hospital without booking policies set"). That is a ratified ADR superseded by a comment. **This ADR ratifies the revision**, because it is correct and because §11 depends on knowing exactly when the closed state can occur: only inside a policy's off-hours, never on a hospital's first day.

It also settles a rejected review finding: requiring a policy row as a hospital-activation prerequisite would re-introduce the two-sources-of-truth drift that 0034 §2 rejected in the first place, for a gate that no longer exists.

### 15. The refresh interval backs off, because this ADR is what makes that page busy

`app/patient/queue/[intakeId]/page.tsx` carries `<meta http-equiv="refresh" content="30">` on a `force-dynamic` page. At Mulago's documented median assessment-centre wait of 346 minutes that is roughly **690 full document reloads per visit**, and the draft both boasted "one POST per door… a chatty flow is a charge, not just a delay" and deferred this under "what this is NOT".

The concrete failure is not shillings. When the bundle runs out or the signal drops mid-wait, the meta-refresh replaces the ticket with a browser error page. There is no cached copy, the patient loses their position display while sitting in the room, and has nothing to show the clerk.

A polling interval is a constant, not a websocket ticket: **30s for the first five minutes, then five minutes**, plus a manual "Check my position" control so the patient owns the spend. The websocket path remains the end state and remains out of scope.

---

## Consequences

### Positive

- **The hazard the research actually identified gets fixed.** Both labels named mechanisms; now they name acts, and the rule holds to confirmation rather than stopping at three surfaces.
- **The doors stay flat and auditable.** No router, nothing new to monitor, nothing new to incident-report — and each door can carry the emergency instruction, which a wrapped "when?" question cannot.
- **The emergency block becomes something a frightened person can act on:** recognisable symptoms rather than a self-rating, a destination, and — where verified — a number that costs no data to dial.
- **Three fabricated-data violations are removed from patient surfaces** (a hospital-wide queue count that does not exist, two notification promises with no transport) and one unverifiable operational claim about the emergency department.
- **Two ordering defects are fixed at the root**, in the two places each lives, before the traffic that would have exposed them arrives: `high` no longer sorts below `routine`, and declaring from home no longer jumps the physical queue.
- **The calendar gets smaller and cheaper**: 14 day-chips replace a `<input type="date">` that degrades to typed `yyyy-mm-dd` on low-end WebViews. Net deletion.
- **An undocumented supersession of a ratified ADR is brought back into the record** (§14).
- **ADR 0034 §6's honesty rule generalises** from wait estimates to slot scarcity, and gains better evidence than it had when written.

### Negative / risks

- **"Primary door" is scoped, and the scope is uncomfortable.** Email-and-password signup, no SMS, no USSD, no assisted path, and reception cannot declare on a patient's behalf. This is the primary door of a side entrance, and the majority of Mulago's OPD never sees it. Naming that is the mitigation available in an ADR; building the majority channel is not this decision.
- **Three prerequisites block the primary-door change**, and each is real work: the priority-rank fix with its test (§7a), the presence-ordering fix (§7b), and the audited operational-decrypt path that lets a clerk match a declared row to a person (§11). Shipping the layout change first would make each of them worse.
- **A general-OPD / assessment department row must exist at Mulago** and be marked default, or §5 has nothing to default to.
- **The emergency block may show no phone number** at hospitals that have not had one verified. That is the correct failure — an unverified number on this block would be the most dangerous fabricated datum in the product — but it is a worse screen than the one we want.
- **The 14-day cap has no replacement for 1–3 month NCD reviews yet.** Confining enforcement to `pt-request-appointment` means clinician and system recall are unaffected, so nothing regresses — but the patient-facing path for a three-month review is still a due-date plus an SMS that does not exist yet.
- **Reception's worklist stops being an exception surface** and becomes load-bearing, on a desk with no search beyond patient code.
- **Triage placement relative to check-in is unsettled.** Kalongo's rollout gave the whole gain to non-urgent patients (−31.44 min) while urgent patients trended 5.62 minutes slower. This ADR instruments that; it does not answer it.
- **The emergency block's effect is unmeasured and possibly zero.** No evidence exists that disclaimers change behaviour, or where to place them.

## What changes on the other surfaces

**Reception.** More volume into `declared` intakes that exist before a clerk has seen anyone. `ha-check-in-patient` already branches on `intake_id` (0034 §3), so no new dispatch — but `/reception/expected` must carry enough identity to match a person at the desk (§11), and owns the end-of-day disposition of declared-but-never-arrived rows.

**Nurse / triage.** The engine is untouched (ADRs 0035–0043). The **sort is not**: §7 fixes `lib/triage/worklist.ts` and `lib/intake/queries.ts` before the volume arrives. Time-to-triage for declared vs unannounced walk-ins is instrumented against the Kalongo risk.

**Clinician.** Patients arrive assigned by department rota rather than self-selected, which is what cover-and-rotate already was. The `/clinician` availability surface is unchanged; §10's day-part rule does not apply to staff surfaces, where a clock time is read by someone fluent in the system's conventions.

**Doctor.** A 14-day cap empties the far end of the calendar and shifts proportionally more of the day into the queue rail (ADR 0029 §1). That is the hospital's real shape, not a regression. Clinician-created and system-created recall is explicitly outside the cap (§8).

**Hospital-admin.** Entry-type aggregates keep working untouched, which is exactly why 0034 §1 chose `walk_in` + a status rather than a new entry type. The new number admin needs is **declared → arrived conversion per department** — the only measure that says whether the primary door produces attendance or noise. Hospital activation gains one step: verify and record an emergency phone number (§3), and confirm the default assessment department (§5). The `accepting_walkins` flag deferred in 0034 §2 stays deferred and is now less likely to be wanted, given §14.

**Super-admin / audit.** Nothing new to audit, deliberately (§4).

## What this is NOT

- Not a new entry model. `patient_intakes.status='declared'` (0034 §1) is untouched.
- Not a triage question, a symptom checker, or a red-flag engine. §3 names symptoms above one unconditional destination; it takes no input and writes nothing.
- Not the NCD review-scheduling solution. §8 names the gap and defers it.
- Not a notification dispatcher. §13 states the contract; §11 deletes every promise made in its absence.
- Not a websocket. §15 changes a constant.
- Not the majority channel. See Context.

## The falsifier

**For the opposite verdict to be right, patients would have to be failing at the choice itself** — picking a door and then behaving as though they had meant the other, or abandoning at the choice screen rather than inside a flow. One door becomes correct if (a) declared→arrived conversion is poor _and_ the same patients turn out to have booked instead, (b) drop-off at the choice screen exceeds drop-off within either door's own flow, and (c) patients cannot restate what the two buttons do after reading them.

What we measure from launch:

| Signal                                                                                                                  | Falsifies                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Comprehension: 20 exit interviews at Mulago OPD** — read both buttons aloud, ask what each does and what happens next | §2's labels. The cheapest study here and the only one that can falsify the words rather than the architecture. Answers the SkipTheQ 15.6% question for our own copy. |
| **Actionability: can a patient act on the emergency instruction without transport?** — same interviews                  | §3. Comprehension without actionability is a disclaimer, not a safety net.                                                                                           |
| Declared → arrived conversion, per department                                                                           | The primary door, if declarations do not become attendances                                                                                                          |
| **Declarations that terminate in a booking ≥3 days out**                                                                | §11's closed-state exit — the under-triage-by-routing signature                                                                                                      |
| Patients who book ≤48h out **and** declare for today                                                                    | The door-confusion signature — the actual case for one door                                                                                                          |
| Choice-screen abandonment vs in-flow abandonment                                                                        | §1's count. Honest caveat: "went to the hospital anyway" reads as abandonment and is a success; the interviews cover what the funnel cannot.                         |
| No-show rate banded by lead time (0–2d / 3–7d / 8–14d)                                                                  | §8's cap. If the gradient inside 14 days is flat or inverted, our curve is not UVA's and the number must be re-derived.                                              |
| Queue abandonment vs position, and whether anyone was shown a bare last place                                           | §6's display rule and 0034 §6                                                                                                                                        |
| Time-to-triage for declared vs unannounced walk-ins                                                                     | The Kalongo risk — that a front-loaded process slows the urgent stream                                                                                               |
| Duplicate intakes per declared patient per day                                                                          | §11's identity-matching requirement — the ghost-row signature                                                                                                        |

**And the standing gap, stated so nobody mistakes this for a settled question:** six researchers looked for a usability study, an A/B test, or a trial comparing a single time-first entry against separate book/queue entries in any healthcare product, in any country. None exists. Both designs are unevidenced on the direct question. This ADR is decided on transferable adjacent evidence and on asymmetric failure costs — a wrong door count costs one tap; a wrong label, an over-long horizon, or an inverted sort costs an attendance, and at a five-hour OPD an attendance is a day of someone's income.

## What the two reviews changed, and what they did not

Seventeen findings changed this document. The largest: the emergency block asks the patient to recognise symptoms instead of rating themselves (§3); the queue count is removed from every surface where it is not true (§6); two ordering defects became prerequisites rather than observations (§7); the date input is replaced by day chips (§10); and "primary" became a layout change with three named blockers rather than a claim (§1, §11).

**Rejected, with reasons:**

- **"On day one both doors are dead and each points at the other."** Premise contradicted by the code: walk-ins are open by default and a policy only narrows the window (§14). The closed state occurs inside a policy's off-hours, never on a hospital's first day. The half of the finding that survives — the closed-state exit routes to a calendar — is accepted in full at §11.
- **"Make a `departmentSchedulingPolicy` row a hospital-activation prerequisite."** Inverts the current, better design and re-creates the two-sources-of-truth drift 0034 §2 rejected. A policy row is a restriction, not an enabler.
- **"Hold the server-side half of the cap; shipping it is a strict regression for NCD patients."** The wizard already stops at 14 days, so a patient-initiated three-month booking is blocked today. The server guard closes a bypass; net change for that patient is zero, not worse. The real finding — that a schema CHECK or a `lib/scheduling` guard would block clinician and system recall — is accepted, and §8 confines enforcement to `pt-request-appointment` accordingly.
- **"Add SMS / USSD / a PWA / an assisted declaration path."** Correct about the population and wrong about the scope: the research's own transfer note calls the device constraint "a red herring for this specific decision", since both designs are one round trip. The finding is accepted as a Context honesty requirement — the app is the minority channel and this ADR says so — not as a change to the decision.
- **"The declared list can inherit the search `reception/find` already has."** That search is `patient_code` only; names are encrypted and reception decryption is reserved for the audited operational-decrypt path. The requirement stands (§11); its cost is a ticket, not a line.

## Related

- [ADR 0034 — Book-or-queue: intake is a status, not an entry type](0034-book-or-queue-choice-point.md) — partially superseded; see the header table for the per-section disposition
- [ADR 0023 — Appointment lifecycle](0023-appointment-lifecycle.md) — §8's cap constrains `pt-request-appointment`; §13's reschedule path is the existing `reschedule-appointment` edge
- [ADR 0029 — Doctor scheduling rework](0029-doctor-scheduling-rework.md) — §1's queue rail carries the shift from §8
- [ADR 0031 — Patient entry-point taxonomy](0031-patient-entry-points-intake.md) — `walk_in` entry type, emergency-never-blocks
- [ADR 0035 — Triage scoring](0035-triage-deterministic-scoring.md) / [ADR 0037 — Override authority](0037-triage-override-authority.md) — where urgency is actually decided, and the authority §7a's sort was silently inverting
- [`docs/booking-entry-points-research.md`](../booking-entry-points-research.md) — 66 findings with sources and per-finding transfer assessments
- `app/patient/page.tsx`, `app/patient/hospitals/page.tsx`, `app/patient/queue/`, `app/patient/book/`, `app/reception/expected/`, `lib/triage/worklist.ts`, `lib/intake/queries.ts`, `supabase/functions/pt-request-appointment/` — the surfaces this changes
