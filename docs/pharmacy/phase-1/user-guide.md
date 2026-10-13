# Pharmacy dispensing — user guide

One page for each person who uses it: the pharmacist, the pharmacy technician, the prescriber, the pharmacy in
charge and the hospital admin. What you see depends on what your hospital has switched on and on whether your
dispensing point is live. If a menu item below is missing, it is not on at your hospital yet.

## Before you start

**The wording is still draft.** Every screen word in this guide is draft until the Clinical Safety Officer (and, for
the clinical lists, a registered pharmacist) signs it. Production keeps the four Phase 1 switches off
(`PHARMACY_DISPENSING`, `PHARMACY_STOCK_ANSWER`, `PHARMACY_PATIENT_LIST`, `PHARMACY_DOWNTIME`) while the wording is
draft. Until then everything here runs at the test hospital only. Three things stay off in production even after
that, until their legal answer is on record: the technician's wider permissions (legal question 1), "Supply without
a pharmacist" (legal question 1) and the slip for buying outside (legal question 5).

**What MedSync deliberately does not do.** Know these before you rely on it.

- **It does not check drug interactions.** Every pharmacy screen says so, and the notice cannot be closed. Check
  each prescription yourself.
- **It does not replace the controlled drugs register.** Keep the signed prescription and write the register as
  you do today. MedSync keeps its own witnessed record beside the paper, never instead of it.
- **It holds no stock for a patient.** "Owed" means the patient comes back when stock arrives. Nothing is set aside.
- **It shows prescribers no quantity.** A prescriber sees "on the shelf", "low", "not on the shelf" and so on, never
  a number.
- **It works nothing out.** No quantity, refill, dose or strength is calculated or converted. Every quantity you
  supply is typed by you; nothing is pre-filled, because prescriptions carry no quantity.
- **It checks no payment.** Payment status is what you record.
- **It does not scan.** Picking the right box from the shelf is your check.

**The dispensing point you work at.** The top bar shows "Working at", your cadre and the point. If you work at more
than one point, choose one. "Your choice is stored on everything you record." Stock, the queue's default and the
controlled drugs record all follow it. A point that is not live shows "Not live: read-only queue and stock set-up".

---

## 1. Pharmacist

You review, query, supply and hand over. You are the only cadre who may accept a pharmacist-first line, decline to
supply, or supply a controlled drug.

### The queue

- **Lanes:** _Pharmacist first_ (a lane reason applies), _Standard_ (checked at supply), _All_. If your hospital has
  not signed its review rule, there is one lane and the page says: "This hospital has not signed its review rule,
  so every prescription needs a pharmacist."
- **Stages:** To review · Queried · Ready to hand over · Awaiting co-sign. A prescription leaves the queue only when
  every line has a recorded outcome. Nothing leaves by itself, however old.
- "Cannot be supplied yet" means the prescription awaits a senior's co-signature. You can read it and query it.
- "Changed since printing" means the paper the patient carries is out of date.
- Older prescriptions sit under "Written before today, still without an outcome". Use **Close as not collected**
  (with a reason) for one the patient never came for. The prescriber sees it at the next visit.

### Reviewing

1. Open the prescription with **Review**.
2. Read each line: the directions **as written**, any overridden stop with the prescriber's reason, and what the
   prescriber was told about stock.
3. Accept each line: **Accept this line**, or **Reason accepted, supply** where a stop was overridden. **Accept the
   remaining lines** takes only the lines with no lane reason.
4. Choose a decision for each line: **Supply in full**, **Supply part** (and whether the rest is owed or bought
   outside), **Not on the shelf**, or **Ask the prescriber**. Type the quantity yourself. "Days this supply covers"
   is optional.
5. **Save and keep in the queue**, or **Continue to hand-over**.

**Product and batch.** The batch that expires first is chosen. **Change** lets you pick another; another batch needs a
reason. An expired batch is never offered; it shows "Expired {date}. Remove it from the shelf." A different pack of the
same strength needs no reason. A different strength is "Not offered: no signed substitution rule."

**If the prescriber changes a line while you work,** it shows "{Medicine} was changed by the prescriber at {time}.
Review it again." Your acceptance of the old line no longer counts.

### Asking the prescriber

1. **Ask the prescriber**, about one line or the whole prescription.
2. Choose the type of problem, write what you propose (up to 500 characters), and tick "The patient is waiting at
   the window" if so. The form shows **Who will be told** before you send.
3. **Send query.**

What you then see, and what it means:

- "Query sent {time} · not answered": sent. It does **not** mean the prescriber has read it.
- "The prescriber has NOT been told. Call them and log the call."
- "Nobody can be told in MedSync. Call the ward or clinic."

