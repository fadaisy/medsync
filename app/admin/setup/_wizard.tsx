"use client";

import type { StepState } from "./actions";
import { useActionState } from "react";
import { CheckIcon, PlusIcon, TrashIcon } from "lucide-react";

import { DEPARTMENT_GROUPS } from "@/app/signup/hospital/_catalog";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  addWardAction,
  confirmDepartmentsAction,
  finaliseSetupAction,
  inviteBackupAdminAction,
  inviteStaffAction,
  removeWardAction,
} from "./actions";

/**
 * Setup wizard — six steps per kickoff §F.
 *
 * Single-page wizard (no step routing) — each step renders inline,
 * each Confirm button writes its rows via a Server Action and the
 * server re-fetches on revalidatePath so the next render shows
 * fresh state. Resumable: the wizard reads its current position
 * from the data, not from local storage. Closing the tab and
 * returning resumes from the last saved row set.
 */

interface WizardProps {
  hospital: { id: string; name: string; state: string };
  prefilledDepartments: ReadonlyArray<{ code: string; isPrimary: boolean }>;
  confirmedDepartmentSlugs: ReadonlyArray<string>;
  wards: ReadonlyArray<{ id: string; name: string; bedCount: number }>;
  roster: ReadonlyArray<{ id: string; designation: string; email: string; fullName: string }>;
  pendingInvitations: ReadonlyArray<{ id: string; email: string; invitedAtIso: string }>;
}

