# ADR 0422 — No conditions or readings in patient web addresses

**Status:** Proposed — 2026-10-25 (patient web Steps 3–4; awaits the owner's review at STOP 9).

## Context

W4 says query strings carry no names, readings or conditions, and W3 says nothing with PHI goes into browser
storage on a shared device. The phone hands a dangerous reading to its interrupt screen, and a booking reason
to the next step, as route parameters, which never leave the device. On the web the same move puts them in
the address bar, the browser history and the server logs.

## Decision

- The dangerous-reading interrupt opens in place inside Log a reading (page and dialog), forced light. There
  is no `/patient/care/readings/danger?value=…` page.
- A booking reason ("antenatal", "counselling") and a symptom area travel between Book, Something is wrong
  and Ask for a day as their position in a list the server holds (`?r=3`, `?a=2`,
  `lib/patient-web/opaque.ts`), never the word.
- Ids in addresses are opaque uuids only.

## Consequences

A refreshed danger interrupt is gone (the reading is saved; the patient sees Log a reading again and Help
stays one press away). A stale link after the reason list changes lands on another choice, which the
patient sees before anything is sent.
