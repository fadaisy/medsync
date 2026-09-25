/**
 * One-dimensional diffusion and reaction through a stack of layers.
 *
 * Both probes are the same problem: a species crosses a series of films with
 * different diffusivities and different solubilities, and somewhere inside,
 * something consumes or produces it. This module solves that once.
 *
 * ## The variable that is actually solved for
 *
 * Concentration is discontinuous at an interface between two materials that
 * dissolve a species differently. What is continuous is the chemical
 * potential, and for dilute ideal solutions that means `u = C / K` is
 * continuous, where `K` is the partition coefficient of the layer relative to
 * water.
 *
 * So the solver works in `u`. Substituting `C = K u` into Fick's law gives
 *
 *     J = -D dC/dx = -(D K) du/dx = -P du/dx,      P = D K
 *
 * and the storage term picks up the same factor:
 *
 *     K du/dt = d/dx ( P du/dx ) + R(C)
 *
 * This is why there is no special interface equation anywhere below: writing
 * it in `u` makes the interface an ordinary face with a different conductance
 * on each side.
 *
 * ## Discretisation
 *
 * Cell-centred finite volume, which conserves mass exactly by construction:
 * whatever leaves one cell through a face enters the next. Face conductances
 * are the series combination of the two half-cells,
 *
 *     G = 1 / ( h_left/(2 P_left) + h_right/(2 P_right) )
 *
 * which is the harmonic mean and is what makes a thin, slow membrane behave
 * like a resistance in series rather than like an averaged material.
 *
 * ## Time integration
 *
 * Fully implicit (backward Euler), with Newton on the coupled system. Not
 * operator splitting: the enzyme reaction is stiff enough that an explicit
 * reaction step would need timesteps of order 10 nanoseconds, and splitting
 * it from the diffusion that supplies its substrate loses the very coupling
 * the model exists to capture.
 *
 * The Jacobian is block tridiagonal, with one dense block per cell of size
 * (number of reacting species), because diffusion couples neighbouring cells
 * and reaction couples species within a cell and nothing else. That is solved
 * by a block Thomas algorithm.
 */
import type {
  DiffusivityM2PerS,
  Metres,
  MolPerCubicMetre,
  PermeabilityMPerS,
  Seconds,
} from "./units.ts";

import { SOLVER } from "./constants.ts";
import { raw } from "./units.ts";

export type SpeciesKey = string;

export type LayerSpec = {
  readonly name: string;
  readonly thickness: Metres;
  /** Diffusivity of each species inside this layer. */
  readonly diffusivity: Readonly<Record<SpeciesKey, DiffusivityM2PerS>>;
  /**
   * Partition coefficient of each species in this layer relative to water.
   * Absent means 1, which is to say the species is as soluble here as in
   * water. A membrane that a species barely dissolves in has K well under 1
   * and that, not only its diffusivity, is what makes it a barrier.
   */
  readonly partition?: Readonly<Record<SpeciesKey, number>>;
};

export type StackSpec = {
  readonly species: readonly SpeciesKey[];
  readonly layers: readonly LayerSpec[];
  readonly nodesPerLayer?: number;
};

/** What happens at the inner end of the stack, per species. */
export type InnerBoundary =
  | { readonly kind: "no-flux" }
  /**
   * A first-order surface reaction consuming the species: the electrode.
   * Flux out is `k * C_surface`. Setting `k` high makes it diffusion limited,
   * which is the regime a real amperometric electrode runs in.
   */
  | { readonly kind: "surface-sink"; readonly k: PermeabilityMPerS };

export type Boundaries = {
  /** Bulk concentration in the fluid at the outer face, per species. */
  readonly outer: Readonly<Record<SpeciesKey, MolPerCubicMetre>>;
  readonly inner: Readonly<Record<SpeciesKey, InnerBoundary>>;
};

/**
 * Volumetric reaction rates in one cell.
 *
 * `concentration` is actual concentration in that cell's material, mol/m3,
 * indexed the same as `species`. Write dC/dt into `out`. Positive is
 * production.
 */
export type ReactionTerm = (
  cellIndex: number,
  concentration: Float64Array,
  out: Float64Array,
) => void;