export function SetupWizard(props: WizardProps) {
  const departmentsDone = props.confirmedDepartmentSlugs.length > 0;
  const wardsDone = props.wards.length > 0;
  const primaryDone = props.roster.some((r) => r.designation === "primary");
  const backupDone = props.roster.some((r) => r.designation === "backup");

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 sm:px-8 sm:py-12">
      <header className="mb-8 flex flex-col gap-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Hospital setup
        </span>
        <h1 className="font-display text-foreground text-[28px] leading-tight font-medium tracking-[-0.02em]">
          Get {props.hospital.name} ready to go live
        </h1>
        <p className="text-muted-foreground text-[14px]">
          Confirm your departments, add your wards, designate a backup admin, and queue any staff
          invitations. When the essentials are in place you can take the hospital live.
        </p>
      </header>

      <ol className="flex flex-col gap-6">
        <Step
          n={1}
          title="Confirm departments"
          done={departmentsDone}
          summary={
            departmentsDone
              ? `${props.confirmedDepartmentSlugs.length} departments confirmed`
              : "Pick the departments you actually run."
          }
        >
          <StepDepartments
            hospitalId={props.hospital.id}
            prefilled={props.prefilledDepartments}
            alreadyConfirmed={props.confirmedDepartmentSlugs}
          />
        </Step>

        <Step
          n={2}
          title="Wards & beds"
          done={wardsDone}
          summary={wardsDone ? `${props.wards.length} wards on file` : "Add at least one ward."}
        >
          <StepWards hospitalId={props.hospital.id} wards={props.wards} />
        </Step>

        <Step
          n={3}
          title="Admin team"
          done={primaryDone}
          summary={`${props.roster.length} on the roster${backupDone ? "" : " · invite a backup"}`}
        >
          <StepAdminTeam hospitalId={props.hospital.id} roster={props.roster} />
        </Step>

        <Step
          n={4}
          title="Staff onboarding"
          summary={`${props.pendingInvitations.length} pending invitations`}
        >
          <StepStaff hospitalId={props.hospital.id} pendingInvitations={props.pendingInvitations} />
        </Step>

        <Step
          n={5}
          title="Connectivity & SMS preferences"
          summary="Confirmed at application time; can be edited after go-live."
        >
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Your connectivity profile was captured during the application. Settings will be editable
            in <span className="text-foreground font-medium">Settings → Connectivity</span> after
            the hospital is live.
          </p>
        </Step>

        <Step
          n={6}
          title="Go live"
          summary={
            departmentsDone && wardsDone && primaryDone
              ? "Essentials complete — ready to activate."
              : "Complete steps 1–3 to enable."
          }
        >
          <StepGoLive
            hospitalId={props.hospital.id}
            ready={departmentsDone && wardsDone && primaryDone}
          />
        </Step>
      </ol>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function Step({
  n,
  title,
  summary,
  done,
  children,
}: {
  n: number;
  title: string;
  summary: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "border-border bg-card overflow-hidden rounded-lg border",
        done && "border-teal-200 dark:border-teal-800/60",
      )}
    >
      <div className="flex items-start gap-3 px-5 py-4">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold",
            done ? "bg-teal-600 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {done ? <CheckIcon className="size-3.5" /> : n}
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <h2 className="text-foreground text-[15px] font-medium tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-[12.5px]">{summary}</p>
        </div>
      </div>
      <div className="border-border border-t px-5 py-4">{children}</div>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function StepDepartments({
  hospitalId,
  prefilled,
  alreadyConfirmed,
}: {
  hospitalId: string;
  prefilled: ReadonlyArray<{ code: string; isPrimary: boolean }>;
  alreadyConfirmed: ReadonlyArray<string>;
}) {
  const [state, action, pending] = useActionState<StepState, FormData>(
    confirmDepartmentsAction,
    {},
  );
  const prefilledCodes = new Set(prefilled.map((d) => d.code));
  const confirmedLower = new Set(alreadyConfirmed.map((c) => c.toLowerCase()));

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="hospital_id" value={hospitalId} />
      <p className="text-muted-foreground text-[12.5px]">
        Pre-selected from your application. Tick to confirm; untick if you don&apos;t currently run
        that department.
      </p>
      <div className="flex flex-col gap-2">
        {DEPARTMENT_GROUPS.map((group) => (
          <fieldset key={group.groupLabel} className="border-border rounded-md border p-3">
            <legend className="text-foreground px-1 text-[12px] font-medium">
              {group.groupLabel}
            </legend>
            <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
              {group.items.map((d) => (
                <label
                  key={d.code}
                  className="text-foreground/90 inline-flex items-center gap-2 text-[13px]"
                >
                  <input
                    type="checkbox"
                    name="departments"
                    value={d.code}
                    defaultChecked={
                      prefilledCodes.has(d.code) || confirmedLower.has(d.code.toLowerCase())
                    }
                    className="size-4"
                  />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {state.error ? (
        <p role="alert" className="text-[12px] text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-[12px] text-teal-700">Saved.</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Confirm departments"}
        </Button>
      </div>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function StepWards({
  hospitalId,
  wards,
}: {
  hospitalId: string;
  wards: ReadonlyArray<{ id: string; name: string; bedCount: number }>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {wards.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {wards.map((w) => (
            <li
              key={w.id}
              className="border-border bg-muted/30 flex items-center justify-between rounded-md border px-3 py-2 text-[13px]"
            >
              <span className="text-foreground font-medium">{w.name}</span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {w.bedCount} bed{w.bedCount === 1 ? "" : "s"}
              </span>
              <RemoveWardForm hospitalId={hospitalId} wardId={w.id} />
            </li>
          ))}
        </ul>
      ) : null}
      <AddWardForm hospitalId={hospitalId} />
    </div>
  );
}

function AddWardForm({ hospitalId }: { hospitalId: string }) {
  const [state, action, pending] = useActionState<StepState, FormData>(addWardAction, {});
  return (
    <form
      action={action}
      className="border-border flex flex-col gap-2 rounded-md border bg-gray-50 p-3 sm:flex-row sm:items-end dark:bg-gray-900/40"
    >
      <input type="hidden" name="hospital_id" value={hospitalId} />
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="ward_name" className="text-[11px]">
          Ward name
        </Label>
        <Input
          id="ward_name"
          name="name"
          placeholder="e.g. Medical Ward 1"
          required
          maxLength={120}
        />
      </div>
      <div className="flex flex-col gap-1 sm:w-[120px]">
        <Label htmlFor="bed_count" className="text-[11px]">
          Beds
        </Label>
        <Input id="bed_count" name="bed_count" type="number" min={0} defaultValue={0} required />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <PlusIcon className="size-3.5" /> Add
      </Button>
      {state.error ? (
        <p role="alert" className="text-[11px] text-red-700 sm:w-full">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function RemoveWardForm({ hospitalId, wardId }: { hospitalId: string; wardId: string }) {
  const [, action, pending] = useActionState<StepState, FormData>(removeWardAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="hospital_id" value={hospitalId} />
      <input type="hidden" name="ward_id" value={wardId} />
      <Button
        type="submit"
        variant="ghost"
        size="iconSm"
        disabled={pending}
        aria-label="Remove ward"
      >
        <TrashIcon className="size-3.5" />
      </Button>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function StepAdminTeam({
  hospitalId,
  roster,
}: {
  hospitalId: string;
  roster: ReadonlyArray<{ id: string; designation: string; email: string; fullName: string }>;
}) {
  const [state, action, pending] = useActionState<StepState, FormData>(inviteBackupAdminAction, {});
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {roster.map((r) => (
          <li
            key={r.id}
            className="border-border bg-muted/30 flex items-center justify-between rounded-md border px-3 py-2 text-[13px]"
          >
            <span className="flex flex-col">
              <span className="text-foreground font-medium">{r.fullName}</span>
              <span className="text-muted-foreground font-mono text-[11px]">{r.email}</span>
            </span>
            <Pill tone={r.designation === "primary" ? "admitted" : "neutral"}>{r.designation}</Pill>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-[12px]">
        Invite a backup admin so day-to-day operations don&apos;t single-point-of-failure on you.
      </p>
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="hospital_id" value={hospitalId} />
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="backup_email" className="text-[11px]">
            Backup admin email
          </Label>
          <Input
            id="backup_email"
            name="email"
            type="email"
            required
            placeholder="colleague@hospital.go.ug"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Inviting…" : "Invite backup admin"}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="text-[12px] text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-[12px] text-teal-700">
          Invitation queued. They&apos;ll claim the role via the invitation link (delivered in a
          follow-up release).
        </p>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function StepStaff({
  hospitalId,
  pendingInvitations,
}: {
  hospitalId: string;
  pendingInvitations: ReadonlyArray<{ id: string; email: string; invitedAtIso: string }>;
}) {
  const [state, action, pending] = useActionState<StepState, FormData>(inviteStaffAction, {});
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-[12.5px]">
        Invite individual clinicians, nurses, pharmacists, and lab tech now — they&apos;ll claim
        their role via the council-anchored verification. Bulk CSV import lands in the next release.
      </p>
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="hospital_id" value={hospitalId} />
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="staff_email" className="text-[11px]">
            Staff email
          </Label>
          <Input id="staff_email" name="email" type="email" required />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Inviting…" : "Queue invitation"}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="text-[12px] text-red-700">
          {state.error}
        </p>
      ) : null}
      {pendingInvitations.length > 0 ? (
        <ul className="flex flex-col gap-1 pt-2">
          {pendingInvitations.map((inv) => (
            <li
              key={inv.id}
              className="text-muted-foreground flex items-center justify-between text-[12px]"
            >
              <span className="font-mono">{inv.email}</span>
              <span className="font-mono text-[11px]">
                {new Date(inv.invitedAtIso).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function StepGoLive({ hospitalId, ready }: { hospitalId: string; ready: boolean }) {
  const [state, action, pending] = useActionState<StepState, FormData>(finaliseSetupAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="hospital_id" value={hospitalId} />
      <p className="text-muted-foreground text-[12.5px]">
        Activating the hospital runs the agreement-gate check, confirms your essential setup (≥ 1
        department, ≥ 1 ward, ≥ 1 primary admin), and flips the hospital to{" "}
        <span className="text-foreground font-medium">active</span>.
      </p>
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="md" disabled={!ready || pending}>
        {pending ? "Activating…" : "Activate hospital"}
      </Button>
    </form>
  );
}
