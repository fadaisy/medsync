# The probe models

Every equation the two sensing probes are built from, as implemented, with the
constant behind each symbol and where that constant came from.

This is the reviewer's copy. The code is the authority, `src/engine/probes`;
if this file and the code disagree, the code is right and this file is a bug.

---

## 1. What "provenance" means here, honestly

Every constant lives in one file, `src/engine/probes/constants.ts`, with a
symbol, a value, a unit and a provenance. Nothing numeric appears inline
anywhere else in that directory, with one stated exception in section 12.

The provenance is either the exact string `engineering estimate` or a
description of a class of source. **It is not a citation.** This build had no
access to a literature database, so a provenance like "glucose oxidase from
_Aspergillus niger_, standard enzymology reference range" says what kind of
document the number would come from and what system it describes. None of them
has been checked against a primary source.

Treat every one as a reviewable claim. There are 118 constants in 11 groups,
of which 62 are engineering estimates: properties of a device that does not
exist, chosen here because the model needed a value. Those carry an `est`
marker wherever a figure resting on one is shown.

The honest summary is that the *structure* of these models is defensible and
the *numbers* are a starting point. A reader who wants to know what the device
would really do should replace the constants, not the equations.

---

## 2. Units

`src/engine/probes/units.ts`. Everything inside the directory is SI. The
clinical units the bench speaks, millimoles per litre and nanoamperes and
minutes, are converted at the boundary in `bench.ts` and nowhere else.

Types are branded, so a concentration cannot be assigned to a flux:

```ts
type Brand<T, B extends string> = T & { readonly [brand]: B };
export type MolPerCubicMetre = Brand<number, "mol/m3">;
export type FluxMolPerM2S    = Brand<number, "mol/m2/s">;
```

The brands are erased at build time, so they cost nothing at runtime.

**What branding does not catch.** Arithmetic on two branded numbers yields a
plain `number`, so `length + time` compiles. TypeScript has no dimensional
algebra and simulating one with phantom types would make every formula in the
model unreadable. The branding catches assignment and argument mistakes, which
is where this class of bug actually happens; it does not catch arithmetic ones.
`tests/probes/units.test.ts` says so rather than implying otherwise.

One conversion is the identity and exists anyway:

```
1 mol/m3 = 1 mmol/L
```

`mmolPerLitreToSi` is written out because writing it out is what stops someone
assuming a factor of a thousand in either direction.

---

## 3. Transport

`src/engine/probes/transport.ts`. Both probes are the same problem: a species
crosses a series of films with different diffusivities and different
solubilities, and something inside consumes or produces it.

### 3.1 The variable that is solved for

Concentration is **discontinuous** at an interface between two materials that
dissolve a species differently. What is continuous is the chemical potential,
and for a dilute ideal solution that means

```
u = C / K
```

is continuous, where `K` is the partition coefficient of the layer relative to
water. Substituting `C = K u` into Fick's law:

```
J = -D dC/dx = -(D K) du/dx = -P du/dx,        P = D K
K du/dt = d/dx ( P du/dx ) + R(C)
```

This is why there is no special interface equation anywhere in the solver:
writing it in `u` makes an interface an ordinary face with a different
conductance on each side.

It is also why a profile through the stack has steps in it. Those steps
are partition coefficients, not discontinuities in anything physical.

### 3.2 Discretisation

Cell-centred finite volume, which conserves mass exactly by construction.
Face conductances are the series combination of the two half cells:

```
G = 1 / ( h_left/(2 P_left) + h_right/(2 P_right) )
```

the harmonic mean, which is what makes a thin slow membrane behave like a
resistance in series rather than like an averaged material.

`N_node` = 24 cells per layer. Grid independence is measured, not assumed:
halving the node count moves the steady-state flux by 1.8e-12 per cent.

### 3.3 Time integration

Fully implicit backward Euler with Newton on the coupled system. Not operator
splitting: the enzyme reaction is stiff enough that an explicit reaction step
would need timesteps of order ten nanoseconds, and splitting it from the
diffusion that supplies its substrate loses the very coupling the model exists
to capture.

The Jacobian is block tridiagonal, one dense block per cell of size (number of
reacting species), solved by a block Thomas algorithm. Adaptive substepping
halves the step and retries when Newton fails.

The residual for cell `c`, species `s`:

```
residual = ( H(C_new) - H(C_old) ) h / dt  -  flux  -  R(C) h
```

