# Bionic islet sensor bench

A virtual prototype of the MedSync bionic islet glucose-sensing subsystem: one
screen, one device, running in a simulated body in simulated time, that you can
poke, break, foul, age and calibrate while watching what happens to the glucose
reading and to the insulin the controller is allowed to give.

It is the hardware-in-the-loop rig the team cannot afford yet, so that design
arguments can be settled by driving it rather than by discussing it.

> **Illustrative simulation of a device that does not yet exist. Model
> parameters are engineering estimates, not clinical data. Not a medical
> device.**
>
> Nothing here has been validated against a patient. The plasma glucose the
> traces call "the truth" is a number this simulation invented. The accuracy
> figures are the simulation grading its own homework.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Static build:

```bash
npm run build        # typecheck, then a static bundle in dist/
npm run preview      # serve dist/ locally
```

`dist/` is entirely static: no backend, no network calls, no telemetry. Any
static host will serve it. `base` is set to `./` in `vite.config.ts`, so it
works from a subdirectory as well as from a domain root.

Headless, with no browser at all:

```bash
npm run bench            # every scenario's scoreboard
npm run bench -- 3 4     # scenarios by number
npm run params           # every model parameter with its provenance
```

---

## What you are looking at

One screen, four regions:

- **Device stage**, centre. One continuous zoom over one object: the body, the
  housing cut away, the optical tip, the electrochemical tip. Zooming never
  navigates anywhere and never pauses the simulation.
- **Instrument column**, right. The supervisor's verdict and the evidence
  behind it, the scoreboard, and the live front-end readouts.
- **Control rail**, left. Time, physiology, all eighteen faults, the clinical
  actions and the nine scenarios.
- **Event log**, bottom. Three streams, timestamped in simulated time,
  exportable as a comma-separated file.

Keyboard: `space` plays and pauses, `.` steps one minute, `1` to `4` set the
acceleration, `m` eats 60 g, `p` takes paracetamol, `c` calibrates. Everything
else is a real button and is reachable by `Tab`.

Every number that comes out of the model rather than out of a document carries
a small `model` tag. Hover or focus it to see where the number comes from.

---

## The three things this bench is arguing

1. **The site.** Intraperitoneal sensing leads subcutaneous sensing by about
   eleven and a half minutes on the same rise. Scenario 2 measures it against a
   ghost trace of a subcutaneous sensor in the same body.
2. **Redundancy is only worth having if you know when to distrust it.**
   Scenario 3 and scenario 4 inject exactly the same interferent. In one there
   is health evidence to blame a tip and the loop keeps running at reduced
   autonomy; in the other there is not, and the system falls back rather than
   guessing. Load either and press **Compare 3 and 4** to see both scoreboards
   side by side.
3. **Nothing outside the body can command a dose.** Lose the phone, lose the
   radio, and the insulin trace is bit-identical. The test suite asserts that
   literally, second by second.

---

## Changing the model

Every parameter is in one file, `src/engine/params.ts`, grouped by subsystem
and commented with its unit and its provenance. Change a value there and
everything downstream follows: the engine, the traces, the readouts, the
scenarios, the tests and the generated tables in `MODEL.md`.

```bash
npm run params                  # the current values, grouped
npm run params -- --markdown    # the table as it appears in MODEL.md
npm test                        # confirm the acceptance checks still hold
```

The parameters most worth turning first:

| To ask | Change |
| --- | --- |
| Is the steroid collar worth it? | `AGEING.steroidEffect0`, or run scenario 9 |
| How much capsule can we tolerate? | `PHYSIOLOGY.tauCapsulePerMicron` |
| Is one flash a minute too many? | `OPTICAL.flashesPerAcquisition`, `AGEING.photobleachHalfScaleFlashes` |
| How wide should the agreement window be? | `ARBITRATION.agreeAbsolute`, `ARBITRATION.agreeRelative` |
| How conservative should the controller be? | `CONTROLLER.confidenceKFull`, `CONTROLLER.confidenceKReduced` |
| What does an invalid reading cost the patient? | `ENVELOPE_DEFAULT.onInvalid`, `ENVELOPE_DEFAULT.safeBasal` |

The full table of every constant, with its value, unit, provenance and
justification, is in [`MODEL.md`](MODEL.md), section 13. The equations, exactly
as implemented, are sections 1 to 11 of the same document. Every decision made
without being asked is in [`DECISIONS.md`](DECISIONS.md).

---

## Layout

```
src/
  engine/        the simulation. No React, no DOM, no Math.random
    params.ts        every constant, with its provenance
    rng.ts           seeded streams, one per noise source
    types.ts         SimState and the event vocabulary
    sim.ts           the engine: physiology, ageing, front ends, arbitration
    controller.ts    the dosing controller, as pure functions
    scoreboard.ts    windowed and streaming scoreboards
    scenarios.ts     the nine scenarios, each with its own check
    runner.ts        the headless command line runner
  worker/        the simulation worker and the sample pipeline
  store/         Zustand state, and the trace buffers that live outside React
  components/    the bench
    stage/           the four zoom levels, and the engine-to-drawing mappings
tests/           Vitest
scripts/         the phase gate checks, all driven through a real browser
```

