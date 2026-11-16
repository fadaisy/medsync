"use client";

import type {
  DirectoryAffiliationRow,
  DirectoryDepartmentOption,
  DirectoryRoleOption,
} from "../_lib/data";
import type { DirectoryAct, DirectoryBucket } from "../_lib/people";
import type { StaffActionState } from "../actions";
import { useMemo, useState, useTransition } from "react";

import { Chip, ChipRow, Field, hit, ini, k } from "@/components/clinics-schedule/shared";
import { PEOPLE } from "@/content/hospital-admin/people";
import { bucketOf, directoryActs, employmentText } from "../_lib/people";
import { assignStaffRoleAction, resetStaffMfaAction, setStaffStatusAction } from "../actions";
import v from "./people-view.module.css";

const D = PEOPLE.directory;
type Filter = "all" | DirectoryBucket;
const FILTERS: readonly Filter[] = ["all", "active", "suspended", "deactivated"];

/** Workflow tags: square and neutral, the word carries the state (ADR 0162). */
const TAG: Record<DirectoryBucket, string | false> = {
  active: "live",
  suspended: "setup",
  deactivated: false,
};

/** People › Directory: everyone approved at this hospital, clinical or not, by name. */
export function DirectoryList({
  rows,
  departments,
  sel,
  onOpen,
}: {
  rows: readonly DirectoryAffiliationRow[];
  departments: readonly DirectoryDepartmentOption[];
  sel: string | null;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [dept, setDept] = useState("");
  const [q, setQ] = useState("");

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === "all" || bucketOf(r.state) === filter) &&
          (!dept || r.departmentId === dept) &&
          hit(
            q,
            r.fullName,
            r.email,
            r.roleName,
            r.departmentName,
            r.cadreName,
            r.registrationNumber,
          ),
      ),
    [rows, filter, dept, q],
  );

  return (
    <>
      <div className={k("su-ctb")}>
        <input
          type="search"
          className={`${k("in")} ${v.find}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={D.search}
          aria-label={D.search}
        />
        <div className={k("su-cfs")} role="group" aria-label={PEOPLE.tabs.directory}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={k(filter === f && "on")}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {D.filters[f]}
              <b>
                {f === "all" ? rows.length : rows.filter((r) => bucketOf(r.state) === f).length}
              </b>
            </button>
          ))}
        </div>
        <select
          className={`${k("in")} ${v.dept}`}
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-label={D.department}
        >
          <option value="">{D.allDepartments}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className={k("su-card", "su-lr")}>
        <div className={k("su-ch")}>
          <b>{D.cardTitle}</b>
          <small>{D.cardSub}</small>
        </div>
        {shown.length ? (
          shown.map((r) => {
            const b = bucketOf(r.state);
            return (
              <div key={r.id} className={`${k("su-lri")} ${sel === r.id ? v.on : ""}`}>
                <span className={k("pav")} aria-hidden="true">
                  <b>{ini(r.fullName)}</b>
                </span>
                <span className={k("su-cn")}>
                  <b>{r.fullName}</b>
                  <small>
                    {r.roleName} · {r.cadreName}
                  </small>
                </span>
                <span className={k("su-cn")}>
                  <b className={k("su-lrimp")}>{r.departmentName}</b>
                  <small>{employmentText(r.employmentType)}</small>
                </span>
                <span className={k("su-hola")}>
                  <span className={k("su-st", TAG[b])}>{D.status[r.state] ?? r.state}</span>
                  <button
                    type="button"
                    className={k("btn", "sm", sel === r.id && "k")}
                    aria-pressed={sel === r.id}
                    onClick={() => onOpen(r.id)}
                  >
                    {D.open}
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <p className={k("su-none")}>{rows.length ? D.noMatch : D.empty}</p>
        )}
      </div>
    </>
  );
}

/**
 * One person on the staff list, beside the list. The changes offered depend on their state, as before: change role,
 * reset the authenticator, suspend, close or reopen. Each needs a reason of 8 characters or more; the Edge Function
 * makes the change for this hospital's affiliation only and writes the audit row.
 */
export function DirectoryPanel({
  row,
  departments,
  roles,
  onClose,
  onDone,
}: {
  row: DirectoryAffiliationRow;
  departments: readonly DirectoryDepartmentOption[];
  roles: readonly DirectoryRoleOption[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [act, setAct] = useState<DirectoryAct | null>(null);
  const [why, setWhy] = useState("");
  const [roleId, setRoleId] = useState(row.roleId);
  const [deptId, setDeptId] = useState(row.departmentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const b = bucketOf(row.state);
  const short = why.trim().length < 8;
  const unchanged = act === "assign_role" && roleId === row.roleId && deptId === row.departmentId;

  const pick = (a: DirectoryAct) => {
    setAct(a);
    setWhy("");
    setError(null);
    setRoleId(row.roleId);
    setDeptId(row.departmentId);
  };

  const confirm = () => {
    if (!act || short || unchanged || busy) return;
    const fd = new FormData();
    fd.set("affiliation_id", row.id);
    fd.set("reason", why.trim());
    let action: (s: StaffActionState, f: FormData) => Promise<StaffActionState>;
    if (act === "assign_role") {
      fd.set("new_role_id", roleId);
      fd.set("new_department_id", deptId);
      action = assignStaffRoleAction;
    } else if (act === "reset_mfa") {
      action = resetStaffMfaAction;
    } else {
      fd.set(
        "target_state",
        act === "suspend" ? "suspended" : act === "deactivate" ? "deactivated" : "approved",
      );
      action = setStaffStatusAction;
    }
    start(async () => {
      let r: StaffActionState;
      try {
        r = await action({}, fd);
      } catch {
        setError(PEOPLE.failed);
        return;
      }
      if (!r.ok) {
        setError(r.error ?? PEOPLE.failed);
        return;
      }
      setAct(null);
      setWhy("");
      onDone(D.done);
    });
  };

  const facts: Array<[string, string]> = [
    [D.rows.role, row.roleName],
    [D.rows.cadre, row.cadreName],
    [D.rows.department, row.departmentName],
    [D.rows.employment, employmentText(row.employmentType)],
    [D.rows.email, row.email],
    [D.rows.council, row.councilName ?? D.none],
    [D.rows.registration, row.registrationNumber ?? D.none],
  ];
  const S = act ? D.step[act] : null;

  return (
    <aside className={k("det", "su-det")} aria-label={row.fullName}>
      <div className={k("su-dh")}>
        <span className={k("pav")} aria-hidden="true">
          <b>{ini(row.fullName)}</b>
        </span>
        <div>
          <h2>{row.fullName}</h2>
          <p>
            <span className={k("su-st", TAG[b])}>{D.status[row.state] ?? row.state}</span>
          </p>
        </div>
        <button type="button" className={k("btn", "sm", "q", "x")} onClick={onClose}>
          {PEOPLE.close}
        </button>
      </div>

      <div className={`${k("su-sum2")} ${v.sum}`}>
        {facts.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <p className={k("su-note")}>{D.statusLine[b]}</p>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{D.actionsCap}</span>
        <ChipRow label={D.actionsCap}>
          {directoryActs(row.state).map((a) => (
            <Chip key={a} on={act === a} onClick={() => pick(a)}>
              {D.acts[a]}
            </Chip>
          ))}
        </ChipRow>

        {act && S ? (
          <>
            {S.warn ? <p className={v.box}>{S.warn}</p> : null}
            {act === "assign_role" ? (
              <>
                <Field as="label" label={D.newDepartment}>
                  <select
                    className={k("in")}
                    value={deptId}
                    onChange={(e) => setDeptId(e.target.value)}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field as="label" label={D.newRole}>
                  <select
                    className={k("in")}
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.cadreName})
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}
            <Field as="label" label={S.label}>
              <textarea
                className={k("in", "su-ta")}
                rows={3}
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                placeholder={PEOPLE.reasonPh}
                maxLength={500}
              />
            </Field>
            <p className={k("su-note")}>{unchanged ? D.unchanged : S.hint}</p>
            {error ? (
              <p className={k("su-note")} role="alert">
                {error}
              </p>
            ) : null}
            <div className={k("mf")}>
              <button
                type="button"
                className={k("btn", "k")}
                disabled={short || unchanged || busy}
                onClick={confirm}
              >
                {busy ? D.working : S.go}
              </button>
              <button
                type="button"
                className={k("btn")}
                onClick={() => setAct(null)}
                disabled={busy}
              >
                {PEOPLE.cancel}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
