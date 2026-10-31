"use client";

import type { PlanItem } from "@/lib/pharmacy/epi/derive";
import { useState } from "react";

import {
  ActionDialog,
  Chip,
  Chips,
  Field,
  inputCls,
  useClientKey,
} from "@/app/pharmacy/patients/_components/kit";
import {
  epiDiscardVialAction,
  epiRegisterAction,
  epiVaccinateAction,
  epiVvmAction,
} from "@/app/pharmacy/patients/actions";
import { LabButton } from "@/components/tide/work/button";
import { Pill } from "@/components/tide/work/kit";
import { fill, PRW, VACCINE_NAMES } from "@/content/pharmacy-rework-patients";
import { nextAfter } from "@/lib/pharmacy/epi/derive";
import { DAY } from "@/lib/pharmacy/wards/derive";

const E = PRW.epi;
const iso = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
const date = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(ms);

export function VvmButton({ batchId, batch }: { batchId: string; batch: string }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<number | null>(null);
  return (
    <>
      <LabButton variant="text" size="sm" onClick={() => setOpen(true)}>
        {E.vvmRecord}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={fill(E.vvmTitle, { batch })}
        submit={PRW.common.save}
        blocked={stage ? null : E.vvmRecord}
        run={() => epiVvmAction({ batchId, stage })}
      >
        <Chips label={E.vvmRecord}>
          {[1, 2, 3, 4].map((s) => (
            <Chip key={s} on={stage === s} onClick={() => setStage(s)}>
              {fill(E.vvm, { n: s })}
            </Chip>
          ))}
        </Chips>
        {stage && stage >= 3 ? <Pill tone="caution">{E.vvmBlocked}</Pill> : null}
      </ActionDialog>
    </>
  );
}

export function DiscardVial({ vialId, left }: { vialId: string; left: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LabButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {fill(E.discard, { n: left })}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={fill(E.discard, { n: left })}
        submit={fill(E.discard, { n: left })}
        run={() => epiDiscardVialAction({ vialId })}
      >
        <p className="text-body-s">{E.discarded}</p>
      </ActionDialog>
    </>
  );
}

export function RegisterButton({ now }: { now: number }) {
  const [open, setOpen] = useState(false);
  const key = useClientKey(open);
  const [f, setF] = useState({
    kind: "child",
    name: "",
    sex: "",
    dob: "",
    cardNo: "",
    carer: "",
    phone: "",
    village: "",
    note: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof typeof f, label: string, extra?: string) => (
    <Field label={label}>
      <input
        className={`${inputCls} ${extra ?? ""}`}
        value={f[k]}
        onChange={(e) => set(k)(e.target.value)}
      />
    </Field>
  );
  const missing = !f.name.trim()
    ? E.name
    : !f.sex
      ? E.sex
      : !f.dob
        ? E.dob
        : !f.cardNo.trim()
          ? E.card
          : !f.carer.trim()
            ? E.carer
            : !f.phone.trim()
              ? E.phone
              : null;
  return (
    <>
      <LabButton variant="primary" onClick={() => setOpen(true)}>
        {E.register}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        wide
        title={E.registerTitle}
        submit={E.registerSave}
        blocked={missing}
        run={() =>
          epiRegisterAction({
            clientKey: key,
            ...f,
            village: f.village || null,
            note: f.note || null,
          })
        }
      >
        <Chips label={E.registerTitle}>
          {Object.entries(E.kinds).map(([k, l]) => (
            <Chip
              key={k}
              on={f.kind === k}
              onClick={() => setF((x) => ({ ...x, kind: k, sex: k === "child" ? x.sex : "F" }))}
            >
              {l}
            </Chip>
          ))}
        </Chips>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("name", E.name)}
          <Field label={E.sex}>
            <Chips label={E.sex}>
              <Chip on={f.sex === "F"} onClick={() => set("sex")("F")}>
                {E.female}
              </Chip>
              {f.kind === "child" ? (
                <Chip on={f.sex === "M"} onClick={() => set("sex")("M")}>
                  {E.male}
                </Chip>
              ) : null}
            </Chips>
          </Field>
          <Field label={E.dob}>
            <DobPicker value={f.dob} max={iso(now)} set={set("dob")} cls={inputCls} />
          </Field>
          {text("cardNo", E.card)}
          {text("carer", f.kind === "child" ? E.carer : E.nextOfKin)}
          <Field label={E.phone}>
            <input
              type="tel"
              inputMode="tel"
              className={inputCls}
              value={f.phone}
              onChange={(e) => set("phone")(e.target.value)}
            />
          </Field>
          {text("village", E.village)}
          {text("note", E.note)}
        </div>
      </ActionDialog>
    </>
  );
}

