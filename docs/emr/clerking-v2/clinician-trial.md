# Clinician trial: old desk against new (Phase 7)

**Who:** 3–5 clinicians (medical officers and interns), each doing both desks in a random order.

**Where:** the dev project, with synthetic patients only.

**Cases:**

- the standard visit (clinical reference 2.12);
- the chest-pain visit (the fixture in `tests/clerking/fixtures.ts`, `chestPainVariant`).

**Recorded for each run:**

- time from opening the desk to signing (a stopwatch, or the desk's timestamps);
- taps and keystrokes (screen recording, counted afterwards);
- errors: a wrong or missing answer against the case sheet;
- one line from the clinician on what slowed them down.

**Reported at STOP 7:** the median and range per desk and case, the difference, the error counts, and the comments.

**Switch-on:** `CLERKING_V2=<test hospital id>` on the dev project; old desk `CLERKING_V2` unset.
