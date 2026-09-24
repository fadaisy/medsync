"use client";

import type { BedStatus, CloseOutDraft, StepProps } from "./close-out-model";
import type { CareUnit, Destination, LevelMismatchCode } from "@/lib/resus/model";
import { ChevronRightIcon } from "lucide-react";

import { LEVEL_MISMATCH_CODES } from "@/lib/resus/model";
import {
  CLOSEOUT_REF,
  LEVELS_OF_CARE,
  NO_SUGGESTION_TEXT,
} from "@/lib/resus/reference/levels-of-care";
import { Choice, FIELD } from "./after-arrest-shared";
import { DESTINATIONS_OFFERED, refText, unitDestination } from "./close-out-model";
import { Block, Note, UnitRow } from "./close-out-ui";
import { CAPABILITY_WORD, DESTINATION_WORD, MISMATCH_WORD } from "./close-out-words";
import { useDeskCtx } from "./desk-context";

/**
 * Lane U6 — close-out step 2: destination (catalog §2–§4). The recommender
 * suggests a level with its rules and sources; the leader chooses a unit or a
 * destination. Below the suggestion needs a reason; above does not. No bed →
 * boarding keeps the episode open (CO-BRD-01). A death goes to the mortuary.
 */

const BED: { id: BedStatus; label: string }[] = [
  { id: "requested", label: "Bed requested" },
  { id: "accepted", label: "Bed accepted" },
  { id: "not_available", label: "No bed available" },
];

/** Rule text through the Law 3 gate (a pending entry shows the pending marker). */
const ruleText = (ruleId: string) => {
  const e = CLOSEOUT_REF[ruleId];
  return e ? refText(e) : ruleId;
};

