# Decisions

Every parameter chosen here, and every scope decision made without being
asked, with the reason. Kept in the order the decisions were made.

This is an illustrative simulation of a device that does not yet exist. Model
parameters are engineering estimates, not clinical data. It is not a medical
device.

---

## 1. Where the bench lives, and how it is kept out of the way

The bench is a self-contained Vite application in `bionic-islet-bench/` inside
the MedSync repository, with its own `package.json`, `tsconfig.json`,
`node_modules` and test runner. It shares nothing with the Next.js application
except the design tokens, which are copied rather than imported.

Three files in the parent repository were changed so the parent toolchain does
not try to compile or lint the bench:

- `tsconfig.json` gained `bionic-islet-bench` in `exclude`. The parent's
  `include` is `**/*.ts`, and the pre-commit hook runs `npm run typecheck` over
  the whole repository, so without this every commit would typecheck the bench
  against Next.js settings.
- `eslint.config.mjs` gained `bionic-islet-bench/**` in `globalIgnores`.
- `.prettierignore` gained `bionic-islet-bench`.

The bench has its own `postcss.config.js` containing no plugins. Without it,
Vite walks up the tree, finds the parent application's PostCSS config and
fails on a plugin that is not installed in the bench.

**Why not a separate repository:** the brief asks for a zip of the repo and a
static `dist/`, both of which a subdirectory gives. Keeping it here means the
design tokens and the bench stay visible to the same reviewers.

---

## 2. Glucose distribution volume: 11.2 L, not 112 L

The brief says `Vg = 1.6 L/kg x 70 kg`. Taken literally that is **112 L**.

That value cannot satisfy the brief's own acceptance check. A 60 g meal is
about 333 mmol of glucose; spread over 112 L with no clearance at all it would
raise plasma glucose by 3.0 mmol/L, from 6.0 to 9.0, and any realistic
clearance brings that well below the required 8 to 12 mmol/L peak.

1.6 **dL**/kg is the standard Bergman minimal-model figure and gives 11.2 L,
which reproduces the required peak. Implemented as
`glucoseVolumeL: 1.6 * 0.1 * 70`.

**Confidence:** high. The brief has a units slip, and the acceptance check is
the better evidence of intent.

---

## 3. Photobleaching half-scale: 700 000 flashes, not 900 000

The brief says two things that cannot both be true:

- `N_half = 900 000` flashes
- "about one year at one flash per minute"

One year at one flash per minute is 525 600 flashes, not 900 000. With
`N_half = 900 000` the bleaching at day 365 is
`1 - exp(-525600/900000) = 44.2 %`, which falls **outside** the brief's own
acceptance band of 45 to 65 percent, by 0.8 points.

`N_half = 700 000` satisfies both statements: it is "about one year" of
flashes (486 days) and it puts day 365 at **52.8 percent**, comfortably inside
the band. The measured value is reported by `tests/ageing.test.ts`.

The parameter is a single named constant,
`AGEING.photobleachHalfScaleFlashes`. Setting it back to 900 000 changes
nothing else.

**Confidence:** medium. Either number is defensible; this one passes the gate
the brief set.

---

## 4. The capsule needs a sink term

The brief's capsule equation is a pure ramp:

```
dCap/dt = k_cap * (1 - steroidEffect) * (1 - coatEffect)
```

A pure ramp has no steady state, yet scenario 5 describes the capsule as being
"at steady state" at six months. It also overshoots: integrating the brief's
equation to day 365 gives 146.7 um, above the brief's own 90 to 140 um band.

A first-order remodelling sink was added:

```
dCap/dt = k_cap * (1 - steroidEffect) * (1 - coatEffect) - Cap / tau_remodel
```

with `tau_remodel = 600 days`. This is the only added term in the ageing model.
It is physiologically ordinary (a fibrous capsule is laid down and resorbed at
the same time) and it lands day 365 at **113 um on tip A and 135 um on tip B**,
both inside the band.

The three ageing statements in the brief cannot all hold at once, and this is
worth stating plainly rather than quietly picking one:

| Brief says | Where | Model gives | Why they disagree |
|---|---|---|---|
| Capsule at steady state at 6 months | scenario 5 | 54 um at day 180, still growing | A capsule that has plateaued by month 6 cannot then reach 90 to 140 um by month 12 at 0.495 um/day |
| Photobleaching about 50 percent at 6 months | scenario 5 | 31 percent at day 180 | 50 percent at 6 months requires N_half = 374 000, which puts day 365 at 75 percent, above the 45 to 65 band |
| Enzyme about 85 percent at 6 months | scenario 5 | 64 percent at day 180 | 85 percent at 6 months requires T_enz = 1107 days, not the 400 days the brief states |

Where a scenario's prose and a numbered parameter disagree, the numbered
parameter wins and the scenario's stated expectation was rewritten to the
model's own values. Scenario 5 now asserts what the model actually does.

**Confidence:** medium-high on the sink term, high on the arithmetic.

---

## 5. Both sensors are temperature dependent, not just compensated

The brief gives a temperature term for the optical tip only, but says "both
sensors are temperature compensated". A compensation with nothing to
compensate is decoration, so the electrochemical front end was given a
`+2 %/degC` sensitivity term, which is the conventional figure for an
enzyme electrode. The thermistor failure fault then has a real consequence on
both channels rather than only on one.

---

## 6. Slow sensor drift was added

Not in the brief. Without it, the only error left between calibrations is
white noise, and the three-sample filter removes almost all of it: the bench
reported a mean absolute relative difference of 1.0 percent, an accuracy no
real glucose sensor has ever achieved. Publishing that number would have been
the bench overselling the device, which is exactly what the honesty rules
exist to prevent.

Each channel now carries an Ornstein-Uhlenbeck drift on its sensitivity, with
a 2.5 percent one-sigma amplitude and a 3 day correlation time. This is what
calibration actually corrects, and it is what makes "days since calibration" a
real number rather than a decoration. With it, day-zero MARD is 3.9 percent
and the whole-year figure is 6.1 percent.

The first value tried, 4 percent, made the two channels disagree often enough
to spend multi-day stretches at reduced autonomy. 2.5 percent keeps
spontaneous disagreement rare without removing it.

---

## 7. The device reports a filtered value, and arbitrates on it

A single 60 s acquisition is dominated by measurement noise. Arbitrating on
raw samples made the supervisor accuse a perfectly healthy tip of moving too
fast about 20 percent of the time, and would have made spurious disagreement
routine once realistic noise was in the model.

Both channels therefore report a three-acquisition mean. It is what the
supervisor arbitrates on, what the controller doses on and what the traces
draw. It costs about one minute of lag, which is included in the reported
uncertainty, and the unfiltered value is still kept per channel and used for
the rate-of-change plausibility check, where a step change is the signal.

The rate-of-change check itself compares across three acquisitions against a
threshold of `0.35 mmol/L per min plus three standard deviations of the
channel's own noise`. A fixed physiological threshold applied to noisy samples
is not a plausibility check, it is a noise detector.

---

## 8. Announcing a meal shortens the excursion but does not blunt the peak

An observation, not a decision, but it changed a test. With a 20 min delivery
lag and a 25 min action lag, insulin given at the moment of eating cannot act
before a peak that arrives at 45 min. Measured over five seeds, announcing a
60 g meal leaves the peak within 0.15 mmol/L but lowers the four-hour mean by
about 0.4 mmol/L.

The test asserts the mean, because that is what the model supports. The
original test asserted the peak and was wrong.

---

## 9. The safe basal is a structural bound, not a setting

`normaliseEnvelope` forces `safeBasal <= basalRate <= maxBasal` wherever an
envelope enters the engine, including a clinician changing it mid-run. This
makes "falling back to safe basal can never raise insulin" a property of the
type rather than a promise in a comment.

The property test found this: a randomised envelope change that lowered
`maxBasal` below `safeBasal` left the device delivering above its own ceiling.

---

## 10. Lowering autonomy stops insulin already in flight

