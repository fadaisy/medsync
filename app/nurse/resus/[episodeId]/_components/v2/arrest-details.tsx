"use client";

import type { TimelineEvent } from "@/lib/resus/types";
import { useMemo, useState } from "react";
import { CircleCheckIcon, ClipboardListIcon } from "lucide-react";

import { updateArrestDetailsV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { currentArrestSeq, declSeq } from "@/lib/resus/als/timing";
import { Choice, FIELD, hhmm } from "./after-arrest-shared";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

/**
 * ArrestDetails — the Utstein fields recorded after the fact (CO-UTS-01/02):
 * witnessed, monitored, collapse time (defaults to the declaration, ALS-REC-04)
 * and CPR started before the declaration. A self-contained trigger + dialog, so
 * the console log and the post-ROSC header just drop `<ArrestDetails />` in.
 * Never shown before an arrest has been declared (never before CPR).
 */

type Tri = boolean | null;

interface Details {
  declaredAtMs: number;
  witnessed: Tri;
  monitored: Tri;
  collapseAtIso: string | null;
  cprBeforeDeclarationAtIso: string | null;
}

/** Latest recorded value of each field across this arrest's declarations (as the Utstein projection reads them). */
function detailsOf(events: readonly TimelineEvent[], seq: number): Details | null {
  const decls = events.filter((e) => e.kind === "arrest_detected" && declSeq(e) === seq);
  if (decls.length === 0) return null;
  const out: Details = {
    declaredAtMs: Date.parse(decls[0]!.recordedAt),
    witnessed: null,
    monitored: null,
    collapseAtIso: null,
    cprBeforeDeclarationAtIso: null,
  };
  for (const { payload: p } of decls) {
    if (typeof p.witnessed === "boolean") out.witnessed = p.witnessed;
    if (typeof p.monitored === "boolean") out.monitored = p.monitored;
    if (typeof p.collapseAtIso === "string") out.collapseAtIso = p.collapseAtIso;
    if (typeof p.cprBeforeDeclarationAtIso === "string")
      out.cprBeforeDeclarationAtIso = p.cprBeforeDeclarationAtIso;
  }
  return out;
}

/** "HH:MM" on the declaration's day; a time later than the declaration means the day before. */
export function timeBefore(hm: string, refMs: number): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const d = new Date(refMs);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > refMs + 60_000) d.setDate(d.getDate() - 1);
  return d.toISOString();
}

export function ArrestDetails({ arrestSeq }: { arrestSeq?: number }) {
  const { store } = useDeskCtx();
  const events = store.activeEvents;
  const seq = arrestSeq ?? currentArrestSeq(events);
  const details = useMemo(() => (seq > 0 ? detailsOf(events, seq) : null), [events, seq]);
  const [open, setOpen] = useState(false);
  if (!details) return null;

  const recorded =
    details.witnessed !== null ||
    details.monitored !== null ||
    details.collapseAtIso !== null ||
    details.cprBeforeDeclarationAtIso !== null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap text-body-s border-border bg-card text-foreground hover:bg-muted focus-visible:shadow-focus inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 font-medium outline-none"
      >
        {recorded ? (
          <CircleCheckIcon className="size-4 text-teal-700" aria-hidden />
        ) : (
          <ClipboardListIcon className="text-muted-foreground size-4" aria-hidden />
        )}
        {recorded ? "Arrest details" : "Add arrest details"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {open ? <DetailsForm seq={seq} details={details} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TriChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Tri;
  onChange: (v: Tri) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-caption text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <Choice selected={value === true} onClick={() => onChange(true)}>
          Yes
        </Choice>
        <Choice selected={value === false} onClick={() => onChange(false)}>
          No
        </Choice>
        <Choice selected={value === null} onClick={() => onChange(null)}>
          Not known
        </Choice>
      </div>
    </fieldset>
  );
}

function DetailsForm({
  seq,
  details,
  onDone,
}: {
  seq: number;
  details: Details;
  onDone: () => void;
}) {
  const { store, ui } = useDeskCtx();
  const declaredHm = hhmm(details.declaredAtMs);
  const [witnessed, setWitnessed] = useState<Tri>(details.witnessed);
  const [monitored, setMonitored] = useState<Tri>(details.monitored);
  const [collapse, setCollapse] = useState(
    details.collapseAtIso ? hhmm(details.collapseAtIso) : declaredHm,
  );
  const [cprBefore, setCprBefore] = useState(details.cprBeforeDeclarationAtIso !== null);
  const [cprAt, setCprAt] = useState(
    details.cprBeforeDeclarationAtIso ? hhmm(details.cprBeforeDeclarationAtIso) : declaredHm,
  );

  // Unchanged default → null (= the declaration, to the second); otherwise the chosen minute.
  const collapseAtIso =
    details.collapseAtIso === null && collapse === declaredHm
      ? null
      : timeBefore(collapse, details.declaredAtMs);
  const cprBeforeDeclarationAtIso = cprBefore ? timeBefore(cprAt, details.declaredAtMs) : null;
  const invalid = collapse === "" || (cprBefore && cprBeforeDeclarationAtIso === null);

  const save = () => {
    const input = {
      episodeId: store.episode.id,
      arrestSeq: seq,
      witnessed,
      monitored,
      collapseAtIso,
      cprBeforeDeclarationAtIso,
    };
    // No optimistic row: a superseding declaration carries the original bedside time,
    // which only the server knows exactly — an interim row would move the arrest clocks.
    store.submit({
      label: `Arrest #${seq} details`,
      run: async ({ clientEventId }) =>
        toOutcome(await updateArrestDetailsV2({ ...input, clientEventId })),
    });
    ui.toast({ message: "Recorded" });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-heading-s">Arrest #{seq} details</DialogTitle>
        <DialogDescription className="text-body-s">
          Declared at {declaredHm}. For the Utstein record — fill in what the team knows.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <TriChoice label="Witnessed" value={witnessed} onChange={setWitnessed} />
        <TriChoice
          label="Monitored at the time of arrest"
          value={monitored}
          onChange={setMonitored}
        />
        <label className="block space-y-1.5">
          <span className="text-caption text-muted-foreground">
            Collapse time (defaults to the declaration)
          </span>
          <input
            type="time"
            value={collapse}
            onChange={(e) => setCollapse(e.target.value)}
            className={`${FIELD} font-mono tabular-nums sm:w-40`}
          />
        </label>
        <fieldset className="space-y-1.5">
          <legend className="text-caption text-muted-foreground">
            CPR started before the declaration?
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <Choice selected={!cprBefore} onClick={() => setCprBefore(false)}>
              No — at the declaration
            </Choice>
            <Choice selected={cprBefore} onClick={() => setCprBefore(true)}>
              Yes, at
            </Choice>
            {cprBefore ? (
              <input
                type="time"
                aria-label="CPR started at"
                value={cprAt}
                onChange={(e) => setCprAt(e.target.value)}
                className={`${FIELD} w-32 font-mono tabular-nums`}
              />
            ) : null}
          </div>
        </fieldset>
      </div>
      <DialogFooter>
        <Button variant="secondary" size="lg" onClick={onDone}>
          Cancel
        </Button>
        <Button size="lg" disabled={invalid || store.readOnly} onClick={save}>
          Save arrest details
        </Button>
      </DialogFooter>
    </>
  );
}
