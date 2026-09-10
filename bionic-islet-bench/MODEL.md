# The model, as implemented

Every equation in the bench engine, written the way the code writes it, so a
reviewer can check the code against this document line by line rather than
taking the bench's word for anything.

**This is an illustrative simulation of a device that does not yet exist.
Every parameter is an engineering estimate or a figure taken from the build
brief. None of it is clinical data, and none of it has been validated against
a patient. It is not a medical device.**

Source of truth is `src/engine/`. Where this document and the code disagree,
the code is right and this document is a bug.

---

## 0. Conventions

| | |
| --- | --- |
| Timestep | `dt = 1` simulated second, fixed, everywhere |
| Integration | Forward Euler. The shortest time constant in the model is 1.7 min, so `dt` is 1/102 of it |
| Glucose | mmol/L |
| Fluxes | mmol/min |
| Insulin delivery | U/h; boluses in U |
| Plasma insulin | mU/L |
| Time | simulated seconds since implant; days where a rate is per day |
| Randomness | one seeded stream per named noise source, never `Math.random` |

`dt_min = 1/60`, `dt_day = 1/86400`.

Every random draw comes from `Rng.stream(name)`, a mulberry32 seeded with
`seed XOR fnv1a(name)`. Streams are independent, so adding a new noise source
does not shift the numbers drawn by the existing ones.

---

## 1. Physiology

### 1.1 Meal absorption

Two compartments with equal rate constants, so appearance peaks at `1/k`:

```
dQ1/dt = -k * Q1
dQ2/dt =  k * Q1 - k * Q2
Ra     =  f * k * Q2
```

A meal of `C` grams adds `C * 5.5506` mmol to `Q1`. With `k = 1/45 per min`,
appearance peaks at 45 min and is about 20 percent of peak at 3 h. `f = 0.9`.

Closed form for a single meal: `Ra(t) = f * D * k^2 * t * exp(-k t)`.

### 1.2 Endogenous glucose production

```
m   = 1 - kEGP * (Ip - Ib)
m   = m * 1.15                        while asleep and more than 5 h in
m   = clamp(m, 0.05, 1.8)
EGP = EGP_b * m
```

`kEGP = 0.022 per mU/L`, `EGP_b = 0.78 mmol/min`, `Ib = 15 mU/L`.

### 1.3 Plasma glucose

```
dGp/dt = (Ra + EGP - Uii) / Vg - X * Gp
```

`Vg = 11.2 L`, `Uii = 0.45 mmol/min`, `X` is remote insulin action in 1/min.

The brief writes this as `(Ra + EGP - Uii - X*Gp) / Vg`. The two are the same
expression if the insulin-dependent term in the brief's numerator is read as
`X * Gp * Vg`, which is the standard minimal-model form and the only reading
in which the units work.

Clamped to `[1.1, 33.0]` mmol/L. That clamp is a numerical guard, not
physiology, and it never binds in any of the nine scenarios.

### 1.4 Insulin

One compartment from delivery to plasma, because delivery is intraperitoneal
and there is no subcutaneous depot:

```
Ip_target = kI * u
dIp/dt    = (Ip_target - Ip) / tau_ins
```

`kI = 16.667 mU/L per U/h`, `tau_ins = 20 min`, `u` is total delivery in U/h
(basal plus any bolus in progress). At the default basal of 0.9 U/h,
`Ip_target = Ib = 15 mU/L`, so the body starts at steady state.

Remote action:

```
X_target = sens * (Xb + p2 * (Ip - Ib))
dX/dt    = (X_target - X) / tau_x
X        = max(0, X)
```

`p2 = 4.0e-4 per min per (mU/L)`, `tau_x = 25 min`.

`Xb` is derived rather than chosen, so that the body is at steady state at
`t = 0`:

```
Xb = (EGP_b - Uii) / (Vg * G0) = (0.78 - 0.45) / (11.2 * 6.0) = 4.911e-3 /min
```

The brief writes `dX/dt = (p2*(Ip - Ib) - X)/tau_x`, which has `X -> 0` at
basal insulin and would mean no insulin-dependent uptake at rest. The `Xb`
offset is the difference.

`sens` is the insulin sensitivity multiplier: `1.4` while exercising, `0.9`
while asleep, and both multiply if both are true.

### 1.5 Insulin on board

Relative to the nominal basal rate, so a suspend produces a real deficit:

```
dIOB/dt = (u - basalRate)/60 - IOB / tau_iob
IOB     = clamp(IOB, -2, 20) U
```

`tau_iob = 100 min`.

### 1.6 Compartments

```
dGip/dt = (Gp  - Gip) / tau_ip          tau_ip = 1.7 min
dGsc/dt = (Gp  - Gsc) / tau_sc          tau_sc = 13.1 min
dGs/dt  = (Gip - Gs)  / tau_cap         per tip
tau_cap = 0.5 + 0.06 * Cap_um  min
```

`Gsc` is the subcutaneous comparator. It is drawn as a ghost trace and is
never read by the arbitration or the controller. The engine has no path from
`Gsc` to a dose except through a bridged external monitor, which is a separate
state with its own autonomy ceiling.

