# ADR 0356 — Meal logging on the Eat tab

**Status:** Accepted, 2026-10-18. Owner request: make the meals page work, on top of the food list (ADR 0412).

## Context

Care → Move and eat → Eat showed the plate guide, water, and the line "Writing down your meals is not available yet". The built-in Ugandan food list (ADR 0412) now gives every food sourced values per 100 g, a GI or unknown, and household portions.

## Decision

1. **Where meals are kept.**
   - Each food eaten is one row of the patient's own log, `personal_health_logs`, with kind `meal` (migration 0190).
   - `numeric_value_1` holds the grams eaten. `numeric_value_2` holds the kcal at the time of logging, so the web and the care team can read a meal without the phone's list.
   - `unit` holds the food or dish id from the list. `note` holds which meal it was: breakfast, lunch, supper or snack.
   - Carbohydrate and glycemic load are never stored. They are worked out again from the list.
   - The table's RLS stays as it is: the patient writes their own rows, and the care team reads them (0188, ADR 0413).
2. **Adding food.** "Add food" opens a sheet.
   - The patient searches by English or local name, or filters by group.
   - Then they pick a portion and how many (in halves), or a weight in grams, and the meal. The meal is guessed from the time of day.
   - Before saving, the sheet shows kcal, carbohydrate, protein, fat and fibre, the GI, and the glycemic load. An unknown value is shown in words: "GI not known".
   - The food's source note is shown too, when it has one.
   - A rolex, a kikomando, and chips with chicken are logged as one dish and counted from their parts.
3. **The day.** Today's card shows the day's total energy, carbohydrate and glycemic load, then each meal's foods.
   - If any food eaten that day has no GI, the day's glycemic load is shown as not known, with the reason.
   - GI and load are words and numbers only, never red, amber or green. They describe the food, not the patient's state.
4. **Taking one back.** The × on a row removes it.
   - A row still waiting in the outbox just leaves the outbox.
   - A row that has been sent is marked `state = 'deleted'`, never deleted from the table.
   - Offline, a sent row cannot be taken back, so it stays and the patient is told to try again.
5. **"Snap your plate" is gone.** It only ever said "Not available yet". Reading a plate from a photo would mean guessing portions, which the no-fabrication rule does not allow without a separate decision.
6. **Who can see it.** The screen's footer now says "You and your care team can see what you log here", as ADR 0413 decided. Meal saves say the same.

## Consequences

- **The owner applies migration 0190** (after 0188). Until then the database refuses `meal` rows: a save says "Couldn't save that", and nothing is lost on the phone.
- The day view reads the same 400-day window as the rest of the log. Meals add rows quickly (several a day), so the 3,000-row ceiling in `health-log.ts` arrives sooner.
- The other "only you can see it" lines (Care tab, the default save toast) still predate ADR 0413. They are left for the owner to decide.
- The patient can only log meals for today. Logging an earlier day is not built.

## Alternatives considered

- **A separate meals table.** Rejected: the patient's log already has the right RLS, the outbox and the care-team read. One more kind costs one migration line.
- **Storing carbohydrate and glycemic load on the row.** Rejected: the list is the source, and a corrected value then fixes old days too. The kcal figure is kept on the row only for readers without the list.