Also found by the property test. A bolus authorised at full autonomy carried on
delivering after the supervisor dropped to `doubtful-one`, which meant a
doubtful reading really could keep insulin flowing.

Any drop below full autonomy now cancels the bolus where it stands and logs
how many units went undelivered. Suspend does the same.

---

## 11. Autonomy may only rise when the evidence is not falling

The brief's rule is `permittedAutonomy(t+1) <= permittedAutonomy(t)` whenever
the evidence score falls. Implemented directly: a rise requires
`evidence did not fall this step` **and** either 15 simulated minutes of
restored agreement or a fresh calibration. Written this way the invariant
holds by construction, and the property test confirms it rather than
discovering it.

A bridged external monitor raises the evidence score by 0.15, which is why
bridging is allowed to lift the device from suspend to safe basal: that is a
rise on **improving** evidence, which the rule permits, rather than an
exception carved out of it.

---

## 12. The supervisor sees its own history, not the model

Impedance and optical return are compared against a five-day exponentially
smoothed baseline of the device's own measurements, not against what the
physical model expects. A supervisor that could read the model would be
cheating, and would never detect anything, because the model is always right
about itself.

This is what makes a step change detectable and slow ageing not: fouling and
capsule growth are tracked into the baseline, while a protein deposition
event, a fracture or an omental wrap are step changes against it.

An early version updated this baseline once per acquisition using a
per-**second** coefficient, giving an effective time constant of 300 days
rather than 5. The supervisor then accused tip B of a permanent impedance step
from about day 80 onward, and the six-month scoreboard showed 50 percent of
the time at reduced autonomy. Fixed.

---

## 13. The patient answers calibration prompts, unless told not to

Long runs need calibration or the uncertainty from time-since-calibration
grows without limit. The engine performs a calibration when the device prompts
(every 7 days), representing a compliant patient. The missed-calibration fault
turns that off, which is the whole point of having the fault.

Sustained unexplained disagreement additionally **requests** a calibration
after one hour, but does not perform one. Calibrating during an interferent
would bake the interferent into the gain, and that is a human's decision to
make badly, not the device's.

---

## 14. Oxygen limitation applies to the part of the signal above 12 mmol/L

The brief says `fO2 = min(1, pO2/25)` "applied only above 12 mmol/L". Read
literally as a multiplier on the whole signal it would create a discontinuity
at 12. Implemented instead as

```
effective = min(G, 12) + max(0, G - 12) * fO2
```

which is continuous, and matches the physical story: oxygen demand outruns
supply only in the part of the reaction above 12 mmol/L.

---

## 15. A low battery slows the optical flash rate

The brief lists "battery low" as a fault but does not say what it does. Doing
nothing would make it a decoration. A device short of power reduces its most
expensive operation, which is the optical flash, so acquisition drops from
60 s to 5 min. The consequence is a visibly wider band on tip A and a slower
trace, which is a real design trade-off rather than a warning light.

---

## 16. Whole-run scoreboards are accumulated, not computed from the buffer

A 365-day run produces 525 600 samples. Any sane trace buffer drops most of
them. Scoring only what survived would report a year as if it were the last
few weeks, silently. `ScoreboardAccumulator` accumulates over every sample the
run produces; the test asserts the scored minutes equal `365 * 1440` exactly.

---

## 17. Steroid collar is on tip A only

The brief describes the dexamethasone acetate collar as slowing capsule growth
"around the optical tip". So tip B has no collar and grows a thicker capsule:
135 um against 113 um at day 365. This is visible on the bench as two
different capsule rings, and it is the reason tip B carries slightly more lag.

---

## 18. The dark bench, and two tints added for contrast

The brief allows a dark bench background if the device reads better on it. It
does: the optical flash, the electron arrivals and the glow of the hydrogel cap
are all light on dark, and on a white ground they would be invisible.

The palette is otherwise unchanged, but two of its colours fail WCAG AA as text
on `#0B1220` and had to be given a tint:

