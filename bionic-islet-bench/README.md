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

## The probes, from first principles

The two sensing probes are not transfer functions. They are diffusion,
chemistry and photon counting, solved.

`src/engine/probes` holds them, and nothing in it knows the bench exists.
`MODEL-PROBES.md` is the reviewer's copy: every equation as implemented, with
the constant behind each symbol.

- **Transport.** One-dimensional finite volume through a stack of layers,
  solved in partition-normalised concentration so an interface is an ordinary
  face. Fully implicit, block tridiagonal Newton, adaptive substepping.
  Checked against four analytic solutions; mass closes to 1.4e-14.
- **The optical probe.** Competitive boronate binding with pH and van 't Hoff
  terms, a photoinduced electron transfer switch that is three rate constants
  competing for one excited state, and exact Poisson photon counting.
- **The enzymatic probe.** Ping-pong bi-bi kinetics with both glucose anomers,
  eight species across six films, peroxide that destroys the enzyme that made
  it, a silver chloride reference that is spent at the signal current, and a
  Randles cell.

Every constant is in one file with a symbol, a unit and a provenance. Nothing
numeric appears inline anywhere else in the directory, with one stated
exception. 62 of the 118 constants are engineering estimates and are marked
`est` wherever a figure is shown that rests on one.

**What that buys.** Things the bench used to declare, it now produces:

- The response is linear from 3 to 25 mmol/L because the outer membrane
  starves the enzyme to 25 parts per million of its Michaelis constant, not
  because a straight line was written down.
- The electrode returns one oxygen for every peroxide it oxidises, so the
  probe recycles almost all of its own oxygen and oxygen limitation never
  appears. Switch the recycling off under the lens and the same probe at
  2 mmHg loses half its current.
- Both dyes bleach at the same fractional rate, so the counts halve and the
  reading does not move.
- A year at 6 mmol/L leaves 11 per cent of the enzyme and costs 0.15 per cent
  of the sensitivity. Ageing arrives as a knee, not a fade.
- An infused polyol reads *high*, because the switch is the boron holding a
  diol and it cannot tell which diol.

Some of those disagree with the front end the bench shipped with, sometimes by
a lot. `npm run compare` prints both, side by side, on four scenarios. Where
they differ, `DECISIONS.md` says which changed and why, and the answer is
never that a constant was adjusted to make a number come out.

### Under the lens

The device stage zooms four times, from the body down to a tip, and stops at
the layer stack. **Under the lens** is the level below that.

A strip across the top draws the whole probe to scale, every film at its real
thickness. A lens sits on one of them, and the drawing underneath is that film
blown up until the mechanism inside it is visible: the molecules that arrive,
what happens to them, and what leaves. Eight stations, five on the enzymatic
tip and three on the optical one, each opening with the question it answers.

Nothing in the drawing is an illustration of the model. How many molecules are
drawn in a band is its solved concentration; how often an enzyme turns over is
its rate law; how often an electron reaches the amplifier is the current; which
receptors are lit is the occupancy the isotherm gives. Move a dial and the
drawing changes because the solver ran again.

Three scales are compressed, and each one says so on the drawing rather than
leaving it to be assumed:

- **The strip is to scale, the drawing is not.** The caption states the factor:
  the permselective film is one micron of a hundred and fourteen, so its
  drawing is a hundred and fourteen times closer than the strip.
- **Molecule counts are logarithmic**, because the species in one stack differ
  by six orders of magnitude. Where that understates the point, as it does
  either side of the glucose-limiting membrane, the drawing prints both
  concentrations and the ratio next to the counts it drew.
- **Rates are sped up.** One enzyme turns over about once every 279 seconds at
  6 mmol/L, which is what starving it on purpose costs; the drawing runs a
  cycle every 4.5 seconds and says by what factor.

Each station shows only the dials it actually responds to, and says what to
watch when you move one. Six preset experiments state their claim before you
run them, set the conditions and move the lens to where the claim is visible.
All six are asserted in the test suite, so a card that stops being true fails a
test, and so is every station's lens position, so a layer renamed in the engine
fails a test rather than quietly leaving the lens spanning the whole probe.

