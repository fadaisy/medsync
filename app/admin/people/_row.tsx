"use client";

import type { PeopleActionState } from "./actions";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSuperadminAction,
  deactivateUserAction,
  resetUserMfaAction,
  suspendUserAction,
} from "./actions";

type Mode = "idle" | "suspend" | "reset-mfa" | "deactivate" | "promote-sa";

/**
 * Single user row in the People list.
 *
 * Each row reveals a per-action form (suspend / reset-MFA /
 * deactivate / promote-to-superadmin) on click, with a typed reason
 * required for every one. Pending second-approval results are
 * surfaced inline so the operator sees "awaiting second superadmin"
 * even though four-eyes auto-satisfies today.
 */
export function PeopleRow({
  userId,
  email,
  fullName,
  state,
  roles,
}: {
  userId: string;
  email: string;
  fullName: string;
  state: string;
  roles: ReadonlyArray<{ role: string; hospitalId: string | null }>;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [suspendState, suspend, suspending] = useActionState<PeopleActionState, FormData>(
    suspendUserAction,
    {},
  );
  const [resetState, reset, resetting] = useActionState<PeopleActionState, FormData>(
    resetUserMfaAction,
    {},
  );
  const [deactivateState, deactivate, deactivating] = useActionState<PeopleActionState, FormData>(
    deactivateUserAction,
    {},
  );
  const [promoteState, promote, promoting] = useActionState<PeopleActionState, FormData>(
    createSuperadminAction,
    {},
  );

  const isSuperadmin = roles.some((r) => r.role === "superadmin");
  const hospitalAdminScopes = roles.filter((r) => r.role === "hospital_admin").length;

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-[14px] font-medium">{fullName}</span>
          <span className="text-muted-foreground text-[12px]">{email}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StateChip state={state} />
          {isSuperadmin ? (
            <span className="rounded-full bg-teal-100/60 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-teal-800 uppercase dark:bg-teal-50/15 dark:text-teal-200">
              superadmin
            </span>
          ) : null}
          {hospitalAdminScopes > 0 ? (
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
              hospital_admin × {hospitalAdminScopes}
            </span>
          ) : null}
        </div>
      </div>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {state !== "suspended" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("suspend")}>
              Suspend
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode("reset-mfa")}>
            Reset MFA
          </Button>
          {state !== "deactivated" ? (
            <Button type="button" variant="alert" size="sm" onClick={() => setMode("deactivate")}>
              Deactivate
            </Button>
          ) : null}
          {!isSuperadmin ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setMode("promote-sa")}
            >
              Promote to superadmin
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === "suspend" ? (
        <ReasonForm
          state={suspendState}
          action={suspend}
          pending={suspending}
          userId={userId}
          label="Reason for suspending (audit log)"
          submitLabel="Confirm suspend"
          onCancel={() => setMode("idle")}
        />
      ) : null}
      {mode === "reset-mfa" ? (
        <ReasonForm
          state={resetState}
          action={reset}
          pending={resetting}
          userId={userId}
          label="Reason for resetting MFA (audit log)"
          submitLabel="Confirm reset"
          onCancel={() => setMode("idle")}
        />
      ) : null}
      {mode === "deactivate" ? (
        <ReasonForm
          state={deactivateState}
          action={deactivate}
          pending={deactivating}
          userId={userId}
          label="Reason for deactivating (audit log)"
          submitLabel="Confirm deactivate"
          onCancel={() => setMode("idle")}
        />
      ) : null}
      {mode === "promote-sa" ? (
        <form
          action={promote}
          className="border-border bg-muted/40 flex flex-col gap-2 rounded-md border-l-2 border-teal-500 p-3"
        >
          <input type="hidden" name="target_user_id" value={userId} />
          <p className="text-muted-foreground text-[11.5px]">
            Promoting <span className="text-foreground">{email}</span> to{" "}
            <span className="text-teal-700 dark:text-teal-300">superadmin</span> — the most powerful
            role in the system. Four-eyes-aware: auto-satisfies today (only 1 real superadmin), will
            enforce a 2nd confirmation once a 2nd exists.
          </p>
          <label className="text-muted-foreground text-[11px]">
            Justification (audit log; ≥ 8 chars)
          </label>
          <Input
            autoFocus
            name="justification"
            placeholder="e.g. assigning Caroline as co-platform-operator"
            minLength={8}
            required
          />
          {promoteState.error ? (
            <p className="text-destructive text-[11.5px]">{promoteState.error}</p>
          ) : null}
          {promoteState.ok && promoteState.awaitingSecondApproval ? (
            <p className="text-[11.5px] text-amber-700 dark:text-amber-300">
              Awaiting second superadmin approval (pending id: {promoteState.pendingId}).
            </p>
          ) : null}
          {promoteState.ok && !promoteState.awaitingSecondApproval ? (
            <p className="text-[11.5px] text-teal-700 dark:text-teal-300">
              Promoted. (Auto-satisfied because only 1 real superadmin exists; recorded.)
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={promoting}>
              {promoting ? "Submitting…" : "Confirm"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function ReasonForm({
  state,
  action,
  pending,
  userId,
  label,
  submitLabel,
  onCancel,
}: {
  state: PeopleActionState;
  action: (formData: FormData) => void;
  pending: boolean;
  userId: string;
  label: string;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <form
      action={action}
      className="border-border bg-muted/40 flex flex-col gap-2 rounded-md border p-3"
    >
      <input type="hidden" name="user_id" value={userId} />
      <label className="text-muted-foreground text-[11px]">{label}</label>
      <Input autoFocus name="reason" minLength={8} required />
      {state.error ? <p className="text-destructive text-[11.5px]">{state.error}</p> : null}
      {state.ok ? <p className="text-[11.5px] text-teal-700 dark:text-teal-300">Done.</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Submitting…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function StateChip({ state }: { state: string }) {
  const tone =
    state === "active"
      ? "bg-teal-100/60 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200"
      : state === "suspended" || state === "deactivated" || state === "rejected"
        ? "bg-red-100/60 text-red-800 dark:bg-red-100/10 dark:text-red-200"
        : state === "pending_approval"
          ? "bg-amber-100/60 text-amber-800 dark:bg-amber-100/10 dark:text-amber-200"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase ${tone}`}
    >
      {state}
    </span>
  );
}
