import { ARBITRATION_LABEL, num } from "../../lib/format.ts";
import { AUTONOMY_LABEL } from "../../engine/types.ts";
import { ELECTROCHEMICAL } from "../../engine/params.ts";
import { Part, StageSvg } from "./Part.tsx";
import { useLiveState, usePulse } from "./useLiveState.ts";

/**
 * Zoom 2: the housing, cut away.
 *
 * Every block here shows what it is doing right now. The optical module
 * lights on each flash, the front end shows the current it measured, the
 * supervisor shows its verdict, and the red insulin line lights only when the
 * controller is commanding a dose.
 */

const BLOCK = { w: 132, h: 70, r: 8 };

export function HousingView() {
  const state = useLiveState();
  const flash = usePulse(state?.tipA.flashes ?? 0, 400);
  const sweep = usePulse(Math.floor((state?.t ?? 0) / 3600), 600);

  if (!state) {
    return <div className="flex h-full items-center justify-center text-micro text-muted">Waiting for the device.</div>;
  }

  const dosing = state.dosingNow;
  const bolus = state.bolusActive;
  const supervisorColour =
    state.arbitration === "valid"
      ? "#5eead4"
      : state.arbitration === "doubtful-one"
        ? "#fde68a"
        : state.arbitration === "invalid"
          ? "#dc2626"
          : "#9aa4b2";

  return (
    <StageSvg viewBox="0 0 980 430" title="Titanium housing, cut away">
      <defs>
        <linearGradient id="housing-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#243055" />
          <stop offset="100%" stopColor="#18213a" />
        </linearGradient>
      </defs>

      <rect x={22} y={26} width={936} height={364} rx={24} fill="url(#housing-wall)" stroke="#5eead4" strokeWidth="1.4" />
      <rect x={36} y={40} width={908} height={336} rx={18} fill="#0f1728" stroke="#2c3b5c" />

      <text x={40} y={18} className="fill-[var(--color-muted)] font-mono text-[12px]">
        sealed titanium housing, abdominal wall pocket
      </text>

      {/* Feedthroughs on the left edge, where the leads enter. */}
      <Part
        number="09"
        name="Hermetic feedthroughs"
        value={`${state.tipA.leadIntact ? 2 : 0} fibres, ${state.tipB.leadIntact ? 5 : 0} wires live`}
        detail="Where lead A's two fibres and lead B's five conductors cross the titanium wall without breaking the seal. A fracture is outside the housing; the feedthroughs themselves stay intact."
        x={44}
        y={392}
      >
        <rect x={22} y={132} width={16} height={120} rx={4} fill="#2c3b5c" stroke="#3a4560" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <circle
            key={i}
            cx={30}
            cy={144 + i * 16}
            r={3}
            fill={i < 2 ? (state.tipA.leadIntact ? "#5eead4" : "#3a4560") : state.tipB.leadIntact ? "#0d9488" : "#3a4560"}
          />
        ))}
      </Part>

      {/* Optical module. */}
      <Block
        x={72}
        y={64}
        number="10"
        name="Optical module"
        value={`ratio ${num(state.readingA.raw, 3)}`}
        detail="Fires one excitation flash per acquisition down lead A and reads the two emission bands that come back. The ratio is what carries the glucose; photobleaching raises the noise on it without moving it."
        accent="#5eead4"
        glow={flash}
      >
        <circle cx={30} cy={40} r={9} fill="#5eead4" opacity={0.25 + flash * 0.75} />
        <circle cx={30} cy={40} r={14} fill="none" stroke="#5eead4" strokeWidth="1" opacity={flash * 0.8} />
        <text x={52} y={44} className="fill-[var(--color-muted)] font-mono text-[12px]">
          flash {state.tipA.flashes.toLocaleString("en-GB")}
        </text>
      </Block>

      {/* Electrochemical front end. */}
      <Block
        x={72}
        y={186}
        number="11"
        name="Electrochemical front end"
        value={`${num(state.readingB.raw, 2)} nA`}
        detail="An AD5941-class analogue front end: holds the working electrode at potential against the silver, silver chloride reference and measures the current. It also runs the hourly impedance sweep."
        accent="#0d9488"
        glow={sweep * 0.6}
      >
        <text x={14} y={30} className="fill-[#cfd8e6] font-mono text-[13px]">
          {num(state.readingB.raw, 2)} nA
        </text>
        <text x={14} y={46} className="fill-[var(--color-muted)] font-mono text-[12px]">
          {state.impedanceKohm >= ELECTROCHEMICAL.impedanceOpenCircuitKohm
            ? "Z open circuit"
            : `Z ${num(state.impedanceKohm, 2)} kOhm`}
        </text>
      </Block>

      {/* Thermistor input. */}
      <Block
        x={72}
        y={296}
        number="12"
        name="Thermistor input"
        value={state.thermistorOk ? `${num(state.tipTemperatureC, 2)} degC` : "failed"}
        detail="Tip temperature. Both front ends are compensated against it, so losing it widens both bands rather than killing either channel."
        accent={state.thermistorOk ? "#0d9488" : "#fde68a"}
      >
        <text x={14} y={30} className="fill-[#cfd8e6] font-mono text-[12px]">
          {state.thermistorOk ? "compensating" : "assumed 37.00"}
        </text>
        <text x={14} y={48} className="fill-[var(--color-muted)] font-mono text-[12px]">
          {state.thermistorOk ? "both front ends" : "bands widened"}
        </text>
      </Block>

      {/* Microcontroller. */}
      <Block
        x={330}
        y={110}
        number="13"
        name="Microcontroller"
        value={`A ${num(state.readingA.glucose)} · B ${num(state.readingB.glucose)} mmol/L`}
        detail="Applies the inverse models and the drift corrections, and produces two glucose values with an uncertainty each. It does not decide anything: that is the supervisor's job, on its own core."
        accent="#0d9488"
      >
        <text x={14} y={26} className="fill-[#cfd8e6] font-mono text-[12px]">
          A {num(state.readingA.glucose)} +- {num(state.readingA.uncertainty, 2)}
        </text>
        <text x={14} y={42} className="fill-[#cfd8e6] font-mono text-[12px]">
          B {num(state.readingB.glucose)} +- {num(state.readingB.uncertainty, 2)}
        </text>
        <text x={14} y={56} className="fill-[var(--color-muted)] font-mono text-[12px]">
          fused {num(state.fusedGlucose)} +- {num(state.fusedUncertainty, 2)}
        </text>
      </Block>

      {/* Safety supervisor, on its own core. */}
      <Block
        x={330}
        y={252}
        number="14"
        name="Safety supervisor"
        value={ARBITRATION_LABEL[state.arbitration]}
        detail="A separate core. It arbitrates the two channels, sets validity and sets permitted autonomy. It can only ever lower autonomy, and nothing outside the body can raise it."
        accent={supervisorColour}
        redPurpose={supervisorColour === "#dc2626" ? "invalid" : undefined}
      >
        <text
          x={14}
          y={26}
          className="font-mono text-[13px]"
          fill={supervisorColour === "#dc2626" ? "#f87171" : supervisorColour}
          data-red={supervisorColour === "#dc2626" ? "invalid" : undefined}
        >
          {ARBITRATION_LABEL[state.arbitration]}
        </text>
        <text x={14} y={42} className="fill-[var(--color-muted)] font-mono text-[12px]">
          {AUTONOMY_LABEL[state.autonomy]}
        </text>
        <text x={14} y={56} className="fill-[var(--color-muted)] font-mono text-[12px]">
          evidence {num(state.evidenceScore, 2)}
        </text>
      </Block>

      {/* Dosing controller. */}
      <Block
        x={584}
        y={110}
        number="15"
        name="Dosing controller"
        value={`${num(state.basalCommand, 2)} U/h`}
        detail="The only thing in the system that can command insulin, and only inside the clinician envelope. It doses on the lower edge of the uncertainty band, so a wider band always means less insulin."
        accent={dosing ? "#dc2626" : "#3a4560"}
        redPurpose="insulin"
      >
        <text x={14} y={26} className="fill-[#cfd8e6] font-mono text-[13px]">
          basal {num(state.basalCommand, 2)} U/h
        </text>
        <text x={14} y={42} className="fill-[var(--color-muted)] font-mono text-[12px]">
          ceiling {num(state.envelope.maxBasal, 2)} U/h
        </text>
        <text x={14} y={56} className="fill-[var(--color-muted)] font-mono text-[12px]">
          on board {num(state.iob, 2)} U
        </text>
      </Block>

      {/* Pump. */}
      <Block
        x={584}
        y={252}
        number="16"
        name="Insulin pump"
        value={dosing ? `${num(state.deliveryRateUph, 2)} U/h` : "not delivering"}
        detail="Delivers what the controller commands, into the peritoneal catheter. Everything red on this bench is this path and nothing else."
        accent={dosing ? "#dc2626" : "#3a4560"}
        redPurpose="insulin"
      >
        <rect x={14} y={20} width={100} height={8} rx={4} fill="#241a24" />
        <rect
          x={14}
          y={20}
          width={Math.min(100, (state.deliveryRateUph / Math.max(state.envelope.maxBasal, 0.1)) * 100)}
          height={8}
          rx={4}
          fill="#dc2626"
          data-red="insulin"
          className="transition-[width] duration-[var(--duration-instant)] ease-[var(--ease-medsync)]"
        />
        <text x={14} y={48} className="fill-[#cfd8e6] font-mono text-[12px]">
          {dosing ? `${num(state.deliveryRateUph, 2)} U/h` : "0.00 U/h"}
          {bolus ? " (bolus)" : ""}
        </text>
      </Block>

      {/* Radio. */}
      <Block
        x={806}
        y={110}
        number="17"
        name="Telemetry radio"
        value={state.telemetryOk && state.phonePresent ? "linked" : `silent ${Math.floor(state.silenceS / 60)} min`}
        detail="Carries readings out and clinician limits in. It never carries a dose. Losing it changes nothing inside the body."
        accent={state.telemetryOk && state.phonePresent ? "#0d9488" : "#fde68a"}
        width={100}
      >
        <text x={12} y={38} className="fill-[#cfd8e6] font-mono text-[12px]">
          {state.telemetryOk ? (state.phonePresent ? "linked" : "no phone") : "radio off"}
        </text>
      </Block>

      {/* Battery. */}
      <Block
        x={806}
        y={266}
        number="18"
        name="Battery"
        value={state.batteryLow ? "low" : "ok"}
        detail="A low battery drops the optical acquisition from every 60 s to every 5 min to save power, which widens the band on tip A."
        accent={state.batteryLow ? "#fde68a" : "#0d9488"}
        width={100}
        height={44}
      >
        <rect x={12} y={16} width={70} height={14} rx={3} fill="none" stroke="#3a4560" />
        <rect x={14} y={18} width={state.batteryLow ? 12 : 60} height={10} rx={2} fill={state.batteryLow ? "#fde68a" : "#0d9488"} />
      </Block>

      {/* Signal paths. The red one lights only when a dose is commanded. */}
      <Path d="M204 95 C 268 95, 268 140, 330 140" />
      <Path d="M204 217 C 268 217, 268 150, 330 150" />
      <Path d="M204 320 C 268 320, 268 290, 330 290" />
      <Path d="M462 141 H 584" />
      <Path d="M396 172 V 252" />
      <Path d="M462 283 H 584" />
      <Path d="M716 141 H 806" />
      <path
        d="M700 180 V 252"
        fill="none"
        stroke={dosing ? "#dc2626" : "#2a1f2c"}
        strokeWidth={bolus ? 4 : 2.5}
        data-red="insulin"
        className="transition-[stroke-width] duration-[var(--duration-instant)] ease-[var(--ease-medsync)]"
      />
      <path
        d="M584 290 H 520 C 500 290, 492 320, 492 352 H 62"
        fill="none"
        stroke={dosing ? "#dc2626" : "#2a1f2c"}
        strokeWidth={bolus ? 4 : 2.5}
        data-red="insulin"
      />
      <circle cx={50} cy={352} r={7} fill={dosing ? "#dc2626" : "#2a1f2c"} stroke="#3a2230" data-red="insulin" />
      <text x={500} y={370} className="fill-[var(--color-red-text)] font-mono text-[12px]" opacity={dosing ? 1 : 0.35} data-red="insulin">
        insulin path to the catheter port
      </text>
    </StageSvg>
  );
}

function Path({ d }: { d: string }) {
  return <path d={d} fill="none" stroke="#2c3b5c" strokeWidth="1.5" strokeDasharray="4 4" />;
}

function Block({
  x,
  y,
  number,
  name,
  value,
  detail,
  accent,
  redPurpose,
  glow = 0,
  width = BLOCK.w,
  height = BLOCK.h,
  children,
}: {
  x: number;
  y: number;
  number: string;
  name: string;
  value: string;
  detail: string;
  accent: string;
  redPurpose?: "insulin" | "invalid";
  glow?: number;
  width?: number;
  height?: number;
  children?: React.ReactNode;
}) {
  return (
    <Part number={number} name={name} value={value} detail={detail} x={x} y={y - 26}>
      <g transform={`translate(${x} ${y})`}>
        <rect
          width={width}
          height={height}
          rx={BLOCK.r}
          fill="#141d33"
          stroke={accent}
          data-red={redPurpose}
          strokeWidth={1 + glow * 1.5}
          opacity={0.9 + glow * 0.1}
        />
        {children}
      </g>
    </Part>
  );
}