where `H` is the total content per unit volume, which is the free
concentration plus anything reversibly bound. That storage term is how binding
retardation enters: bound glucose does not diffuse, but it has to be filled
before the free concentration can rise.

### 3.4 What is checked

| check | requirement | result |
| --- | --- | --- |
| one slab against `D C0 / L` | analytic | 1.69e-13 % |
| three layers against series resistance | analytic | 4.29e-13 % |
| transient against the erfc half space | analytic | 0.226 % worst of 130 nodes |
| concentration jump at an interface | the partition ratio | 0.2492 against 0.2500 |
| flux continuity through every face | exact | 9.95e-13 worst |
| mass balance over 200 steps | 1e-9 | 1.382e-14 |
| grid independence, 24 against 48 nodes | under 1 % | 1.8e-12 % |
| Newton path against the linear path | machine precision | 5.4e-14 |
| first-order decay slab against `C0 cosh(m(L-x))/cosh(mL)` | analytic | 1.1e-3 % |

The last two exist because the Newton path had a sign error in the
off-diagonal blocks of its Jacobian and none of the checks above it found it:
every one of them either ran the linear path or happened to stop after a
single iteration, where a wrong Jacobian still lands close enough to pass a
loose tolerance. A second iteration diverged by a factor of 1.6e6.

---

## 4. Dimensionless groups

`src/engine/probes/dimensionless.ts`. Not decoration; each answers a design
question the raw concentrations do not.

```
Thiele modulus        phi = L sqrt(k/D),  k = k_cat E / K_G
effectiveness         eta = tanh(phi) / phi
Damkohler             Da  = (k_cat E L_enz) / (P_outer C_bulk / L_outer)
Biot                  Bi  = (D_int/L_int) / (D_ext/L_ext)
permeability ratio    P_O2 / P_G  across a membrane, D K over D K
diffusion time        t   = L^2 / 2D
```

At the declared design point: phi 1.34, eta 0.65, oxygen over glucose
2667 to 1 across the outer membrane, Biot 0.90 capsule against gel.

A Thiele modulus of 1.34 means the enzyme layer is mildly diffusion limited
and about two thirds of the loaded enzyme is doing useful work at low glucose.
That is a normal design point rather than a fault. Tightening the layer to
force phi below 1 would be tuning the physics to satisfy a test.

---

## 5. The optical probe

`src/engine/probes/optical/`. Stack, fluid first: boundary layer, fouling,
capsule, gel. The fibre is at the inner face of the gel.

### 5.1 Competitive binding

An arylboronic acid forms a cyclic ester with a 1,2 or 1,3 diol. Glucose is
one such diol; so is fructose, so is every acyclic polyol. The receptor cannot
tell them apart by chemistry, only by affinity:

```
theta_G     = (G/Kd_G) / ( 1 + G/Kd_G + F/Kd_F + M/Kd_M )
theta_total = (G/Kd_G + F/Kd_F + M/Kd_M) / ( 1 + G/Kd_G + F/Kd_F + M/Kd_M )
```

**The fluorescence reports `theta_total`, not `theta_G`.** The switch is the
boron pulling on the amine's lone pair, and the boron does that whenever it
has esterified *a* diol; it has no way of knowing which. So a fructose or an
infused mannitol lights the molecule up exactly as a glucose would, the
instrument attributes every occupied site to glucose, and the reading goes
**up**.

Using `theta_G` would make a competitor read *low*, by taking sites away from
glucose. That is what a competitive binding assay does when the label is the
glucose; it is not what a single-site turn-on sensor does. The model had this
backwards until phase 4 and the sign of the probe's entire polyol error with
it.

Inverted, which is what the instrument does:

```
G = Kd_G ( theta/(1 - theta) - load ),      load = F/Kd_F + M/Kd_M
```

with `load` set to what the instrument was **calibrated** against, not the
truth. That mismatch is the whole mechanism of the polyol error and it is
visible in the code as a caller's choice of argument rather than as an added
term.

### 5.2 pH

Only the anionic tetrahedral boronate binds a diol well; the neutral trigonal
form barely does. The fraction in the binding form is set by the boron pKa:

```
Kd(pH) = Kd(pH_ref) ( 1 + 10^(pKa - pH) ) / ( 1 + 10^(pKa - pH_ref) )
```

Affinity falls as the medium acidifies, which is the right direction.

### 5.3 Temperature, and a sign the brief has wrong

Boronate ester formation is exothermic. By van 't Hoff, an exothermic
association must weaken as the temperature rises, so Kd must **increase**:

