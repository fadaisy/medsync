import { EmptyState, Panel } from "@/components/tide/work/kit";
import { RC } from "@/content/pharmacy-rework-records";
import { ROSTER_RULE_GROUPS } from "@/content/pharmacy-roster";
import { RS } from "@/content/pharmacy-roster-sections";

export type PrescriberRow = {
  userId: string;
  who: string | null;
  department: string | null;
  cdAllowed: boolean;
  only: number;
};

const WITNESS = ROSTER_RULE_GROUPS.find((g) => g.id === "witness")!.rules;

/** §15 Prescribers: today's list, unchanged, and the Witnessing rules beside it. */
export function Prescribers({ prescribers }: { prescribers: PrescriberRow[] }) {
  const P = RC.setup.people;
  const W = RS.prescribers;
  return (
    <Panel title={W.title} note={W.sub}>
      {prescribers.length === 0 ? (
        <EmptyState compact title={P.prescribersNone} />
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {prescribers.map((p) => (
            <li key={p.userId} className="text-body-s flex flex-wrap justify-between gap-2 py-2">
              <span>
                <span className="font-semibold">{p.who}</span>
                {p.department ? (
                  <span className="text-muted-foreground"> · {p.department}</span>
                ) : null}
              </span>
              <span className="text-caption text-ink-700">
                {!p.cdAllowed ? P.notAllowed : p.only > 0 ? P.onlySome(p.only) : P.any}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="bg-tide-sunken rounded-tide-tile flex flex-col gap-1 px-3.5 py-3">
        <h3 className="text-body-s font-semibold">{W.witnessTitle}</h3>
        <ul className="text-ink-700 flex list-disc flex-col gap-0.5 pl-4 text-[13px] leading-[17px]">
          {WITNESS.map((r) => (
            <li key={r.text}>{r.text}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-[12px]">{W.fromRules}</p>
      </div>
    </Panel>
  );
}
