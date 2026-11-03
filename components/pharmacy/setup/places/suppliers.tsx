"use client";

import type { PlacesView, SupplierRow } from "@/lib/pharmacy/setup/types";
import { useState } from "react";

import { DateField } from "@/app/lab/_components/v2/fields";
import { upsertSupplierAction } from "@/app/pharmacy/setup/setup-actions";
import { linkBtn } from "@/components/pharmacy/medicines/shared";
import { FormDialog, inputCls, labelCls, useAct } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { PL } from "@/content/pharmacy-setup-places";
import { budgetPct, budgetTone, orderDue, orderDueTone } from "@/lib/pharmacy/derive/setup/places";
import { cn } from "@/lib/utils";
import { Tag } from "./shared";

const S = PL.sup;
const BAR = {
  ok: "bg-primary",
  warn: "bg-status-caution-fg",
  bad: "bg-status-caution-fg",
} as const;
type Form = {
  name: string;
  what: string;
  cycle: string;
  next: string;
  lead: string;
  budget: string;
  used: string;
  period: string;
  contact: string;
  phone: string;
};
const formOf = (x: SupplierRow | null): Form => ({
  name: x?.name ?? "",
  what: x?.what ?? "",
  cycle: String(x?.cycleMonths ?? 0),
  next: x?.nextCycleOn ?? "",
  lead: String(x?.leadDays ?? 7),
  budget: String(x?.budgetUgx ?? 0),
  used: String(x?.usedUgx ?? 0),
  period: x?.period ?? "",
  contact: x?.contact ?? "",
  phone: "",
});
const whole = (s: string) => {
  const d = s.replace(/[\s,]/g, "");
  return /^\d+$/.test(d) ? Number(d) : d === "" ? 0 : NaN;
};

/** Edit or add: the terms the order builder uses. Phones are never invented; empty keeps none. */
function SupplierDialog({
  view: v,
  edit,
  toast,
  onClose,
}: {
  view: PlacesView;
  /** null closed, "new" adding, else the row. */
  edit: SupplierRow | "new" | null;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const row = edit && edit !== "new" ? edit : null;
  const [pending, run] = useAct(toast);
  const [f, setF] = useState<Form>(() => formOf(row));
  const [err, setErr] = useState("");
  const set = (k: keyof Form) => (val: string) => (setF((x) => ({ ...x, [k]: val })), setErr(""));
  const submit = () => {
    const n = f.name.trim();
    if (!n) return setErr(S.errName);
    const [cycle, lead, budget, used] = [f.cycle, f.lead, f.budget, f.used].map(whole);
    if ([cycle, lead, budget, used].some((x) => Number.isNaN(x))) return setErr(S.errNumber);
    if (budget && used! > budget) return setErr(S.errUsed);
    void run(
      () =>
        upsertSupplierAction({
          id: row?.id ?? null,
          name: n,
          what: f.what.trim(),
          cycleMonths: cycle,
          nextCycleOn: f.next || null,
          leadDays: lead,
          budgetUgx: budget,
          usedUgx: used,
          period: f.period.trim(),
          contact: f.contact.trim(),
          phone: f.phone.trim(),
        }),
      () => (row ? S.saved(n) : S.added(n)),
    ).then((ok) => ok && onClose());
  };
  const text = (k: keyof Form, label: string, ph?: string, numeric?: boolean, hint?: string) => (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
      <input
        className={inputCls}
        placeholder={ph}
        inputMode={numeric ? "numeric" : undefined}
        value={f[k]}
        onChange={(e) => set(k)(e.target.value)}
      />
    </label>
  );
  return (
    <FormDialog
      open={!!edit}
      onClose={onClose}
      title={row ? S.titleEdit(row.name) : S.titleAdd}
      sub={S.lead}
      error={err}
      submit={row ? S.save : S.add}
      onSubmit={submit}
      pending={pending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", S.name)}
        {text("what", S.what)}
        {text("cycle", S.cycle, undefined, true)}
        <div className="flex flex-col gap-1">
          <DateField
            label={S.next}
            value={f.next}
            onChange={set("next")}
            now={new Date(v.nowMs).toISOString()}
            allowFuture
          />
          {f.next ? (
            <button type="button" className={cn(linkBtn, "w-fit")} onClick={() => set("next")("")}>
              {S.clearNext}
            </button>
          ) : null}
        </div>
        {text("lead", S.lead2, undefined, true)}
        {text("budget", S.budget, undefined, true)}
        {text("used", S.used, undefined, true)}
        {text("period", S.period, S.periodPh)}
        {text("contact", S.contactL, S.contactPh)}
        {text(
          "phone",
          S.phone,
          undefined,
          false,
          row?.phoneMasked ? S.phoneSaved(row.phoneMasked) : S.phoneHint,
        )}
      </div>
    </FormDialog>
  );
}

/** §B6: each supplier's order-due chip, terms, budget bar and contact. */
export function Suppliers({ view: v, toast }: { view: PlacesView; toast: (m: string) => void }) {
  const [edit, setEdit] = useState<SupplierRow | "new" | null>(null);
  const can = v.can.suppliers;
  return (
    <Panel
      title={PL.supTitle}
      note={PL.supNote}
      action={can ? <LabButton onClick={() => setEdit("new")}>{PL.addSupplier}</LabButton> : null}
    >
      {v.suppliers.length ? (
        <ul className="divide-border flex flex-col divide-y">
          {v.suppliers.map((x) => {
            const d = orderDue(x.nextCycleOn, v.today, v.rules.orderDueDays);
            const due = orderDueTone(d);
            const pct = budgetPct(x.usedUgx, x.budgetUgx);
            const tone = budgetTone(pct, 75, 90);
            return (
              <li key={x.id} className="flex flex-col gap-1.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-[15px] font-semibold">{x.name}</span>
                    {due ? <Tag tone={due}>{d! <= 0 ? PL.orderNow : PL.orderIn(d!)}</Tag> : null}
                  </span>
                  <span className="flex items-center gap-1">
                    {x.tel ? (
                      <a href={x.tel} className={linkBtn}>
                        {PL.call}
                      </a>
                    ) : null}
                    {can ? (
                      <LabButton
                        size="sm"
                        variant="text"
                        aria-label={PL.editAria(x.name)}
                        onClick={() => setEdit(x)}
                      >
                        {PL.edit}
                      </LabButton>
                    ) : null}
                  </span>
                </div>
                {x.what ? <span className="text-body-s text-ink-700">{x.what}</span> : null}
                <span className="text-caption text-ink-600">
                  {PL.terms(x.cycleMonths, x.nextCycleOn, x.leadDays)}
                </span>
                {x.budgetUgx > 0 ? (
                  <div className="flex flex-col gap-1">
                    <span
                      role="img"
                      aria-label={PL.budgetAria(pct, PL.budgetTone[tone])}
                      className="bg-ink-150 block h-2 w-full max-w-md overflow-hidden rounded-full"
                    >
                      <span
                        className={cn("block h-full rounded-full", BAR[tone])}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-caption text-ink-700 tabular-nums">
                      {PL.budget(x.usedUgx, x.budgetUgx, x.period, pct)}
                      {PL.budgetTone[tone] ? ` · ${PL.budgetTone[tone]}` : ""}
                    </span>
                  </div>
                ) : null}
                <span className="text-caption text-ink-600">
                  {PL.contact(x.contact, x.phoneMasked)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact title={PL.noSupplierRows} />
      )}
      {edit ? (
        <SupplierDialog
          key={edit === "new" ? "new" : edit.id}
          view={v}
          edit={edit}
          toast={toast}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </Panel>
  );
}