```
ln Ka(T) - ln Ka(T0) = -(dH/R)(1/T - 1/T0)
Kd(T) = Kd(T0) exp( (dH/R)(1/T - 1/T0) ),        dH < 0
```

The build brief writes this with a leading minus sign on `dH/R`, which makes
binding get *tighter* on warming and contradicts the negative enthalpy the
brief supplies in the same sentence. The correct form is implemented.
DECISIONS.md records the deviation.

### 5.4 Binding retardation

Total glucose held per cubic metre of gel:

```
H(C) = C + R_tot theta(C)
retardation = 1 + R_tot d(theta)/dC
```

`R_tot` is **derived, not declared**. The receptor is the indicator: the same
molecule carries the boronic acid that binds and the amine whose lone pair
quenches, which is what makes the fluorescence report the binding at all. So

```
R_tot = N_dye0 / ( L_gel N_A )
```

which comes out around 20 micromoles per litre, five hundred times below
`Kd_G`. The consequence, which the model produces rather than assumes, is that
reversible binding stores almost no glucose and the gel's lag is diffusive
rather than chemical. Declaring a separate, larger receptor density would have
made the retardation visible and would have been inventing a design feature to
make a term matter.

### 5.5 Is equilibrium legitimate?

The rate law is linear in theta at fixed glucose:

```
d(theta)/dt = a - b theta,    a = k_on C / (1 + load),   b = a + k_off
k_off = k_on Kd
```

so the equilibrium is approached exponentially with time constant `1/b`, about
67 ms. Over the brief's own ramp of 0.3 mmol/L per minute the kinetic and
equilibrium occupancies differ by 3e-3 per cent. Instantaneous binding is
therefore allowed, and the test says so by measuring rather than asserting.

### 5.6 The switch

```
Phi_f(theta) = k_r / ( k_r + k_nr + (1 - theta) k_PET )
```

Three rate constants competing for one excited state. The photoinduced
electron transfer channel is switched off in proportion to occupancy.

The on-to-off contrast is not a parameter anywhere: it is 6.33, which is what
those three numbers imply. The brief guessed "roughly five".

### 5.7 The photon chain

Per flash, per square metre of illuminated gel:

```
excitations per molecule   x_e   = sigma_abs Phi_photon t_pulse         = 0.400
excitations                N_exc = N_dye x_e
emitted                          = N_exc Phi_f
at the detector                  = emitted A_fibre eta_coll eta_filt QE
```

Two assumptions hide in that chain and both are computed rather than asserted:

- **optical depth** `sigma_abs N_area` = 2.5e-5, so the far face of the gel
  sees the same flash as the near one and uniform illumination is allowed.
- **excited-state fraction** = 3.6e-7, so the ground state does not deplete
  and counts stay proportional to dye density.

Because the illumination is uniform, the detected signal is the dye-weighted
average of the **quantum yield** across the gel, not the quantum yield of the
average glucose. Those differ whenever there is a gradient, because the switch
is nonlinear, and the model carries the difference.

### 5.8 Counting

Exact Poisson, not a Gaussian approximation: at these count rates the Poisson
noise dominates the measurement, and approximating it would get the variance
right and the tail wrong, and the tail is what produces the occasional bad
reading a supervisor has to survive.

```
counted = Poisson(signal) + Poisson(dark) + Normal(0, sigma_amp)
variance = signal + dark + sigma_amp^2
```

### 5.9 Bleaching, and why the ratio survives it

Every excitation carries a probability `Phi_b` of destroying the molecule, and
a molecule is excited `x_e` times per flash:

```
survival per flash = exp( -Phi_b x_e ) = exp(-4.0e-7)
```

Both dyes are excited by the same flash at the same wavelength and, by design,
with the same absorption cross-section, so both are destroyed at the same
fractional rate. `N_dye / N_ref` is therefore constant and the ratio is
untouched while both channels fade. That is a property of the design produced
by giving both dyes the same cross-section, not a correction applied
afterwards.

Halving takes 1.73 million flashes, which at one a minute is 3.3 years. A year
of once-a-minute flashes costs 19 per cent of the dye. The bench's placeholder
front end had it at 53 per cent.

### 5.10 The reading

```
R = ( N_dye Phi_f(theta) ) / ( N_ref Phi_f,ref )
r0 = ( N_dye / N_ref ) / Phi_f,ref
Phi_f = R / r0    ->    theta    ->    G_gel    ->    G = G_gel / K_G,gel
```

Everything else in the chain, the flash energy, the collection optics, the
filter, the detector, appears identically in both channels and cancels. That
cancellation is the reason the probe is ratiometric.

