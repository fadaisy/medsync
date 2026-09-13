"use client";

import type { CapacityActionState } from "../actions";
import type { DataTableColumn, PillTone } from "@/components/ui/data-table";
import { useActionState, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, DataTableEmpty, Pill } from "@/components/ui/data-table";
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
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";
import { upsertServiceLineAction } from "../actions";
import { INPUT_CLASS } from "./policy-form";

/**
 * Service lines — the hospital's bookable services and, per line, which of
 * the three capacity modes it runs in (ADR 0087). Table of every line, row →
 * sheet editor, "New service line" → the same editor blank. The editor posts
 * to `upsertServiceLineAction` → `ha-upsert-service-line`, which owns audit
 * and the write; the form only refuses what the 0058 CHECKs would refuse.
 */

export interface ServiceLineRow {
  id: string;
  name: string;
  slug: string;
  departmentId: string;
  departmentName: string;
  capacityMode: string;
  timeToCareDays: number;
  continuityDefault: boolean;
  confidential: boolean;
  paymentPosture: string;
  feeUgx: number | null;
  depositUgx: number | null;
  reasonCodes: string[];
  isDefault: boolean;
  active: boolean;
}

export interface DepartmentOption {
  id: string;
  name: string;
}

const MODE_LABEL: Record<string, string> = {
  slot: "Slot",
  session: "Session",
  open_queue: "Open queue",
};

const MODE_TONE: Record<string, PillTone> = {
  slot: "neutral",
  session: "admitted",
  open_queue: "discharged",
};

const POSTURE_LABEL: Record<string, string> = {
  none: "No payment",
  deposit: "Deposit",
  full: "Full fee",
};

const REASON_LABEL: Record<string, string> = {
  follow_up: "Follow-up",
  post_discharge: "Post-discharge",
  new_concern: "New concern",
  refill: "Refill",
  test_results: "Test results",
  antenatal: "Antenatal",
  immunisation: "Immunisation",
  child_wellness: "Child wellness",
  specialist_review: "Specialist review",
  routine: "Routine",
  procedure: "Procedure",
  counselling: "Counselling",
  second_opinion: "Second opinion",
  other: "Other",
};

/** The 13 Appendix A codes plus the shipped catch-all, in Appendix A order. */
const REASON_OPTIONS = [...PATIENT_REASON_CODES, "other"] as const;

