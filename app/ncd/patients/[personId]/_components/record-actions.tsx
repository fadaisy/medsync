"use client";

import type { ConditionModule, ReviewComponent } from "@/lib/ncdreg/standard/types";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlusIcon, ClipboardPlusIcon, PhoneIcon, PlusIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { REFERRAL_SOURCE, WHERE_FIRST_DIAGNOSED } from "@/lib/ncdreg/standard/code-lists";
import { revealPhoneAction } from "../../../actions";
import { EventDialog } from "../../../_components/event-dialog";
import { useOutbox } from "../../../_components/outbox-provider";
import { Seg } from "../../../visit/[visitId]/_components/controls";
import { ReviewDialog } from "./review-dialog";

const field = "border-input h-10 rounded-lg border bg-transparent px-3 text-[14px]";

export function RecordActions({
  personId,
  personName,
  modules,
  addable,
  reviewComponents,
  today,
  can,
  alive,
}: {
  personId: string;
  personName: string;
  modules: ConditionModule[];
  /** Enabled modules the person is not yet registered for (A4). */
  addable: ConditionModule[];
  reviewComponents: (ReviewComponent | "other")[];
  today: string;
  can: { visit: boolean; event: boolean; enrol: boolean; review: boolean };
  alive: boolean;
}) {
  const router = useRouter();
  const { submit } = useOutbox();
  const [dialog, setDialog] = useState<null | "event" | "registration" | "review">(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const startVisit = () =>
    start(async () => {
      const visitId = crypto.randomUUID();
      const r = await submit("visit.arrive", { visitId, personId, visitType: "unscheduled" });
      if (!r.ok) return setMsg("message" in r ? r.message : "Not saved");
      router.push(`/ncd/visit/${visitId}`);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {can.visit && alive ? (
        <Button onClick={startVisit} disabled={pending}>
          <CalendarPlusIcon aria-hidden /> Start a visit
        </Button>
      ) : null}
      {can.review && reviewComponents.length ? (
        <Button variant="secondary" onClick={() => setDialog("review")}>
          <ClipboardPlusIcon aria-hidden /> Record a review
        </Button>
      ) : null}
      {can.event ? (
        <Button variant="secondary" onClick={() => setDialog("event")}>
          Record an event
        </Button>
      ) : null}
      {can.enrol && addable.length && alive ? (
        <Button variant="secondary" onClick={() => setDialog("registration")}>
          <PlusIcon aria-hidden /> Add a condition
        </Button>
      ) : null}
      {msg ? (
        <p role="alert" className="text-caption text-ink-800">
          {msg}
        </p>
      ) : null}
      <EventDialog open={dialog === "event"} onOpenChange={(o) => setDialog(o ? "event" : null)} personId={personId} personName={personName} modules={modules} today={today} onDone={() => router.refresh()} />
      <ReviewDialog open={dialog === "review"} onOpenChange={(o) => setDialog(o ? "review" : null)} personId={personId} components={reviewComponents} today={today} />
      <RegistrationDialog open={dialog === "registration"} onOpenChange={(o) => setDialog(o ? "registration" : null)} personId={personId} modules={addable} />
    </div>
  );
}

function RegistrationDialog({ open, onOpenChange, personId, modules }: { open: boolean; onOpenChange: (o: boolean) => void; personId: string; modules: ConditionModule[] }) {
  const router = useRouter();
  const { submit } = useOutbox();
  const [code, setCode] = useState(modules[0]?.code ?? "");
  const m = modules.find((x) => x.code === code);
  const [subtype, setSubtype] = useState("");
  const [basis, setBasis] = useState("");
  const [year, setYear] = useState("");
  const [where, setWhere] = useState("");
  const [referral, setReferral] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sub = m && m.subtypes.length === 1 ? m.subtypes[0]!.code : subtype;
  const save = () =>
    start(async () => {
      const r = await submit("registration.add", {
        personId,
        registrationId: crypto.randomUUID(),
        condition: code,
        subtype: sub,
        basisOfDiagnosis: basis,
        diagnosisYear: Number(year),
        whereFirstDiagnosed: where || null,
        referralSource: referral || null,
      });
      if (!r.ok) return setMsg("message" in r ? r.message : "Not saved");
      onOpenChange(false);
      router.refresh();
    });
  return (
    <EditorDialog open={open} onOpenChange={onOpenChange} width="medium">
      <SheetHeader>
        <SheetTitle>Add a condition</SheetTitle>
        <SheetDescription>One registration per condition; the date is today.</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-4">
        <Seg label="Condition" hideLabel={false} value={code} onChange={(v) => (setCode(v), setSubtype(""), setBasis(""))} options={modules.map((x) => [x.code, x.label] as const)} />
        {m && m.subtypes.length > 1 ? <Seg label="Type" hideLabel={false} value={subtype} onChange={setSubtype} options={m.subtypes.map((s) => [s.code, s.label] as const)} /> : null}
        {m ? <Seg label="Basis of diagnosis" hideLabel={false} value={basis} onChange={setBasis} options={m.basis_of_diagnosis.map((s) => [s.code, s.label] as const)} /> : null}
        <label className="flex w-40 flex-col gap-1">
          <span className="text-label">Year diagnosed</span>
          <input className={`${field} font-mono`} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </label>
        <Seg label="Where first diagnosed" hideLabel={false} value={where} onChange={setWhere} options={WHERE_FIRST_DIAGNOSED.codes.map((c) => [c.code, c.label] as const)} />
        <Seg label="Referred from" hideLabel={false} value={referral} onChange={setReferral} options={REFERRAL_SOURCE.codes.map((c) => [c.code, c.label] as const)} />
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
        <Button onClick={save} disabled={!code || !sub || !basis || year.length !== 4 || pending}>
          Add
        </Button>
      </SheetFooter>
    </EditorDialog>
  );
}

/** "Show number": revealed on request only, audited server-side; a demo number is never dialable. */
export function ShowNumber({ personId, slot, masked, demo }: { personId: string; slot: 1 | 2; masked: string; demo: boolean }) {
  const [shown, setShown] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <PhoneIcon className="text-ink-500 size-3.5" aria-hidden />
      <span className="font-mono tabular-nums">{shown ?? masked}</span>
      {demo ? <span className="text-ink-600 text-[11px]">Demo number, do not call</span> : null}
      {!shown ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await revealPhoneAction(personId, slot);
              if (r.ok && r.value) setShown(r.value.number);
            })
          }
        >
          Show number
        </Button>
      ) : null}
    </span>
  );
}
