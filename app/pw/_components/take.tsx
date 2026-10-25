"use client";

import type { DayDose, Today } from "@/lib/patient-web/today";
import type { DoseSlot } from "@patient-core/dose-slots";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { patternFor, SLOT_TIMES, SLOT_WORDS } from "@patient-core/dose-slots";
import { CheckIcon, PlusIcon } from "lucide-react";

import { addMedicationAction } from "@/app/patient/track/actions";
import { Chip, ChipRow, Dialog, TextField, Toast } from "@/components/tide/controls";
import { Button, ICON, IconDisc, Note, Overline } from "@/components/tide/kit";
import { HOME_COPY, TAKE_COPY as T } from "@/content/patient/home";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { cn } from "@/lib/utils";
import { takeDoseAction, undoTakeAction } from "../patient/_lib/day-actions";

/**
 * "I took it" everywhere it appears (Home's Now card, the plus's Right now card, the take dialog): one take
 * through the server, the toast with Undo that deletes exactly that take (S5). The page re-renders from the
 * server after each, so the cascade, the rail's badge and Care move together.
 */
export function useTake() {
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);
  const [pending, start] = useTransition();

  const undo = (takeId: string) =>
    start(async () => {
      const r = await undoTakeAction(takeId);
      setToast({ message: r.ok ? T.undone : r.error });
    });

  const take = (dose: DayDose, saved: string) =>
    start(async () => {
      const r = await takeDoseAction(dose.medicationId, dose.scheduledForIso);
      setToast(
        r.ok
          ? { message: saved, onUndo: () => undo(r.takeId) }
          : { message: r.error || PATIENT_WEB_COPY.offline },
      );
    });

  const node = toast ? (
    <Toast
      message={toast.message}
      onUndo={
        toast.onUndo
          ? () => {
              toast.onUndo?.();
              setToast(null);
            }
          : undefined
      }
      onClose={() => setToast(null)}
    />
  ) : null;

  return { take, undo, pending, toast: node, say: (message: string) => setToast({ message }) };
}

/** "Which one did you take?" (the phone's medicine-sheet.tsx) as a centred dialog. Names and times only (L5). */
export function TakeDialog({
  open,
  onOpenChange,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: Today | null;
}) {
  const { take, undo, pending, toast, say } = useTake();
  const [adding, setAdding] = useState(false);
  const close = (o: boolean) => {
    if (!o) setAdding(false);
    onOpenChange(o);
  };
  const doses = today?.doses ?? [];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={close}
        title={adding ? T.addTitle : T.title}
        width="wide"
        footer={adding ? undefined : <Button onClick={() => close(false)}>{T.done}</Button>}
      >
        {adding ? (
          <AddMedicineForm
            onCancel={() => setAdding(false)}
            onDone={(text) => {
              setAdding(false);
              say(text);
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Overline area="medicines">{T.overline(today?.taken ?? 0, today?.total ?? 0)}</Overline>
            {!doses.length ? <p className="text-pw-ink-2 text-[15px]">{T.none}</p> : null}
            <ul className="flex flex-col gap-2">
              {doses.map((d) => (
                <li
                  key={d.id}
                  className={cn(
                    "rounded-pw-row flex items-center gap-3 p-3",
                    d.status === "due"
                      ? "bg-pw-accent-tint ring-pw-accent ring-2 ring-inset"
                      : "bg-pw-surface ring-pw-surface-3 ring-1 ring-inset",
                  )}
                >
                  <span className="flex w-14 shrink-0 flex-col items-center">
                    <span className="font-pw-mono text-[15px] font-semibold">{d.time}</span>
                    <span className="text-pw-ink-3 text-xs">{SLOT_WORDS[d.slot]}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{d.medicine}</span>
                    <span
                      className={cn(
                        "block text-[13px]",
                        d.status === "taken" ? "text-pw-accent-text" : "text-pw-ink-2",
                      )}
                    >
                      {stateLine(d)}
                    </span>
                  </span>
                  {d.status === "taken" ? (
                    d.takeId ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => d.takeId && undo(d.takeId)}
                        aria-label={T.undoLabel(SLOT_WORDS[d.slot])}
                        className="bg-pw-act text-pw-on-act focus-visible:outline-pw-focus grid size-12 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <CheckIcon className="size-[18px]" strokeWidth={2.8} aria-hidden />
                      </button>
                    ) : null
                  ) : (
                    <Button
                      size="s"
                      tone={d.status === "later" ? "outline" : "primary"}
                      busy={pending}
                      aria-label={`${d.status === "later" ? T.tookEarly : HOME_COPY.tookIt}: ${SLOT_WORDS[d.slot]} ${d.medicine}`}
                      onClick={() => take(d, d.status === "later" ? T.savedEarly(d.time) : T.saved)}
                    >
                      {d.status === "later" ? T.tookEarly : HOME_COPY.tookIt}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={`${T.notOnList}. ${T.addTitle}.`}
              className="rounded-pw-row bg-pw-surface-2 hover:bg-pw-surface-3 focus-visible:outline-pw-focus flex min-h-12 items-center gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <IconDisc className="bg-pw-surface text-pw-area-medicines size-8">
                <PlusIcon className="size-4" {...ICON} />
              </IconDisc>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{T.notOnList}</span>
                <span className="text-pw-ink-2 block text-[13px]">{T.notOnListLine}</span>
              </span>
            </button>
            <Note>{T.missedNote}</Note>
          </div>
        )}
      </Dialog>
      {toast}
    </>
  );
}

function stateLine(d: DayDose): string {
  if (d.status === "taken") return T.takenAt(d.takenAt ?? d.time);
  if (d.status === "due") return T.dueNow;
  if (d.status === "later") return T.later;
  if (d.status === "missed") return T.missed;
  return T.noEntry;
}

const SLOTS = Object.keys(SLOT_WORDS) as DoseSlot[];

/** Add a medicine by its name and the times of day (the phone's add-medicine.tsx). No amount (L5). */
export function AddMedicineForm({
  onDone,
  onCancel,
}: {
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<DoseSlot[]>([]);
  const [busy, start] = useTransition();
  const toggle = (s: DoseSlot) =>
    setSlots((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));

  const save = () =>
    start(async () => {
      const times = [...new Set(slots.map((s) => SLOT_TIMES[s]))].sort();
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("schedule_pattern", patternFor(times));
      for (const t of times) fd.append("schedule_times", t);
      const r = await addMedicationAction({}, fd);
      if (r.error) {
        onDone(r.error);
        return;
      }
      router.refresh();
      onDone(T.added(name.trim()));
    });

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={T.nameLabel}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={T.namePlaceholder}
        maxLength={120}
      />
      <div className="flex flex-col gap-2">
        <p className="text-pw-ink-2 text-[15px] font-medium">{T.whenLabel}</p>
        <ChipRow label={T.whenLabel}>
          {SLOTS.map((s) => (
            <Chip key={s} selected={slots.includes(s)} onClick={() => toggle(s)}>
              {`${SLOT_WORDS[s]} · ${SLOT_TIMES[s]}`}
            </Chip>
          ))}
        </ChipRow>
      </div>
      <p className="text-pw-ink-3 text-[13px]">
        {T.prescribed} {PATIENT_WEB_COPY.whoSeesLog}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <Button
          busy={busy}
          disabledReason={name.trim() ? undefined : T.nameFirst}
          onClick={save}
          className="flex-1"
        >
          {T.add}
        </Button>
        <Button tone="outline" onClick={onCancel}>
          {T.cancel}
        </Button>
      </div>
    </div>
  );
}