export function ServiceLinesSection({
  lines,
  departments,
}: {
  lines: ReadonlyArray<ServiceLineRow>;
  departments: ReadonlyArray<DepartmentOption>;
}) {
  // null = closed; "new" = blank editor; a row = edit that row.
  const [selected, setSelected] = useState<ServiceLineRow | "new" | null>(null);

  const columns: ReadonlyArray<DataTableColumn<ServiceLineRow>> = [
    {
      id: "name",
      header: "Service line",
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-foreground truncate font-medium">
            {row.name}
            {row.active ? "" : <span className="text-muted-foreground"> · inactive</span>}
          </span>
          <span className="text-muted-foreground text-caption truncate font-mono">{row.slug}</span>
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      cell: (row) => <span className="truncate">{row.departmentName}</span>,
      hideOnNarrow: true,
    },
    {
      id: "mode",
      header: "Mode",
      cell: (row) => (
        <Pill tone={MODE_TONE[row.capacityMode] ?? "neutral"}>
          {MODE_LABEL[row.capacityMode] ?? row.capacityMode}
        </Pill>
      ),
    },
    {
      id: "ttc",
      header: "Time to care",
      mono: true,
      cell: (row) => `${row.timeToCareDays} d`,
      hideOnNarrow: true,
    },
    {
      id: "confidential",
      header: "Confidential",
      cell: (row) =>
        row.confidential ? (
          <Pill tone="sensitive">Confidential</Pill>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      hideOnNarrow: true,
    },
    {
      id: "posture",
      header: "Payment",
      cell: (row) => POSTURE_LABEL[row.paymentPosture] ?? row.paymentPosture,
      hideOnNarrow: true,
    },
    {
      id: "default",
      header: "Default",
      cell: (row) =>
        row.isDefault ? <Pill tone="stable">Default</Pill> : <span className="sr-only">No</span>,
    },
  ];

  return (
    <section className="border-border bg-card flex flex-col rounded-lg border">
      <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-foreground text-heading-s font-medium">Service lines</h2>
          <p className="text-muted-foreground text-body-s max-w-xl leading-relaxed">
            What patients can book and how each service takes its patients — a timed slot, a
            numbered position in a clinic session, or a same-day queue. Every department already has
            one slot-mode line; new lines default to session mode.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSelected("new")}
          disabled={departments.length === 0}
          className="w-fit shrink-0"
        >
          <PlusIcon className="size-3.5" />
          New service line
        </Button>
      </div>

      <div className="border-border border-t">
        <DataTable
          data={lines}
          columns={columns}
          rowKey={(row) => row.id}
          onRowSelect={(row) => setSelected(row)}
          selectedRowId={selected && selected !== "new" ? selected.id : null}
          caption="Service lines at this hospital"
          empty={
            <DataTableEmpty
              title="No service lines yet"
              description="Add a department first — each department gets a slot-mode line when it is created — or create a line here."
            />
          }
        />
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent widthClassName="w-full sm:max-w-[600px]">
          {selected !== null ? (
            <ServiceLineEditor
              key={selected === "new" ? "new" : selected.id}
              line={selected === "new" ? null : selected}
              departments={departments}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

/* ─── Editor ───────────────────────────────────────────────────────── */

function ServiceLineEditor({
  line,
  departments,
  onClose,
}: {
  line: ServiceLineRow | null;
  departments: ReadonlyArray<DepartmentOption>;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<CapacityActionState, FormData>(
    upsertServiceLineAction,
    {},
  );
  const [posture, setPosture] = useState(line?.paymentPosture ?? "none");
  const [mode, setMode] = useState(line?.capacityMode ?? "session");

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      {line ? <input type="hidden" name="id" value={line.id} /> : null}
      {line ? <input type="hidden" name="slug" value={line.slug} /> : null}

      <SheetHeader>
        <SheetTitle>{line ? line.name : "New service line"}</SheetTitle>
        <SheetDescription>
          {line
            ? "Changes apply to new bookings. Sessions already published keep their own capacity."
            : "A bookable service inside one department. Patients discover lines, not departments."}
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="sl-name" className="text-caption tracking-tight">
              Name
            </Label>
            <Input
              id="sl-name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={line?.name ?? ""}
              placeholder="e.g. Diabetes Clinic"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sl-department" className="text-caption tracking-tight">
              Department
            </Label>
            <select
              id="sl-department"
              name="department_id"
              required
              defaultValue={line?.departmentId ?? departments[0]?.id ?? ""}
              className={INPUT_CLASS}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sl-mode" className="text-caption tracking-tight">
              Capacity mode
            </Label>
            <select
              id="sl-mode"
              name="capacity_mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="session">Session — numbered position in a clinic</option>
              <option value="slot">Slot — one patient per timed slot</option>
              <option value="open_queue">Open queue — same-day ticket</option>
            </select>
            <span className="text-muted-foreground text-caption">
              {mode === "session"
                ? "Publish weekly clinic sessions below; patients get a position and an arrival window."
                : mode === "slot"
                  ? "Uses the department booking policy and each clinician's availability."
                  : "No sessions or slots; patients take a same-day ticket."}
            </span>
          </div>
        </div>

        <fieldset className="border-border bg-background/40 flex flex-col gap-3 rounded-md border p-4">
          <legend className="text-muted-foreground -ml-1 px-1 font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Access
          </legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sl-ttc" className="text-caption tracking-tight">
              Time to care (days)
            </Label>
            <Input
              id="sl-ttc"
              name="time_to_care_days"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              required
              defaultValue={line?.timeToCareDays ?? 7}
              className="sm:max-w-[160px]"
            />
            <span className="text-muted-foreground text-caption">
              The longest wait this line should offer before it is flagged. Appendix A defaults are
              provisional until CSO sign-off.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span id="sl-reasons-label" className="text-caption text-foreground font-medium">
              Reasons a patient can book this line for
            </span>
            <div role="group" aria-labelledby="sl-reasons-label" className="flex flex-wrap gap-1.5">
              {REASON_OPTIONS.map((code) => (
                <label
                  key={code}
                  className="text-body-s has-checked:border-brand-300 has-checked:bg-accent has-checked:text-accent-foreground border-input bg-background text-muted-foreground ease-expo-out cursor-pointer rounded-md border px-3 py-1.5 transition-colors duration-150 hover:border-gray-300 has-checked:font-medium"
                >
                  <input
                    type="checkbox"
                    name="reason_codes"
                    value={code}
                    defaultChecked={line ? line.reasonCodes.includes(code) : false}
                    className="sr-only"
                  />
                  {REASON_LABEL[code] ?? code}
                </label>
              ))}
            </div>
          </div>
          <label className="text-body-s flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="continuity_default"
              defaultChecked={line?.continuityDefault ?? false}
              className="accent-brand-600 mt-0.5 size-4"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground font-medium">Offer continuity first</span>
              <span className="text-muted-foreground text-caption leading-relaxed">
                Returning patients are shown their last clinician first. Access still wins — the
                soonest session is always offered.
              </span>
            </span>
          </label>
          <label className="text-body-s flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="confidential"
              defaultChecked={line?.confidential ?? false}
              className="accent-brand-600 mt-0.5 size-4"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground font-medium">Confidential service</span>
              <span className="text-muted-foreground text-caption leading-relaxed">
                Hidden from proxy bookers; messages never name the service.
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset className="border-border bg-background/40 flex flex-col gap-3 rounded-md border p-4">
          <legend className="text-muted-foreground -ml-1 px-1 font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Payment posture
          </legend>
          <p className="text-muted-foreground text-body-s leading-relaxed">
            Posture only. No money moves until payments are switched on for this hospital.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sl-posture" className="text-caption tracking-tight">
                Posture
              </Label>
              <select
                id="sl-posture"
                name="payment_posture"
                value={posture}
                onChange={(e) => setPosture(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="none">No payment</option>
                <option value="deposit">Deposit to book</option>
                <option value="full">Full fee to book</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sl-fee" className="text-caption tracking-tight">
                Fee (UGX)
              </Label>
              <Input
                id="sl-fee"
                name="fee_ugx"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                required={posture !== "none"}
                defaultValue={line?.feeUgx ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sl-deposit" className="text-caption tracking-tight">
                Deposit (UGX)
              </Label>
              <Input
                id="sl-deposit"
                name="deposit_ugx"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                disabled={posture !== "deposit"}
                defaultValue={line?.depositUgx ?? ""}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="border-border bg-background/40 flex flex-col gap-3 rounded-md border p-4">
          <legend className="text-muted-foreground -ml-1 px-1 font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Status
          </legend>
          <label className="text-body-s flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="is_default"
              defaultChecked={line?.isDefault ?? false}
              className="accent-brand-600 mt-0.5 size-4"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground font-medium">Hospital default</span>
              <span className="text-muted-foreground text-caption leading-relaxed">
                Where a patient lands when no service is chosen — usually General OPD. One per
                hospital; ticking this here unticks the current default.
              </span>
            </span>
          </label>
          <label className="text-body-s flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="active"
              defaultChecked={line?.active ?? true}
              className="accent-brand-600 mt-0.5 size-4"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground font-medium">Active</span>
              <span className="text-muted-foreground text-caption leading-relaxed">
                Inactive lines take no new bookings; existing ones are untouched.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sl-reason" className="text-caption tracking-tight">
            Audit note
          </Label>
          <Input
            id="sl-reason"
            name="reason"
            minLength={8}
            required
            placeholder="Why this change — at least 8 characters"
          />
          <span className="text-muted-foreground text-caption">
            Recorded against your name in the hospital audit log.
          </span>
        </div>

        {state.error ? (
          <p
            role="alert"
            className="border-alert-border bg-alert-bg text-alert-fg text-body-s rounded-md border p-3"
          >
            {state.error}
          </p>
        ) : null}
      </SheetBody>

      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : line ? "Save service line" : "Create service line"}
        </Button>
      </SheetFooter>
    </form>
  );
}