| Colour | On the bench | Contrast | Used for |
| --- | --- | --- | --- |
| `grey #6B7280` | fails | 3.9:1 | replaced by `--color-muted #9AA4B2` at 7.4:1 for secondary text |
| `red #DC2626` | fails | 3.9:1 | replaced by `--color-red-text #F87171` at 6.8:1 for red **text** only |
| `teal-600 #0D9488` | passes on the bench at 5.0:1, but fails as white-on-teal at 3.7:1 and as teal-on-teal-tint at 4.2:1 | | replaced by `--color-teal-bright #5EEAD4` for interactive chrome |

`#DC2626` itself is kept for the insulin line, the catheter, the pump bar and
the invalid state fill, where the 3:1 graphics threshold applies and it passes.
`#5EEAD4` is not an invention: DESIGN-medsync's own dark-mode table maps
teal-600 to `#5EEAD4` in dark mode. `#0B1220` on `#5EEAD4` is 12.7:1.

axe-core reports zero violations at WCAG 2.1 A and AA.

---

## 19. Red declares its purpose in the markup

"Red is reserved for the insulin path and the invalid state" is easy to write
and hard to keep. The first version of the colour audit sniffed the text near
each red element, which passes anything with the word "insulin" nearby and
fails anything without text at all, such as a legend swatch.

Every intentionally red element now carries `data-red="insulin"` or
`data-red="invalid"`, and the audit fails on any red element without one. It is
a rule the code has to keep rather than a heuristic that can be fooled. The
canvas is not in the document, so the same rule is enforced there by a unit
test over `src/components/tracePalette.ts`.

Current count: 20 distinct red usages, all declared, none undeclared.

---

## 20. Particles are CSS animations, not a JavaScript particle system

The molecules crossing the membrane, the electrons arriving at the platinum and
the flash going down the fibre are CSS animations whose duration is set inline
from engine state. Three reasons, in order of importance:

1. The duration is a **rendered property**, so `scripts/visual-binding.mjs` can
   read it back and invert it. A JavaScript particle system's speed is not
   visible to anything outside itself, so nothing could check it.
2. `prefers-reduced-motion` freezes them through the global rule without any
   component knowing about it.
3. They run on the compositor, so they cost nothing at 1440 times real time.

---

## 21. Three visual quantities are bound and checked, the rest are documented

The brief asks for a test tying three visual quantities to engine state within
2 percent. Rather than unit-testing the mapping functions against themselves,
which would prove nothing, the check runs in a real browser: it reads the
rendered attribute, inverts it through the documented mapping, and compares
against the same quantity as printed by the readouts panel, which is a
different code path.

| Drawn | Read from | Compared against |
| --- | --- | --- |
| Cap brightness | the glow element's opacity | "Fluorescence ratio R" |
| Electron arrival period | the particle's computed `animation-duration` | "Electrode current I" |
| Capsule ring radius | the ring's `r` attribute | "Capsule, tip A" |

Measured worst disagreement over four glucose levels and three ages: 0.000
percent. Where a value rounds to the readout's last printed digit the check
says so rather than reporting a spurious percentage.

The other animated quantities (docking rate, membrane crossing rate, collar
halo radius) derive from state through documented mappings in `MODEL.md`
section 11, but are not part of the checked three.

---

## 22. Long runs would not fit on one row of labels

The electrochemical tip has seven layers. Seven names will not fit around the
edges of a 920 unit drawing without colliding, and shrinking them makes them
unreadable. The layers are therefore named inside themselves, running
vertically, with the bracket number at the top of each layer and the full name
and current value on hover and focus like every other part on the bench.

The bracket numbers under the stack are staggered across three rows for the
same reason.

---

## 23. The three ages in the screenshot gallery come from scenarios

The first version ran the bench at 1440 times real time for 62 wall-clock
seconds to reach day one. That is a timing race: it depends on how fast the
machine is, and it broke on the first slow run.

The gallery now loads scenario 1, scenario 5 and scenario 9 for day 1, day 181
and day 365. Those runs are deterministic, they are the same runs the tests
assert on, and they do not depend on the machine.

