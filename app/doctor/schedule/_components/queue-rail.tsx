"use client";

import { useState, useTransition } from "react";
import { AlertTriangleIcon, ClockIcon, PlayIcon, PlusIcon, UserPlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { recordWalkinAction, startEncounterAction } from "../actions";

export interface QueueRow {
  id: string;
  kind: string;
  state: string;
  arrivedAtIso: string;
  sequenceNumber: number;
  patientCode: string | null;
  appointmentId: string | null;
  notes: string | null;
}

const KIND_LABEL: Record<string, string> = {
  scheduled_arrival: "Scheduled",
  walk_in: "Walk-in",
  urgent_walk_in: "Urgent walk-in",
};

/**
 * Day-view queue rail. Renders the department's same-day queue
 * entries (waiting + being_seen). The doctor can:
 *   - Call a waiting patient → starts an encounter (ha-start-encounter)
 *   - Record a new walk-in (ha-record-walkin)
 */
export function QueueRail({ entries }: { entries: ReadonlyArray<QueueRow> }) {
  const waiting = entries.filter((e) => e.state === "waiting");
  const beingSeen = entries.filter((e) => e.state === "being_seen");

  return (
    <aside
      aria-label="Department queue today"
      className="border-border bg-card flex h-full w-full flex-col gap-3 rounded-xl border p-3 lg:max-w-[280px]"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Today&rsquo;s queue
        </h2>
        <span className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
          {entries.length}
        </span>
      </header>

      {/* Being seen */}
      {beingSeen.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground font-mono text-[9.5px] tracking-[0.14em] uppercase">
            Now seeing
          </h3>
          <ul className="stagger-children flex flex-col gap-1">
            {beingSeen.map((e) => (
              <li key={e.id}>
                <QueueChip row={e} variant="being_seen" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Waiting */}
      <section className="flex flex-col gap-1.5">
        <h3 className="text-muted-foreground font-mono text-[9.5px] tracking-[0.14em] uppercase">
          Waiting · {waiting.length}
        </h3>
        {waiting.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">No one waiting right now.</p>
        ) : (
          <ul className="stagger-children flex flex-col gap-1">
            {waiting.map((e) => (
              <li key={e.id}>
                <QueueChip row={e} variant="waiting" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecordWalkinButton />
    </aside>
  );
}

function QueueChip({ row, variant }: { row: QueueRow; variant: "waiting" | "being_seen" }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isUrgent = row.kind === "urgent_walk_in";

  function call() {
    setError(null);
    startTransition(async () => {
      const result = await startEncounterAction({
        appointmentId: row.appointmentId ?? undefined,
        queueEntryId: row.appointmentId ? undefined : row.id,
        reason: "Called from queue rail.",
      });
      if (!result.ok) setError(result.error ?? "Couldn't start encounter.");
    });
  }

  return (
    <div
      className={cn(
        "border-border flex items-start gap-2 rounded-md border px-2.5 py-2 transition-colors duration-200",
        variant === "being_seen" && "border-blue-500/40 bg-blue-50/40 dark:bg-blue-950/15",
        isUrgent && variant === "waiting" && "border-rose-500/40 bg-rose-50/40 dark:bg-rose-950/15",
        !isUrgent && variant === "waiting" && "hover:border-gray-300 hover:bg-teal-50/30",
      )}
    >
      <span aria-hidden className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
        #{row.sequenceNumber}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-foreground inline-flex items-center gap-1 text-[12.5px] font-medium">
          {row.patientCode ?? "Patient"}
          {isUrgent ? (
            <AlertTriangleIcon className="size-3 text-rose-600 dark:text-rose-400" aria-hidden />
          ) : null}
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[10px] tabular-nums">
          <ClockIcon className="size-2.5" aria-hidden />
          {formatRelative(row.arrivedAtIso)} · {KIND_LABEL[row.kind] ?? row.kind}
        </span>
        {row.notes ? (
          <span className="text-muted-foreground/90 text-[11px] italic">{row.notes}</span>
        ) : null}
        {error ? <span className="text-destructive scale-in text-[11px]">{error}</span> : null}
      </div>
      {variant === "waiting" ? (
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          disabled={pending}
          onClick={call}
          aria-label={`Call ${row.patientCode ?? "patient"}`}
          title="Call + start encounter"
        >
          <PlayIcon className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function RecordWalkinButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="mt-auto"
      >
        <UserPlusIcon className="size-3.5" aria-hidden />
        Record walk-in
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent widthClassName="w-full sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>Record a walk-in</SheetTitle>
            <SheetDescription>
              Add a patient who arrived without an appointment to today&rsquo;s queue. Audited.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <RecordWalkinForm onSuccess={() => setOpen(false)} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

function RecordWalkinForm({ onSuccess }: { onSuccess: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [urgent, setUrgent] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    formData.set("urgent", urgent ? "true" : "false");
    startTransition(async () => {
      const result = await recordWalkinAction({}, formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't record walk-in.");
        return;
      }
      onSuccess();
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="patient_user_id" className="text-[11px] tracking-tight">
          Patient ID (UUID)
        </Label>
        <Input
          id="patient_user_id"
          name="patient_user_id"
          placeholder="A patient picker lands in a polish pass."
          required
          className="font-mono text-[12px]"
        />
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Paste the patient&rsquo;s UUID for now — the picker ships with the patient-directory
          polish pass.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="walkin-notes" className="text-[11px] tracking-tight">
          Notes (optional)
        </Label>
        <Input
          id="walkin-notes"
          name="notes"
          placeholder="Anything the next clinician should see at a glance."
          maxLength={500}
        />
      </div>

      <label className="border-border bg-card tap hover:bg-muted/20 flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          className="mt-0.5 size-4 accent-rose-600"
        />
        <span className="flex flex-1 flex-col">
          <span className="text-foreground text-[13px] font-medium">Mark as urgent</span>
          <span className="text-muted-foreground text-[11.5px]">
            Walks the queue to the front and flags the entry rose. Use sparingly.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="walkin-reason" className="text-[11px] tracking-tight">
          Reason (audited · ≥ 8 chars)
        </Label>
        <Input
          id="walkin-reason"
          name="reason"
          minLength={8}
          maxLength={200}
          defaultValue="Walk-in at reception."
          required
        />
      </div>

      {error ? (
        <p className="text-destructive border-destructive/30 bg-destructive/5 scale-in rounded-md border px-3 py-2 text-[12px] leading-relaxed">
          {error}
        </p>
      ) : null}

      <SheetFooter className="px-0">
        <Button type="submit" disabled={pending}>
          {pending ? (
            "Recording…"
          ) : (
            <>
              <PlusIcon className="size-3.5" aria-hidden />
              Record walk-in
            </>
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

function formatRelative(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  return `${diffH}h`;
}