export function DestinationStep({ draft, patch, facts, died }: StepProps & { died: boolean }) {
  const d = useDeskCtx();
  const s = facts.suggestion;
  const units = d.initial.careUnits;
  const pickDestination = (dest: Destination) => patch({ destination: dest, unitId: null });
  const pickUnit = (u: CareUnit) => patch({ unitId: u.id, destination: unitDestination(u) });
  const extra = (k: keyof CloseOutDraft["extras"]) => () =>
    patch({ extras: { ...draft.extras, [k]: !draft.extras[k] } });

  if (died)
    return (
      <Block title="Destination">
        <p className="text-body-m text-foreground">Mortuary</p>
        <p className="text-body-s text-muted-foreground">
          After a confirmed death the destination is the mortuary. The after-death tasks stay open
          on the desk after close.
        </p>
      </Block>
    );

  const top = s.reasons.find((r) => r.level === s.level);
  return (
    <>
      <Block title="Suggested level of care">
        <p className="text-body-m text-foreground font-medium">
          {s.level ? LEVELS_OF_CARE[s.level].label : NO_SUGGESTION_TEXT}
        </p>
        {top ? <p className="text-body-s text-muted-foreground">{ruleText(top.ruleId)}</p> : null}
        {s.reasons.length > 0 ? (
          <details className="group">
            <summary className="text-body-s inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-teal-700">
              <ChevronRightIcon
                aria-hidden
                className="ease-expo-out size-4 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
              />
              Why — rules and sources
            </summary>
            <ul className="text-body-s text-muted-foreground flex flex-col gap-1.5 pl-5">
              {s.reasons.map((r) => {
                const url = CLOSEOUT_REF[r.ruleId]?.url ?? "";
                return (
                  <li key={r.ruleId}>
                    <span className="text-foreground font-mono">{r.ruleId}</span> ·{" "}
                    {ruleText(r.ruleId)} ·{" "}
                    {url.startsWith("http") ? (
                      <a href={url} target="_blank" rel="noreferrer" className="underline">
                        {r.source}
                      </a>
                    ) : (
                      r.source
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
        {s.extraDestinations.map((x) => (
          <p
            key={x.ruleId}
            className="text-body-s text-foreground flex flex-wrap items-center gap-2"
          >
            Also consider: {DESTINATION_WORD[x.destination]} — {ruleText(x.ruleId)}
            {x.destination !== "ct_first" && draft.destination !== x.destination ? (
              <Choice
                selected={false}
                onClick={() => pickDestination(x.destination as Destination)}
              >
                Choose {DESTINATION_WORD[x.destination]}
              </Choice>
            ) : null}
          </p>
        ))}
        {s.transferSuggested ? (
          <Note
            action={
              <Choice
                selected={draft.destination === "transferred"}
                onClick={() => pickDestination("transferred")}
              >
                Transfer out
              </Choice>
            }
          >
            No registered unit here declares{" "}
            {s.requiredCapabilities.map((c) => CAPABILITY_WORD[c]).join(", ")} — transfer to a
            higher-level facility.
          </Note>
        ) : null}
      </Block>
      <Block title="Also true now (the record cannot tell)">
        <div className="flex flex-wrap gap-2">
          <Choice selected={draft.extras.agitationDelirium} onClick={extra("agitationDelirium")}>
            Severe agitation / delirium
          </Choice>
          <Choice selected={draft.extras.riskOfEscalation} onClick={extra("riskOfEscalation")}>
            At risk of escalation
          </Choice>
          <Choice selected={draft.extras.rrtNeeded} onClick={extra("rrtNeeded")}>
            RRT needed
          </Choice>
        </div>
      </Block>

      <Block title="Unit">
        {units.length === 0 ? (
          <p className="text-body-s text-muted-foreground">
            No units registered — choose a destination below.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Unit" className="flex flex-col gap-2">
            {units.map((u) => (
              <UnitRow
                key={u.id}
                unit={u}
                required={s.requiredCapabilities}
                selected={draft.unitId === u.id}
                onSelect={() => pickUnit(u)}
              />
            ))}
          </div>
        )}
      </Block>

      <Block title={units.length === 0 ? "Destination" : "Or a destination"}>
        <div role="group" aria-label="Destination" className="flex flex-wrap gap-2">
          {DESTINATIONS_OFFERED.map((dest) => (
            <Choice
              key={dest}
              selected={!draft.unitId && draft.destination === dest}
              onClick={() => pickDestination(dest)}
            >
              {DESTINATION_WORD[dest]}
            </Choice>
          ))}
        </div>
        {draft.destination ? (
          <p className="text-body-s text-foreground">
            Chosen: {DESTINATION_WORD[draft.destination]}
            {facts.unit ? ` — ${facts.unit.name}` : ""}
            {facts.chosen ? ` · ${LEVELS_OF_CARE[facts.chosen].label}` : ""}
          </p>
        ) : null}
      </Block>

      {facts.mismatchNeeded ? (
        <Block title="Below the suggestion — reason">
          <div className="flex flex-wrap gap-2">
            {LEVEL_MISMATCH_CODES.map((m: LevelMismatchCode) => (
              <Choice
                key={m}
                selected={draft.mismatch === m}
                onClick={() => patch({ mismatch: m })}
              >
                {MISMATCH_WORD[m]}
              </Choice>
            ))}
          </div>
          {draft.mismatch === "clinical_judgement" ? (
            <>
              <label htmlFor="co-mismatch" className="text-caption text-muted-foreground">
                Short note (required)
              </label>
              <input
                id="co-mismatch"
                maxLength={300}
                value={draft.mismatchNote}
                onChange={(e) => patch({ mismatchNote: e.target.value })}
                className={FIELD}
              />
            </>
          ) : null}
        </Block>
      ) : null}

      {!facts.boarding && draft.destination ? (
        <Block title="Bed">
          <div className="flex flex-wrap gap-2">
            {BED.map((b) => (
              <Choice key={b.id} selected={draft.bed === b.id} onClick={() => patch({ bed: b.id })}>
                {b.label}
              </Choice>
            ))}
          </div>
          {draft.bed === "accepted" ? (
            <>
              <label htmlFor="co-accepted" className="text-caption text-muted-foreground">
                Accepted by (name, cadre)
              </label>
              <input
                id="co-accepted"
                maxLength={60}
                value={draft.bedAcceptedBy}
                onChange={(e) => patch({ bedAcceptedBy: e.target.value })}
                className={FIELD}
              />
            </>
          ) : null}
          {draft.bed === "not_available" ? (
            facts.canBoard ? (
              <p className="text-body-s text-muted-foreground">
                Start boarding: the resus stays open, its clock stops and a boarding clock starts.
                Vitals and actions keep working.
              </p>
            ) : (
              <Note>Boarding is not available now — continue to the handover.</Note>
            )
          ) : null}
        </Block>
      ) : null}
    </>
  );
}
