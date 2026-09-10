"use client";

import type { ScheduleActionState } from "../actions";
import type { ScheduleAppointmentRow } from "./schedule-list";
import { useActionState, useEffect, useState } from "react";
import { CheckIcon, UserXIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
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
import {
  cancelAppointmentAction,
  confirmAppointmentAction,
  declineAppointmentAction,
  markNoShowAction,
} from "../actions";

type Mode = "view" | "confirm" | "decline" | "cancel" | "no_show";

export function AppointmentDetailSheet({
  item,
  onOpenChange,
}: {
  item: ScheduleAppointmentRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent widthClassName="w-full sm:max-w-[560px]">
        {item ? <Content key={item.id} item={item} onClose={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Content({ item, onClose }: { item: ScheduleAppointmentRow; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("view");
  const isPending = item.status === "pending_approval";
  const isConfirmed = item.status === "confirmed";
  const isArrived = item.status === "arrived";
  // useState lazy init keeps Date.now() out of the render body
  // (React's new purity rules flag it as impure).
  const [nowMs] = useState<number>(() => Date.now());
  const isPastStart = new Date(item.startsAtIso).getTime() < nowMs;

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Pill tone="neutral">{item.type === "virtual" ? "Virtual" : "In-person"}</Pill>
          {item.priority === "urgent" ? <Pill tone="critical">Urgent</Pill> : null}
        </div>
        <SheetTitle>{item.patientName}</SheetTitle>
        <SheetDescription>
          {formatWhen(item.startsAtIso)}{" "}
          <span className="text-muted-foreground">· {item.reason.replace(/_/g, " ")}</span>
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <dl className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2 text-[12.5px]">
          <dt className="text-muted-foreground">Patient code</dt>
          <dd className="text-foreground font-mono tabular-nums">{item.patientCode ?? "—"}</dd>
          <dt className="text-muted-foreground">Starts</dt>
          <dd className="text-foreground font-mono tabular-nums">
            {new Date(item.startsAtIso).toLocaleString()}
          </dd>
          <dt className="text-muted-foreground">Ends</dt>
          <dd className="text-foreground font-mono tabular-nums">
            {new Date(item.endsAtIso).toLocaleString()}
          </dd>
        </dl>

        {item.reasonNote ? (
          /* Patient's own words — quiet brand-tinted quote card (no edge bars). */
          <div className="bg-brand-50/50 ring-brand-500/15 dark:bg-brand-950/20 mt-4 rounded-md px-3 py-2 ring-1">
            <p className="text-muted-foreground font-mono text-[10.5px] tracking-[0.12em] uppercase">
              Patient note
            </p>
            <p className="text-foreground text-body-s leading-relaxed italic">
              &ldquo;{item.reasonNote}&rdquo;
            </p>
          </div>
        ) : null}
      </SheetBody>

      <SheetFooter>
        {mode === "view" ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {isPending ? (
              <>
                <Button variant="secondary" onClick={() => setMode("decline")}>
                  <XIcon className="size-3.5" />
                  Decline…
                </Button>
                <Button variant="primary" onClick={() => setMode("confirm")}>
                  <CheckIcon className="size-3.5" />
                  Confirm…
                </Button>
              </>
            ) : null}
            {(isConfirmed || isArrived) && isPastStart ? (
              <Button variant="secondary" onClick={() => setMode("no_show")}>
                <UserXIcon className="size-3.5" />
                Mark no-show…
              </Button>
            ) : null}
            {isPending || isConfirmed || isArrived ? (
              <Button variant="secondary" onClick={() => setMode("cancel")}>
                <XIcon className="size-3.5" />
                Cancel…
              </Button>
            ) : null}
          </div>
        ) : (
          <ActionForm
            mode={mode}
            appointmentId={item.id}
            onCancel={() => setMode("view")}
            onSuccess={onClose}
          />
        )}
      </SheetFooter>
    </>
  );
}

function ActionForm({
  mode,
  appointmentId,
  onCancel,
  onSuccess,
}: {
  mode: "confirm" | "decline" | "cancel" | "no_show";
  appointmentId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const action =
    mode === "confirm"
      ? confirmAppointmentAction
      : mode === "decline"
        ? declineAppointmentAction
        : mode === "cancel"
          ? cancelAppointmentAction
          : markNoShowAction;
  const [state, formAction, pending] = useActionState<ScheduleActionState, FormData>(action, {});
  useEffect(() => {
    if (state.ok) onSuccess();
  }, [state.ok, onSuccess]);

  const sensitive = mode !== "confirm";
  const label =
    mode === "confirm"
      ? "Confirmation note"
      : mode === "decline"
        ? "Reason for declining (visible to patient)"
        : mode === "cancel"
          ? "Reason for cancelling"
          : "Reason for marking no-show";
  const cta =
    mode === "confirm"
      ? pending
        ? "Confirming…"
        : "Confirm"
      : mode === "decline"
        ? pending
          ? "Declining…"
          : "Decline"
        : mode === "cancel"
          ? pending
            ? "Cancelling…"
            : "Cancel appointment"
          : pending
            ? "Recording…"
            : "Mark no-show";
  const placeholder =
    mode === "confirm"
      ? "e.g. Slot confirmed; will see them in Room 3."
      : mode === "decline"
        ? "e.g. I'll be on call that day — please reschedule."
        : mode === "cancel"
          ? "e.g. Clinic moved to Friday this week."
          : "e.g. Patient didn't arrive; tried calling — no answer.";

  return (
    <form action={formAction} className="reveal-up flex w-full flex-col gap-3">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">
          {label} <span className="text-muted-foreground font-normal">(≥ 8 chars, audited)</span>
        </Label>
        <Input
          id="reason"
          name="reason"
          required
          minLength={8}
          autoFocus
          placeholder={placeholder}
          aria-invalid={!!state.error}
          className={cn(sensitive && "border-amber-200")}
        />
        {state.error ? (
          <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">
            {state.error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Back
        </Button>
        <Button
          type="submit"
          variant={mode === "confirm" ? "primary" : "secondary"}
          disabled={pending}
        >
          {cta}
        </Button>
      </div>
    </form>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
