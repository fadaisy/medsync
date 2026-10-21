"use client";

import type { Condition } from "@/lib/pharmacy/stores/readiness-stores";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetBody, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { STORE } from "@/content/pharmacy-stores-store";
import {
  attestLocationApprover,
  recordLocationBriefing,
  recordLocationDrill,
  switchLocation,
} from "../location-actions";

/**
 * Going live per location (Pharmacy Phase 2, 5.12, GL2-1) on the Phase 1 go-live page: each place's conditions
 * with their evidence (counts only: no stock figure, no patient), and the two-person switch. The second hospital
 * admin types their own password and code here; both fields are emptied after every try (D-PH2-23).
 */

const G = STORE.golive;
const TARGET = "min-h-11";
const SELECT =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-md border px-2.5 outline-none";

function evidence(c: Condition): string | null {
  const e = c.evidence;
  if (c.id === "products_set_up") return G.evidence.products(Number(e.products ?? 0));
  if (c.id === "opening_count")
    return G.evidence.counted(Number(e.counted ?? 0), Number(e.of ?? 0));
  if ((c.id === "people_briefed" || c.id === "downtime_drill") && typeof e.at === "string")
    return G.evidence.at(e.at.slice(0, 10));
  return null;
}

export function ConditionList({ conditions }: { conditions: readonly Condition[] }) {
  return (
    <ul className="text-body-s flex flex-col gap-1">
      {conditions.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-2">
          {c.met ? (
            <StatusWord glyph={CheckIcon} icon>
              {G.met}
            </StatusWord>
          ) : (
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {G.notMet}
            </StatusWord>
          )}
          <span>{G.conditions[c.id]}</span>
          {evidence(c) ? <span className="text-muted-foreground">{evidence(c)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Dialog({
  label,
  title,
  submit,
  variant = "secondary",
  disabled,
  onSave,
  children,
}: {
  label: string;
  title: string;
  submit: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onSave: (d: FormData) => Promise<{ ok: boolean; error?: string }>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    start(async () => {
      const r = await onSave(d);
      if (!r.ok) return setError(r.error ?? "");
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <EditorDialog
      width="medium"
      open={open}
      onOpenChange={(n) => {
        setError(null);
        setOpen(n);
      }}
      trigger={
        <DialogTrigger render={<Button variant={variant} className={TARGET} disabled={disabled} />}>
          {label}
        </DialogTrigger>
      }
    >
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {children}
          <p role="status" className="empty:hidden">
            {error ? (
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {error}
              </StatusWord>
            ) : null}
          </p>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            onClick={() => setOpen(false)}
          >
            {G.cancel}
          </Button>
          <Button type="submit" className={TARGET} disabled={pending}>
            {submit}
          </Button>
        </SheetFooter>
      </form>
    </EditorDialog>
  );
}

const s = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

/** GL2-1: switch on (every condition met) or off (a reason), with a second hospital admin's password and code. */
export function SwitchLocation({
  locationId,
  name,
  live,
  ready,
  admins,
}: {
  locationId: string;
  name: string;
  live: boolean;
  ready: boolean;
  admins: readonly { userId: string; name: string }[];
}) {
  const ids = { who: useId(), password: useId(), code: useId(), reason: useId() };
  return (
    <Dialog
      label={live ? G.switchOff : G.switchOn}
      title={live ? G.switchOffTitle(name) : G.switchOnTitle(name)}
      submit={live ? G.switchOff : G.switchOn}
      variant={live ? "secondary" : "primary"}
      disabled={(!live && !ready) || admins.length === 0}
      onSave={async (d) => {
        const a = await attestLocationApprover({
          approverUserId: s(d, "approver"),
          password: String(d.get("password") ?? ""),
          code: s(d, "code"),
        });
        if (!a.ok) return a;
        return switchLocation({
          locationId,
          action: live ? "off" : "on",
          reason: live ? s(d, "reason") : null,
          approvalAttestationId: a.id,
        });
      }}
    >
      {admins.length === 0 ? <p className="text-body-s">{G.noSecond}</p> : null}
      {live ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.reason}>{G.reason}</Label>
          <Input
            id={ids.reason}
            name="reason"
            required
            minLength={10}
            maxLength={500}
            className={TARGET}
          />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.who}>{G.secondAdmin}</Label>
          <select id={ids.who} name="approver" className={SELECT} required defaultValue="">
            <option value="" disabled>
              {G.chooseAdmin}
            </option>
            {admins.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.password}>{G.password}</Label>
          <Input
            id={ids.password}
            name="password"
            type="password"
            autoComplete="off"
            required
            className={TARGET}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.code}>{G.code}</Label>
          <Input
            id={ids.code}
            name="code"
            inputMode="numeric"
            autoComplete="off"
            required
            maxLength={7}
            className={TARGET}
          />
        </div>
      </div>
    </Dialog>
  );
}

export function BriefingDialog({ locationId, name }: { locationId: string; name: string }) {
  const ids = { on: useId(), notes: useId() };
  return (
    <Dialog
      label={G.recordBriefing}
      title={G.briefingTitle(name)}
      submit={G.save}
      onSave={(d) =>
        recordLocationBriefing({ locationId, heldOn: s(d, "heldOn"), notes: s(d, "notes") || null })
      }
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.on}>{G.heldOn}</Label>
        <Input id={ids.on} name="heldOn" required placeholder="2026-10-21" className={TARGET} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.notes}>{G.notes}</Label>
        <Input id={ids.notes} name="notes" maxLength={1000} className={TARGET} />
      </div>
    </Dialog>
  );
}

export function DrillDialog({ locationId, name }: { locationId: string; name: string }) {
  const ids = { on: useId(), who: useId(), what: useId(), problems: useId() };
  return (
    <Dialog
      label={G.recordDrill}
      title={G.drillTitle(name)}
      submit={G.save}
      onSave={(d) =>
        recordLocationDrill({
          locationId,
          heldOn: s(d, "heldOn"),
          participants: s(d, "participants"),
          whatWasDone: s(d, "whatWasDone"),
          problems: s(d, "problems") || null,
          includedDelivery: d.get("includedDelivery") === "on",
          includedIssue: d.get("includedIssue") === "on",
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.on}>{G.heldOn}</Label>
          <Input id={ids.on} name="heldOn" required placeholder="2026-10-21" className={TARGET} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.who}>{G.participants}</Label>
          <Input id={ids.who} name="participants" required maxLength={500} className={TARGET} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={ids.what}>{G.whatWasDone}</Label>
          <Input id={ids.what} name="whatWasDone" required maxLength={1000} className={TARGET} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={ids.problems}>{G.problems}</Label>
          <Input id={ids.problems} name="problems" maxLength={1000} className={TARGET} />
        </div>
        <label className="text-body-s inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" name="includedDelivery" />
          {G.includedDelivery}
        </label>
        <label className="text-body-s inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" name="includedIssue" />
          {G.includedIssue}
        </label>
      </div>
    </Dialog>
  );
}