export type Grid = {
  readonly species: readonly SpeciesKey[];
  readonly nCells: number;
  /** Cell widths, metres. */
  readonly h: Float64Array;
  /** Cell centre positions from the outer face, metres. */
  readonly x: Float64Array;
  /** Index into `layers` for each cell. */
  readonly layerOf: Int32Array;
  /** Partition coefficient, [species][cell]. */
  readonly K: readonly Float64Array<ArrayBuffer>[];
  /** Face conductances, [species][face]. Face f sits between cell f-1 and f. */
  readonly G: readonly Float64Array<ArrayBuffer>[];
  /** Total stack thickness, metres. */
  readonly thickness: number;
  readonly layers: readonly LayerSpec[];
};

/** The solved field: partition-normalised concentration, [species][cell]. */
export type Field = Float64Array<ArrayBuffer>[];

function speciesIndex(species: readonly SpeciesKey[], key: SpeciesKey): number {
  const i = species.indexOf(key);
  if (i < 0) throw new Error(`species ${key} is not in this stack`);
  return i;
}

/**
 * Build the grid.
 *
 * Face conductances include the two outermost faces. Face 0 connects the
 * outer bulk to cell 0 and uses only cell 0's half-width, because the bulk is
 * held at a fixed concentration and offers no resistance of its own; the
 * unstirred boundary layer is an explicit layer in the stack instead, which
 * is more honest than folding it into a coefficient.
 */
export function buildGrid(spec: StackSpec): Grid {
  const nodes = spec.nodesPerLayer ?? SOLVER.nodesPerLayer;
  if (nodes < 20) throw new Error("at least 20 nodes per layer are required");

  const nCells = spec.layers.length * nodes;
  const h = new Float64Array(nCells);
  const x = new Float64Array(nCells);
  const layerOf = new Int32Array(nCells);

  let cursor = 0;
  let position = 0;
  for (let l = 0; l < spec.layers.length; l += 1) {
    const layer = spec.layers[l]!;
    const dx = raw(layer.thickness) / nodes;
    for (let n = 0; n < nodes; n += 1) {
      h[cursor] = dx;
      x[cursor] = position + dx / 2;
      layerOf[cursor] = l;
      position += dx;
      cursor += 1;
    }
  }

  const K: Float64Array<ArrayBuffer>[] = [];
  const G: Float64Array<ArrayBuffer>[] = [];

  for (const key of spec.species) {
    const kArr = new Float64Array(nCells);
    const pArr = new Float64Array(nCells);
    for (let c = 0; c < nCells; c += 1) {
      const layer = spec.layers[layerOf[c]!]!;
      const d = layer.diffusivity[key];
      if (d === undefined) throw new Error(`layer ${layer.name} has no diffusivity for ${key}`);
      const partition = layer.partition?.[key] ?? 1;
      kArr[c] = partition;
      pArr[c] = raw(d) * partition;
    }

    // nCells + 1 faces: face 0 is the outer boundary, face nCells the inner.
    const g = new Float64Array(nCells + 1);
    g[0] = (2 * pArr[0]!) / h[0]!;
    for (let f = 1; f < nCells; f += 1) {
      const left = h[f - 1]! / (2 * pArr[f - 1]!);
      const right = h[f]! / (2 * pArr[f]!);
      g[f] = 1 / (left + right);
    }
    g[nCells] = (2 * pArr[nCells - 1]!) / h[nCells - 1]!;

    K.push(kArr);
    G.push(g);
  }

  return {
    species: spec.species,
    nCells,
    h,
    x,
    layerOf,
    K,
    G,
    thickness: position,
    layers: spec.layers,
  };
}

/** A field with every species at its outer bulk concentration. */
export function uniformField(grid: Grid, boundaries: Boundaries): Field {
  return grid.species.map((key) => {
    const arr = new Float64Array(grid.nCells);
    arr.fill(raw(boundaries.outer[key] ?? (0 as unknown as MolPerCubicMetre)));
    return arr;
  });
}

/** Actual concentration in a cell's own material, mol/m3. */
export function concentrationAt(
  grid: Grid,
  field: Field,
  speciesKey: SpeciesKey,
  cell: number,
): number {
  const i = speciesIndex(grid.species, speciesKey);
  return field[i]![cell]! * grid.K[i]![cell]!;
}

/** The concentration profile of one species, in its local material, mol/m3. */
export function profile(grid: Grid, field: Field, speciesKey: SpeciesKey): Float64Array {
  const i = speciesIndex(grid.species, speciesKey);
  const out = new Float64Array(grid.nCells);
  for (let c = 0; c < grid.nCells; c += 1) out[c] = field[i]![c]! * grid.K[i]![c]!;
  return out;
}

