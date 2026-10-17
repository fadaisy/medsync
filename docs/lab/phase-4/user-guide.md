# Referred tests and results back: user guide (Lab Phase 4)

For laboratory staff, the laboratory lead, the data protection lead, the infection prevention lead and doctors.
Everything here appears only where the hospital has switched on `labReferral` (and `labExchange` for Connections).

## Before the first referral (laboratory lead)

1. **Partners** (Exchange → Partners): add each reference laboratory with its transport and how results come back.
   For each partner, record the tests it does with its own code, the identifiers its form needs, its stated
   turnaround (or none), and its packing list. A second laboratory lead signs each list. Without a signed list, a
   test cannot go to that partner.
2. Ask the **data protection lead** to record the partner's legal record and field list at **Referral governance**.
   Paper sending works without them; electronic sending does not.
3. Ask the **infection prevention lead** to record the high-risk wording. The CSO countersigns it.

## Sending specimens out (To refer)

1. **To refer** lists the received specimens whose test this hospital refers. Choose the partner.
2. Scan or type the partner's form number for each tube and tick every packing item. **Add to manifest** stays off
   until every identifier and item is done, and says what is missing.
3. A tube for two destinations needs an **aliquot**: it gets its own lab number.
4. A **high-risk** specimen never goes on a manifest. MedSync shows the outbreak procedure; record who you told. It
   does not arrange the transport.
5. **Seal** the manifest, **print** it (A4; a reprint says "Copy"), and record the **handover**: who took it and
   when. The manifest carries no patient names. Patient details travel on the request forms inside the package.

## Tracking (Referrals)

- Each referral shows its state in words ("At Reference lab A: received", "Overdue"). Overdue is counted from the
  partner's stated turnaround in working days. A partner with no stated turnaround is never overdue.
- **Record an update** for what you learnt by phone, SMS, the rider's log or their portal. Say how you learnt it.
  An update dated earlier than the last one is kept but does not move the referral back.
- **Rejected by the reference lab** needs their reason. Recollect makes a new specimen.
- **Cancel after sending** is a request to the partner. A result that still comes back says so.
- **Lost** needs a note of the call that confirmed it, and opens a nonconformity.

## Results back on paper

1. Open the referral and choose **Enter the result**. Attach a **scan** of their report first.
2. Type their number, the name and date of birth as printed, their report number, when it was reported and who
   authorised it. If these do not match the referral, nothing is filed: the report waits under **Waiting for a
   match**.
3. Type each value **with the unit and range exactly as printed**. MedSync converts to this hospital's unit. An
   unknown unit blocks release. The flag compares only against their printed range.
4. If another lab person is on duty, they check it against the scan before release. Alone, the result says
   "Entered by one person" and the next shift's check task appears.
5. A value past this hospital's critical limits raises the critical call as usual. If the reference lab already
   called the ward, record who, when and to whom.
6. A **corrected report** from the reference lab is entered as an amendment of that result, with its reason.

## Waiting for a match

Results that could not file by themselves, with the reason in words. The comparison says Same, Differs or Cannot
compare. **Values stay hidden** until you decide. Start with **Ask the reference lab**. **File after confirming**
needs how it was confirmed (a corrected report, or a phone call with the name of the person you spoke to), a second
lab person and a reason. The doctor sees "Filed by hand after a mismatch". MedSync never creates a patient or an
order from a result, and never picks between two.

## Connections (laboratory lead)

- **Tiles:** delivered today, retrying (with the oldest), needs a person, waiting for a match.
- **Pair a machine:** make a one-time code (your authenticator code is asked). Give it to the person setting up the
  partner's system or the bridge. It works once, expires in 30 minutes and locks after 10 wrong tries. When the
  machine has paired, **Check and enable**: type the fingerprint the machine shows on its own screen.
- **Revoke** stops a machine at once. Its stored messages stay.
- **Results back, to file:** a partner's result that matched its referral. **File on the order**.
- **Messages:** a message that stopped trying or could not be read says so, and that it was stored before it was
  acknowledged. Retry after fixing the cause, or set it aside, with a reason. **Open the message** shows patient
  details. Your reason is recorded.
- National connections (CPHL/NHLDS, the national Laboratory Data Repository) say **Not connected** and what the lab
  does instead.

## Analysers

Each analyser on the equipment register says **"Waiting for {model}'s interface document · Typed by hand"**.
Results are typed from the printout until the maker's document is in hand and the bridge has had its shadow run.

## Referral governance (data protection lead, infection prevention lead, hospital admin)

- The **hospital admin** names the data protection lead and the infection prevention lead.
- The **data protection lead** records each partner's legal basis, agreement and review date, processor terms,
  cross-border safeguards, the hospital's PDPO registration and the breach contact, and the fields that may be sent.
  Diagnosis, phone and address are never on the list. A second person signs: you cannot sign your own draft.
- The **infection prevention lead** records the high-risk wording and the procedure reference.

## Doctors

- The order line says where the specimen went and its state ("Sent to Reference lab A, received there").
- **Results → Sent out, waiting** lists your patients' tests at reference labs.
- A referred result carries a **Referred** tag and where it came from: the lab, their report, who entered and
  checked it, and **Open the original report**.
