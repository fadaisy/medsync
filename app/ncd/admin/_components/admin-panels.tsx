"use client";

import type { AdminResult } from "../actions";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  assignRoleAction,
  decideDefinitionAction,
  decideGoLiveAction,
  demoContinueAction,
  demoOffAction,
  demoOnAction,
  proposeDefinitionAction,
  removeAllSyntheticAction,
  requestGoLiveAction,
  revokeRoleAction,
  setConditionAction,
  updateSettingsAction,
} from "../actions";
import { Seg } from "../../visit/[visitId]/_components/controls";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<AdminResult>, after?: (r: AdminResult) => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? null) : r.message);
      after?.(r);
      router.refresh();
    });
  return { pending, msg, run, setMsg };
}
const Msg = ({ msg }: { msg: string | null }) =>
  msg ? (
    <p role="status" className="text-body-s text-ink-800">
      {msg}
    </p>
  ) : null;

/* ─── I5 Demo data card ────────────────────────────────────────────────── */

export function DemoCard({
  demo,
  copy,
  modes,
  approved,
  canManage,
  initialOpen,
}: {
  demo: { status: string; mode: string; startedAt: string; counts: Record<string, unknown>; progress: Record<string, unknown> } | null;
  copy: { switch_on: string; switch_off: string; confirm_off: string; blocked_after_go_live: string };
  modes: { id: string; label: string; description: string }[];
  approved: boolean;
  canManage: boolean;
  initialOpen: "on" | "off" | null;
}) {
  const a = useAction();
  const [dialog, setDialog] = useState<"on" | "off" | null>(canManage ? initialOpen : null);
  const [mode, setMode] = useState("scenario");
  const on = demo && ["loading", "on"].includes(demo.status);
  const loading = demo?.status === "loading";
  const progress = demo?.progress as { next?: number; total?: number } | undefined;
  // Full clinic: keep loading in chunks while the card is open (the cron route does the same).
  useEffect(() => {
    if (!loading || a.pending) return;
    const t = window.setTimeout(() => a.run(() => demoContinueAction()), 300);
    return () => window.clearTimeout(t);
  }, [loading, a]);
  return (
    <section id="demo" aria-labelledby="demo-h" className="border-border flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="demo-h" className="text-heading-s">
        Demo data
      </h2>
      <p className="text-body-s">
        {on ? (loading ? "Loading" : "On") : "Off"}
        {demo && on ? ` · ${modes.find((m) => m.id === demo.mode)?.label ?? demo.mode} · since ${new Date(demo.startedAt).toLocaleString("en-GB")}` : ""}
      </p>
      {loading && progress?.total ? (
        <div className="flex flex-col gap-1">
          <div className="bg-ink-100 h-2 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.next ?? 0}>
            <div className="bg-teal-600 h-full" style={{ width: `${Math.round((100 * (progress.next ?? 0)) / progress.total)}%` }} />
          </div>
          <p className="text-caption text-ink-600">
            {progress.next ?? 0} of {progress.total} generated patients written. Capture screens are usable already.
          </p>
        </div>
      ) : null}
      {demo?.status === "on" && demo.counts ? (
        <p className="text-caption text-ink-600">
          {String(demo.counts.persons ?? "–")} demo patients · {String(demo.counts.visits ?? "–")} visits
        </p>
      ) : null}
      {approved ? <p className="text-caption text-ink-700">{copy.blocked_after_go_live}</p> : null}
      {canManage && !approved ? (
        <div>
          {on ? (
            <Button variant="secondary" onClick={() => setDialog("off")}>
              {copy.switch_off}
            </Button>
          ) : (
            <Button onClick={() => setDialog("on")}>{copy.switch_on}</Button>
          )}
        </div>
      ) : null}
      <Msg msg={a.msg} />
      <EditorDialog open={dialog === "on"} onOpenChange={(o) => setDialog(o ? "on" : null)} width="medium">
        <SheetHeader>
          <SheetTitle>{copy.switch_on}</SheetTitle>
          <SheetDescription>Synthetic patients only. Nothing here is a real patient, and no SMS is ever sent to a demo patient.</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
          {modes.map((m) => (
            <label key={m.id} className="border-border has-[:checked]:border-teal-edge has-[:checked]:bg-teal-tint flex cursor-pointer gap-3 rounded-lg border p-3">
              <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
              <span className="flex flex-col">
                <span className="text-label">{m.label}</span>
                <span className="text-caption text-ink-600">{m.description}</span>
              </span>
            </label>
          ))}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button disabled={a.pending} onClick={() => a.run(() => demoOnAction(mode), () => setDialog(null))}>
            {copy.switch_on}
          </Button>
        </SheetFooter>
      </EditorDialog>
      <EditorDialog open={dialog === "off"} onOpenChange={(o) => setDialog(o ? "off" : null)} width="medium">
        <SheetHeader>
          <SheetTitle>{copy.switch_off}</SheetTitle>
          <SheetDescription>{copy.confirm_off}</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button variant="secondary" onClick={() => setDialog(null)}>
            Keep demo data
          </Button>
          <Button disabled={a.pending} onClick={() => a.run(() => demoOffAction(true), () => setDialog(null))}>
            Remove demo data
          </Button>
        </SheetFooter>
      </EditorDialog>
    </section>
  );
}