/**
 * Molar flux at the inner face, mol/(m2 s), positive meaning into the
 * electrode. This is the quantity the amperometric current is computed from.
 */
export function innerFlux(
  grid: Grid,
  field: Field,
  speciesKey: SpeciesKey,
  inner: InnerBoundary,
): number {
  if (inner.kind === "no-flux") return 0;
  const i = speciesIndex(grid.species, speciesKey);
  const last = grid.nCells - 1;
  // Series: half a cell of diffusion, then the surface reaction itself.
  const diffusive = grid.G[i]![grid.nCells]!;
  const surface = raw(inner.k) * grid.K[i]![last]!;
  const combined = 1 / (1 / diffusive + 1 / surface);
  return combined * field[i]![last]!;
}

/** Total moles per square metre held in the stack, for the mass balance check. */
export function inventory(grid: Grid, field: Field, speciesKey: SpeciesKey): number {
  const i = speciesIndex(grid.species, speciesKey);
  let total = 0;
  for (let c = 0; c < grid.nCells; c += 1) total += field[i]![c]! * grid.K[i]![c]! * grid.h[c]!;
  return total;
}

/** Molar flux entering through the outer face, mol/(m2 s). */
export function outerFlux(
  grid: Grid,
  field: Field,
  speciesKey: SpeciesKey,
  boundaries: Boundaries,
): number {
  const i = speciesIndex(grid.species, speciesKey);
  const uBulk = raw(boundaries.outer[speciesKey] ?? (0 as unknown as MolPerCubicMetre));
  return grid.G[i]![0]! * (uBulk - field[i]![0]!);
}

/**
 * Move a field from one grid to another after the geometry has changed.
 *
 * Both probes live in tissue that thickens over months and pick up a fouling
 * film that grows and shrinks, so the stack is not a fixed object. Rebuilding
 * the grid every tick would be wasteful and rebuilding it never would be
 * wrong, so the probe rebuilds when a layer thickness has moved by more than
 * `SOLVER.geometryRebuildTolerance` and calls this to carry the state across.
 *
 * The remap is done in `u`, the partition-normalised concentration, and by
 * fractional position **within the same layer**, not by absolute position.
 * That matters: when the capsule thickens, the gel behind it has not moved
 * its contents, and interpolating by absolute depth would smear the interface
 * jump across the boundary. Layer identity is assumed unchanged, which is
 * true because the stack is built from the same list of layers every time.
 */