The last division is the calibration: the isotherm returns the concentration
in the gel, and glucose is less soluble in a hydrogel than in water, so the
gel sits at `K_G,gel` times the external value once they have equilibrated.
Dividing by that partition coefficient is what a calibration against a blood
meter does. It is a declared constant, not a factor fitted to make the reading
come out right.

Measured: bias under 0.07 per cent from 3 to 15 mmol/L, with the stated
uncertainty within a few per cent of the observed scatter.

---

## 6. The enzymatic probe

`src/engine/probes/enzymatic/`. Stack, fluid first: boundary layer, fouling,
capsule, glucose-limiting outer membrane, crosslinked enzyme layer,
permselective inner membrane, platinum.

Eight species. Six of them react and travel the coupled Newton path: the two
glucose anomers, oxygen, peroxide, the lactone and the gluconate. Two are
linear: paracetamol and ascorbate.

### 6.1 Ping-pong bi-bi

The enzyme does not bind glucose and oxygen at once. It takes glucose, hands
two hydrogens to its flavin, releases the lactone, and only then meets oxygen,
which reoxidises the flavin and leaves as peroxide. Two half reactions, no
ternary complex:

```
v = k_cat E G O2 / ( K_G O2 + K_O2 G + G O2 )
```

Everything the probe does wrong at low oxygen falls out of that denominator.
As oxygen goes to zero the first and third terms vanish and

```
v -> k_cat E O2 / K_O2
```

which is linear in oxygen and completely blind to glucose. **That is oxygen
limitation, and there is no test for it anywhere in the file: it is the rate
law, not a branch.** Measured, it moves 0.05 per cent across a hundredfold
change in glucose.

### 6.2 Anomers

Glucose in water is a mixture of the alpha and beta pyranose forms and the
enzyme takes only beta. Normally that hardly matters, because the mixture sits
at its equilibrium of 64 per cent beta:

```
d(beta)/dt = k_mut ( f_beta,eq (alpha + beta) - beta )
```

It matters here because the enzyme consumes beta faster than a hundred-second
interconversion replaces it. **The beta fraction at the enzyme is 0.0022
against 0.64 in the bulk**, so the probe is partly mutarotation limited. That
is why both anomers are carried.

### 6.3 Ageing

```
dE/dt = -( k_therm + k_inact [H2O2] ) E
```

per slice of the layer, so the slices with the most peroxide die first. No
imposed decay constant and no ageing curve.

A year at 6 mmol/L leaves 11.4 per cent of the enzyme, against 53.2 per cent
from the thermal term alone, so the peroxide term is doing most of the work. A
year at 20 mmol/L destroys it. **The current moves 0.15 per cent over that
first year**, because the response is membrane limited and the enzyme is in
enormous excess. Ageing arrives as a knee, not a fade, which is why a probe
like this holds its calibration and then fails.

### 6.4 The lactone and the acid

The lactone hydrolyses with a seven-minute half life. Its only exit is outward
through the outer membrane, and its residence time behind that membrane is
about 4400 seconds, so most of it becomes gluconic acid where it stands.
Gluconate is anionic at pH 7.4, so the same membrane traps it harder still:

```
pH_local = pH_body - [gluconate] / beta_buf
```

pH 6.93 in the layer at 6 mmol/L and 5.44 at 25.

**Nothing in the model reads this number.** No pH dependence of glucose
oxidase is declared in the constants table, and inventing one to consume the
figure would be inventing physics. It is also an upper bound: bicarbonate
crosses membranes freely and would keep buffering, which is not modelled.

### 6.5 The electrode

The current is a flux, not a gain:

```
I = n F A J_H2O2
```

with `J` the molar flux the transport solver computed at the inner face. There
is no sensitivity coefficient and no calibration slope anywhere in the model.
Interferents add their own term the same way and the amplifier cannot tell
them apart, which is the whole difficulty.

**The electrode returns oxygen.** Two electrons oxidise peroxide to oxygen at
the platinum, one oxygen for each one the enzyme spent, and 99.97 per cent of
the peroxide gets there. It is modelled as a source in the control volume
against the electrode face, equal to the flux leaving through it. The
consequence is that the probe recycles almost all of its own oxygen and
oxygen limitation never appears at any partial pressure down to 1 mmHg. The
lens view has a labelled model switch that turns the recycling off, which is
the only way to see what it is worth: the same probe at 2 mmHg then loses
half its current and is fully oxygen limited.

### 6.6 The reference