The engine has no dependency on React, on the DOM or on the worker. The same
code runs in the browser, in the command line runner and in the test suite,
which is why the numbers on screen are the numbers the tests assert on.

---

## The checks

```bash
npm test                                  # the full suite
npx tsc --noEmit                          # types
node scripts/shoot.mjs <url> screenshots --axe   # screenshots and axe-core
node scripts/perf.mjs <url>               # frame rate at every acceleration
node scripts/keyboard.mjs <url>           # keyboard-only operation
node scripts/colour-audit.mjs <url>       # where red is allowed to appear
node scripts/reduced-motion.mjs <url>     # animation frozen, numbers live
node scripts/visual-binding.mjs <url>     # drawings tied to engine state
node scripts/scenario-check.mjs <url>     # nine scenarios and the export
node scripts/tip-gallery.mjs <url>        # the tip views across levels and ages
```

The browser scripts need the dev server or a preview server running. They use
the Chromium already on the machine rather than downloading another.

The suite takes about five minutes, because the ageing checks and the property
test are the point of it: two full simulated years and 24 million checked
simulated seconds.

### What each check reported

| Check | Result |
| --- | --- |
| Determinism, same seed and scenario, twice | identical scoreboards, logs and traces for all seven short scenarios |
| 60 g meal, loop closed | peaks 9.2 to 9.9 mmol/L across five seeds, back below 8 within 3 h |
| Site advantage, scenario 2 | peritoneal leads subcutaneous by **11.6 min** (needs 9 to 14) |
| Safety invariants, 10 000 randomised fault sequences | **0 violations** over 24 000 000 checked simulated seconds; reached invalid in 5113 sequences, doubtful-one in 6217, suspend in 542 |
| Basal is non-increasing in uncertainty, 100 000 random inputs | **0 violations** |
| Photobleaching at day 365 | **52.8 %** (needs 45 to 65) |
| Capsule at day 365 | **tip A 113.2 um, tip B 135.4 um** (needs 90 to 140) |
| Fused difference against plasma over a whole year | **6.10 %** (needs under 12) |
| Frame rate at 1x, 60x, 600x, 1440x | **60.0 to 60.2 fps** |
| Engine cost | **1.59 us per simulated second** (budget 1000) |
| Traces against the headless runner | identical value for value |
| axe-core, WCAG 2.1 A and AA | **0 violations** |
| Keyboard reach | 82 of 83 interactive elements by Tab, all named |
| Colour audit | 20 red usages, **all** declaring insulin or invalid, 0 undeclared |
| Reduced motion | 0 elements animating; simulated clock and readouts still advancing |
| Visual bindings, 4 glucose levels and 3 ages | worst disagreement **0.000 %** (limit 2 %) |
| First-load JavaScript | **103 kB gzipped** (budget 300) |

---

## Bundle and Lighthouse

Production build, `npm run build`:

| Asset | Raw | Gzipped | Loaded |
| --- | --- | --- | --- |
| `index-*.js` | 232 kB | **72.2 kB** | on first paint |
| `motion-*.js` | 88 kB | **31.1 kB** | on first paint |
| `index-*.css` | 24 kB | 5.6 kB | on first paint |
| `sim.worker-*.js` | 42 kB | 14 kB | alongside, in the worker |
| **First-load JavaScript** | | **103.3 kB gzipped** | budget 300 kB |

`framer-motion` is loaded through `LazyMotion` with the `domAnimation` feature
set rather than in full, which is 31 kB gzipped instead of 45. It is used for
exactly two panel transitions and nothing else, because the design system has
no decorative motion for it to do.

Lighthouse 13.4.1 against the production build, headless Chromium, default
mobile throttling:

| Category | Score |
| --- | --- |
| Performance | **99** |
| Accessibility | **100** |
| Best practices | **100** |
| SEO | **100** |

First contentful paint 1.6 s, largest contentful paint 1.7 s, total blocking
time 130 ms, cumulative layout shift **0**. Zero failing audits in any
category.

---

## Deploying

`npm run build` produces a static `dist/`. It has no backend, makes no network
requests and stores nothing. Serve it from any static host, or open
`dist/index.html` over `file://` if your browser allows module workers from
that origin (most do not, so a static server is easier).

The honesty strip is not configurable and cannot be dismissed. If you are
publishing this anywhere someone might mistake it for a product, leave it
alone.

---

## What this bench is not

- It is not a validated model. The physiology is a minimal model with
  engineering estimates for parameters; the sensor models are plausible shapes
  with plausible constants, not measurements of hardware.
- It is not a claim that the device works. It is a claim about what the device
  is specified to do, made executable so that the specification can be argued
  with.
- The accuracy figures are the simulation compared against its own simulated
  plasma glucose. They are not a clinical mean absolute relative difference and
  should never be quoted as one.
- The multi-factor step on the clinician envelope is simulated and says so on
  screen. There is no identity provider and no backend of any kind.
