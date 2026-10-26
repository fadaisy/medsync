"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { answerRenewal } from "@/lib/emr/actions/repeats";
import { DEMO_SAVE } from "@/lib/pharmacy/network-demo";

const FIELD =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-9 w-full rounded-md border px-2.5 outline-none";

/**
 * 5.3: Book a visit, or Decline with a signed reason. While the decline reasons are unsigned (Appendix D), Decline
 * is absent: a request is answered only by Renew or Book a visit.
 */
export function RenewalAnswer({
  patientUserId,
  renewalId,
  reasons,
  demo = false,
}: {
  patientUserId: string;
  renewalId: string;
  reasons: { code: string; words: string }[] | null;
  demo?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"visit_needed" | "declined" | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = { code: useId(), note: useId() };
  const send = () =>
    start(async () => {
      if (demo) return setError(DEMO_SAVE);
      const r = await answerRenewal({
        surface: "doctor",
        patientUserId,
        renewalId,
        answer:
          open === "declined" ? { kind: "declined", reasonCode: code } : { kind: "visit_needed" },
        note: note.trim() || null,
      });
      if (!r.ok) return setError(r.error);
      setOpen(null);
      router.refresh();
    });
  const dialog = (kind: "visit_needed" | "declined", label: string, title: string) => (
    <EditorDialog
      width="medium"
      open={open === kind}
      onOpenChange={(o) => setOpen(o ? kind : null)}
      trigger={
        <DialogTrigger render={<Button variant="secondary" size="sm" />}>{label}</DialogTrigger>
      }
    >
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>
          {kind === "visit_needed"
            ? "The request closes as “Visit needed”. The patient and the pharmacy are told; book the visit in scheduling."
            : "The patient is told to contact the clinic. The pharmacy is told."}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-3">
        {kind === "declined" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.code} className="text-caption text-muted-foreground">
              Reason
            </label>
            <select
              id={ids.code}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={FIELD}
            >
              <option value="">Choose a reason</option>
              {reasons?.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.words}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.note} className="text-caption text-muted-foreground">
            Note (optional)
          </label>
          <textarea
            id={ids.note}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            className={`${FIELD} min-h-20 py-2`}
          />
        </div>
        {error ? (
          <p role="status" className="text-body-s">
            {error}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={() => setOpen(null)}>
          Cancel
        </Button>
        <Button disabled={pending || (kind === "declined" && !code)} onClick={send}>
          {label}
        </Button>
      </SheetFooter>
    </EditorDialog>
  );
  return (
    <>
      {dialog("visit_needed", "Book a visit", "Book a visit")}
      {reasons?.length ? dialog("declined", "Decline", "Decline the renewal") : null}
    </>
  );
}
