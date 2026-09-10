import { AGEING, PHYSIOLOGY } from "../../engine/params.ts";
import { num } from "../../lib/format.ts";
import { Part, StageSvg } from "./Part.tsx";
import { capsuleRadius } from "./visualMapping.ts";
import { useLiveState, usePulse } from "./useLiveState.ts";

/**
 * Zoom 1: the body.
 *
 * An axial slice through the abdomen. The titanium housing sits in a pocket
 * in the anterior abdominal wall, the cuffed tract carries both leads through
 * the wall, the two sensing tips are tethered against the parietal peritoneum
 * in one quadrant and the insulin catheter tip sits in the opposite one.
 *
 * Everything that moves here is read from the engine: the peritoneal tint
 * from the fluid glucose, the capsule rings from each tip's capsule
 * thickness, and the red catheter from whether a dose is being commanded.
 */

const CAVITY = { cx: 452, cy: 214, rx: 286, ry: 132 };

export function BodyView() {
  const state = useLiveState();
  const flash = usePulse(state?.tipA.flashes ?? 0, 350);

  if (!state) {
    return <div className="flex h-full items-center justify-center text-micro text-muted">Waiting for the device.</div>;
  }

  // Peritoneal fluid tint. Opacity carries the concentration, never hue: a
  // colour-coded fluid would be a second, quieter way of saying "high", and
  // colour alone is not allowed to say anything on a clinical surface.
  const tint = Math.min(0.34, Math.max(0.05, (state.peritonealGlucose - 2) / 52));

  const capA = capsuleRadius(state.tipA.capsuleMicron);
  const capB = capsuleRadius(state.tipB.capsuleMicron);
  const dosing = state.dosingNow;
  const bolus = state.bolusActive;

  return (
    <StageSvg viewBox="0 0 920 420" title="Abdominal cross-section with the implanted device">
      <defs>
        <radialGradient id="fluid" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#5eead4" stopOpacity={tint} />
          <stop offset="100%" stopColor="#0d9488" stopOpacity={tint * 0.6} />
        </radialGradient>
        <linearGradient id="insulin-flow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Abdominal wall and skin. */}
      <ellipse
        cx={CAVITY.cx}
        cy={CAVITY.cy}
        rx={CAVITY.rx + 34}
        ry={CAVITY.ry + 34}
        fill="#16203a"
        stroke="#24304a"
        strokeWidth="1.5"
      />
      <ellipse
        cx={CAVITY.cx}
        cy={CAVITY.cy}
        rx={CAVITY.rx + 16}
        ry={CAVITY.ry + 16}
        fill="#1b2745"
        stroke="#24304a"
        strokeWidth="1"
      />

      {/* Peritoneal cavity, tinted by the fluid glucose. */}
      <ellipse cx={CAVITY.cx} cy={CAVITY.cy} rx={CAVITY.rx} ry={CAVITY.ry} fill="#101a30" />
      <ellipse cx={CAVITY.cx} cy={CAVITY.cy} rx={CAVITY.rx} ry={CAVITY.ry} fill="url(#fluid)" />
      <ellipse
        cx={CAVITY.cx}
        cy={CAVITY.cy}
        rx={CAVITY.rx}
        ry={CAVITY.ry}
        fill="none"
        stroke="#2c3b5c"
        strokeWidth="1"
      />

      {/* Spine, posterior. Orientation cue only. */}
      <g opacity="0.5">
        <ellipse cx={452} cy={330} rx={30} ry={18} fill="#1b2745" stroke="#2c3b5c" />
        <text x={452} y={392} textAnchor="middle" className="fill-[var(--color-muted)] text-[12px]">
          posterior
        </text>
        <text x={452} y={24} textAnchor="middle" className="fill-[var(--color-muted)] text-[12px]">
          anterior
        </text>
      </g>

      {/* Lead A: two fibres. Lead B: five wires. Drawn as they run. */}
      <path
        d="M470 84 C 470 150, 540 210, 618 250"
        fill="none"
        stroke="#0d9488"
        strokeWidth="3"
        strokeLinecap="round"
        opacity={state.tipA.leadIntact ? 0.95 : 0.25}
        strokeDasharray={state.tipA.leadIntact ? undefined : "8 6"}
      />
      <path
        d="M470 84 C 470 150, 540 210, 618 250"
        fill="none"
        stroke="#5eead4"
        strokeWidth="1"
        opacity={state.tipA.leadIntact ? 0.8 : 0.2}
      />
      <path
        d="M486 86 C 494 160, 570 236, 648 292"
        fill="none"
        stroke="#0d9488"
        strokeWidth="4"
        strokeLinecap="round"
        opacity={state.tipB.leadIntact ? 0.95 : 0.25}
        strokeDasharray={state.tipB.leadIntact ? undefined : "8 6"}
      />

      {/* Insulin catheter, opposite quadrant. Red, and only lit when the
          controller is actually commanding a dose. */}
      <path
        d="M424 86 C 372 140, 300 220, 282 288"
        fill="none"
        stroke={dosing ? "url(#insulin-flow)" : "#3a2230"}
        strokeWidth={bolus ? 5 : 3.5}
        strokeLinecap="round"
        data-red="insulin"
        className="transition-[stroke-width] duration-[var(--duration-instant)] ease-[var(--ease-medsync)]"
      />

      {/* Housing in its pocket in the anterior wall. */}
      <Part
        number="01"
        name="Titanium housing"
        value={`${num(state.envelope.basalRate, 2)} U/h basal, battery ${state.batteryLow ? "low" : "ok"}`}
        detail="Sealed titanium housing in a pocket in the anterior abdominal wall. Holds the optical module, the electrochemical front end, the microcontroller, the safety supervisor, the controller, the radio and the battery."
        x={528}
        y={36}
      >
        <rect x={420} y={46} width={84} height={34} rx={9} fill="#1f2b47" stroke="#5eead4" strokeWidth="1.4" />
        <rect x={428} y={54} width={68} height={18} rx={5} fill="#0d1424" />
        <circle cx={441} cy={63} r={4} fill="#5eead4" opacity={0.35 + flash * 0.65} />
        <circle cx={462} cy={63} r={4} fill={dosing ? "#dc2626" : "#3a2230"} data-red="insulin" />
        <circle cx={483} cy={63} r={4} fill={state.telemetryOk && state.phonePresent ? "#0d9488" : "#3a4560"} />
      </Part>

      <Part
        number="02"
        name="Cuffed tract"
        value="both leads, one crossing"
        detail="A single cuffed tract carries lead A and lead B through the abdominal wall. The cuff anchors the tract and is where tissue ingrowth seals it."
        x={410}
        y={104}
        anchor="end"
      >
        <rect x={440} y={80} width={46} height={14} rx={4} fill="#2c3b5c" stroke="#3a4560" />
      </Part>

      <Part
        number="03"
        name="Lead A, two fibres"
        value={state.tipA.leadIntact ? "intact" : "fractured, channel lost"}
        detail="Two glass fibres to the optical tip: one carries the excitation flash out, one carries the two emission bands back. A fracture kills the optical channel and shows as a loss of optical return."
        x={556}
        y={150}
      />

      <Part
        number="04"
        name="Lead B, five wires"
        value={state.tipB.leadIntact ? "intact" : "fractured, open circuit"}
        detail="Five conductors to the electrochemical tip: working, counter and reference electrodes plus the thermistor pair. A fracture shows as an open circuit on the hourly impedance sweep."
        x={572}
        y={196}
      />

      {/* Tip A, with its capsule ring. */}
      <Part
        number="05"
        name="Tip A, optical"
        value={`capsule ${num(state.tipA.capsuleMicron, 0)} um, lag ${num(PHYSIOLOGY.tauCapsuleBaseMin + PHYSIOLOGY.tauCapsulePerMicron * state.tipA.capsuleMicron, 1)} min`}
        detail="Boronic acid hydrogel cap on the ends of two glass fibres, tethered against the parietal peritoneum. The ring around it is the fibrous capsule, drawn to the modelled thickness. The dexamethasone collar slows it while the collar is still eluting."
        x={668}
        y={228}
      >
        <circle cx={618} cy={250} r={capA} fill="#2c3b5c" opacity="0.55" data-bound="capsule-a" />
        <circle cx={618} cy={250} r={capA} fill="none" stroke="#3a4560" strokeWidth="1" />
        <circle cx={618} cy={250} r={7} fill="#5eead4" opacity={0.5 + flash * 0.5} />
        <circle cx={618} cy={250} r={7} fill="none" stroke="#ccfbf1" strokeWidth="0.8" />
      </Part>

      {/* Tip B, with its capsule ring. */}
      <Part
        number="06"
        name="Tip B, electrochemical"
        value={`capsule ${num(state.tipB.capsuleMicron, 0)} um, fouling ${num(state.tipB.fouling * 100, 0)} %`}
        detail="Glucose oxidase over platinum with a silver, silver chloride reference. No steroid collar, so its capsule grows faster than tip A's. Fouling on the outer membrane is separate from the capsule."
        x={700}
        y={318}
      >
        <circle cx={648} cy={292} r={capB} fill="#2c3b5c" opacity="0.55" data-bound="capsule-b" />
        <circle cx={648} cy={292} r={capB} fill="none" stroke="#3a4560" strokeWidth="1" />
        <rect x={641} y={285} width={14} height={14} rx={3} fill="#0d9488" />
        <rect x={641} y={285} width={14} height={14} rx={3} fill="none" stroke="#ccfbf1" strokeWidth="0.8" />
      </Part>

      <Part
        number="07"
        name="Insulin catheter tip"
        value={dosing ? `delivering ${num(state.deliveryRateUph, 2)} U/h` : "no delivery"}
        detail="The intraperitoneal catheter tip, deliberately in the opposite quadrant from the sensing tips so that delivered insulin does not wash over them. It lights only when the controller is commanding a dose."
        x={258}
        y={322}
        anchor="end"
      >
        <circle cx={282} cy={288} r={dosing ? 9 : 6} fill={dosing ? "#dc2626" : "#3a2230"} data-red="insulin" className="transition-[r] duration-[var(--duration-instant)] ease-[var(--ease-medsync)]" />
        <circle cx={282} cy={288} r={13} fill="none" stroke="#dc2626" strokeWidth="1" opacity={bolus ? 0.75 : 0} data-red="insulin" />
      </Part>

      <Part
        number="08"
        name="Peritoneal fluid"
        value={`${num(state.peritonealGlucose)} mmol/L, oxygen ${num(state.oxygenMmHg, 0)} mmHg`}
        detail="The compartment both tips actually sample. It follows plasma with a 1.7 min time constant, which is the whole argument for this site. The tint is the concentration; the number is the value."
        x={300}
        y={150}
        anchor="end"
      />

      {/* Scale bar, so the capsule rings mean something. */}
      <g transform="translate(40 388)">
        <line x1="0" y1="0" x2={capsuleRadius(100) - capsuleRadius(0)} y2="0" stroke="#9aa4b2" strokeWidth="1.5" />
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#9aa4b2" strokeWidth="1.5" />
        <line
          x1={capsuleRadius(100) - capsuleRadius(0)}
          y1="-4"
          x2={capsuleRadius(100) - capsuleRadius(0)}
          y2="4"
          stroke="#9aa4b2"
          strokeWidth="1.5"
        />
        <text x={0} y={20} className="fill-[var(--color-muted)] font-mono text-[12px]">
          100 um of capsule
        </text>
      </g>

      <text x={896} y={404} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[12px]">
        day {num(state.tipA.ageDays, 1)} · capsule growth {num(AGEING.capsuleGrowthPerDay * (1 - AGEING.coatEffect), 2)} um/day bare
      </text>
    </StageSvg>
  );
}
