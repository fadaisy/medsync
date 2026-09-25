import { AUTONOMY_LABEL } from "../engine/types.ts";
import {
  ARBITRATION_COLOUR,
  ARBITRATION_LABEL,
  AUTONOMY_DESCRIPTION,
  medsyncPosture,
  num,
} from "../lib/format.ts";
import { benchData } from "../store/benchData.ts";
import { useBench } from "../store/bench.ts";
import { ModelTag } from "./ModelTag.tsx";
import { Panel } from "./Panel.tsx";

/**
 * The safety supervisor's verdict, the evidence behind it, what autonomy that
 * buys, and what MedSync outside the body would be doing about it.
 */
export function StateCard() {
  useBench((s) => s.tick);
  const state = benchData.state;
  if (!state) {
    return (
      <Panel title="Safety supervisor">
        <p className="text-micro text-muted">Waiting for the first arbitration.</p>
      </Panel>
    );
  }

  const colour = ARBITRATION_COLOUR[state.arbitration];
  const posture = medsyncPosture(state);

  return (
    <Panel title="Safety supervisor" subtitle="Separate core. It can only lower autonomy.">
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          data-red={state.arbitration === "invalid" ? "invalid" : undefined}
          className="mt-[3px] h-3 w-3 shrink-0 rounded-full"
          style={{ background: colour }}
        />
        <div className="min-w-0 flex-1">
          <p
            className="text-heading-s"
            data-red={state.arbitration === "invalid" ? "invalid" : undefined}
            style={{ color: colour === "var(--color-red)" ? "var(--color-red-text)" : colour }}
          >
            {ARBITRATION_LABEL[state.arbitration]}
          </p>
          <p className="text-micro text-muted">
            Permitted autonomy: {AUTONOMY_LABEL[state.autonomy]}
          </p>
        </div>
        <span className="tabular shrink-0 rounded-[var(--radius-control)] border border-edge px-1.5 py-0.5 text-micro text-muted">
          evidence {num(state.evidenceScore, 2)}
          <ModelTag note="Weighted from both tip health scores and how closely the two channels agree. Autonomy may never rise in a step where this falls." />
        </span>
      </div>

      <p className="mt-2 text-micro leading-relaxed text-[#cfd8e6]">
        {AUTONOMY_DESCRIPTION[state.autonomy]}
      </p>

      <h3 className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted">
        Evidence that fired
      </h3>
      <ul className="mt-1 space-y-0.5">
        {state.arbitrationReasons.slice(0, 6).map((reason, index) => (
          <li key={`${reason}-${index}`} className="text-micro leading-snug text-[#cfd8e6]">
            <span aria-hidden="true" className="mr-1 text-muted">
              &middot;
            </span>
            {reason}
          </li>
        ))}
      </ul>

      <h3 className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted">
        What MedSync would be doing
      </h3>
      <p className="mt-1 text-micro leading-snug text-[#cfd8e6]">{posture}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-edge pt-2">
        <dt className="text-micro text-muted">Fused output</dt>
        <dd className="tabular text-right text-small text-[#e8edf5]">
          {num(state.fusedGlucose)} <span className="text-micro text-muted">mmol/L</span>
        </dd>
        <dt className="text-micro text-muted">One standard deviation</dt>
        <dd className="tabular text-right text-small text-[#cfd8e6]">
          {num(state.fusedUncertainty, 2)} <span className="text-micro text-muted">mmol/L</span>
        </dd>
        <dt className="text-micro text-muted">Rate of change</dt>
        <dd className="tabular text-right text-small text-[#cfd8e6]">
          {num(state.fusedRate, 3)} <span className="text-micro text-muted">mmol/L per min</span>
        </dd>
        <dt className="text-micro text-muted">Plasma glucose (the truth)</dt>
        <dd className="tabular text-right text-small text-[#cfd8e6]">
          {num(state.plasmaGlucose)} <span className="text-micro text-muted">mmol/L</span>
        </dd>
      </dl>
    </Panel>
  );
}