The site advantage the bench claims is `tau_sc - tau_ip = 11.4 min`. Measured
on scenario 2 at the half height of the plasma excursion: **11.6 min**.

### 1.7 Peritoneal oxygen

```
pO2 = base * (1 - 0.15 * exercising) * exp(-Cap_B / 400)
```

`base = 40 mmHg`, or `18 mmHg` while the low-oxygen fault is set.

---

## 2. Ageing

All rates are per day; the engine advances them by `dt_day` each step.

### 2.1 Capsule

```
steroid  = steroidScale * 0.6 * exp(-age / 120)      tip A only
growth   = 0.9 * (1 - steroid) * (1 - 0.45)
dCap/dt  = growth - Cap / 600
```

The `-Cap / 600` remodelling sink is not in the brief; see DECISIONS.md
decision 4. `steroidScale` is 1 normally and 0 in scenario 9.

Tip B has no collar, so its capsule grows faster.

Measured at day 365 with the default parameters: **tip A 113.2 um, tip B
135.4 um**. Without the collar: **135.3 um on tip A**.

A flush multiplies `Cap` by 0.8 on both tips. An omental wrap adds 85 um to
one tip.

### 2.2 Photobleaching

```
counts  = counts0 * exp(-flashes / 700000) * (1 - 0.0016 * Cap) * wrapAtten
bleached = 1 - exp(-flashes / 700000)
```

One flash per acquisition. The ratio is unaffected; only the noise on it
changes, as `1/sqrt(counts)`.

Measured at day 365: **52.8 percent bleached**.

### 2.3 Enzyme and reference

```
enzyme   = exp(-age_B / 400)
driftMv  = 0.15 * (min(age, 500) + 3 * max(0, age - 500))
```

Both computed from age directly rather than integrated, so they cannot drift
numerically.

### 2.4 Fouling

```
df/dt = 0.000788 * (1 - f)         per day
```

A protein deposition event adds 0.35 at once; a flush halves it.

---

## 3. Optical front end, tip A

Acquired once per `acquisitionPeriod` (60 s, or 300 s when the battery is
low). If lead A is fractured the channel reports nothing at all.

```
sd_R  = 0.012 * sqrt(counts0 / counts)
R     = 0.80
      + 0.060 * driftA * Gs_A
      + 0.25 * mannitolOn
      + 0.004 * (T - 37)
      + N(0, sd_R)
```

The inverse model, using the temperature the device believes in, which is the
thermistor reading or an assumed 37.0 degC if it has failed:

```
R_comp = R - 0.004 * (T_known - 37)
g_raw  = (R_comp - 0.80) / 0.060
g_A    = calGainA * g_raw + calOffsetA
```

The mannitol offset is not subtracted, because the device does not know it is
there. That is the whole point of the interferent.

Reported uncertainty:

```
noise = (sd_R / 0.060) * calGainA * filterGain
cal   = min(1.5, 0.06 * daysSinceCalibration)
temp  = 0 if the thermistor is healthy, else 0.35
sd_A  = 0.15 + sqrt(noise^2 + cal^2 + temp^2)
```

`filterGain = 1/sqrt(n)` where `n` is the number of samples the reported
value will be averaged over, at most 3.

---

## 4. Electrochemical front end, tip B

```
fO2       = min(1, pO2 / 25)
g_eff     = min(Gs_B, 12) + max(0, Gs_B - 12) * fO2
S         = driftB * enzyme * (1 - 0.6 * f)
I         = 0.5
          + 2.0 * S * g_eff
          + interferents
          + 0.015 * driftMv
          + 2.0 * S * g_eff * 0.02 * (T - 37)
          + N(0, sd_I)
sd_I      = 0.35 + 0.22 * f
```

The brief writes the oxygen term as a multiplier "applied only above 12
mmol/L". Read literally as a multiplier on the whole signal it would be
discontinuous at 12; the `g_eff` form above is continuous and matches the
physical story, that oxygen demand outruns supply only in the part of the
reaction above 12 mmol/L.

Interferents ramp in and decay rather than stepping:

```
tau_elim = halfLife / ln 2
shape(t) = exp(-t/tau_elim) - exp(-t/tau_abs)
contribution = peak * max(0, shape(t)) / shape(t_peak)
```

Paracetamol: peak 8 nA, `tau_abs = 20 min`, half-life 240 min, so it peaks at
about 60 min. Vitamin C: peak 3 nA, `tau_abs = 8 min`, half-life 60 min.

Inverse model and uncertainty:

```
tempFactor = 1 + 0.02 * (T_known - 37)
g_raw      = (I - 0.5) / (2.0 * tempFactor)
g_B        = calGainB * g_raw + calOffsetB

noise = (sd_I / 2.0) * calGainB * filterGain
cal   = min(1.5, 0.06 * daysSinceCalibration)
foul  = 0.9 * f
temp  = 0 if the thermistor is healthy, else 0.35
sd_B  = 0.15 + sqrt(noise^2 + cal^2 + foul^2 + temp^2)
```

### 4.1 Impedance

Swept once per simulated hour:

```
Z_expected = 4.2 * (1 + 3*f) * (1 + 0.004 * Cap_B) * wrapImpedanceFactor
Z          = Z_expected * (1 + N(0, 0.01))
```

If lead B is fractured, `Z` reads the open-circuit sentinel.

---

## 5. Filtering and the health evidence

### 5.1 Reported value

Each channel reports the mean of its last three acquisitions. That is what the
supervisor arbitrates on, what the controller doses on and what the traces
draw. It costs about one minute of extra lag, and the `filterGain` above
already reflects the noise reduction. The unfiltered value is kept and used
only for the rate-of-change check.

### 5.2 Baselines

The supervisor cannot see the model. It compares against its own smoothed
history, with a five day time constant, updated once per acquisition:

```
baseline += (measured - baseline) * (acquisitionPeriod / (5 * 86400))
```

This is why slow ageing is tracked into the baseline and a step change is not.

### 5.3 Health score

Each tip starts at 1 and loses:

| Evidence | Loss |
| --- | --- |
| Lead fractured | health set to 0 |
| Impedance more than 35 percent from its own baseline (tip B) | 0.5 |
| Optical return below 55 percent of its own baseline (tip A) | 0.5 |
| Fouling above 45 percent | `0.6 * (f - 0.45) / 0.55` |
| Rate of change beyond the threshold below | 0.5 |
| Thermistor failed | 0.15, both tips |

The rate-of-change threshold allows for the channel's own noise, because a
fixed physiological threshold applied to noisy samples is a noise detector,
not a plausibility check:

```
span      = 3 acquisitions, in minutes
rate      = |g(t) - g(t - span)| / span
threshold = 0.35 + 3 * sd * sqrt(2) / span
```

A tip is flagged when its health falls below 0.6.

---

## 6. Calibration

A finger-prick reads `N(Gp, 0.4)` mmol/L. Each channel's gain is fitted to it:

```
calGain = clamp(meter / g_uncalibrated, 0.2, 5)
calOffset = 0
```

One point fits a gain and nothing else. That is deliberate: it is why an
offset drift such as chloride depletion survives calibration and shows up as a
slow error that widens with time since calibration.

A calibration happens at implant, whenever the device prompts (every 7 days)
unless the missed-calibration fault is set, and whenever the user asks. One
hour of unexplained disagreement additionally **requests** a calibration but
does not perform one, because calibrating during an interferent would bake the
interferent into the gain.

---

## 7. Fusion and arbitration

### 7.1 State

```
aliveX   = the channel produced a number
flaggedX = health < 0.6
agree    = |g_A - g_B| <= max(1.0, 0.15 * mean(g_A, g_B))
```

| Condition | State |
| --- | --- |
| Neither alive | `invalid` |
| One alive, and it is flagged | `invalid` |
| One alive, not flagged | `doubtful-one` |
| Both flagged | `invalid` |
| Exactly one flagged | `doubtful-one`, trusting the other |
| Neither flagged, agree | `valid` |
| Neither flagged, disagree | `invalid` |

If the result is `invalid` and an external monitor is bridged, the state
becomes `bridged`.

### 7.2 Fused value

| State | Fused output | Uncertainty |
| --- | --- | --- |
| `valid` | inverse-variance weighted mean of A and B | `1 / sqrt(1/sd_A^2 + 1/sd_B^2)` |
| `doubtful-one` | the trusted channel | that channel's `sd`, times 1.6 |
| `invalid` | mean of whatever is alive, for display only | at least 2.5, or half the disagreement |
| `bridged` | `N(Gsc, 0.5)` | 1.2 |

The rate is a least-distance slope over the last 10 simulated minutes of fused
values.

### 7.3 Evidence score and autonomy

```
agreementQuality = clamp(1 - |g_A - g_B| / window, 0, 1), or 0 if either is dead
evidence = clamp(0.6 * mean(health_A, health_B)
                 + 0.4 * agreementQuality
                 + 0.15 * bridged, 0, 1)
```

Autonomy is an ordered level:

| Level | Name | What it allows |
| --- | --- | --- |
| 3 | full | basal modulation, meal boluses, correction boluses |
| 2 | basal modulation only | basal within a tighter ceiling, no boluses |
| 1 | safe basal | a fixed rate at or below the nominal basal, no boluses |
| 0 | suspend | nothing |

Target from the state: `valid -> 3`, `doubtful-one -> 2`, `bridged -> 2`,
`invalid -> 1 or 0` depending on the envelope.

The transition rule, which is where the safety invariant lives:

```
if target <= current:
    autonomy = target                       # falls immediately, always
else:
    evidenceFell = evidence < previousEvidence
    stableHeld   = 15 min of stable evidence
    if not evidenceFell and (stableHeld or freshCalibration):
        autonomy = target
```

Autonomy therefore cannot rise in a step where the evidence falls. That is the
brief's rule, implemented directly rather than tested for after the fact. The
property test over 10 000 randomised fault sequences confirms it holds across
24 000 000 checked simulated seconds.

"Stable evidence" means two healthy tips agreeing, or a bridged monitor while
the state is `bridged`. That is why bridging lifts a suspended device to basal
modulation after 15 min, and never to full.

---

## 8. Controller and pump

