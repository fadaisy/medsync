# Cascade

The patient's day as one stack of overlapping cards in time order: deep navy for what is done, lagoon for what is due now, foam for what comes next.

**Use** on Home's "Today". Earliest at the top. Done items are compact rows (icon, title, time, a white tick). The item due now is the open card at the bottom of the stack, with its action. Up to two "next" items follow as foam rows; the rest live in This week.

**Tone by order, not topic.** Steps go `cascade-1` → `cascade-2` → `cascade-3` → `cascade-now`. Which area an item belongs to shows by its icon and word, never by the card colour.

**Consumer provides** the ordered items, each with icon, title, time and state, and the now item's actions.

**Values** cards overlap by `cascade-overlap` 32px (more than the 28px corner, so no square corner shows), top corners `radius-xl` 28; the now card is fully rounded. Text on steps 1–3 is `on-band` and `on-band-2`; on now and next it is navy. In the now card, "I took it" is a navy pill (it would otherwise be lagoon on lagoon) and "Not yet" is a translucent white pill.

**Don't** show more than four done rows (fold older ones into "Earlier today"); colour a card by area; use a status colour for a card; put a dangerous reading in the cascade (it interrupts the screen instead).
