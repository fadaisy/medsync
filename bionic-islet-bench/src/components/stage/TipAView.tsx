import { AGEING, SENSING } from "../../engine/params.ts";
import { DOT, num } from "../../lib/format.ts";
import { Part, StageSvg } from "./Part.tsx";
import { useLiveState, usePulse, useReducedMotion } from "./useLiveState.ts";
import {
  bleachFraction,
  collarHaloRadius,
  dockingPeriodSeconds,
  glowBrightness,
  tipCapsuleRadius,
} from "./visualMapping.ts";

/**
 * Zoom 3: the optical tip.
 *
 * The excitation flash travels down one fibre, the boronic acid hydrogel cap
 * glows, glucose molecules dock and undock at a rate set by the current local
 * concentration, the two emission bands split, and the ratio updates.
 *
 * Nothing here is canned. The cap's brightness is the fluorescence ratio, the
 * docking rate is the local glucose, the ring is the capsule thickness, the
 * halo is what is left of the steroid collar, and the dimming is the
 * photobleaching the model has accumulated.
 */

const CAP = { x: 470, y: 208 };

/** Where the docking molecules come in from, spread around the cap. */
const DOCK_SITES = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + 0.3;
  return {
    id: i,
    x: CAP.x + Math.cos(angle) * 34,
    y: CAP.y + Math.sin(angle) * 34,
    fromX: Math.cos(angle) * 108,
    fromY: Math.sin(angle) * 108,
    delay: (i / 10).toFixed(2),
  };
});

