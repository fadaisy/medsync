# Button

Pill-shaped actions: one lagoon primary per region, a white secondary beside it, a soft lagoon for additive actions, and text buttons for small changes.

**Use** `primary` for the one thing the screen or card is for ("Save reading", "I took it"). `secondary` beside it for the alternative ("Not yet"). `soft` for adding in place ("Add a reading"). `text` for "Change", "Undo". Disabled is `surface-sunken` with `ink-3`, and the screen says why.

**Consumer provides** the label (a verb first), an optional 18px Lucide icon before it.

**Values** height `button-h` 52, `radius-pill`, `label` 16/600. Primary `accent` fill, `accent-on` text, `shadow-accent`. Secondary `surface` with a 1px `line-strong` edge. On a navy band or cascade card, secondary becomes `surface` (white) with `ink` text.

**Don't** put white text on lagoon; put two primaries side by side; use red for anything but Help and "Get help now" (see HelpButton); colour a button with an area hue.