export function remapField(from: Grid, to: Grid, field: Field): Field {
  if (from.layers.length !== to.layers.length) {
    throw new Error("remapField needs the same layers in the same order");
  }

  // Fractional position of every cell inside its own layer, on both grids.
  const fractionOf = (grid: Grid): Float64Array => {
    const starts = new Float64Array(grid.layers.length);
    const ends = new Float64Array(grid.layers.length);
    let position = 0;
    for (let l = 0; l < grid.layers.length; l += 1) {
      starts[l] = position;
      position += raw(grid.layers[l]!.thickness);
      ends[l] = position;
    }
    const out = new Float64Array(grid.nCells);
    for (let c = 0; c < grid.nCells; c += 1) {
      const l = grid.layerOf[c]!;
      const span = ends[l]! - starts[l]!;
      out[c] = span > 0 ? (grid.x[c]! - starts[l]!) / span : 0.5;
    }
    return out;
  };

  const fromFraction = fractionOf(from);
  const toFraction = fractionOf(to);

  // First and last cell index of each layer on the source grid.
  const first: number[] = [];
  const last: number[] = [];
  for (let c = 0; c < from.nCells; c += 1) {
    const l = from.layerOf[c]!;
    if (first[l] === undefined) first[l] = c;
    last[l] = c;
  }

  return to.species.map((key) => {
    const source = from.species.indexOf(key);
    const out = new Float64Array(to.nCells);
    if (source < 0) return out;
    const values = field[source]!;
    for (let c = 0; c < to.nCells; c += 1) {
      const l = to.layerOf[c]!;
      const lo = first[l]!;
      const hi = last[l]!;
      const target = toFraction[c]!;
      // Linear interpolation between the two bracketing source cells, held
      // flat outside the outermost and innermost source centres.
      let j = lo;
      while (j < hi && fromFraction[j + 1]! < target) j += 1;
      if (target <= fromFraction[lo]!) {
        out[c] = values[lo]!;
      } else if (target >= fromFraction[hi]!) {
        out[c] = values[hi]!;
      } else {
        const a = fromFraction[j]!;
        const b = fromFraction[j + 1]!;
        const w = b > a ? (target - a) / (b - a) : 0;
        out[c] = values[j]! * (1 - w) + values[j + 1]! * w;
      }
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// The solve
// ---------------------------------------------------------------------------

/**
 * Total content of each species held in one cell per unit volume, mol/m3,
 * given the free concentrations. Defaults to the free concentration itself.
 *
 * This is how reversible binding to an immobile receptor enters the model.
 * A glucose molecule bound to a boronic acid in the gel is still in the gel:
 * it does not diffuse, but it has to be filled before the free concentration
 * can rise. That extra capacity is what makes a binding sensor respond more
 * slowly than a bare diffusion calculation predicts, and it is a real effect
 * rather than a fitted lag.
 *
 * Only available to species in `reacting`, because a nonlinear storage term
 * makes the equation nonlinear and the linear path is a single exact solve.
 */
export type StorageTerm = (
  cellIndex: number,
  concentration: Float64Array,
  out: Float64Array,
) => void;

export type StepOptions = {
  /** Reacting species, in the order the reaction term expects. Others are linear. */
  readonly reacting?: readonly SpeciesKey[];
  readonly reaction?: ReactionTerm;
  readonly storage?: StorageTerm;
  /** Newton tolerance on the maximum relative update. */
  readonly tolerance?: number;
  readonly maxNewton?: number;
};

export type StepResult = {
  readonly field: Field;
  /** Newton iterations used on the last substep. */
  readonly iterations: number;
  /** How many substeps the tick was divided into. */
  readonly substeps: number;
  readonly converged: boolean;
};

/**
 * Advance the field by `dt`, or solve to steady state when `dt` is null.
 *
 * Adaptive substepping: if Newton fails to converge, the step is halved and
 * retried, down to a floor. This is what the brief means by adaptive
 * substepping inside the bench's one second tick.
 */
export function step(
  grid: Grid,
  field: Field,
  boundaries: Boundaries,
  dt: Seconds | null,
  options: StepOptions = {},
): StepResult {
  const total = dt === null ? null : raw(dt);
  let remaining = total;
  let current = field.map((a) => Float64Array.from(a));
  let substeps = 0;
  let iterations = 0;

  if (remaining === null) {
    const result = newtonSolve(grid, current, current, boundaries, null, options);
    return {
      field: result.field,
      iterations: result.iterations,
      substeps: 1,
      converged: result.converged,
    };
  }

  let trial = remaining;
  const floor = total! / SOLVER.maxReactionSubsteps;
  while (remaining > 1e-15) {
    const dtTry = Math.min(trial, remaining);
    const result = newtonSolve(grid, current, current, boundaries, dtTry, options);
    if (result.converged) {
      current = result.field;
      remaining -= dtTry;
      substeps += 1;
      iterations = result.iterations;
      // Grow the step back towards the full tick once it is going well.
      trial = Math.min(total!, dtTry * 2);
    } else {
      trial = dtTry / 2;
      if (trial < floor) {
        return { field: current, iterations: result.iterations, substeps, converged: false };
      }
    }
  }

  return { field: current, iterations, substeps, converged: true };
}

/**
 * One backward Euler solve by Newton's method, or a steady-state solve when
 * `dt` is null (the storage term simply drops out).
 */
function newtonSolve(
  grid: Grid,
  guess: Field,
  previous: Field,
  boundaries: Boundaries,
  dt: number | null,
  options: StepOptions,
): { field: Field; iterations: number; converged: boolean } {
  const tolerance = options.tolerance ?? SOLVER.reactionTolerance;
  const maxNewton = options.maxNewton ?? 40;

  const reactingKeys = options.reacting ?? [];
  const reactingIdx = reactingKeys.map((key) => grid.species.indexOf(key));
  const linearIdx = grid.species.map((_, i) => i).filter((i) => !reactingIdx.includes(i));

  const field = guess.map((a) => Float64Array.from(a));

  // Species with no reaction term are linear and decoupled: one tridiagonal
  // solve each, exact, no iteration.
  for (const i of linearIdx) {
    solveLinearSpecies(grid, field, previous, boundaries, dt, i);
  }

  if (reactingIdx.length === 0) return { field, iterations: 0, converged: true };

  const nS = reactingIdx.length;
  const nC = grid.nCells;
  const conc = new Float64Array(nS);
  const rates = new Float64Array(nS);
  const ratesPerturbed = new Float64Array(nS);
  const held = new Float64Array(nS);
  const heldPerturbed = new Float64Array(nS);
  const heldPrevious = new Float64Array(nS);
  const concPrevious = new Float64Array(nS);

  /** Total content, defaulting to the free concentration when no term is given. */
  const contentOf = (cell: number, c: Float64Array, out: Float64Array): void => {
    if (options.storage) options.storage(cell, c, out);
    else out.set(c);
  };

  // Block tridiagonal storage: A (sub), B (diag), C (super), each nS x nS.
  const A = new Float64Array(nC * nS * nS);
  const B = new Float64Array(nC * nS * nS);
  const Cu = new Float64Array(nC * nS * nS);
  const residual = new Float64Array(nC * nS);

  let iterations = 0;
  for (; iterations < maxNewton; iterations += 1) {
    A.fill(0);
    B.fill(0);
    Cu.fill(0);
    residual.fill(0);

    for (let c = 0; c < nC; c += 1) {
      const h = grid.h[c]!;
      for (let sLocal = 0; sLocal < nS; sLocal += 1) {
        const s = reactingIdx[sLocal]!;
        conc[sLocal] = field[s]![c]! * grid.K[s]![c]!;
      }
      if (options.reaction) options.reaction(c, conc, rates);
      else rates.fill(0);
      contentOf(c, conc, held);

      if (dt !== null) {
        for (let sLocal = 0; sLocal < nS; sLocal += 1) {
          const s = reactingIdx[sLocal]!;
          concPrevious[sLocal] = previous[s]![c]! * grid.K[s]![c]!;
        }
        contentOf(c, concPrevious, heldPrevious);
      }

      for (let sLocal = 0; sLocal < nS; sLocal += 1) {
        const s = reactingIdx[sLocal]!;
        const row = c * nS + sLocal;
        const kCell = grid.K[s]![c]!;
        const gL = grid.G[s]![c]!;
        const gR = grid.G[s]![c + 1]!;
        const u = field[s]![c]!;

        let flux = 0;
        let dSelf = 0;

        // Outer neighbour or the outer boundary.
        if (c === 0) {
          const uBulk = raw(
            boundaries.outer[grid.species[s]!] ?? (0 as unknown as MolPerCubicMetre),
          );
          flux += gL * (uBulk - u);
          dSelf -= gL;
        } else {
          flux += gL * (field[s]![c - 1]! - u);
          dSelf -= gL;
          // d(residual)/d(u of the outer neighbour). The residual is written
          // accumulation minus flux, and the flux rises with the neighbour, so
          // this entry is negative. The linear path above uses the same sign.
          A[(row * nS + sLocal) as number] = -gL;
        }

        // Inner neighbour or the inner boundary.
        if (c === nC - 1) {
          const inner = boundaries.inner[grid.species[s]!] ?? { kind: "no-flux" as const };
          if (inner.kind === "surface-sink") {
            const surface = raw(inner.k) * kCell;
            const combined = 1 / (1 / gR + 1 / surface);
            flux += combined * (0 - u);
            dSelf -= combined;
          }
        } else {
          flux += gR * (field[s]![c + 1]! - u);
          dSelf -= gR;
          Cu[(row * nS + sLocal) as number] = -gR;
        }

        // Accumulation is the change in total content, which is the free
        // concentration plus anything reversibly bound in this cell.
        const accumulation = dt === null ? 0 : ((held[sLocal]! - heldPrevious[sLocal]!) * h) / dt;

        residual[row] = accumulation - flux - rates[sLocal]! * h;
        B[(row * nS + sLocal) as number] = -dSelf;
      }

      // Jacobian of reaction and storage by finite difference: nS extra
      // evaluations per cell. Runs even with no reaction, because a
      // nonlinear storage term needs it too.
      {
        for (let col = 0; col < nS; col += 1) {
          const sCol = reactingIdx[col]!;
          const kCol = grid.K[sCol]![c]!;
          const base = conc[col]!;
          const delta = Math.max(Math.abs(base) * 1e-6, 1e-14);
          conc[col] = base + delta;
          if (options.reaction) options.reaction(c, conc, ratesPerturbed);
          else ratesPerturbed.fill(0);
          contentOf(c, conc, heldPerturbed);
          conc[col] = base;
          for (let rowLocal = 0; rowLocal < nS; rowLocal += 1) {
            const dRdC = (ratesPerturbed[rowLocal]! - rates[rowLocal]!) / delta;
            const dHdC = (heldPerturbed[rowLocal]! - held[rowLocal]!) / delta;
            // d(residual)/d(u_col), chain rule through C = K u:
            //   accumulation contributes  + h/dt * dHeld/dC * K_col
            //   reaction contributes      - h    * dR/dC    * K_col
            const slot = (c * nS + rowLocal) * nS + col;
            const accumulationTerm = dt === null ? 0 : (h * dHdC * kCol) / dt;
            B[slot] = B[slot]! + accumulationTerm - h * dRdC * kCol;
          }
        }
      }
    }

    const update = blockThomas(A, B, Cu, residual, nC, nS);
    if (!update) return { field, iterations, converged: false };

    let worst = 0;
    for (let c = 0; c < nC; c += 1) {
      for (let sLocal = 0; sLocal < nS; sLocal += 1) {
        const s = reactingIdx[sLocal]!;
        const before = field[s]![c]!;
        let after = before - update[c * nS + sLocal]!;
        // A concentration below zero is unphysical and is a solver artefact,
        // never a result. Clamping here keeps Newton in the feasible region.
        if (after < 0) after = 0;
        field[s]![c] = after;
        const scale = Math.max(Math.abs(before), Math.abs(after), 1e-12);
        worst = Math.max(worst, Math.abs(after - before) / scale);
      }
    }

    if (worst < tolerance) return { field, iterations: iterations + 1, converged: true };
  }

  return { field, iterations, converged: false };
}

/** One species with no reaction: an ordinary tridiagonal solve. */
function solveLinearSpecies(
  grid: Grid,
  field: Field,
  previous: Field,
  boundaries: Boundaries,
  dt: number | null,
  s: number,
): void {
  const n = grid.nCells;
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const c = new Float64Array(n);
  const d = new Float64Array(n);
  const key = grid.species[s]!;
  const uBulk = raw(boundaries.outer[key] ?? (0 as unknown as MolPerCubicMetre));
  const inner = boundaries.inner[key] ?? { kind: "no-flux" as const };

  for (let i = 0; i < n; i += 1) {
    const h = grid.h[i]!;
    const kCell = grid.K[s]![i]!;
    const gL = grid.G[s]![i]!;
    const gR = grid.G[s]![i + 1]!;
    const storage = dt === null ? 0 : (kCell * h) / dt;

    let diag = storage;
    let rhs = dt === null ? 0 : (kCell * h * previous[s]![i]!) / dt;

    if (i === 0) {
      diag += gL;
      rhs += gL * uBulk;
    } else {
      diag += gL;
      a[i] = -gL;
    }

    if (i === n - 1) {
      if (inner.kind === "surface-sink") {
        const surface = raw(inner.k) * kCell;
        diag += 1 / (1 / gR + 1 / surface);
      }
    } else {
      diag += gR;
      c[i] = -gR;
    }

    b[i] = diag;
    d[i] = rhs;
  }

  const solution = thomas(a, b, c, d, n);
  const target = field[s]!;
  for (let i = 0; i < n; i += 1) target[i] = Math.max(0, solution[i] ?? 0);
}

/** Scalar tridiagonal solve, Thomas algorithm. */
function thomas(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  n: number,
): Float64Array {
  const cp = new Float64Array(n);
  const dp = new Float64Array(n);
  cp[0] = c[0]! / b[0]!;
  dp[0] = d[0]! / b[0]!;
  for (let i = 1; i < n; i += 1) {
    const denom = b[i]! - a[i]! * cp[i - 1]!;
    cp[i] = c[i]! / denom;
    dp[i] = (d[i]! - a[i]! * dp[i - 1]!) / denom;
  }
  const x = new Float64Array(n);
  x[n - 1] = dp[n - 1]!;
  for (let i = n - 2; i >= 0; i -= 1) x[i] = dp[i]! - cp[i]! * x[i + 1]!;
  return x;
}

/**
 * Block tridiagonal solve with dense nS x nS blocks.
 *
 * `A` is the sub-diagonal block, `B` the diagonal, `C` the super-diagonal,
 * each stored cell-major. Returns the update vector, or null if a block turns
 * out to be singular, which is how a diverging Newton step reports itself.
 */
function blockThomas(
  A: Float64Array,
  B: Float64Array,
  C: Float64Array,
  rhs: Float64Array,
  nC: number,
  nS: number,
): Float64Array | null {
  const blockSize = nS * nS;
  const gamma = new Float64Array(nC * blockSize);
  const beta = new Float64Array(nC * nS);
  const work = new Float64Array(blockSize);
  const workVec = new Float64Array(nS);

  // First block.
  for (let i = 0; i < blockSize; i += 1) work[i] = B[i]!;
  const inv0 = invert(work, nS);
  if (!inv0) return null;
  matMul(inv0, C.subarray(0, blockSize), gamma.subarray(0, blockSize), nS);
  matVec(inv0, rhs.subarray(0, nS), beta.subarray(0, nS), nS);

  for (let c = 1; c < nC; c += 1) {
    const off = c * blockSize;
    const aBlock = A.subarray(off, off + blockSize);
    const prevGamma = gamma.subarray(off - blockSize, off);
    // work = B_c - A_c * gamma_{c-1}
    matMul(aBlock, prevGamma, work, nS);
    for (let i = 0; i < blockSize; i += 1) work[i] = B[off + i]! - work[i]!;
    const inv = invert(work, nS);
    if (!inv) return null;
    if (c < nC - 1) {
      matMul(inv, C.subarray(off, off + blockSize), gamma.subarray(off, off + blockSize), nS);
    }
    // beta_c = inv * ( rhs_c - A_c * beta_{c-1} )
    matVec(aBlock, beta.subarray((c - 1) * nS, c * nS), workVec, nS);
    for (let i = 0; i < nS; i += 1) workVec[i] = rhs[c * nS + i]! - workVec[i]!;
    matVec(inv, workVec, beta.subarray(c * nS, (c + 1) * nS), nS);
  }

  const x = new Float64Array(nC * nS);
  for (let i = 0; i < nS; i += 1) x[(nC - 1) * nS + i] = beta[(nC - 1) * nS + i]!;
  for (let c = nC - 2; c >= 0; c -= 1) {
    const off = c * blockSize;
    matVec(
      gamma.subarray(off, off + blockSize),
      x.subarray((c + 1) * nS, (c + 2) * nS),
      workVec,
      nS,
    );
    for (let i = 0; i < nS; i += 1) x[c * nS + i] = beta[c * nS + i]! - workVec[i]!;
  }
  return x;
}

function matMul(a: Float64Array, b: Float64Array, out: Float64Array, n: number): void {
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let sum = 0;
      for (let k = 0; k < n; k += 1) sum += a[i * n + k]! * b[k * n + j]!;
      out[i * n + j] = sum;
    }
  }
}

function matVec(a: Float64Array, v: Float64Array, out: Float64Array, n: number): void {
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let k = 0; k < n; k += 1) sum += a[i * n + k]! * v[k]!;
    out[i] = sum;
  }
}

/** Dense inverse by Gauss-Jordan with partial pivoting. n is 1 to 4 here. */
function invert(a: Float64Array, n: number): Float64Array | null {
  const m = new Float64Array(n * 2 * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) m[i * 2 * n + j] = a[i * n + j]!;
    m[i * 2 * n + n + i] = 1;
  }
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let best = Math.abs(m[col * 2 * n + col]!);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(m[r * 2 * n + col]!);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (best < 1e-300) return null;
    if (pivot !== col) {
      for (let j = 0; j < 2 * n; j += 1) {
        const tmp = m[col * 2 * n + j]!;
        m[col * 2 * n + j] = m[pivot * 2 * n + j]!;
        m[pivot * 2 * n + j] = tmp;
      }
    }
    const diag = m[col * 2 * n + col]!;
    for (let j = 0; j < 2 * n; j += 1) m[col * 2 * n + j] = m[col * 2 * n + j]! / diag;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r * 2 * n + col]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j += 1) {
        m[r * 2 * n + j] = m[r * 2 * n + j]! - factor * m[col * 2 * n + j]!;
      }
    }
  }
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) out[i * n + j] = m[i * 2 * n + n + j]!;
  }
  return out;
}