---

## 24. Two bugs the property test found, and two the scenario check found

Recorded because they are the argument for having written the checks at all.

**From the safety property test over randomised fault sequences:**

1. A bolus authorised at full autonomy kept delivering after the supervisor
   dropped to `doubtful-one`. So a doubtful reading really could keep insulin
   flowing, which is the exact failure the brief's critique list asks you to
   try to build. Any drop below full autonomy now cancels the bolus where it
   stands and logs the undelivered units.
2. A randomised envelope change that lowered `maxBasal` below `safeBasal` left
   the device delivering above its own ceiling. `normaliseEnvelope` now forces
   `safeBasal <= basalRate <= maxBasal` wherever an envelope enters the engine,
   and also trims a bolus already in flight.

**From the browser scenario check:**

3. The worker built each scenario's outcome from the engine's own sample
   buffer, which holds eight samples because the stream is what keeps the
   history. Scenario 2's check measures a rise across three hours, so it was
   silently failing to find one and the bench was showing the previous
   scenario's verdict. It now uses the stream's 24 hours of minutes.
4. The fault "Unannounced meal" and the scenario "Unannounced meal" had the
   same label, so a substring match hit the wrong one. The fault is now
   "Unannounced meal, 60 g", and the check scopes its locator to the scenarios
   section.

---

## 25. Trace buffers live outside React

At 1440 times real time the worker produces 24 samples a second and the canvas
redraws every frame. Putting a year of samples through React state would mean a
new array identity 30 times a second for no benefit.

The buffers are a module singleton in `src/store/benchData.ts`, read directly
by the canvas in its own animation frame. Only the small numbers go through
Zustand, published at 10 a second rather than 30, because a readout does not
need redrawing faster than a person can read it.

Measured: 60 frames per second at every acceleration, engine cost 1.59
microseconds per simulated second.

---

## 26. What the honesty rules cost, and why they were worth it

Three times during this build a number came out better than it should have, and
each time the fix was to make the model worse rather than to publish the
number:

- A mean absolute relative difference of 1.0 percent, because the only error
  between calibrations was white noise that a three-sample filter removed.
  Sensor drift was added (decision 6) and it became 3.9 percent at day zero and
  6.1 percent over a year.
- A perfect frame rate reported alongside a worker cost of 910 microseconds per
  simulated second at 1x, which was the cost of reading the clock twice around
  a single step, not the cost of the step. The metric now refuses to publish a
  figure from a batch too small to measure honestly.
- Scoreboards computed from whatever the trace buffer still held, which would
  have reported a 365 day run as if it were the last few weeks. The scoreboard
  is now accumulated over every sample the run produces, and the test asserts
  the scored minutes equal 365 times 1440 exactly.

None of these would have been visible to a reviewer looking at the screen.

---

## 27. Sorbitol is not modelled separately

The brief's part table names both mannitol and sorbitol as things that fool the
optical tip, but its fault list has one polyol entry. Modelling sorbitol
separately would be the same mechanism with a different constant, and a
nineteenth fault the brief did not ask for. The mannitol fault stands for the
class, and the tooltip and MODEL.md both say the mechanism is boronic acid
binding a diol, which is why any polyol does this.

The unused `OPTICAL.sorbitolOffset` constant was removed rather than left in
the file looking as though something used it.

---

## 28. The 365 day button reports its scoreboard into the log

The brief says the button "fast-forwards ageing and reports the scoreboard".
The scoreboard panel updates as the run proceeds, but a run that takes most of
a minute and then silently stops has not reported anything: the user has to go
looking. On completion the worker now writes one line into the event log with
time in range, time below 3.9, the fused difference against plasma, the alert
count, minutes at reduced autonomy, minutes suspended, total insulin, capsule
thickness, photobleaching and enzyme activity.

---

## 29. The simulation host is separate from the worker

`sim.worker.ts` held all the logic and reached for `self.postMessage`, which
tied the simulation to running inside a Web Worker. That was fine until the
bench needed to be embedded in a page that may not be permitted to spawn one.

