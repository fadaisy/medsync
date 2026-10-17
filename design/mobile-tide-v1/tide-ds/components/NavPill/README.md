# NavPill

The app's main navigation: a frosted floating pill above the home indicator, a lagoon plus cradled in a bump at its centre, and four places that each carry their word.

**Use** on every signed-in screen, inset 16px from the screen edges and 14px above the home indicator. Places, in order: Home, Visits, [Add], Care, Me.

**Where you are** The current place sits in a navy chip (62 × 56, 18px corners) with its icon filled and its word in white at 700. Other places are outline icons in `ink-3` with their word at 500. In Navy, the chip turns `ink` (near-white) with navy text.

**What needs you** A small count badge on a place (for example Care, 1 due) in `ink` with white text, ringed in the pill colour. On the current place it turns lagoon. Never red.

**The centre plus** A 56px `accent` disc with a navy plus, cradled in a bump that rises from the pill's top edge and ringed 5px in the pill colour so it looks set into the bar, with `shadow-accent` beneath and the word "Add" under it. It opens a sheet: Log a reading · I took a medicine · Book a visit · Tell my care team.

**Consumer provides** the current place, any counts, and the plus handler.

**Values** pill `surface-raised` at 94% with a 1px hairline and `shadow-float`, height 72 plus a 20px bump, ends 28px. Every hit area is at least `touch-min` 48.

**Don't** drop the words; put Help in it (Help lives in the header); add a sixth place; colour a place with its area hue; use a red badge.
