"use client";

import { useEffect, useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { RW } from "@/content/pharmacy-rework";
import { fill } from "@/content/pharmacy-workspace-v2";
import { cn } from "@/lib/utils";
import { useOnline } from "../_lib/use-online";
import {
  answerWitnessAction,
  requestWitnessAction,
  waitingForMeAction,
  witnessesOnDutyAction,
  witnessRequestStateAction,
} from "../witness-actions";

const W = RW.witness;

type Person = {
  userId: string;
  name: string;
  role: keyof typeof W.roles | null;
  shift: keyof typeof W.shifts | null;
};
export type WitnessResult =
  | { how: "phone"; attestationId: string; name: string }
  | { how: "paper"; name: string };

/**
 * The witness picker (rework PRD §6.5): people on duty here now, from the roster; "Send to …" puts the request on the
 * witness's own screen and this dialog waits for their answer. Offline, the paper witness's name is typed and the entry
 * is flagged for the in-charge.
 */
export function WitnessDialog({
  open,
  onOpenChange,
  what,
  purpose,
  locationId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** What is being recorded, as the witness will read it. */
  what: string;
  purpose: string;
  locationId: string | null;
  onDone: (r: WitnessResult) => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [roster, setRoster] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [request, setRequest] = useState<string | null>(null);
  const [state, setState] = useState<"waiting" | "declined" | "expired" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState("");
  const online = useOnline();
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    void witnessesOnDutyAction({ locationId }).then((r) => {
      if (!r.ok) return setError(r.error);
      setPeople(r.people as Person[]);
      setRoster(r.roster);
    });
  }, [open, locationId]);

  // Ask every two seconds until the witness answers.
  useEffect(() => {
    if (!request || state !== "waiting") return;
    const t = setInterval(() => {
      void witnessRequestStateAction({ requestId: request }).then((r) => {
        if (!r.ok) return;
        if (r.status === "approved" && r.attestationId) {
          clearInterval(t);
          onDone({ how: "phone", attestationId: r.attestationId, name: person?.name ?? "" });
        } else if (r.status === "declined" || r.status === "expired") setState(r.status);
      });
    }, 2000);
    return () => clearInterval(t);
  }, [request, state, onDone, person]);

  const roles = [...new Set((people ?? []).map((p) => p.role ?? "any"))];
  const shown = (people ?? []).filter((p) => !role || (p.role ?? "any") === role);
  const send = () =>
    person &&
    start(async () => {
      setError(null);
      const r = await requestWitnessAction({
        witnessUserId: person.userId,
        locationId,
        purpose,
        summary: what,
      });
      if (!r.ok) return setError(r.error);
      setRequest(r.id);
      setState("waiting");
    });

  return (
    <EditorDialog open={open} onOpenChange={onOpenChange} width="medium">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{W.title}</DialogTitle>
        <p className="text-body-s text-ink-600">{what}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
        {!online ? (
          <>
            <p className="bg-tide-sunken text-body-s rounded-tide-row px-3 py-2">{W.offline}</p>
            <label className="flex flex-col gap-1 text-[13.5px] font-medium">
              {W.paperName}
              <input
                value={paper}
                onChange={(e) => setPaper(e.target.value)}
                className="bg-card rounded-tide-field h-11 px-3 shadow-[inset_0_0_0_1px_var(--color-ink-300)]"
              />
            </label>
          </>
        ) : state ? (
          <p role="status" className="bg-tide-sunken text-body-s rounded-tide-row px-3 py-2">
            {fill(state === "waiting" ? W.waiting : state === "declined" ? W.declined : W.expired, {
              name: person?.name ?? "",
            })}
          </p>
        ) : (
          <>
            {!roster ? <p className="text-caption text-ink-600">{W.noRoster}</p> : null}
            {roles.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[13.5px] font-medium">{W.who}</span>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={role === r}
                      onClick={() => setRole(role === r ? null : r)}
                      className={cn(
                        "min-h-11 rounded-full px-4 text-[13.5px] sm:min-h-9",
                        role === r
                          ? "bg-tide-navy-900 text-tide-on-band"
                          : "bg-card shadow-tide-card",
                      )}
                    >
                      {r === "any" ? W.onDuty : W.roles[r as keyof typeof W.roles]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <span className="text-overline text-tide-ink-3 uppercase">{W.onDuty}</span>
            {people && !shown.length ? (
              <p className="text-body-s text-ink-600">{W.nobody}</p>
            ) : null}
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {shown.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  aria-pressed={person?.userId === p.userId}
                  onClick={() => setPerson(p)}
                  className={cn(
                    "rounded-tide-row flex min-h-12 flex-col justify-center px-3 py-2 text-left",
                    person?.userId === p.userId
                      ? "bg-tide-lagoon-tint font-semibold"
                      : "bg-card shadow-tide-card",
                  )}
                >
                  <span className="text-[14px]">{p.name}</span>
                  {p.role ? (
                    <span className="text-caption text-ink-600">
                      {W.roles[p.role]}
                      {p.shift ? ` · ${W.shifts[p.shift]}` : ""}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        )}
        {error ? (
          <p role="alert" className="text-body-s text-ink-800">
            {error}
          </p>
        ) : null}
      </div>
      <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3">
        <LabButton variant="quiet" onClick={() => onOpenChange(false)}>
          {W.cancel}
        </LabButton>
        {!online ? (
          <LabButton
            variant="primary"
            disabledReason={paper.trim().length < 3 ? W.paperNameShort : null}
            onClick={() => onDone({ how: "paper", name: paper.trim() })}
          >
            {W.recordPaper}
          </LabButton>
        ) : state === "waiting" ? null : (
          <LabButton
            variant="primary"
            busy={pending}
            disabledReason={person ? null : W.choose}
            onClick={() => {
              setState(null);
              send();
            }}
          >
            {person ? fill(W.send, { name: person.name }) : W.choose}
          </LabButton>
        )}
      </div>
    </EditorDialog>
  );
}

type Waiting = { id: string; purpose: string; summary: string; actorName: string };

/** The witness's side, in the shell: requests waiting for this person, with Approve and Decline. */
export function WitnessInbox() {
  const [rows, setRows] = useState<Waiting[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    let on = true;
    const ask = () => void waitingForMeAction().then((r) => on && r.ok && setRows(r.rows));
    ask();
    const t = setInterval(ask, 5000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);
  if (!rows.length) return null;
  return (
    <section
      aria-label={W.inboxTitle}
      className="bg-tide-navy-900 text-tide-on-band rounded-tide-card flex flex-col gap-2 px-4 py-3 print:hidden"
    >
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3">
          <p className="text-body-s min-w-0 flex-1">
            {fill(W.inboxFrom, { name: r.actorName, summary: r.summary })}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await answerWitnessAction({ requestId: r.id, approve: false });
                setRows((x) => x.filter((y) => y.id !== r.id));
              })
            }
            className="text-tide-on-band min-h-11 rounded-full px-4 text-[13.5px] underline sm:min-h-9"
          >
            {W.decline}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await answerWitnessAction({ requestId: r.id, approve: true });
                setRows((x) => x.filter((y) => y.id !== r.id));
              })
            }
            className="bg-tide-lagoon text-tide-on-lagoon min-h-11 rounded-full px-4 text-[13.5px] font-semibold sm:min-h-9"
          >
            {W.approve}
          </button>
        </div>
      ))}
    </section>
  );
}