/* ─── I4 Condition catalogue ───────────────────────────────────────────── */

export function CatalogueTable({
  rows,
  approved,
  canManage,
}: {
  rows: { code: string; label: string; level: string; status: string; version: string; enabled: boolean; registrations: number; versions: number }[];
  approved: boolean;
  canManage: boolean;
}) {
  const a = useAction();
  return (
    <section aria-labelledby="cat-h" className="flex flex-col gap-3">
      <h2 id="cat-h" className="text-heading-s">
        Condition catalogue
      </h2>
      <div className="border-border overflow-x-auto border-y">
        <table className="w-full min-w-[720px] text-[14px]">
          <caption className="sr-only">Condition modules at this facility</caption>
          <thead>
            <tr className="text-ink-600 border-border border-b text-left text-[13px]">
              {["Module", "Level", "Status", "Version", "Registrations", "Enabled", ""].map((h) => (
                <th key={h} scope="col" className="h-11 px-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const blocked = !r.enabled && approved && r.level === "core" && r.status !== "approved";
              return (
                <tr key={r.code} className="border-border border-b last:border-b-0">
                  <td className="h-12 px-3">{r.label}</td>
                  <td className="px-3 capitalize">{r.level}</td>
                  <td className="px-3">{r.status}</td>
                  <td className="px-3 font-mono text-[12px]">{r.version}</td>
                  <td className="px-3 font-mono tabular-nums">{r.registrations}</td>
                  <td className="px-3">{r.enabled ? "Yes" : "No"}</td>
                  <td className="px-3 text-right">
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={a.pending || blocked}
                        title={blocked ? "After go-live only an approved module can be enabled." : undefined}
                        onClick={() => a.run(() => setConditionAction(r.code, !r.enabled, r.enabled ? "Disabled by the registry lead" : "Enabled by the registry lead"))}
                      >
                        {r.enabled ? "Disable" : "Enable"}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-ink-600">Disabling a module refuses new registrations only; existing records stay readable and its indicators keep reporting. Every change is versioned and audited.</p>
      <Msg msg={a.msg} />
    </section>
  );
}

/* ─── I3 Settings ──────────────────────────────────────────────────────── */

export function SettingsForm({ initial, canManage }: { initial: Record<string, unknown>; canManage: boolean }) {
  const a = useAction();
  const [v, setV] = useState<Record<string, string>>(() => ({
    glucoseUnit: String(initial.glucoseUnit),
    creatinineUnit: String(initial.creatinineUnit),
    reminderBeforeDays: String(initial.reminderBeforeDays),
    reminderAfterDays: String(initial.reminderAfterDays),
    reminderMaxMissed: String(initial.reminderMaxMissed),
    sendWindowStart: String(initial.sendWindowStart).slice(0, 5),
    sendWindowEnd: String(initial.sendWindowEnd).slice(0, 5),
    defaultIntervalWeeks: (initial.defaultIntervalWeeks as number[]).join(", "),
    hospitalDisplayName: String(initial.hospitalDisplayName ?? ""),
    clinicPhone: String(initial.clinicPhone ?? ""),
  }));
  const set = (k: string) => (x: string) => setV({ ...v, [k]: x });
  const field = "border-input h-9 rounded-lg border bg-transparent px-2 text-[14px]";
  const num = (k: string, label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-label">{label}</span>
      <input className={`${field} w-24 font-mono`} inputMode="numeric" value={v[k]} onChange={(e) => set(k)(e.target.value)} />
    </label>
  );
  return (
    <section aria-labelledby="set-h" className="flex flex-col gap-3">
      <h2 id="set-h" className="text-heading-s">
        Settings
      </h2>
      <fieldset disabled={!canManage || a.pending} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-4">
          <Seg label="Default glucose unit" hideLabel={false} value={v.glucoseUnit} onChange={set("glucoseUnit")} options={[["mmol", "mmol/L"], ["mgdl", "mg/dL"]]} />
          <Seg label="Default creatinine unit" hideLabel={false} value={v.creatinineUnit} onChange={set("creatinineUnit")} options={[["umol", "µmol/L"], ["mgdl", "mg/dL"]]} />
        </div>
        <div className="flex flex-wrap gap-4">
          {num("reminderBeforeDays", "Reminder, days before")}
          {num("reminderAfterDays", "After a miss, days")}
          {num("reminderMaxMissed", "Most missed-visit reminders")}
          <label className="flex flex-col gap-1">
            <span className="text-label">Send from</span>
            <input type="time" className={field} value={v.sendWindowStart} onChange={(e) => set("sendWindowStart")(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label">Send until</span>
            <input type="time" className={field} value={v.sendWindowEnd} onChange={(e) => set("sendWindowEnd")(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-label">Appointment quick picks (weeks)</span>
            <input className={`${field} w-40 font-mono`} value={v.defaultIntervalWeeks} onChange={(e) => set("defaultIntervalWeeks")(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label">Hospital name in SMS</span>
            <input className={`${field} w-64`} value={v.hospitalDisplayName} onChange={(e) => set("hospitalDisplayName")(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label">Clinic phone in SMS</span>
            <input className={`${field} w-44 font-mono`} value={v.clinicPhone} onChange={(e) => set("clinicPhone")(e.target.value)} />
          </label>
        </div>
        {canManage ? (
          <Button
            className="self-start"
            onClick={() =>
              a.run(() =>
                updateSettingsAction({
                  glucoseUnit: v.glucoseUnit,
                  creatinineUnit: v.creatinineUnit,
                  reminderBeforeDays: Number(v.reminderBeforeDays),
                  reminderAfterDays: Number(v.reminderAfterDays),
                  reminderMaxMissed: Number(v.reminderMaxMissed),
                  sendWindowStart: v.sendWindowStart,
                  sendWindowEnd: v.sendWindowEnd,
                  defaultIntervalWeeks: (v.defaultIntervalWeeks ?? "").split(/[,\s]+/).filter(Boolean).map(Number),
                  hospitalDisplayName: v.hospitalDisplayName || null,
                  clinicPhone: v.clinicPhone || null,
                }),
              )
            }
          >
            Save settings
          </Button>
        ) : null}
      </fieldset>
      <p className="text-caption text-ink-600">Live SMS sending stays off in this build: the only transport is a logging mock.</p>
      <Msg msg={a.msg} />
    </section>
  );
}

/* ─── I2 Code lists and thresholds ─────────────────────────────────────── */

export function DefinitionVersions({
  lists,
  versions,
  me,
  canManage,
}: {
  lists: { id: string; label: string; version: string; status: string; codes: number }[];
  versions: { id: string; definitionId: string; version: string; status: string; author: string; payload: Record<string, unknown> }[];
  me: string | null;
  canManage: boolean;
}) {
  const a = useAction();
  const [list, setList] = useState(lists[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const field = "border-input h-9 rounded-lg border bg-transparent px-2 text-[14px]";
  return (
    <section aria-labelledby="def-h" className="flex flex-col gap-3">
      <h2 id="def-h" className="text-heading-s">
        Code lists and thresholds
      </h2>
      <p className="text-caption text-ink-600">Every list is draft version 0.1 until signed. A change creates a new version with an author and a different approver; history is never rewritten.</p>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((l) => (
          <li key={l.id} className="text-body-s flex justify-between gap-2">
            <span>{l.label}</span>
            <span className="text-muted-foreground font-mono text-[12px]">
              {l.codes} · {l.status}
            </span>
          </li>
        ))}
      </ul>
      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-label">List</span>
            <select className={field} value={list} onChange={(e) => setList(e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label">New code</span>
            <input className={`${field} font-mono`} value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label">Label</span>
            <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <Button variant="secondary" disabled={!code || !label || a.pending} onClick={() => a.run(() => proposeDefinitionAction(list, { add: [{ code, label }] }), () => (setCode(""), setLabel("")))}>
            Propose
          </Button>
        </div>
      ) : null}
      {versions.length ? (
        <ul className="flex flex-col gap-2">
          {versions.map((v) => (
            <li key={v.id} className="border-border text-body-s flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span>
                <span className="font-mono text-[12px]">{v.version}</span> · {JSON.stringify(v.payload)} · {v.status}
              </span>
              {canManage && v.status === "proposed" && v.author !== me ? (
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => a.run(() => decideDefinitionAction(v.id, true))}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => a.run(() => decideDefinitionAction(v.id, false))}>
                    Refuse
                  </Button>
                </span>
              ) : v.status === "proposed" ? (
                <span className="text-caption text-ink-600">Awaiting a second person</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Msg msg={a.msg} />
    </section>
  );
}

/* ─── NCD roles (D-16) ─────────────────────────────────────────────────── */

export function RolesPanel({ staff, roles, canAssign }: { staff: { userId: string; name: string }[]; roles: { id: string; name: string; role: string }[]; canAssign: boolean }) {
  const a = useAction();
  const [user, setUser] = useState(staff[0]?.userId ?? "");
  const [role, setRole] = useState("registry_lead");
  return (
    <section aria-labelledby="roles-h" className="flex flex-col gap-3">
      <h2 id="roles-h" className="text-heading-s">
        Registry roles
      </h2>
      <p className="text-caption text-ink-600">Nurses, clinicians, records officers and administrators take their registry role from their existing role. These three are assigned here. The clinical safety role is assigned only by the platform owner.</p>
      <ul className="flex flex-col gap-1">
        {roles.map((r) => (
          <li key={r.id} className="text-body-s flex items-center justify-between gap-2">
            <span>
              {r.name} · {r.role.replace(/_/g, " ")}
            </span>
            {canAssign && r.role !== "clinical_safety_officer" ? (
              <Button size="sm" variant="ghost" onClick={() => a.run(() => revokeRoleAction(r.id))}>
                Revoke
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canAssign ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-label">Staff member</span>
            <select className="border-input h-9 rounded-lg border bg-transparent px-2 text-[14px]" value={user} onChange={(e) => setUser(e.target.value)}>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Seg label="Role" hideLabel={false} value={role} onChange={setRole} options={[["registry_lead", "Registry lead"], ["head_of_department", "Head of department"], ["auditor", "Auditor"]]} />
          <Button variant="secondary" disabled={!user || a.pending} onClick={() => a.run(() => assignRoleAction(user, role))}>
            Assign
          </Button>
        </div>
      ) : null}
      <Msg msg={a.msg} />
    </section>
  );
}

/* ─── §8.3 Go-live ─────────────────────────────────────────────────────── */

export function GoLivePanel({
  approved,
  request,
  synthetic,
  draftCore,
  canRequest,
  canApprove,
  canRemove,
  me,
}: {
  approved: boolean;
  request: { id: string; status: string; requestedBy: string } | null;
  synthetic: number;
  draftCore: string[];
  canRequest: boolean;
  canApprove: boolean;
  canRemove: boolean;
  me: string | null;
}) {
  const a = useAction();
  const [note, setNote] = useState("");
  return (
    <section aria-labelledby="gl-h" className="flex flex-col gap-3">
      <h2 id="gl-h" className="text-heading-s">
        Go-live approval
      </h2>
      {approved ? (
        <p className="text-body-s">Approved for patient data. Synthetic records can no longer be created and demo data cannot be turned on.</p>
      ) : (
        <>
          <p className="text-body-s">Draft standard version 0.1. Not approved for patient data. Approval needs a request and a second, different person holding clinical safety approval.</p>
          <ul className="text-body-s flex list-disc flex-col gap-0.5 pl-5">
            <li>{synthetic ? `${synthetic} synthetic record${synthetic === 1 ? "" : "s"} must be removed first.` : "No synthetic records."}</li>
            <li>{draftCore.length ? `Draft core modules enabled: ${draftCore.join(", ")}. Disable them first.` : "No draft core module is enabled."}</li>
          </ul>
          {synthetic && canRemove ? (
            <Button variant="secondary" className="self-start" disabled={a.pending} onClick={() => a.run(() => removeAllSyntheticAction())}>
              Remove all synthetic records
            </Button>
          ) : null}
          {canRequest && (!request || request.status !== "requested") ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-label">Note for the approver</span>
                <input className="border-input h-9 w-80 rounded-lg border bg-transparent px-2 text-[14px]" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <Button disabled={a.pending} onClick={() => a.run(() => requestGoLiveAction(note))}>
                Request go-live
              </Button>
            </div>
          ) : null}
          {request?.status === "requested" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-s">A go-live request is waiting.</span>
              {canApprove && request.requestedBy !== me ? (
                <>
                  <Button onClick={() => a.run(() => decideGoLiveAction(request.id, true))}>Approve go-live</Button>
                  <Button variant="secondary" onClick={() => a.run(() => decideGoLiveAction(request.id, false))}>
                    Refuse
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      <Msg msg={a.msg} />
    </section>
  );
}