/** Vaccinate: the doses due today (all ticked), AEFI, the checks, and the next visit. */
export function VaccinateButton({
  clientId,
  name,
  plan,
  atEpi,
  now,
}: {
  clientId: string;
  name: string;
  plan: PlanItem[];
  atEpi: Record<string, number>;
  now: number;
}) {
  const due = plan.filter((x) => x.s === "due" || x.s === "overdue");
  const [open, setOpen] = useState(false);
  const key = useClientKey(open);
  const [picked, setPicked] = useState<string[]>(() =>
    due.filter((x) => (atEpi[x.vaccine] ?? 0) > 0).map((x) => x.lab),
  );
  const [aefi, setAefi] = useState("none");
  const [checked, setChecked] = useState(false);
  const [shift, setShift] = useState(0);
  const nx = nextAfter(plan, picked, now);
  const back = nx ? nx.d + shift * 7 * DAY : null;
  const rel =
    back == null
      ? ""
      : Math.round((back - now) / DAY) <= 1
        ? PRW.common.tomorrow
        : fill(PRW.common.inDays, { n: Math.round((back - now) / DAY) });
  return (
    <>
      <LabButton
        variant="primary"
        disabledReason={due.length ? null : E.nothingElse}
        onClick={() => setOpen(true)}
      >
        {E.vaccinate}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        wide
        title={fill(E.vaxTitle, { name })}
        submit={picked.length === 1 ? E.vaxSaveOne : fill(E.vaxSave, { n: picked.length })}
        blocked={!picked.length ? E.vaxNothing : !checked ? E.vaxChecked : null}
        foot={E.vaxFoot}
        run={() =>
          epiVaccinateAction({
            clientKey: key,
            clientId,
            doses: due
              .filter((x) => picked.includes(x.lab))
              .map((x) => ({ antigen: x.lab, site: x.site })),
            aefi,
            checked,
            comeBackOn: back == null ? null : iso(back),
          })
        }
      >
        <Field label={E.vaxDue}>
          <ul className="flex flex-col gap-1.5">
            {due.map((x) => {
              const n = atEpi[x.vaccine] ?? 0;
              const on = picked.includes(x.lab);
              return (
                <li key={x.lab} className="flex flex-wrap items-center gap-2">
                  <Chip
                    on={on}
                    disabled={!n}
                    onClick={() =>
                      setPicked((p) => (on ? p.filter((l) => l !== x.lab) : [...p, x.lab]))
                    }
                  >
                    {x.lab}
                  </Chip>
                  <span className="text-body-s text-muted-foreground">
                    {x.site} · {n ? fill(E.vaxAtEpi, { n }) : E.vaxNoneUsable} ·{" "}
                    {VACCINE_NAMES[x.vaccine]}
                  </span>
                  {x.s === "overdue" ? (
                    <Pill tone="caution">{fill(E.late, { n: x.late ?? 0 })}</Pill>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Field>
        <Field label={E.aefiTitle}>
          <Chips label={E.aefiTitle}>
            {Object.entries(E.aefi).map(([k, l]) => (
              <Chip key={k} on={aefi === k} onClick={() => setAefi(k)}>
                {l}
              </Chip>
            ))}
          </Chips>
        </Field>
        {aefi === "serious" ? <Pill tone="caution">{E.aefiSerious}</Pill> : null}
        <Chips label={E.vaxChecked}>
          <Chip on={checked} onClick={() => setChecked(!checked)}>
            {checked ? "✓ " : ""}
            {E.vaxChecked}
          </Chip>
        </Chips>
        <Field label={E.comeBack}>
          {back == null ? (
            <p className="text-body-s">{E.nothingElse}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{date(back)}</span>
              <span className="text-body-s text-muted-foreground">
                {fill(E.comeBackFor, { rel, lab: nx!.lab })}
              </span>
              <LabButton
                variant="secondary"
                size="sm"
                onClick={() => back - 7 * DAY > now && setShift(shift - 1)}
              >
                {E.weekLess}
              </LabButton>
              <LabButton variant="secondary" size="sm" onClick={() => setShift(shift + 1)}>
                {E.weekMore}
              </LabButton>
            </div>
          )}
        </Field>
      </ActionDialog>
    </>
  );
}

/** Date of birth as day, month and year (no native date input; Td clients are adults, so years reach back 60). */
function DobPicker({
  value,
  max,
  set,
  cls,
}: {
  value: string;
  max: string;
  set: (v: string) => void;
  cls: string;
}) {
  const [y0 = "", m0 = "", d0 = ""] = value ? value.split("-") : [];
  const [parts, setParts] = useState({ y: y0, m: m0, d: d0 });
  const top = Number(max.slice(0, 4));
  const pick = (k: "y" | "m" | "d", v: string) => {
    const next = { ...parts, [k]: v };
    setParts(next);
    const date = next.y && next.m && next.d ? `${next.y}-${next.m}-${next.d}` : "";
    const real = date && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
    set(real && date <= max ? date : "");
  };
  const two = (n: number) => String(n).padStart(2, "0");
  const select = (k: "y" | "m" | "d", label: string, xs: string[]) => (
    <select
      aria-label={label}
      className={cls}
      value={parts[k]}
      onChange={(e) => pick(k, e.target.value)}
    >
      <option value="">{label}</option>
      {xs.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );
  return (
    <span className="flex flex-wrap gap-2">
      {select(
        "d",
        "Day",
        Array.from({ length: 31 }, (_, i) => two(i + 1)),
      )}
      {select(
        "m",
        "Month",
        Array.from({ length: 12 }, (_, i) => two(i + 1)),
      )}
      {select(
        "y",
        "Year",
        Array.from({ length: 61 }, (_, i) => String(top - i)),
      )}
    </span>
  );
}