**Log a phone answer** records who you spoke to. Only "keep it as written, with their reason" from someone who may
prescribe answers the query; that person can dispute it, which reopens it. "They will change it" or "Stop it"
answers nothing: the line waits until they act in MedSync. **Withdraw** a query you no longer need, with a reason.

**Decline to supply** is offered only after a query was sent on that line. The prescriber is told.

### Not on the shelf

Choose what happens to the line:

- **Owed to the patient.** They come back when stock arrives. Nothing is held for them.
- **The patient buys it outside.** Prints the slip to take with their signed prescription.
- **Send for it from {point}.** Only when another live point holds it; the line is owed.
- **Return to the prescriber** for an alternative (sends a query).

Choose the reason and **Record**. Then tell the patient yourself: "Tell the patient now." If no message can be sent
the screen says "No message is sent. The patient knows only what you tell them." A controlled drug is never offered
"buys it outside".

### Hand-over

Four sections, then **Record hand-over**.

1. **Confirm who is at the window.** Collected by the patient or someone else (their name and relationship). Tick
   "They said the patient's full name, and it matches." Then ask for the date of birth or the phone number on file
   and type what the person says. MedSync never shows either value, so do not read anything out.
   - "Matches." Carry on.
   - "This does not match. Check you have the right patient."
   - After five wrong tries in a day for one patient, the typed check closes until the pharmacy in charge reopens
     it. Use **Identified another way**: the card or prescription with the patient's number was shown, known to
     staff, or other (with a note). It is recorded with your name and listed for the pharmacy in charge.
2. **Supplying now.** Check the medicine, quantity, batch and expiry. Labels are printed (one per batch) or written
   by hand, as your point is set. If printing fails, **Write them by hand instead**.
3. **Explained.** Tick what you explained. Nothing here is required.
4. **Payment status**, if your hospital uses it. Where it is required, "Not recorded" cannot be handed over;
   **Emergency** always can.

**If the hand-over is refused,** nothing is written. Do what it says:

- "Batch {number} now holds {n}. Choose again." Someone else took that stock; choose the batch again.
- "{Medicine} was already supplied at {point}, {time}." Do not supply it again.
- "{Medicine} was changed by the prescriber. Review it again."

### Controlled drugs

A hand-over with a controlled line opens **Controlled supply**. The amber notice stays: "MedSync's record does not
replace the paper. Keep the signed prescription and make the entry in the hospital's controlled drugs register, as you
do today."

1. **The witness** chooses their own name and types their own password and authenticator code. They can never be
   you. Five failures lock that witness for an hour. If nobody may witness yet, the screen says the witness list is
   not signed.
2. **The count.** Type "In the cupboard before" for each batch, then **Check the count**. Only then does MedSync show
   its figure. If they differ: "The count does not match the record. Record the difference; it goes to the pharmacy
   in charge." The supply continues from your count.
3. **Paper that still applies.** Tick both: the signed prescription is here and will be kept; the register entry is
   made and the collector has signed it. **Print the register entry** gives you a slip to copy from. It is not the
   register.
4. **The witness agrees** with the balance.

**Record supply** stays off and lists what it waits for until all four are done.

### After the hand-over

**Supplied today** lists every hand-over at your point. **Reprint labels** is logged. **Reverse** works only on the
day the supply was recorded: say whether the pack is back and fit (it returns to its batch) or not fit (it returns
and is written off). The line goes back to where it stood and the prescriber is told. Later than that, ask the
pharmacy in charge to **Correct the record**.

**Look-back** (a tab on Supplied today) lists supplies made without a check a live supply needs: supplied without a
pharmacist, entered after downtime with a flag, or supplied on a phone answer later disputed. Open each and record
**Looked at** with a note.

**Ward prescriptions.** With individual inpatient supply off, you review and accept pharmacist-first ward lines only:
"Ward doses come from ward stock, which MedSync does not count yet."

---

## 2. Pharmacy technician

Every screen, label and record shows you as **Pharmacy technician**, never as a pharmacist.

**You can:**

- open the queue and any prescription;
- decide, supply and hand over **standard-lane lines and lines a pharmacist has accepted**, including identity,
  labels, what was explained and payment status;
- record **Not on the shelf** on those lines, and work Open lines (supply now, change between owed and buying
  outside, confirm filled elsewhere, close with a reason);
- send a query to the prescriber and log a phone answer;
- keep stock: receive, count, adjust, add a product, add a batch found on the shelf, send stock to another point;
- enter downtime sheets row by row;
- witness a controlled drug, **only if the hospital's signed witness list includes technicians**. While no list is
  signed, nobody may witness.

**You cannot:**

- accept a pharmacist-first line. You see it read-only with "Waiting for a pharmacist";
- decline to supply, or change the strength of a medicine;
- supply a controlled drug;
- reverse a supply or correct the record;
- record a downtime period, correct batch details, set a price or reopen a closed identity check (the pharmacy in
  charge does these).