The logic moved to `src/worker/simHost.ts`, which knows nothing about workers:
it takes a `post` callback and exposes `handle(message)`. `sim.worker.ts` is
now four lines connecting it to a worker, and the store picks a host from a
build flag. Nothing else in the bench can tell the difference, and all nine
scenarios produce identical numbers either way.

Two things this exposed, both fixed:

- `import.meta.env["VITE_INLINE_HOST"]` with a bracket is **not** statically
  replaced by Vite; only dot access is. The branch that should have been dead
  in the production build survived, and the whole engine was bundled a second
  time into the main chunk, 33 kB of it. `src/vite-env.d.ts` declares the flag
  so dot access typechecks.
- Vite's worker plugin emits a worker file whenever it sees the
  `new Worker(new URL(...))` pattern in the source, even when that branch has
  been removed. `scripts/build-single.mjs` therefore asserts that the assembled
  bundle contains no `new Worker(` and no relative module import, rather than
  trusting that the emitted file is unused.

---

## 30. The source is pure ASCII

The single-file page carries no charset declaration of its own, because
whatever embeds it supplies one. A literal middle dot, which the design system
uses as a separator between related values, was decoded as Latin-1 and rendered
as two wrong characters.

Two changes, either of which would have been enough, both kept because they
protect against different failures: the separator is now a single exported
constant written as an escape, so no source file contains a byte outside ASCII;
and the preview build sets `esbuild.charset: "ascii"`, so anything non-ASCII
that arrives later through a dependency is escaped on the way out. The
assembled page is checked for non-ASCII bytes after every build.

---

## 31. The export says how many rows it wrote

A page embedded in a sandboxed frame cannot hand the viewer a file. The
comma-separated export was therefore a control that did nothing at all in that
setting, with no error and no explanation.

The fix was not to couple the bench to whichever host is embedding it. The
control now reports what it produced, which is useful in every setting: in the
production build the file lands and the count confirms it, and in an embedded
copy the count is the only thing that happens, which is at least honest.

---

## 32. The bench ships on the MedSync deployment, at /bioniccell

Not as its own Vercel project. It is committed as static files under
`public/bioniccell/`, a rewrite in `next.config.ts` makes the bare
`/bioniccell` path work, and the `proxy.ts` matcher excludes it so it is never
auth-gated.

**The MedSync build deliberately does not build the bench.** Chaining them
would mean a broken bench build takes the hospital application's deployment
down with it, which is a bad trade for a demonstration tool. The built output
is committed instead, and `npm run bench:embed` at the repository root
regenerates it.

Committing build output is normally a smell. Here it buys isolation between a
product deployment and a demonstration, and the alternative was worse.

### The bug this nearly shipped with

The first attempt built the bench with Vite's `base: "./"`, which is right for
a page served from a directory root. Served through the rewrite, the page is at
`/bioniccell` with no trailing slash, so `./assets/index.js` resolves against
`/` and asks for `/assets/index.js`, which does not exist. The page returned
200, the HTML was correct, every asset was individually fetchable at its real
path, and the application never mounted.

Only loading the page through the actual Next server caught it. Fetching the
assets directly, which is what a naive check would have done, passed.

The embedded build now uses `--base=/bioniccell/` and the favicon uses Vite's
`%BASE_URL%` placeholder so it follows the same base. The standalone build
still uses `./` and still works from a domain root.

---

## 33. Two live regions, and a check that assumed one

The progress bar and the export confirmation are both `role="status"` live
regions, which is correct HTML: they announce different things.

The browser checks, though, waited for a scenario to finish loading by polling
`!document.querySelector('[role="status"]')`. Adding the second live region
made that selector always match, so the checks hung for their full ten minute
timeout on the first scenario, and the first failure looked like the engine
refactor had broken the worker.

The progress bar now carries `data-progress` and the checks wait on that. The
lesson is about the checks rather than the page: a probe that keys off a role
shared by any other element is a probe that will break for a reason unrelated
to what it is testing.