Under `prefers-reduced-motion` every molecule freezes where it is and every
number keeps updating, because the point of the drawing is the arrangement.

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
| `index-*.js` | 335 kB | **104.6 kB** | on first paint |
| `motion-*.js` | 88 kB | **30.8 kB** | on first paint |
| `index-*.css` | 26 kB | 5.9 kB | on first paint |
| `sim.worker-*.js` | 104 kB | 33.5 kB | alongside, in the worker |
| **First-load JavaScript** | | **135.4 kB gzipped** | budget 300 kB |

The first-load figure went from 103.3 kB to 135.4 kB across the probe physics
work. The lens view imports the solver, the two probe models and the constants
table directly, so all of it lands in the main chunk rather than in the
worker's. That is 32 kB gzipped for eight species of diffusion and reaction, a
Poisson sampler, a hundred and eighteen constants with their provenance and
eight magnified mechanisms, against a budget with 165 kB of headroom left. It
could be split out behind a dynamic import if the budget ever tightened; it
has not, so it is not.

`framer-motion` is loaded through `LazyMotion` with the `domAnimation` feature
set rather than in full, which is 31 kB gzipped instead of 45. It is used for
exactly two panel transitions and nothing else, because the design system has
no decorative motion for it to do.

Lighthouse 13.4.1 against the production build, headless Chromium, default
mobile throttling. **These are the phase 6 numbers and have not been re-run
since the probe physics landed**; the main chunk grew by 26 kB gzipped, which
will have moved the performance score and the paint timings somewhat:

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

### On the MedSync deployment, at /bioniccell

This is how the bench is actually shipped. It rides on the existing MedSync
Vercel project rather than a separate one, so it is on the same domain, the
same branch previews and the same deployment as the hospital application:

```
https://<any medsync deployment>/bioniccell
```

Three pieces make that work, all in the repository root:

| Piece | What it does |
| --- | --- |
| `public/bioniccell/` | the built bench, committed as static files |
| `next.config.ts` rewrite | `/bioniccell` serves `/bioniccell/index.html`, so the bare path works |
| `proxy.ts` matcher | excludes `/bioniccell`, so it is never auth-gated and pays no cookie refresh |

The bench build for this route uses `--base=/bioniccell/`, so its assets and
its worker resolve from an absolute path. That matters: with a relative base
the page served at `/bioniccell` asks for `/assets/...` and gets nothing.

**The MedSync build does not build the bench.** A broken bench build would
otherwise take the hospital application down with it. The built output is
committed, and regenerated deliberately:

```bash
npm run bench:embed     # from the repository root: build the bench, copy it into public/
```

Run that whenever the bench changes, and commit what it produces.

### As its own Vercel project

Also supported, if you would rather it had its own domain. `vercel.json` in
this directory configures it; deploy from here, not from the repository root,
which would deploy the Next.js application instead:

```bash
cd bionic-islet-bench
npx vercel --prod
```

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Root directory | `bionic-islet-bench` |
| Install command | `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |

The install command matters: the check scripts depend on Playwright, whose
postinstall would otherwise download a browser onto the builder for no reason.

### A single self-contained page

```bash
npm run build:single      # dist-single/bench-preview.html
```

One HTML file, about 370 kB, with the stylesheet, the bundle and the favicon
inlined and no external request of any kind. Useful for embedding the bench
somewhere that will not run a build, or for handing someone a copy that works
from a file.

The difference from the production build is where the simulation loop runs.
The normal build puts it in a Web Worker; the single-file build runs it on the
main thread, because a page embedded under a strict content policy may not be
allowed to spawn a worker at all. Both use the same `src/worker/simHost.ts`,
and all nine scenarios produce identical numbers either way. At 1440 times real
time the engine costs under 2 ms of processor time per wall-clock second, so
the main thread carries it without dropping a frame.

One thing does not survive the move: a page embedded in a sandboxed frame
cannot hand the viewer a file, so the comma-separated export writes its row
count to the screen but the file does not reach the disk. It works normally in
the production build.

### Before you put it on a public URL

The honesty strip is not configurable and cannot be dismissed. Leave it alone.

`public/robots.txt` currently allows crawling. This is a simulation of a device
that does not exist, dressed as an instrument panel; if the URL is public and
you would rather it did not turn up in search results, change that `Allow` to
`Disallow` before deploying.

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
