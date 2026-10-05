"use client";

import type { ConditionModule } from "@/lib/ncdreg/standard/types";
import { useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ADMISSION_REASON,
  DEATH_PLACE,
  DEATH_SOURCE,
  EVENT_TYPE,
  REPORTING_UNITS,
} from "@/lib/ncdreg/standard/code-lists";
import { Seg } from "../visit/[visitId]/_components/controls";
import { useOutbox } from "./outbox-provider";

const field = "border-input h-10 rounded-lg border bg-transparent px-3 text-[14px]";

/**
 * D1–D3: the event form. It needs only the person, the type and the date; further fields appear only
 * for the types that need them. Death, transfer and withdrawal end active status and cancel every
 * pending reminder at once (server-side). Online-only (§9).
 */
export function EventDialog({
  open,
  onOpenChange,
  personId,
  personName,
  modules,
  initialType,
  today,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  personId: string;
  personName: string;
  /** The person's condition modules: their admission reasons and event types join the shared lists. */
  modules: readonly ConditionModule[];
  initialType?: string;
  today: string;
  onDone?: () => void;
}) {
  const { submit } = useOutbox();
  const [type, setType] = useState(initialType ?? "");
  const [date, setDate] = useState(today);
  const [estimated, setEstimated] = useState(false);
  const [unit, setUnit] = useState("ncd_clinic");
  const [reason, setReason] = useState("");
  const [place, setPlace] = useState("");
  const [source, setSource] = useState("");
  const [cause, setCause] = useState("");
  const [destination, setDestination] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const types = [...EVENT_TYPE.codes, ...modules.flatMap((m) => m.event_types)];
  const reasons = [...ADMISSION_REASON.codes, ...modules.flatMap((m) => m.admission_reasons)];
  const ready =
    type && date && (type !== "admission" || reason) && (type !== "death" || (place && source));

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await submit("event.record", {
        eventId: crypto.randomUUID(),
        personId,
        type,
        eventDate: date,
        dateEstimated: estimated,
        reportingUnit: unit,
        admissionReason: type === "admission" ? reason : null,
        death: type === "death" ? { place, source, cause: cause || null } : null,
        transferDestination: type === "transfer_out" ? destination || null : null,
      });
      if (!r.ok) return setMsg("message" in r ? r.message : "Not saved");
      onOpenChange(false);
      onDone?.();
    });

  return (
    <EditorDialog open={open} onOpenChange={onOpenChange} width="medium">
      <SheetHeader>
        <SheetTitle>Record an event</SheetTitle>
        <SheetDescription>{personName}</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-label">Event</span>
          <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Choose…</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-label">Date</span>
            <input
              type="date"
              max={today}
              className={`${field} font-mono`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="text-body-s inline-flex h-10 items-center gap-2">
            <input
              type="checkbox"
              checked={estimated}
              onChange={(e) => setEstimated(e.target.checked)}
            />{" "}
            Date estimated
          </label>
        </div>
        <Seg
          label="Reported by"
          hideLabel={false}
          value={unit}
          onChange={setUnit}
          options={REPORTING_UNITS.codes.map((c) => [c.code, c.label] as const)}
        />
        {type === "admission" ? (
          <label className="flex flex-col gap-1">
            <span className="text-label">Main reason for admission</span>
            <select className={field} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose…</option>
              {reasons.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {type === "death" ? (
          <>
            <Seg
              label="Place"
              hideLabel={false}
              value={place}
              onChange={setPlace}
              options={DEATH_PLACE.codes.map((c) => [c.code, c.label] as const)}
            />
            <Seg
              label="Information from"
              hideLabel={false}
              value={source}
              onChange={setSource}
              options={DEATH_SOURCE.codes.map((c) => [c.code, c.label] as const)}
            />
            <label className="flex flex-col gap-1">
              <span className="text-label">Cause, if known (optional)</span>
              <input className={field} value={cause} onChange={(e) => setCause(e.target.value)} />
            </label>
          </>
        ) : null}
        {type === "transfer_out" ? (
          <label className="flex flex-col gap-1">
            <span className="text-label">Transferred to (optional)</span>
            <input
              className={field}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </label>
        ) : null}
        {type === "death" || type === "transfer_out" || type === "withdrawal" ? (
          <p className="text-caption text-ink-700">
            This ends active follow-up and stops every pending reminder.
          </p>
        ) : null}
        {msg ? (
          <p role="alert" className="text-body-s text-ink-800">
            {msg}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!ready || pending}>
          Record event
        </Button>
      </SheetFooter>
    </EditorDialog>
  );
}
