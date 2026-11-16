"use client";

import type { FirstRun } from "../_lib/model";
import type { DepartmentRow } from "@/lib/services/data";
import type { DepartmentKind, LegacyPlan } from "@/supabase/functions/_shared/services-hub";
import { useMemo, useState } from "react";

import { DeskDialog, Field, k, Seg, Toggle } from "@/components/clinics-schedule/shared";
import { DEPTS } from "@/content/hospital-admin/departments";
import { fill } from "@/content/lab-workspace-v2";
import {
  CATALOGUE_DEPARTMENTS,
  DEPARTMENT_KINDS,
  labelFor,
} from "@/supabase/functions/_shared/services-hub";
import { useOp } from "../_lib/use-op";
import d from "./departments.module.css";

const A = DEPTS.addDialog;

function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p className={k("su-note")} role="alert">
      {error}
    </p>
  ) : null;
}

/** + Add departments: the Ministry's catalogue as toggles, one department not on it, live now or not (§5.3). */
export function AddDepartmentsDialog({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: DepartmentRow[];
}) {
  const op = useOp();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [other, setOther] = useState("");
  const [otherKind, setOtherKind] = useState<DepartmentKind>("clinical");
  // Adding a department is choosing it: live by default, so staff can pick it at sign-up.
  const [live, setLive] = useState(true);
  const have = useMemo(
    () => new Set(existing.filter((x) => !x.archived).map((x) => x.catalogueCode)),
    [existing],
  );
  const groups = useMemo(() => {
    const m = new Map<string, (typeof CATALOGUE_DEPARTMENTS)[number][]>();
    for (const c of CATALOGUE_DEPARTMENTS) {
      if (q && !c.label.toLowerCase().includes(q.trim().toLowerCase())) continue;
      m.set(c.group, [...(m.get(c.group) ?? []), c]);
    }
    return [...m.entries()];
  }, [q]);
  const flip = (code: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  const total = picked.size + (other.trim().length >= 2 ? 1 : 0);
  const close = () => {
    op.setError(null);
    onClose();
  };
  const add = () =>
    op.run(
      {
        op: "add_departments",
        codes: [...picked],
        custom: other.trim().length >= 2 ? [{ name: other.trim(), kind: otherKind }] : [],
        live,
      },
      () => {
        setPicked(new Set());
        setOther("");
        onClose();
      },
    );

  return (
    <DeskDialog
      open={open}
      onClose={close}
      label={A.title}
      tile="tick"
      title={A.title}
      lead={A.lead}
      cls={k("su-m")}
    >
      <input
        className={`${k("in")} ${d.select}`}
        placeholder={A.search}
        aria-label={A.search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={d.catalogue}>
        {groups.map(([group, items]) => (
          <div key={group} className={d.group} role="group" aria-label={group}>
            <span className={k("cap")}>{group}</span>
            {items.map((c) => {
              const already = have.has(c.code);
              return (
                <Toggle
                  key={c.code}
                  on={already || picked.has(c.code)}
                  disabled={already}
                  flip={() => flip(c.code)}
                  t={already ? [c.label, A.have] : [c.label, ""]}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className={d.row}>
        <Field as="label" label={A.other}>
          <input
            className={`${k("in")} ${d.select}`}
            value={other}
            maxLength={80}
            onChange={(e) => setOther(e.target.value)}
          />
        </Field>
        <Seg
          opts={DEPARTMENT_KINDS.map((x) => [x, DEPTS.kinds[x]] as const)}
          value={otherKind}
          onPick={setOtherKind}
          label={A.otherKind}
          className={d.wrapSeg}
        />
      </div>
      <Toggle on={live} flip={() => setLive((x) => !x)} t={A.live} />
      <ErrorNote error={op.error} />
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          disabled={op.busy || total === 0}
          onClick={add}
        >
          {total ? fill(A.btn, { n: total }) : A.pick}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {A.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}

/** The signed MoH standard for this level: everything arrives not live (PS-1: an unsigned preset is invisible). */
export function PresetDialog({
  open,
  onClose,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  preset: NonNullable<FirstRun["preset"]>;
}) {
  const op = useOp();
  const P = DEPTS.preset;
  const kinds = ["department", "lab_section", "clinic", "imaging"] as const;
  return (
    <DeskDialog
      open={open}
      onClose={onClose}
      label={fill(P.title, { level: preset.levelLabel })}
      tile="tick"
      title={fill(P.title, { level: preset.levelLabel })}
      lead={fill(P.lead, { source: preset.source, section: preset.section })}
      cls={k("su-m", "md")}
    >
      <div className={k("su-sec")}>
        <p className={k("su-note")}>
          {P.note} {preset.skip ? fill(P.skip, { n: preset.skip }) : ""}
        </p>
        {preset.add.length === 0 ? <p className={k("su-note")}>{P.allSet}</p> : null}
        {kinds.map((x) => {
          const items = preset.add.filter((a) => a.kind === x);
          if (!items.length) return null;
          return (
            <div key={x} className={d.group}>
              <span className={k("cap")}>
                {P.kinds[x]} · {items.length}
              </span>
              <p className={k("su-note")}>{items.map((i) => i.label).join(" · ")}</p>
            </div>
          );
        })}
      </div>
      <ErrorNote error={op.error} />
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          disabled={op.busy || preset.add.length === 0}
          onClick={() => op.run({ op: "apply_preset" }, onClose)}
        >
          {fill(P.btn, { n: preset.add.length })}
        </button>
        <button type="button" className={k("btn")} onClick={onClose}>
          {P.later}
        </button>
      </div>
    </DeskDialog>
  );
}

/** The application's old answers, brought in once; emergency values arrive waiting for a second admin. */
export function LegacyDialog({
  open,
  onClose,
  plan,
  state,
}: {
  open: boolean;
  onClose: () => void;
  plan: LegacyPlan;
  state: FirstRun["legacy"];
}) {
  const op = useOp();
  const L = DEPTS.legacy;
  const lines: [string, string[]][] = [
    [L.lines.departments, plan.departments.map((c) => labelFor("department", c))],
    [L.lines.sections, plan.labSections.map((c) => labelFor("lab_section", c))],
    [
      L.lines.clinics,
      [
        ...plan.clinics.map((c) => labelFor("clinic", c)),
        ...plan.customClinics.map((c) => fill(L.forReview, { name: c })),
      ],
    ],
    [L.lines.imaging, plan.imaging.map((c) => labelFor("imaging", c))],
  ];
  return (
    <DeskDialog
      open={open}
      onClose={onClose}
      label={L.title}
      tile="tick"
      title={L.title}
      lead={L.lead}
      cls={k("su-m", "md")}
    >
      <div className={k("su-sec")}>
        {lines.map(([title, items]) =>
          items.length ? (
            <div key={title} className={d.group}>
              <span className={k("cap")}>
                {title} · {items.length}
              </span>
              <p className={k("su-note")}>{items.join(" · ")}</p>
            </div>
          ) : null,
        )}
        {plan.capabilities.length ? (
          <div className={d.group}>
            <span className={k("cap")}>{L.lines.emergency}</span>
            {plan.capabilities.map((c) => (
              <div key={c.key} className={d.row}>
                <span>{(L.caps as Record<string, string>)[c.key] ?? c.key}</span>
                {c.key !== "mortuary" ? <span className={d.tag}>{L.second}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
        {plan.notes.length ? (
          <ul className={d.lines}>
            {plan.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <ErrorNote error={op.error} />
      <div className={k("mf")}>
        <button
          type="button"
          className={k("btn", "k")}
          disabled={op.busy}
          onClick={() => op.run({ op: "import_legacy", accept: true }, onClose)}
        >
          {L.btn}
        </button>
        {state === "offered" ? (
          <button
            type="button"
            className={k("btn")}
            disabled={op.busy}
            onClick={() => op.run({ op: "import_legacy", accept: false }, onClose)}
          >
            {L.no}
          </button>
        ) : null}
      </div>
    </DeskDialog>
  );
}