**When no pharmacist is on duty.** "Supply without a pharmacist" appears only if two hospital admins have switched it
on and legal question 1 has an answer on record. It is off in production. You choose a reason; the supply goes on the
look-back list for a pharmacist. It is never offered for a controlled drug. Otherwise the patient waits, or the line
is recorded as owed.

**When something is refused,** the screen says why in words and nothing is written. If it says "Waiting for a
pharmacist", call one.

---

## 3. Prescriber

**Nothing in this guide blocks prescribing.** Every stock answer can be overridden; placing always works.

### The stock line

In the prescribing dialog's Check step, where a live dispensing point serves your patient, each medicine shows one
line in words. You never see a quantity.

| You see                                                                      | What to do                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| "On the shelf at {point}. Counted {when}." or "Low at {point}. …"            | Nothing                                                |
| "Received {when}, not yet counted."                                          | Nothing                                                |
| "Stock at {point} has not been counted {since …}. This answer may be wrong." | Nothing; treat it as unknown                           |
| "Not on the shelf at {point} since {date}. In stock at {other point}."       | **Aware; prescribe anyway** or **Pick something else** |
| "Not stocked at {point}."                                                    | **Aware; prescribe anyway** or **Pick something else** |
| "Pharmacy not linked yet."                                                   | Nothing: no live point serves this patient             |

What you chose is stored, so the pharmacy reads "The prescriber was told it was not on the shelf." Stock informs and
never blocks.

### A query from the pharmacy

A chip on the line, "Pharmacy query · waiting {n} min", and "{n} from the pharmacy" in the plan step's header. Open
it to read who asked, the type, what they propose and whether the patient is waiting at the window. Answer once:

- **Keep it as written**, with a reason. The line goes back to the pharmacy. In production, while your hospital's
  reasons are not signed, Keep is not offered: "Call the pharmacy to answer."
- **Change the prescription.** The dialog opens on that line. "The new prescription is in the basket. Place it to
  send the change." Placing it stops the old line in the same step. For a query about the whole prescription, change
  the lines you choose and then press **Changes made**.
- **Stop this medicine** (or **Stop the remaining medicines**), with a reason.

Any clinician who may prescribe for this patient here may answer. The first answer wins; a later one is shown it.
Nurses cannot answer.

**Call the pharmacy** shows the point's phone number. If the point has no phone set, the button is absent.

If the pharmacy logged a phone answer in your name, you see "The pharmacy recorded your phone answer at {time}. Not
you? Tell us." **Tell us** reopens the query.

### A line that was not supplied

"From the pharmacy, {time}. {Medicine} was not supplied: {reason}. {What the patient was told}." Choose **Choose an
alternative** or **Leave it as it is**. No answer is required.

### Stopping a line, and printing

You stop a placed line by answering a pharmacy query with **Stop this medicine**. There is no separate stop button on
a placed line yet. A line already supplied stays supplied.

When you print the prescription, MedSync records the print. If you change a line after printing, the pharmacy sees
"Changed since printing" and asks for the paper to match. **Known gap:** the printed prescription still lists lines
you have stopped, and reprinting does not remove them. At a live point MedSync refuses to supply a stopped line; a
pharmacy elsewhere cannot tell. Cross a stopped line out on the paper and tell the patient.

### On the ward

Nurses see a read-only chip on each inpatient medicine: "Pharmacy: not yet reviewed", "Pharmacy: reviewed {time}",
"Pharmacy: query with the prescriber" or "Pharmacy: standard lane, not reviewed". It never holds a dose. The first
dose is charted as usual.

---

## 4. Pharmacy in charge

You hold `pharmacy.manage` while the hospital admin has named you head of the Pharmacy department or of your point in
Departments & services. It ends when that assignment ends.

**Opening count.** Before a point can go live every product there needs one count. The Stock page shows how many
remain.

**Reorder levels.** On a medicine's Stock page: **Set reorder level**. Leave it empty for no level. "A medicine with
no reorder level set is never shown as low."

**Count freshness.** Set how many days a count stays fresh for your point (blank for none). With none set, a count
never goes stale and prescribers are never told it is old. Set one.

**Batch corrections.** A mistyped batch number or expiry: **Correct batch details**, with a reason. "The old value
stays in the record. Movements are unchanged."

**Differences.**

- A non-controlled count that differs shows both figures under "Counts waiting for a reason". The person who
  counted gives the reason, which records the correction.
- A controlled difference waits under **Open differences** on the Controlled drugs page. Read it, then **Close with a
  note**.

**Look-backs.** The Look-back tab on Supplied today must be cleared by a pharmacist ("Looked at", with a note). If you
are not a pharmacist, make sure one does. Use the **Identified another way** filter to see how often staff skip the
typed check.