All of this is in `src/engine/controller.ts` as pure functions, so the safety
properties can be tested directly.

### 8.1 Basal

```
k           = 1.0 at full autonomy, 2.0 at reduced
lowerBound  = fused - k * sd_fused
error       = lowerBound - target
integral   += ki * error * dt_min, clamped to +-1.6 U/h
proposed    = basalRate + kp*error + integral + kd*rate - 0.05 * max(0, IOB)
ceiling     = maxBasal at full autonomy
            = min(maxBasal, 1.5 * basalRate) at reduced
basal       = clamp(proposed, 0, ceiling)
```

`kp = 0.55`, `ki = 0.0016`, `kd = 9.0`.

**The controller doses on the lower edge of the confidence band, never on the
point estimate.** This is what makes "a doubtful reading can never buy more
insulin" a property of the arithmetic rather than a promise. The property test
checks it over 100 000 randomised inputs: `basal(u1) >= basal(u2)` whenever
`u1 < u2`.

### 8.2 Predictive suspend

```
predicted = lowerBound + rate * suspendHorizon
if predicted < suspendThreshold: basal = 0
```

Defaults: 20 min horizon, 4.0 mmol/L.

### 8.3 Boluses

Full autonomy only.

```
meal:       units = clamp(carbs / icr, 0, maxBolus)
correction: predicted30 = lowerBound + rate * 30
            units = clamp((predicted30 - target)/isf - max(0, IOB), 0, maxBolus)
            only if predicted30 > correctionThreshold
            and at least 30 min since the last correction
```

Both are refused below `minBolusUnits = 0.2 U`. A bolus is delivered at
`maxBolus / 5` U per minute.

**Any drop below full autonomy stops a bolus already in flight** and logs how
many units went undelivered. The property test found this: without it, a bolus
authorised at full autonomy kept delivering after the supervisor had dropped
to `doubtful-one`.

### 8.4 Envelope normalisation

Applied wherever an envelope enters the engine, including a clinician changing
it mid-run:

```
maxBasal  = max(0, maxBasal)
basalRate = min(max(0, basalRate), maxBasal)
safeBasal = min(max(0, safeBasal), basalRate)
maxBolus  = max(0, maxBolus)
```

A tightened ceiling also trims a bolus already in flight and the current basal
command. The property test found that too.

---

## 9. Faults

| Fault | What it does to the model |
| --- | --- |
| Paracetamol | adds up to 8 nA to `I`, absorbed over about an hour, 4 h half-life |
| Mannitol | adds 0.25 to `R` while set, about 4.2 mmol/L of apparent glucose |
| Vitamin C | adds up to 3 nA to `I`, 1 h half-life |
| Exercise | `sens *= 1.4`, `pO2 *= 0.85` |
| Low oxygen | `base pO2 = 18 mmHg` |
| Protein deposition | `f += 0.35` on tip B |
| Omental wrap | `Cap += 85 um`, optical return to 45 percent, impedance factor 1.8 |
| Lead A fracture | tip A reports nothing |
| Lead B fracture | tip B reports nothing, impedance reads open circuit |
| Thermistor failure | temperature compensation assumes 37.0 degC, both bands widen by 0.35 |
| Telemetry loss | radio off. Nothing inside the body changes |
| Phone lost | MedSync stops hearing. Nothing inside the body changes |
| Battery low | acquisition period 60 s to 300 s |
| Missed calibration | the patient stops answering prompts |
| Unannounced meal | a meal the controller is not told about |
| Envelope change | new bounds, normalised, with an audit entry |
| Flush | `Cap *= 0.8`, `f *= 0.5`, wrap partially cleared, both tips |
| Tip exchange | that tip's ageing, fouling and lead integrity reset |

---

## 10. Scoreboard

Over every sample the run produced, not only the ones the trace buffer still
holds:

```
timeInRange  = fraction of samples with 3.9 <= Gp <= 10.0
timeBelow39  = fraction with Gp < 3.9
timeBelow30  = fraction with Gp < 3.0
MARD         = mean over samples of |fused - Gp| / Gp
```

`MARD` here is against the simulated plasma value, which a real device would
not have. It is not a clinical mean absolute relative difference: there is no
reference meter and no patient.

---

## 11. Visual bindings

Three drawn quantities are the engine's numbers rather than decoration, and
each has an exact inverse in `src/components/stage/visualMapping.ts`:

```
glowBrightness(R)        = clamp(0.12 + (R - 0.80)/1.20 * 0.88, 0.12, 1)
electronPeriodSeconds(I) = clamp(12 / (I + 0.5), 0.15, 6)     seconds
capsuleRadius(um)        = 9 + 0.075 * um                     drawing units
tipCapsuleRadius(um)     = 62 + 0.42 * um                     drawing units
```

`scripts/visual-binding.mjs` reads each rendered attribute back, inverts it,
and compares against the same quantity as printed by the readouts panel, which
is a different code path. Measured worst disagreement across four glucose
levels and three ages: **0.000 percent**, against a 2 percent limit.

The supporting mappings, which are derived from state but are not part of the
checked three:

