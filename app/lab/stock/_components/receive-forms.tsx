"use client";

import type { Payload } from "@/lib/lab/signed-config";
import { useState } from "react";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill, LAB3 } from "@/content/lab-phase-3";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { acceptanceOutcome, evaluateLotComparison } from "@/lib/lab/acceptance";
import { acceptLotAction, receiveDeliveryAction, rejectLotAction } from "@/lib/lab/stock-actions";
import { cn } from "@/lib/utils";
import { RECEIVE as C, STOCK } from "../_lib/copy";
import { inputClass, newKey, num, selectClass } from "../../_components/pop";
import { LabButton } from "@/components/tide/work/button";
import { DateField, DateTimeField } from "../../_components/v2/fields";
import { ActButton } from "../../quality/_components/act-button";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

/* ─── The delivery (§5.6) ──────────────────────────────────────────── */

const blank = {
  itemId: "",
  lot: "",
  received: "",
  useBy: "",
  rejected: "",
  sealed: true,
  coldChain: "na",
  note: "",
};

export function DeliveryForm({ items }: { items: readonly { id: string; name: string }[] }) {
  const { pending, message, act } = useAct();
  const [supplier, setSupplier] = useState<"nms" | "jms" | "other">("nms");
  const [name, setName] = useState("");
  const [noteNo, setNoteNo] = useState("");
  const [at, setAt] = useState("");
  const [lines, setLines] = useState([blank]);
  const patch = (i: number, v: Partial<typeof blank>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...v } : l)));
  const save = () =>
    act(async () => {
      const r = await receiveDeliveryAction({
        supplier,
        supplierName: supplier === "other" ? name.trim() || null : null,
        noteNumber: noteNo.trim() || null,
        receivedAt: at ? new Date(at).toISOString() : new Date().toISOString(),
        lines: lines.map((l) => ({
          itemId: l.itemId,
          lot: l.lot,
          useBy: l.useBy || null,
          received: Number(l.received),
          rejected: Number(l.rejected || 0),
          condition: {
            sealed: l.sealed,
            coldChain: l.coldChain === "na" ? null : l.coldChain === "yes",
            note: l.note.trim() || null,
          },
        })),
        clientKey: newKey(),
      });
      if (r.ok) setLines([blank]);
      return r;
    }, C.saved);
  return (
    <section
      aria-labelledby="delivery-heading"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="delivery-heading" className="text-heading-s">
        {C.title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={C.from}>
          <select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value as typeof supplier)}
            className={selectClass}
          >
            {Object.entries(C.suppliers).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {supplier === "other" ? (
          <Field label={C.supplierName}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className={inputClass}
            />
          </Field>
        ) : null}
        <Field label={C.note}>
          <Input
            value={noteNo}
            onChange={(e) => setNoteNo(e.target.value)}
            maxLength={60}
            className={cn(inputClass, "font-mono")}
          />
        </Field>
        <DateTimeField label={C.receivedAt} value={at} onChange={setAt} className="sm:col-span-2" />
      </div>
      <div className="overflow-x-auto">
        <table className="text-body-s w-full border-collapse text-left">
          <caption className="sr-only">{C.title}</caption>
          <thead>
            <tr className="text-caption text-muted-foreground">
              {C.columns.map((h) => (
                <th key={h} scope="col" className="py-2 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-border/60 border-t align-top">
                <td className="py-2 pr-3">
                  <select
                    aria-label={`${C.columns[0]} ${i + 1}`}
                    value={l.itemId}
                    onChange={(e) => patch(i, { itemId: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">{STOCK.choose}</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <Input
                    aria-label={`${C.columns[1]} ${i + 1}`}
                    value={l.lot}
                    onChange={(e) => patch(i, { lot: e.target.value })}
                    maxLength={60}
                    className={cn(inputClass, "w-32 font-mono")}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    aria-label={`${C.columns[2]} ${i + 1}`}
                    type="number"
                    min={1}
                    value={l.received}
                    onChange={(e) => patch(i, { received: e.target.value })}
                    className={cn(inputClass, "w-20 tabular-nums")}
                  />
                </td>
                <td className="py-2 pr-3">
                  <DateField
                    label={`${C.columns[3]} ${i + 1}`}
                    hideLabel
                    value={l.useBy}
                    onChange={(v) => patch(i, { useBy: v })}
                    allowFuture
                  />
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
                      <input
                        type="checkbox"
                        checked={l.sealed}
                        onChange={(e) => patch(i, { sealed: e.target.checked })}
                      />
                      {C.sealed}
                    </label>
                    <select
                      aria-label={`${C.coldChain} ${i + 1}`}
                      value={l.coldChain}
                      onChange={(e) => patch(i, { coldChain: e.target.value })}
                      className={selectClass}
                    >
                      <option value="na">{C.coldChainNa}</option>
                      <option value="yes">{C.coldChain}: yes</option>
                      <option value="no">{C.coldChain}: no</option>
                    </select>
                    <Field label={C.damaged}>
                      <Input
                        type="number"
                        min={0}
                        value={l.rejected}
                        onChange={(e) => patch(i, { rejected: e.target.value })}
                        className={cn(inputClass, "w-20 tabular-nums")}
                      />
                    </Field>
                    <Field label={C.arrivalNote}>
                      <Input
                        value={l.note}
                        onChange={(e) => patch(i, { note: e.target.value })}
                        maxLength={200}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </td>
                <td className="py-2">
                  {lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-7"
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    >
                      {C.removeLine}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" onClick={() => setLines((ls) => [...ls, blank])}>
          {C.addLine}
        </Button>
        <ActButton variant="primary" type="button" onClick={save} busy={pending}>
          {C.save}
        </ActButton>
        <Said message={message} />
      </div>
    </section>
  );
}

/* ─── Accept a lot (§5.6; LA-3, LA-5) ──────────────────────────────── */

export function AcceptCard({
  item,
  lot,
  evidence,
  focused = false,
}: {
  item: { name: string; plan: Payload<"acceptance_plan"> | null };
  lot: { id: string; lot: string };
  evidence: { id: string; label: string }[];
  /** Opened from Needs you (`?lot=`): scrolled to and announced. */
  focused?: boolean;
}) {
  const { pending, message, act } = useAct();
  const A = C.accept;
  const plan = item.plan;
  const n = plan?.comparison?.samples ?? 0;
  const [rows, setRows] = useState(() =>
    Array.from({ length: n }, () => ({ level: "", current: "", candidate: "" })),
  );
  const [qc, setQc] = useState<Set<string>>(new Set());
  const [certificate, setCertificate] = useState("");
  const [reason, setReason] = useState("");
  const pairs = rows
    .map((r, i) => ({
      observationId: `sample-${i + 1}`,
      level: r.level.trim() || "—",
      current: num(r.current),
      candidate: num(r.candidate),
    }))
    .filter(
      (p): p is typeof p & { current: number; candidate: number } =>
        p.current !== null && p.candidate !== null,
    );
  const verdict = plan?.method === "lot_comparison" ? evaluateLotComparison(plan, pairs) : null;
  const met =
    !!plan &&
    acceptanceOutcome(plan, {
      comparison: verdict?.outcome,
      qcPassed: qc.size ? true : undefined,
      certificateAccepted: !!certificate.trim(),
    }).kind === "accepted";
  return (
    <article
      id={`lot-${lot.id}`}
      tabIndex={focused ? -1 : undefined}
      aria-current={focused ? "true" : undefined}
      className={cn(
        "border-border bg-card grid scroll-mt-24 gap-4 rounded-lg border p-4 lg:grid-cols-[1fr_18rem]",
        focused && "shadow-focus",
      )}
    >
      <div className="flex flex-col gap-3">
        <h3 className="text-heading-s">{A.title(lot.lot, item.name)}</h3>
        {focused ? (
          <p className="text-caption text-muted-foreground">{LABWS2_QUALITY.stock.focus}</p>
        ) : null}
        {!plan ? (
          <StatusWord tone="caution" className="w-fit">
            {fill(LAB3.noAcceptancePlan, { Item: item.name })}
          </StatusWord>
        ) : null}
        {plan?.method === "lot_comparison" ? (
          <>
            <table className="text-body-s w-full border-collapse text-left">
              <caption className="text-caption text-muted-foreground text-left">
                {A.noIdentity}
              </caption>
              <thead>
                <tr className="text-caption text-muted-foreground">
                  {A.sampleColumns.map((h) => (
                    <th key={h} scope="col" className="py-2 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const v = verdict?.pairs.find((p) => p.observationId === `sample-${i + 1}`);
                  const set = (k: keyof typeof r) => (e: { target: { value: string } }) =>
                    setRows((rs) =>
                      rs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)),
                    );
                  return (
                    <tr key={i} className="border-border/60 border-t">
                      <th scope="row" className="py-2 pr-3 font-normal">
                        Sample {i + 1}
                      </th>
                      <td className="py-2 pr-3">
                        <Input
                          aria-label={`Sample ${i + 1} level`}
                          value={r.level}
                          onChange={set("level")}
                          maxLength={40}
                          className={cn(inputClass, "w-24")}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          aria-label={`Sample ${i + 1} current lot`}
                          inputMode="decimal"
                          value={r.current}
                          onChange={set("current")}
                          className={cn(inputClass, "w-24 tabular-nums")}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          aria-label={`Sample ${i + 1} new lot`}
                          inputMode="decimal"
                          value={r.candidate}
                          onChange={set("candidate")}
                          className={cn(inputClass, "w-24 tabular-nums")}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {v ? Math.round(v.difference * 1000) / 1000 : ""}
                      </td>
                      <td className="py-2">
                        {v ? (
                          v.within ? (
                            <StatusWord icon glyph={CheckIcon}>
                              {A.within}
                            </StatusWord>
                          ) : (
                            <StatusWord tone="caution">{A.outside}</StatusWord>
                          )
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : null}
        {plan && plan.method !== "none" ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-body-s text-muted-foreground">{A.qc}</legend>
            {evidence.length === 0 ? (
              <p className="text-body-s">{A.qcNone}</p>
            ) : (
              evidence.map((e) => (
                <label
                  key={e.id}
                  className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0"
                >
                  <input
                    type="checkbox"
                    checked={qc.has(e.id)}
                    onChange={(ev) =>
                      setQc((s) => {
                        const t = new Set(s);
                        if (ev.target.checked) t.add(e.id);
                        else t.delete(e.id);
                        return t;
                      })
                    }
                  />
                  {e.label}
                </label>
              ))
            )}
          </fieldset>
        ) : null}
        {plan?.certificateAllowed ? (
          <Field label={A.certificate}>
            <Input
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              maxLength={300}
              className={inputClass}
            />
          </Field>
        ) : null}
        <Field label={A.reason}>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            className={inputClass}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <LabButton
            type="button"
            busy={pending}
            disabledReason={reason.trim().length < 3 ? LABWS2_QUALITY.sweep.rejectReason : null}
            onClick={() => act(() => rejectLotAction({ lotId: lot.id, reason, pairs }), A.rejected)}
          >
            {A.reject}
          </LabButton>
          <ActButton
            type="button"
            variant="primary"
            busy={pending}
            disabledReason={met ? null : LABWS2_QUALITY.sweep.acceptUnmet}
            onClick={() =>
              act(
                () =>
                  acceptLotAction({
                    lotId: lot.id,
                    pairs,
                    qcIds: [...qc],
                    certificate: certificate.trim() || null,
                  }),
                A.accepted,
              )
            }
          >
            {A.accept}
          </ActButton>
          <Said message={message} />
        </div>
      </div>
      {plan ? (
        <aside className="border-border flex flex-col gap-2 rounded-md border p-3">
          <h4 className="text-heading-s">{A.planCard}</h4>
          <dl className="text-body-s grid gap-1">
            <dt className="text-caption text-muted-foreground">{A.method}</dt>
            <dd>{STOCK.plan.methods[plan.method]}</dd>
            {plan.comparison ? (
              <>
                <dt className="text-caption text-muted-foreground">{A.samples}</dt>
                <dd>
                  {plan.comparison.samples} · {plan.comparison.spread}
                </dd>
                <dt className="text-caption text-muted-foreground">{A.acceptIf}</dt>
                <dd>
                  {A.criterion(
                    plan.comparison.criterion.absolute,
                    plan.comparison.criterion.percent,
                    plan.comparison.criterion.combine,
                  )}
                </dd>
                {plan.comparison.qcAlso ? (
                  <>
                    <dt className="text-caption text-muted-foreground">{A.also}</dt>
                    <dd>{A.qcAlso}</dd>
                  </>
                ) : null}
              </>
            ) : null}
            <dt className="text-caption text-muted-foreground">{STOCK.plan.source}</dt>
            <dd>{plan.source}</dd>
          </dl>
        </aside>
      ) : null}
    </article>
  );
}
