"use client";

import type { StopReason } from "@/lib/resus/model";
import { useMemo, useState } from "react";
import { CircleStopIcon, InfoIcon } from "lucide-react";

import { stopResuscitationV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { computeArrestState } from "@/lib/resus/als/engine";
import { stopAuthority, terminationReview } from "@/lib/resus/als/termination";
import { STOP_REASONS } from "@/lib/resus/model";
import {
  arrestContextOf,
  Choice,
  FIELD,
  hhmm,
  NEUTRAL_DARK,
  ReviewRow,
} from "./after-arrest-shared";
import { useDeskCtx } from "./desk-context";
import { ReviewFacts, shownTexts } from "./termination-review-facts";
import { TreatmentLimitation } from "./treatment-limitation";
import { toOutcome, useNow } from "./use-desk";

/**
 * TerminationReview — "Stop resuscitation?" (prompt §5.11, ALS-TOR-01..10). The
 * facts, the causes not yet excluded, the continue flags and the criteria as
 * information (termination-review-facts.tsx); then the team, family and reasons.
 * A team decision, recorded — never a prompt to stop and never a hard block
 * (D9: any cadre may record, a non-doctor with a senior co-sign pending).
 */

const REASON_LABEL: Record<StopReason, string> = {
  no_response_to_als: "No response to ALS",
  persistent_asystole: "Persistent asystole",
  known_wishes_or_plan: "Known wishes / plan",
  irreversible_condition: "Irreversible condition",
  other: "Other",
};

type Team = "not_asked" | "no_objection" | "objection";
type Family = "present" | "informed" | "not_reachable";

const FAMILY_LABEL: Record<Family, string> = {
  present: "Present",
  informed: "Informed",
  not_reachable: "Not reachable",
};

export function TerminationReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent
        side="center"
        widthClassName="max-w-[1120px]"
        className="lg:h-[min(780px,calc(100dvh-2rem))]"
        data-testid="termination-review"
      >
        {open ? <ReviewBody onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function ReviewBody({ onClose }: { onClose: () => void }) {
  const d = useDeskCtx();
  const { store, ui, initial } = d;
  const now = useNow(store.nowMs, 1000);
  const events = store.activeEvents;
  const actx = useMemo(() => arrestContextOf(d, events), [d, events]);
  const arrest = computeArrestState(events, now, actx);
  const review = terminationReview(events, arrest, actx, now);
  const authority = stopAuthority(initial.me.cadreCode);

  const [team, setTeam] = useState<Team>("not_asked");
  const [objection, setObjection] = useState("");
  const [senior, setSenior] = useState({
    name: "",
    cadre: "",
    mode: "in_person" as "in_person" | "phone",
  });
  const [family, setFamily] = useState<Family | null>(null);
  const [reasons, setReasons] = useState<StopReason[]>([]);
  const [other, setOther] = useState("");

  const toggleReason = (r: StopReason) =>
    setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  const missing =
    arrest.arrestSeq === 0
      ? "No arrest is recorded in this resus."
      : arrest.status !== "in_arrest"
        ? "The arrest is not running — nothing to stop."
        : reasons.length === 0
          ? "Give at least one reason."
          : reasons.includes("other") && !other.trim()
            ? "Describe the other reason."
            : team === "objection" && !objection.trim()
              ? "Describe the objection."
              : null;
  const stopAt = hhmm(now);

  const stop = () => {
    const arrestSeq = arrest.arrestSeq;
    const fields = {
      arrestSeq,
      reasons,
      otherReason: reasons.includes("other") ? other.trim() : null,
      teamAsked: team !== "not_asked",
      objection: team === "objection" ? objection.trim() : null,
      seniorConsulted: senior.name.trim()
        ? { name: senior.name.trim(), cadre: senior.cadre.trim(), mode: senior.mode }
        : null,
      family,
      shown: shownTexts(review, arrest.paediatric),
    };
    const label = `Resuscitation stopped — ${reasons.map((x) => x.replace(/_/g, " ")).join(", ")}${authority.seniorCosignPending ? " (senior co-sign pending)" : ""}`;
    const episodeId = store.episode.id;
    store.submit({
      label: "Stop resuscitation",
      optimistic: () => [
        {
          kind: "resuscitation_stopped",
          step: "arrest",
          arrestSeq,
          payload: { ...fields, seniorCosignPending: authority.seniorCosignPending, label },
        },
      ],
      // R8: "Recorded" only once the server has it; a refusal raises the desk's error toast.
      run: async ({ clientEventId, recordedAt }) => {
        const o = toOutcome(
          await stopResuscitationV2({ ...fields, episodeId, clientEventId, recordedAt }),
        );
        if (o.ok) ui.toast({ message: `Recorded — resuscitation stopped at ${stopAt}` });
        return o;
      },
    });
    ui.toast({ message: "Saving…" });
    onClose();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>Stop resuscitation?</SheetTitle>
        <SheetDescription>Leader decision · team-based</SheetDescription>
      </SheetHeader>
      {/* Landscape: what the leader reviews (left), the decision (right). */}
      {/* Each column scrolls on its own, so the decision never scrolls away with the facts. */}
      <SheetBody className="grid gap-x-8 py-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:py-0">
        <div className="lg:border-border min-w-0 lg:overflow-y-auto lg:border-r lg:py-1 lg:pr-8">
          <ReviewFacts review={review} paediatric={arrest.paediatric} />
        </div>
        <div className="min-w-0 lg:overflow-y-auto lg:py-1">
          <ReviewRow label="Team">
            <div className="flex flex-wrap gap-2">
              <Choice
                selected={team === "no_objection"}
                onClick={() => setTeam(team === "no_objection" ? "not_asked" : "no_objection")}
              >
                Team asked — no objection
              </Choice>
              <Choice
                selected={team === "objection"}
                onClick={() => setTeam(team === "objection" ? "not_asked" : "objection")}
              >
                Objection raised
              </Choice>
            </div>
            {team === "objection" ? (
              <input
                aria-label="Objection"
                placeholder="Objection: who, and what they said"
                value={objection}
                onChange={(e) => setObjection(e.target.value)}
                maxLength={500}
                className={FIELD}
              />
            ) : null}
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
              <input
                aria-label="Senior consulted — name"
                placeholder="Senior consulted: name"
                value={senior.name}
                onChange={(e) => setSenior({ ...senior, name: e.target.value })}
                maxLength={80}
                className={FIELD}
              />
              <input
                aria-label="Senior consulted — cadre"
                placeholder="Cadre"
                value={senior.cadre}
                onChange={(e) => setSenior({ ...senior, cadre: e.target.value })}
                maxLength={60}
                className={FIELD}
              />
              <div className="flex gap-2" role="group" aria-label="Consulted how">
                <Choice
                  selected={senior.mode === "in_person"}
                  onClick={() => setSenior({ ...senior, mode: "in_person" })}
                >
                  In person
                </Choice>
                <Choice
                  selected={senior.mode === "phone"}
                  onClick={() => setSenior({ ...senior, mode: "phone" })}
                >
                  Phone
                </Choice>
              </div>
            </div>
          </ReviewRow>

          <ReviewRow label="Family">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Family">
              {(Object.keys(FAMILY_LABEL) as Family[]).map((f) => (
                <Choice
                  key={f}
                  selected={family === f}
                  onClick={() => setFamily(family === f ? null : f)}
                >
                  {FAMILY_LABEL[f]}
                </Choice>
              ))}
            </div>
          </ReviewRow>

          <ReviewRow label="Reasons">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Reasons (one or more)">
              {STOP_REASONS.map((r) => (
                <Choice key={r} selected={reasons.includes(r)} onClick={() => toggleReason(r)}>
                  {REASON_LABEL[r]}
                </Choice>
              ))}
            </div>
            {reasons.includes("other") ? (
              <input
                aria-label="Other reason"
                placeholder="Other reason"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                maxLength={300}
                className={FIELD}
              />
            ) : null}
          </ReviewRow>

          {/* CPR not attempted is decided before CPR, in the arrest confirm only (§5.11, ALS-REC-07). */}
          <ReviewRow label="Other decisions">
            <TreatmentLimitation />
          </ReviewRow>
        </div>
      </SheetBody>
      <SheetFooter className="flex-col items-stretch sm:flex-row sm:items-center">
        <p className="text-body-s text-muted-foreground mr-auto inline-flex items-start gap-1.5 self-center">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {missing ??
            (authority.seniorCosignPending
              ? "Recorded with a senior co-sign pending (D9)."
              : "Recorded as the leader's decision.")}
        </p>
        <Button variant="secondary" size="lg" onClick={onClose}>
          Cancel
        </Button>
        <button
          type="button"
          disabled={missing !== null || store.readOnly}
          onClick={stop}
          className={NEUTRAL_DARK}
        >
          <CircleStopIcon className="size-5" aria-hidden />
          <span suppressHydrationWarning>Stop resuscitation at {stopAt}</span>
        </button>
      </SheetFooter>
    </>
  );
}