export function TipAView() {
  const state = useLiveState();
  const reduced = useReducedMotion();
  const flash = usePulse(state?.tipA.flashes ?? 0, 500);

  if (!state) {
    return <div className="flex h-full items-center justify-center text-micro text-muted">Waiting for the device.</div>;
  }

  const tip = state.tipA;
  const ratio = state.readingA.raw;
  const glow = glowBrightness(ratio);
  const bleach = bleachFraction(tip.flashes, AGEING.photobleachHalfScaleFlashes);
  const steroid = AGEING.steroidEffect0 * Math.exp(-tip.ageDays / AGEING.steroidTauDays);
  const halo = collarHaloRadius(steroid);
  const capsule = tipCapsuleRadius(tip.capsuleMicron);
  const dockPeriod = dockingPeriodSeconds(tip.localGlucose);
  const dead = !tip.leadIntact;

  // Emission split. The ratio is the short band over the long band, so the
  // two bars are drawn from the same number the readout shows.
  const shortBand = Math.min(1, ratio / 2.4);
  const longBand = Math.min(1, 1 / 2.4 / Math.max(ratio, 0.01) + 0.28);

  return (
    <StageSvg viewBox="0 0 920 420" title="Optical tip, boronic acid hydrogel cap on two glass fibres">
      <defs>
        <radialGradient id="cap-glow">
          <stop offset="0%" stopColor="#ccfbf1" stopOpacity="1" />
          <stop offset="55%" stopColor="#5eead4" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0d9488" stopOpacity="0.15" />
        </radialGradient>
      </defs>

      {/* Fibrous capsule, drawn to the modelled thickness. */}
      <Part
        number="20"
        name="Fibrous capsule"
        value={`${num(tip.capsuleMicron, 1)} um`}
        detail="The tissue response around the tip. It adds 0.06 min of lag per micrometre, which is why a thick capsule shows up as a slower trace rather than a wrong one."
        x={702}
        y={92}
      >
        <circle cx={CAP.x} cy={CAP.y} r={capsule} fill="#1c2743" opacity="0.85" data-bound="capsule-tip-a" />
        <circle cx={CAP.x} cy={CAP.y} r={capsule} fill="none" stroke="#2c3b5c" strokeWidth="1.5" />
      </Part>

      {/* Steroid collar halo, shrinking as the collar elutes. */}
      <Part
        number="21"
        name="Dexamethasone collar"
        value={steroid > 0.02 ? `${num(steroid * 100, 0)} % of peak suppression` : "eluted"}
        detail="Dexamethasone acetate eluting from a collar behind the cap. It slows capsule growth while it lasts, then stops. The halo is what is left of it."
        x={168}
        y={92}
        anchor="end"
      >
        <circle
          cx={CAP.x}
          cy={CAP.y}
          r={halo}
          fill="none"
          stroke="#5eead4"
          strokeWidth="1"
          strokeDasharray="5 7"
          opacity={0.12 + steroid * 0.5}
        />
      </Part>

      {/* The two fibres. */}
      <rect x={40} y={196} width={334} height={9} rx={4} fill="#1f2b47" stroke="#2c3b5c" />
      <rect x={40} y={214} width={334} height={9} rx={4} fill="#1f2b47" stroke="#2c3b5c" />

      {/* Excitation flash travelling down the delivery fibre. */}
      {!reduced && !dead ? (
        <circle
          className="particle"
          cx={48}
          cy={200.5}
          r={4.5}
          fill="#ccfbf1"
          style={{
            animationName: "flash-down",
            animationDuration: `${SENSING.acquisitionPeriodS / 60}s`,
            ["--travel" as string]: "412px",
          }}
        />
      ) : null}
      {reduced && !dead ? <circle cx={240} cy={200.5} r={4.5} fill="#ccfbf1" opacity="0.7" /> : null}

      <Part
        number="22"
        name="Excitation fibre"
        value={dead ? "no light returning" : `flash ${tip.flashes.toLocaleString("en-GB")}`}
        detail="One flash per acquisition goes out along this fibre. Every flash bleaches a little of the dye, which is why the cap dims and the noise grows over a year without the ratio itself moving."
        x={44}
        y={172}
      />

      <Part
        number="23"
        name="Collection fibre"
        value={`${num((1 - bleach) * 100, 0)} % of original return`}
        detail="Carries both emission bands back to the optical module, which splits them and takes the ratio. Photobleaching and the capsule both cut the return, which raises the noise on the ratio without shifting it."
        x={44}
        y={262}
      />

      {/* Glucose molecules docking on and off the hydrogel. */}
      {!dead
        ? DOCK_SITES.map((site) => (
            <g key={site.id}>
              <circle
                className={reduced ? undefined : "particle"}
                cx={site.x}
                cy={site.y}
                r={5}
                fill="#5eead4"
                opacity={reduced ? 0.55 : undefined}
                style={
                  reduced
                    ? undefined
                    : {
                        animationName: "dock",
                        animationDuration: `${dockPeriod}s`,
                        animationDelay: `${site.delay}s`,
                        ["--from-x" as string]: `${site.fromX}px`,
                        ["--from-y" as string]: `${site.fromY}px`,
                      }
                }
              />
            </g>
          ))
        : null}

      {/* The hydrogel cap itself. Brightness is the fluorescence ratio. */}
      <Part
        number="24"
        name="Boronic acid hydrogel cap"
        value={dead ? "no signal" : `ratio ${num(ratio, 3)}`}
        detail="Glucose binds reversibly to the boronic acid receptors in the gel, which shifts the fluorescence. It needs no oxygen at all, which is the reason for having it. Mannitol and sorbitol bind the same receptors and are read as glucose."
        x={396}
        y={336}
      >
        <circle cx={CAP.x} cy={CAP.y} r={30} fill="#0d1424" />
        <circle
          cx={CAP.x}
          cy={CAP.y}
          r={30}
          fill="url(#cap-glow)"
          opacity={dead ? 0.05 : glow * (1 - bleach * 0.55) + flash * 0.12}
          data-bound="glow"
          data-bound-opacity={dead ? 0.05 : glow}
        />
        <circle cx={CAP.x} cy={CAP.y} r={30} fill="none" stroke="#5eead4" strokeWidth="1.2" opacity={dead ? 0.3 : 0.9} />
      </Part>

      {/* Emission split and the ratio. */}
      <g transform="translate(636 176)">
        <text x={0} y={-16} className="fill-[var(--color-muted)] font-mono text-[12px]">
          emission bands
        </text>
        <rect x={0} y={0} width={150} height={13} rx={4} fill="#101a30" />
        <rect x={0} y={0} width={150 * shortBand} height={13} rx={4} fill="#5eead4" opacity={dead ? 0.15 : 0.95} />
        <text x={158} y={11} className="fill-[var(--color-muted)] font-mono text-[11px]">
          short
        </text>
        <rect x={0} y={22} width={150} height={13} rx={4} fill="#101a30" />
        <rect x={0} y={22} width={150 * longBand} height={13} rx={4} fill="#0d9488" opacity={dead ? 0.15 : 0.95} />
        <text x={158} y={33} className="fill-[var(--color-muted)] font-mono text-[11px]">
          long
        </text>
        <text x={0} y={60} className="fill-[#e8edf5] font-mono text-[15px]">
          R = {num(ratio, 3)}
        </text>
        <text x={0} y={78} className="fill-[var(--color-muted)] font-mono text-[11px]">
          {num(state.readingA.glucose)} +- {num(state.readingA.uncertainty, 2)} mmol/L
        </text>
      </g>

      <Part
        number="25"
        name="Photobleaching"
        value={`${num(bleach * 100, 1)} % bleached`}
        detail="Each flash destroys a little dye. The ratio is unaffected because both bands fade together, but fewer photons come back, so the noise rises as one over the square root of the counts. It shows here as a dimmer cap."
        x={734}
        y={336}
      />

      <text x={40} y={396} className="fill-[var(--color-muted)] font-mono text-[12px]">
        local glucose {num(tip.localGlucose)} mmol/L {DOT} docking every {num(dockPeriod, 2)} s {DOT} day {num(tip.ageDays, 1)}
        {state.mannitolOn ? ` ${DOT} mannitol present, read as glucose` : ""}
      </text>
      {reduced ? (
        <text x={880} y={396} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[12px]">
          motion frozen, values live
        </text>
      ) : null}
    </StageSvg>
  );
}
