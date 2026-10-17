# DateRail

A week laid out as big dates down the left with the day's cards beside them; the selected date is a white tile that bleeds into the screen's left edge.

**Use** on This week (Home) and on Visits. The selected date is flush against the screen edge, square on the left, `radius-lg` on the right, with `shadow-card` and a small `accent` dot top-right, as if pulled out of the phone. Other dates float on the ground with no tile; dates further out fade to `ink-3`.

**Consumer provides** the dates and, per date, its cards (each with an area dot and word, a title and one supporting line).

**Values** rail column 78 wide with no left padding; date `numeral` 30/32, day or "Today" in `caption` `ink-2`; tile height 84; cards `surface`, `radius-lg`, `shadow-card`.

**Don't** give the selected tile a left radius or a left margin (the bleed is the point); colour a card by area; put more than three cards beside one date (summarise instead).