```
dockingPeriodSeconds(G)     = clamp(9 / (G + 1), 0.35, 9)
crossingPeriodSeconds(G, f) = clamp(10 / ((G + 1) * max(1 - 0.6f, 0.15)), 0.4, 14)
collarHaloRadius(steroid)   = 74 + 46 * steroid
```

---

## 12. Where the brief contradicts itself

Recorded here as well as in DECISIONS.md, because a reviewer checking the
equations will want it in the same place as the equations.

| The brief says | Where | This model | Why |
| --- | --- | --- | --- |
| `Vg = 1.6 L/kg` | 2.1 | 1.6 dL/kg, 11.2 L | 112 L cannot produce the 8 to 12 mmol/L peak the brief's own check requires |
| `N_half = 900 000` flashes | 2.2 | 700 000 | 900 000 puts day 365 at 44.2 percent, outside the brief's own 45 to 65 percent band |
| Capsule is a pure ramp | 2.2 | plus a `-Cap/600` sink | A pure ramp has no steady state, and integrates to 147 um at day 365, above the brief's 90 to 140 band |
| Capsule at steady state at 6 months | scenario 5 | 54 um and still growing | Cannot both plateau at 6 months and reach 90 to 140 um at 12 |
| Photobleaching about 50 percent at 6 months | scenario 5 | 31 percent | 50 percent at 6 months forces 75 percent at 12, above the band |
| Enzyme about 85 percent at 6 months | scenario 5 | 64 percent | 85 percent at 6 months needs `T_enz = 1107` days, not the 400 the brief states |
| `dX/dt = (p2*(Ip-Ib) - X)/tau_x` | 2.1 | plus the `Xb` offset | Without it there is no insulin-dependent uptake at rest and the body is not at steady state |
| Interferent adds `+8 nA` | 2.3 | ramps to 8 nA over about an hour | A step trips the rate-of-change check, which would blame tip B and hide the point scenario 3 makes |

---

## 13. Every constant

Generated from `src/engine/params.ts` by `npm run params -- --markdown`, so it
cannot drift from the code. Provenance is one of:

- **brief** the value is written in the build brief and used as written
- **deviation** the brief gives a value, this differs, and DECISIONS.md says why
- **textbook** a conventional value from published physiological modelling
- **estimate** an engineering estimate chosen here, not from any document