A silver, silver chloride reference only holds still while it has silver
chloride left to give. Every electron the working electrode collects is one
the reference must supply, so the reservoir drains at exactly the signal
current:

```
E_ref = E0 - (RT/F) ln( a_Cl / a_std )
remaining = 1 - Q / (F Q_Cl)
k_e(drift) = k_e rho_r exp( -beta_E dE )
```

At 0.41 nA the reservoir lasts 2.2 years, against a one-year implant.

Even at 99.99 per cent spent, 246 mV of drift, the current barely moves. At
steady state everything the enzyme makes has to leave somewhere and the
electrode is the only easy way out, so the current is set by production rather
than by electrode kinetics: a slower surface reaction simply lets the peroxide
build up until the flux is restored. The drift shows up in the peroxide
capture fraction long before it shows up in the reading.

**Where this model stops.** Once the reservoir is empty the Nernst description
no longer applies at all: the electrode starts doing something else and the
potential swings by volts. `a_min` clamps the activity so the arithmetic
survives; it does not model the failure. A bench reading "silver chloride
remaining approximately zero" should be treated as end of life rather than as
a drift figure.

### 6.7 Interferents

Paracetamol and ascorbate cross the same six films. They differ in one place:
the permselective film, where rejection enters as a reduction of the film's
partition coefficient rather than as a factor applied to the current
afterwards. That is where it physically acts, since a charged film keeps an
anion out of the membrane in the first place.

```
K_effective = K_I,inner ( 1 - r )
```

Per unit concentration the paracetamol current is 17.82 times the ascorbate
one. The full series resistance of the stack predicts 17.82. The rejection
factors alone would say 20.0, and that overstates it, because the two share
every other layer and the same electrode.

A one gram dose adds 8.3 per cent of the signal. The bench's placeholder front
end had it at 64 per cent.

### 6.8 The impedance

A Randles cell:

```
Z = R_s + ( Z_f  ||  1/(j w C_dl) ),     Z_f = R_ct + sigma_W (1 - j)/sqrt(w)
```

Fouling multiplies the solution resistance; the capsule adds to it in
proportion to its thickness; a fractured lead is an open circuit.

**Read at 10 kHz, not 1 kHz.** Fouling is a solution-resistance effect, and at
1 kHz the double layer shunts most of the cell so the measurement is reading a
capacitor: the protein film the bench's fault deposits moves the magnitude by
20 per cent there, under the 35 per cent step the supervisor flags on, and
goes unseen. At 10 kHz that capacitor is effectively a short, the cell reads
`R_s`, and the same film moves it by 83 per cent.

---

## 7. Noise

The optical channel's noise is **derived**: Poisson counting statistics on
both bands, plus dark counts and amplifier read noise, propagated through the
inversion. It lands within a few per cent of the observed scatter.

The amperometric channel's noise is **not derived, and it is worth being plain
about why.** `electricalNoiseFloor` computes what the physics gives: shot noise
and Johnson noise at a nanoampere over a minute come to about a femtoampere,
four orders of magnitude below what the bench declares. The declared figure is
standing in for micro-motion of the probe in tissue and for local perfusion,
neither of which this model resolves. Replacing it with the derived value
would make the channel almost noiseless and the whole bench dishonestly good,
so the bench's declaration is carried across as what it always meant: a noise
in the units of the reading, 0.175 mmol/L.

The optical channel's slow drift is differential, not a sensitivity. A
ratiometric measurement cancels anything common to both bands, so what
survives is one emission filter ageing faster than the other: half a per cent
on the ratio, which arrives as about one and a half per cent of glucose
because the switch is steep, and which a one-point gain calibration **cannot**
remove, because the inversion is a chemistry rather than a gain.

---

## 8. Determinism

There is no `Math.random` anywhere in `src/engine`. Every draw comes from an
explicitly passed seeded stream, and each noise source draws from its own
named stream so that adding a new one does not shift the numbers drawn by the
existing ones.

The settled-field cache is a cache and not an approximation: on a hit the
stored field is copied and the steady-state solve is skipped entirely. An
earlier version warm-started Newton instead, which made the engine's output
depend on whether another engine had been built first in the same process.

---

## 9. Fidelity

Three modes, which are three timestep choices for one model rather than three
models:

| mode | seconds per solve | cost |
| --- | --- | --- |
| full | 1 | 2.2 ms per simulated second |
| fast | 10 | 196 us |
| frozen | never | 0 |