**Reopening a closed identity check.** After five wrong tries in a day the check closes for that patient. Make sure
the person at the window is the patient (or their representative), then **Reopen the typed check**.

**Correct the record.** For a supply found wrong after the day it was made (for example, the wrong patient): **Mark as
recorded in error**, with a reason. No stock moves; put the shelf right with a count.

**Recording a downtime period.**

1. Keep blank sheets ready: **Print blank sheets** reserves the numbers.
2. When the system is back: **Record a downtime** (started, ended, reason) and tick the sheets used. They become
   "to enter" for anyone who dispenses.
3. Sheets printed more than 7 days ago and never named are listed under "Sheets not yet named". Name them in a
   downtime, or **Void a sheet number** with a reason.
4. **Record a drill** before going live. A drill writes no patient record and moves no stock.

A row whose time is outside every recorded downtime is refused with "Ask the pharmacy in charge to record this
downtime first." Rows a live supply would have refused are recorded and go on the look-back list. A controlled supply
entered from a sheet waits on the Controlled drugs page until confirmed against the register with a witness.

**Confirming the log columns.** Supplied today → **Print the dispensing log** → **Confirm the columns**. Put the columns
in the order of your hospital's HMIS 016 book. Until you do, the log prints "Columns not yet confirmed against this
hospital's dispensing log."

---

## 5. Hospital admin

Go to **Departments & services → Pharmacy → Pharmacy settings**. Nothing on these pages shows a patient.

### Going live, per dispensing point

Open the point's **Going live** page. It shows six conditions, each with its evidence:

1. **The content is signed:** every set signed by the CSO, the clinical ones co-signed by a registered pharmacist,
   and the hazard log co-signed by a registered pharmacist.
2. **The legal interim answers are on record:** questions 1 to 6, each with a document reference, who gave it and
   when (**Record an answer**).
3. **The stock is set up and counted:** an opening count for every product.
4. **A downtime drill is recorded** at this point.
5. **The pharmacy and the prescribers are briefed** (**Record a briefing**, once for each).
6. **An in-charge is named for the point** and the point's phone is set. Until legal question 1 says otherwise, the
   in-charge must be a pharmacist.

**Switch on dispensing** opens only when all six are met. A **different** hospital admin then presses **Approve and
switch on**; you cannot approve your own request. For a second or later point you also need a note on how the first
point's pilot went, written by someone other than the admin who asks.

**Switching off.** **Switch off**, with a reason of at least a sentence; a second admin approves. The point returns to
read-only. Its open lines stay workable from any live point. **Withdraw the request** cancels a request still
waiting.

### Settings

**This point:** the pharmacy phone (used by "Call the pharmacy", the slip and messages), labels printed or written by
hand, and count freshness.

**This hospital:**

- **Individual inpatient supply.** Leave it **off**. A known fault means stopping an admission medicine can leave its
  prescription active, and that must be fixed in prescribing before wards are supplied patient by patient.
- **Payment status required before hand-over.** "Emergency" always passes.
- **Expiry look-ahead,** in days.
- **Live SMS to patients.** "Live SMS stays off until the patient wording, the message templates and the message
  name are signed."

### Supply without a pharmacist

Lets a technician supply a pharmacist-first line when no pharmacist can be reached. It needs two things: an answer to
legal question 1 on record, and two admins. One admin presses **Ask to switch it on**; a different one presses
**Approve and switch on**. Without the legal answer it is refused. It never covers a controlled drug, every use goes on
the look-back list, and nothing limits how often it is used, so watch that list. **Switch it off** whenever a
pharmacist is back on the rota.

## 6. The national medicines list

**Pharmacy staff.** On **Stock**, open **National list**. It shows the Essential Medicines and Health Supplies List
for Uganda as printed: every medicine and health supply, with its level of care, its class (Vital, Essential or
Necessary) and whether it sits under a specialist band. Search by name or class, show only medicines or only
supplies, or tick **Vital only**. A medicine already on MedSync's prescribing list says **On the prescribing list**.
A row marked **Check against the printed list** was hard to read in the source, so trust the paper over it. The list
is for reference only: you cannot prescribe, supply or stock from it.

**The CSO (superadmin).** Under **Admin → Medicines list**:

- **Links to confirm.** Link each prescribing-list medicine to its row in the national list. Where several rows
  share the name (tablet and injection, for example), choose the one that matches how it is prescribed.
  **Review the single matches** links every medicine that has exactly one row, after you have read the list.
- **Rows to check against the printed list.** Open the PDF at the page shown and record what you checked. A
  flagged medicine row can be linked only after that.
- **Linked.** Unlink a medicine if it was linked to the wrong row.

Once a medicine is linked, Stock shows its class and counts it in "out, of which vital".