| Parameter | Value | Unit | Provenance | Justification |
| --- | --- | --- | --- | --- |
| `PHYSIOLOGY.bodyMassKg` | 70 | kg | brief | The brief's subject. |
| `PHYSIOLOGY.glucoseVolumeL` | 11.2 | L | deviation | 1.6 dL/kg x 70 kg, the standard minimal-model volume. The brief writes 1.6 L/kg, which is ten times larger and cannot produce the peak the brief's own acceptance check requires. See DECISIONS.md decision 2. |
| `PHYSIOLOGY.startingGlucose` | 6 | mmol/L | brief | The brief's starting value. |
| `PHYSIOLOGY.egpBasal` | 0.78 | mmol/min | textbook | About 2 mg/kg/min of basal hepatic glucose output. |
| `PHYSIOLOGY.uptakeInsulinIndependent` | 0.45 | mmol/min | textbook | Central nervous system and red cell uptake, roughly 120 g/day. |
| `PHYSIOLOGY.egpInsulinSensitivity` | 0.022 | per mU/L | estimate | Engineering estimate, tuned so production is suppressed to about a fifth at 40 mU/L above basal. |
| `PHYSIOLOGY.egpMultiplierMin` | 0.05 |  | estimate | Engineering estimate. A floor so production never goes negative. |
| `PHYSIOLOGY.egpMultiplierMax` | 1.8 |  | estimate | Engineering estimate. A ceiling for the dawn window. |
| `PHYSIOLOGY.insulinBasal` | 15 | mU/L | textbook | A conventional fasting plasma insulin. |
| `PHYSIOLOGY.insulinGainPerUnitPerHour` | 16.6667 | mU/L per U/h | estimate | Engineering estimate, chosen so the default 0.9 U/h basal holds plasma insulin at its basal value. |
| `PHYSIOLOGY.tauInsulinMin` | 20 | min | brief | The brief's delivery to plasma lag for intraperitoneal insulin. |
| `PHYSIOLOGY.tauActionMin` | 25 | min | brief | The brief's remote insulin action lag. |
| `PHYSIOLOGY.p2` | 0.0004 | 1/min per mU/L | estimate | Engineering estimate, tuned so one unit lowers glucose by about the default sensitivity factor of 2.8 mmol/L. |
| `PHYSIOLOGY.mmolPerGramCarb` | 5.55062 | mmol/g | textbook | 1000 divided by the molar mass of glucose, 180.16 g/mol. |
| `PHYSIOLOGY.mealBioavailability` | 0.9 |  | estimate | Engineering estimate. Nine tenths of ingested carbohydrate reaching plasma. |
| `PHYSIOLOGY.mealAbsorptionRate` | 0.0222222 | 1/min | brief | The brief's two-compartment absorption peaking at 45 min, with about a fifth of peak still arriving at 3 h. |
| `PHYSIOLOGY.exerciseSensitivityGain` | 0.4 |  | brief | The brief's 40 percent rise in insulin sensitivity. |
| `PHYSIOLOGY.exerciseOxygenDrop` | 0.15 |  | brief | The brief's 15 percent fall in peritoneal oxygen. |
| `PHYSIOLOGY.sleepSensitivityFactor` | 0.9 |  | estimate | Engineering estimate. The brief lists sleep as a control but says nothing about its effect. |
| `PHYSIOLOGY.dawnProductionFactor` | 1.15 |  | estimate | Engineering estimate for the dawn phenomenon. |
| `PHYSIOLOGY.dawnWindowMin` | 120 | min | estimate | Engineering estimate for how long the dawn window lasts. |
| `PHYSIOLOGY.tauPeritonealMin` | 1.7 | min | brief | The brief's plasma to peritoneal fluid equilibration. |
| `PHYSIOLOGY.tauSubcutaneousMin` | 13.1 | min | brief | The brief's subcutaneous comparator. Drawn as a ghost trace and never used for dosing. |
| `PHYSIOLOGY.tauCapsuleBaseMin` | 0.5 | min | brief | The brief's tissue lag at zero capsule thickness. |
| `PHYSIOLOGY.tauCapsulePerMicron` | 0.06 | min per um | brief | The brief's extra lag per micrometre of capsule. |
| `PHYSIOLOGY.oxygenNominalMmHg` | 40 | mmHg | brief | The brief's nominal peritoneal oxygen tension. |
| `PHYSIOLOGY.oxygenFaultMmHg` | 18 | mmHg | estimate | Engineering estimate. The brief lists a low-oxygen fault but gives no value. |
| `PHYSIOLOGY.oxygenCapsuleScaleMicron` | 400 | um | estimate | Engineering estimate. The brief says a thicker capsule lowers oxygen but gives no rate. |
| `PHYSIOLOGY.glucoseFloor` | 1.1 | mmol/L | estimate | A numerical guard, not physiology. |
| `PHYSIOLOGY.glucoseCeiling` | 33 | mmol/L | estimate | A numerical guard, not physiology. |
| `AGEING.capsuleGrowthPerDay` | 0.9 | um/day | brief | The brief's bare capsule growth rate. |
| `AGEING.coatEffect` | 0.45 |  | brief | The brief's zwitterionic coat suppression. |
| `AGEING.steroidEffect0` | 0.6 |  | brief | The brief's peak steroid suppression. |
| `AGEING.steroidTauDays` | 120 | days | brief | The brief's steroid elution time constant. |
| `AGEING.capsuleRemodelTauDays` | 600 | days | deviation | An added sink term. The brief's capsule equation is a pure ramp with no steady state, and integrating it lands day 365 at 147 um, above the brief's own 90 to 140 um band. See DECISIONS.md decision 4. |
| `AGEING.flushRemovalFraction` | 0.2 |  | brief | The brief's 20 percent of the surface layer removed by a flush. |
| `AGEING.omentalWrapMicron` | 85 | um | estimate | Engineering estimate. The brief says a wrap is a large capsule step but gives no size. |
| `AGEING.photobleachHalfScaleFlashes` | 700000 | flashes | deviation | The brief says 900 000 and calls it about one year at one flash per minute. Those disagree, and 900 000 puts day 365 at 44.2 percent, outside the brief's own 45 to 65 percent band. See DECISIONS.md decision 3. |
| `AGEING.enzymeTauDays` | 400 | days | brief | The brief's glucose oxidase decay time constant. |
| `AGEING.chlorideDriftMvPerDay` | 0.15 | mV/day | brief | The brief's silver chloride reference drift. |
| `AGEING.chlorideKneeDay` | 500 | day | brief | The brief's day beyond which chloride depletion accelerates. |
| `AGEING.chlorideAccelFactor` | 3 |  | estimate | Engineering estimate. The brief says the drift accelerates past day 500 but not by how much. |
| `AGEING.chlorideOffsetNaPerMv` | 0.015 | nA/mV | estimate | Engineering estimate converting reference drift into a background current offset. |
| `AGEING.foulingRatePerDay` | 0.000788 | 1/day | estimate | Engineering estimate. First-order approach to fully fouled, reaching about 25 percent at one year. |
| `AGEING.foulingEventStep` | 0.35 |  | estimate | Engineering estimate. The brief says fouling jumps on a deposition event but not by how much. |
| `AGEING.flushFoulingRemoval` | 0.5 |  | estimate | Engineering estimate for how much fouling a flush clears. |
| `OPTICAL.ratioZero` | 0.8 |  | brief | The brief's fluorescence ratio at zero glucose. |
| `OPTICAL.ratioPerMmol` | 0.06 | per mmol/L | brief | The brief's ratio gain. |
| `OPTICAL.mannitolOffset` | 0.25 |  | brief | The brief's mannitol offset on the ratio. |
| `OPTICAL.sorbitolOffset` | 0.18 |  | estimate | Engineering estimate. The brief names sorbitol as an interferent but gives no size. |
| `OPTICAL.ratioPerDegC` | 0.004 | per degC | brief | The brief's temperature term. |
| `OPTICAL.ratioNoiseSd0` | 0.012 | ratio | estimate | Engineering estimate. 0.012 on a gain of 0.06 per mmol/L is about 0.2 mmol/L at day zero. |
| `OPTICAL.flashesPerAcquisition` | 1 | flashes | brief | One flash per acquisition, as the brief describes. |
| `OPTICAL.counts0` | 100000 | counts | estimate | Arbitrary units. Only the ratio of counts to counts matters. |
| `OPTICAL.opticalLossPerMicron` | 0.0016 | fraction per um | estimate | Engineering estimate for scattering loss through the capsule. Drives the optical-loss health flag. |
| `ELECTROCHEMICAL.currentZeroNa` | 0.5 | nA | brief | The brief's background current. |
| `ELECTROCHEMICAL.currentPerMmolNa` | 2 | nA per mmol/L | brief | The brief's current gain. |
| `ELECTROCHEMICAL.oxygenSaturationMmHg` | 25 | mmHg | brief | The brief's oxygen saturation point. |
| `ELECTROCHEMICAL.oxygenLimitThreshold` | 12 | mmol/L | brief | The brief's threshold above which oxygen limits. |
| `ELECTROCHEMICAL.foulingSensitivityCoefficient` | 0.6 |  | brief | The brief's 0.6 times fouling loss of sensitivity. |
| `ELECTROCHEMICAL.foulingImpedanceCoefficient` | 3 |  | brief | The brief's one plus three times fouling impedance rise. |
| `ELECTROCHEMICAL.impedanceBaseKohm` | 4.2 | kOhm | estimate | Engineering estimate. The brief gives no absolute impedance, only how it moves. |
| `ELECTROCHEMICAL.impedanceCapsulePerMicron` | 0.004 | fraction per um | estimate | Engineering estimate for how capsule thickness raises impedance. |
| `ELECTROCHEMICAL.impedanceOpenCircuitKohm` | 9999 | kOhm | estimate | A sentinel for a fractured lead, not a measurement. |
| `ELECTROCHEMICAL.paracetamolPeakNa` | 8 | nA | brief | The brief's paracetamol contribution. |
| `ELECTROCHEMICAL.paracetamolTauAbsorbMin` | 20 | min | estimate | Engineering estimate. The brief implies a step; an oral drug ramps in, and a step would trip the rate-of-change check and hide the point scenario 3 makes. See DECISIONS.md. |
| `ELECTROCHEMICAL.paracetamolHalfLifeMin` | 240 | min | brief | The brief's 4 hour half-life. |
| `ELECTROCHEMICAL.vitaminCPeakNa` | 3 | nA | brief | The brief's vitamin C contribution. |
| `ELECTROCHEMICAL.vitaminCTauAbsorbMin` | 8 | min | estimate | Engineering estimate, as for paracetamol. |
| `ELECTROCHEMICAL.vitaminCHalfLifeMin` | 60 | min | brief | The brief's 1 hour half-life. |
| `ELECTROCHEMICAL.currentNoiseSdNa` | 0.35 | nA | estimate | Engineering estimate. 0.35 nA on a gain of 2.0 nA per mmol/L is about 0.18 mmol/L, in line with published continuous monitor noise. |
| `ELECTROCHEMICAL.currentNoiseFoulingNa` | 0.22 | nA | estimate | Engineering estimate for extra noise from a fouled membrane. |
| `SENSING.acquisitionPeriodS` | 60 | s | brief | The brief's once per 60 s acquisition. |
| `SENSING.impedanceSweepPeriodS` | 3600 | s | brief | The brief's hourly impedance sweep. |
| `SENSING.tipTemperatureC` | 37 | degC | estimate | Body temperature. |
| `SENSING.tipTemperatureNoiseC` | 0.05 | degC | estimate | Engineering estimate for thermistor noise. |
| `SENSING.thermistorFallbackC` | 37 | degC | estimate | What the device assumes when the thermistor has failed. |
| `SENSING.meterErrorSd` | 0.4 | mmol/L | brief | The brief's finger-prick meter error. |
| `SENSING.uncertaintyPerDaySinceCal` | 0.06 | mmol/L per day | estimate | Engineering estimate. The brief says time since calibration widens uncertainty but not by how much. |
| `SENSING.uncertaintyPerFouling` | 0.9 | mmol/L | estimate | Engineering estimate for how fouling widens the band. |
| `SENSING.uncertaintyFloor` | 0.15 | mmol/L | estimate | Nothing is ever claimed to be more certain than this. |
| `SENSING.calibrationIntervalDays` | 7 | days | estimate | Engineering estimate for how often the device prompts for a reference reading. |
| `SENSING.sensorDriftSd` | 0.025 | fraction | estimate | Not in the brief. Added because without drift the only error left is white noise, which the filter removes, and the bench would claim an accuracy no real sensor has. See DECISIONS.md decision 6. |
| `SENSING.sensorDriftTauDays` | 3 | days | estimate | Engineering estimate for the drift correlation time. |
| `ARBITRATION.agreeAbsolute` | 1 | mmol/L | brief | The brief's absolute part of the agreement window. |
| `ARBITRATION.agreeRelative` | 0.15 |  | brief | The brief's relative part of the agreement window. |
| `ARBITRATION.healthFlagThreshold` | 0.6 |  | estimate | Engineering estimate. The brief describes health evidence but sets no threshold. |
| `ARBITRATION.rateImplausibleMmolPerMin` | 0.35 | mmol/L per min | estimate | Engineering estimate. 0.35 mmol/L per min is about 21 mmol/L per hour, faster than physiology allows. |
| `ARBITRATION.impedanceStepFlagFraction` | 0.35 |  | estimate | Engineering estimate for what counts as a step against the device's own baseline. |
| `ARBITRATION.opticalLossFlagFraction` | 0.55 |  | estimate | Engineering estimate for what counts as lost optical return. |
| `ARBITRATION.foulingFlagLevel` | 0.45 |  | estimate | Engineering estimate for the fouling that starts to count against a tip. |
| `ARBITRATION.recoveryHoldMin` | 15 | min | brief | The brief's 15 minutes of restored agreement before autonomy may rise. |
| `CONTROLLER.kp` | 0.55 | U/h per mmol/L | estimate | Engineering estimate, tuned on the ordinary-day scenario. |
| `CONTROLLER.ki` | 0.0016 | U/h per mmol/L per min | estimate | Engineering estimate, tuned on the ordinary-day scenario. |
| `CONTROLLER.kd` | 9 | U/h per mmol/L per min | estimate | Engineering estimate, tuned on the ordinary-day scenario. |
| `CONTROLLER.integralClamp` | 1.6 | U/h | estimate | Anti-windup bound. Engineering estimate. |
| `CONTROLLER.tauIobMin` | 100 | min | estimate | Engineering estimate for how long delivered insulin counts as on board. |
| `CONTROLLER.iobFeedbackFraction` | 1 |  | estimate | A correction bolus is reduced by the full insulin on board. |
| `CONTROLLER.iobBasalFraction` | 0.05 | U/h per U | estimate | Engineering estimate. Deliberately small: a large value made announcing a meal worse than not announcing it. |
| `CONTROLLER.correctionIntervalMin` | 30 | min | estimate | Engineering estimate for the minimum gap between corrections. |
| `CONTROLLER.minBolusUnits` | 0.2 | U | estimate | The smallest dose a pump of this class would deliver. |
| `CONTROLLER.bolusDeliveryMin` | 5 | min | estimate | Engineering estimate for how long a full bolus takes to deliver. |
| `CONTROLLER.correctionHorizonMin` | 30 | min | estimate | Engineering estimate for the correction prediction horizon. |
| `CONTROLLER.confidenceKFull` | 1 |  | estimate | The controller doses one standard deviation below the estimate at full autonomy. |
| `CONTROLLER.confidenceKReduced` | 2 |  | estimate | Two standard deviations at reduced autonomy. This is what makes a wider band always mean less insulin. |
| `CONTROLLER.reducedBasalCeilingFactor` | 1.5 |  | estimate | Engineering estimate. At reduced autonomy the basal ceiling is 1.5 times the nominal rate. |
| `ENVELOPE_DEFAULT.basalRate` | 0.9 | U/h | brief | The brief's default basal rate. |
| `ENVELOPE_DEFAULT.maxBasal` | 3 | U/h | brief | The brief's hard basal bound. |
| `ENVELOPE_DEFAULT.maxBolus` | 4 | U | brief | The brief's hard bolus bound. |
| `ENVELOPE_DEFAULT.target` | 6.5 | mmol/L | estimate | Engineering estimate. The brief sets bounds but no target. |
| `ENVELOPE_DEFAULT.correctionThreshold` | 10 | mmol/L | estimate | Engineering estimate for when a correction is considered. |
| `ENVELOPE_DEFAULT.suspendThreshold` | 4 | mmol/L | brief | The brief's predicted-glucose suspend threshold. |
| `ENVELOPE_DEFAULT.suspendHorizonMin` | 20 | min | brief | The brief's 20 minute suspend prediction horizon. |
| `ENVELOPE_DEFAULT.isf` | 2.8 | mmol/L per U | estimate | Engineering estimate for the insulin sensitivity factor. |
| `ENVELOPE_DEFAULT.icr` | 10 | g per U | estimate | Engineering estimate for the insulin to carbohydrate ratio. |
| `ENVELOPE_DEFAULT.safeBasal` | 0.6 | U/h | estimate | Engineering estimate. Forced at or below the nominal rate by normaliseEnvelope, so falling back can never raise insulin. |
| `ENVELOPE_DEFAULT.onInvalid` | safe-basal |  | brief | The brief's choice between safe basal and suspend on invalid. |
| `RANGES.inRangeLow` | 3.9 | mmol/L | brief | The brief's time-in-range lower bound. |
| `RANGES.inRangeHigh` | 10 | mmol/L | brief | The brief's time-in-range upper bound. |
| `RANGES.hypoLevel1` | 3.9 | mmol/L | brief | The brief's level 1 hypoglycaemia threshold. |
| `RANGES.hypoLevel2` | 3 | mmol/L | brief | The brief's level 2 hypoglycaemia threshold. |