An acquisition forces a catch-up, so the instrument never reads a stale
profile and full, fast and a sixty-second stride give the same numbers. The
difference between them is only what the lens view sees between readings.

A run spanning months passes a coarser stride, which is the first choice that
costs accuracy: 0.02 percentage points of mean error over a day at nine
hundred seconds, and it takes a year of simulation from twenty nine minutes of
wall clock to two.

---

## 10. Against the placeholder front end

`npm run compare` prints these side by side. The differences that matter:

| | placeholder | physics |
| --- | --- | --- |
| current at 6 mmol/L | 12.5 nA | 0.41 nA |
| sensitivity | declared, 2.0 nA per mmol/L | measured, 0.0685 |
| paracetamol, 1 g | 64 % of signal | 8.3 % |
| impedance, clean | 4.2 kohm at 1 kHz | 0.22 kohm at 10 kHz |
| photobleaching at six months | 31 % | 10 % |
| enzyme at six months | 64 % | 30 % |
| sensitivity against enzyme loss | proportional | flat until the knee |
| temperature coefficient | 2 % per degree | none worth modelling |
| a polyol | reads high, by an offset | reads high, by competition |
| oxygen limitation | above 12 mmol/L, by a threshold | never, because of recycling |

On an ordinary day the two agree closely: time in range 100.0 against 99.5 per
cent, insulin 41.46 against 41.52 U. The physics changes what happens at the
edges, not in the middle.

---

## 11. What is deliberately not modelled

- **Fructose and polyol transport.** Held at their bulk concentration
  everywhere in the optical stack. They move on the timescale of an hour and
  the stack equilibrates in a few minutes.
- **Bicarbonate resupply** to the enzyme layer, which would reduce the local
  pH shift. The figure reported is an upper bound.
- **Reference failure past exhaustion**, as section 6.6 says.
- **Micro-motion and perfusion**, as section 7 says.
- **Tissue optics.** The omental wrap is extra capsule and nothing else. The
  bench's placeholder caught a wrap by dimming the optical return; this
  geometry cannot, because the fibre and the gel sit inside the housing and
  the collected light never crosses the tissue. The consequence is that the
  bench no longer demonstrates the optical-loss evidence path at all.

---

## 12. The one exemption from the constants rule

`src/engine/probes/stochastic.ts` is the only file in the directory with bare
numbers in it. The Lanczos coefficients and Hoermann's rejection constants are
not parameters of any model: they are the published definition of two standard
algorithms, and changing one does not change the physics, it breaks the
algorithm. They have no unit and no physical provenance, so filing them under
a heading of physical constants would be filing them under a heading that is
false.

Everything with a unit is still in `constants.ts`.

## 13. The three scales the drawing compresses

`src/components/lab/Magnified.tsx` draws the mechanism inside one film. Three
quantities in it cannot be drawn faithfully, and each one is declared on the
drawing rather than silently applied.

**Size.** A glucose molecule is under a nanometre and the glucose-limiting
membrane is twenty five thousand of them thick. Drawn to scale it would be an
empty rectangle. So molecule sizes are fixed and readable and carry no
information at all; what carries a concentration is how many are drawn. The
strip above the drawing is to scale, and the caption states the ratio between
the two, so nothing rests on assuming the drawing is proportionate.

**Concentration.** Counts are logarithmic over six decades:

    n(C) = clamp( round( (log10(C / 1e-5 mmol/L) / 6) * n_max ), 1, n_max )

because the species in one stack differ by six orders of magnitude and a linear
count draws either an empty band or a solid one. Where the comparison across a
band is the point being made, the band's caption prints both concentrations and
their ratio next to the counts it drew, so the compression is visible. At the
glucose-limiting membrane that reads: 4.80 mmol/L on one side, 0.0671 on the
other, seventy one times less, drawn as thirteen against nine.

**Rate.** Two things in the drawing happen at a rate the model sets:

- The enzyme cycle is one turnover of one molecule. The interval between
  turnovers is `1 / v(x)` with `v` the ping-pong rate law of section 4 divided
  by the enzyme loading, and comes to about 279 s at 6 mmol/L. The drawing runs
  a cycle every 4.5 s and prints the ratio.
- Electrons reaching the amplifier are charge per unit time, so the current
  sets the interval rather than the count: the drawing places one electron
  every `2.4 s / (I / 0.4 nA)`.

Everything else drawn is a solved quantity used directly: which receptors are
lit is the occupancy of section 3, which species cross the permselective film
is the partitioning of section 5, and the fraction of peroxide reaching the
platinum is the capture fraction of section 6.
