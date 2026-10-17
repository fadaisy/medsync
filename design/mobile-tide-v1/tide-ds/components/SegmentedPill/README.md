# SegmentedPill

Two or three pills that switch a view, with an optional round add button at the end, as in the reference's "Today / Calendar / +".

**Use** under the header on Home ("Today / This week") and Visits ("Coming up / Past"). Two choices is best, three at most.

**Consumer provides** the choices, the selected one, and the add action if any.

**Values** height 46, `radius-pill`. Selected `accent` with `accent-on` and `shadow-accent`; unselected `surface` with `ink` and `shadow-card`. Add button 46 round, `accent`.

**Don't** use it for filters with many options (use chips), or as a primary action.
