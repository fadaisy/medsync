"use client";

import type { useCount } from "../use-count";
import type { LineInfo, ReceiveDelivery, ReceiveLine, RejWhy } from "@/lib/pharmacy/derive/receive";
import { useEffect, useRef } from "react";

import { askApprovalAction } from "@/app/pharmacy/stock/store/receive-actions";
import { LabButton } from "@/components/tide/work/button";
import { RC } from "@/content/pharmacy-receive";
import { RCT } from "@/content/pharmacy-receive-count";
import { expText, normExp, num } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";
import { Field, inputCls, selectCls } from "../shared";
import { ChipRadio, pillCls, Said } from "./parts";

type Count = ReturnType<typeof useCount>;
const P = RC.problem;
const E = RCT.edit;
const WHY: RejWhy[] = [
  "damaged",
  "wrong_product",
  "expired",
  "short_dated",
  "recall",
  "cold_chain",
  "other",
];

/** The open line (RECEIVE §D1 "Edit panel"). Every change goes through `setLine`, which saves as you go. */
export function LineEdit({
  line: l,
  info: i,
  d,
  c,
  autoFocus,
  onDone,
}: {
  line: ReceiveLine;
  info: LineInfo;
  d: ReceiveDelivery;
  c: Count;
  autoFocus: boolean;
  onDone: () => void;
}) {
  const { world, online, run } = useReceive();
  const R = world.rules;
  const m = i.m;
  const id = l.id;
  const batchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) batchRef.current?.focus();
  }, [autoFocus]);

  const set = (patch: Partial<ReceiveLine>) => c.setLine(id, patch);
  const text = (k: keyof ReceiveLine) => (e: { target: { value: string } }) =>
    set({ [k]: e.target.value } as Partial<ReceiveLine>);
  const bad = (...t: string[]) => t.find((x) => i.problems.includes(x)) ?? null;

  const expectedPacks = l.notePacks !== "" ? Number(l.notePacks) : i.owed;
  const canAll = !d.blind && expectedPacks > 0 && Number(l.packs) !== expectedPacks;
  const needsDecision = i.short && !i.expired && i.packs > 0;
  const needsApproval =
    i.short && !i.expired && (l.decision === "accept" || l.decision === "accept_tell");
  const canRejectAll = (i.expired || i.tempBad || !!i.rc || i.vvmBad || i.frozen) && i.acc > 0;
  const rejectAll = () =>
    set({
      rejOn: true,
      rejPacks: String(i.packs),
      rejWhy: i.expired ? "expired" : i.rc ? "recall" : i.tempBad ? "cold_chain" : "other",
      rejFate: "quarantine",
    });

  const ask = async () => {
    await c.flush();
    run(() => askApprovalAction({ deliveryId: d.id, lineId: id }), E.asked);
  };

  const notes: { warn: boolean; text: string }[] = [];
  if (i.counted && m.cold && i.temp !== null)
    notes.push(
      i.tempBad
        ? { warn: true, text: RCT.note.tempOut(l.temp, R.tempLow, R.tempHigh) }
        : { warn: false, text: RCT.note.tempIn(l.temp, R.tempLow, R.tempHigh) },
    );
  if (i.expired) notes.push({ warn: true, text: RCT.note.expired(expText(normExp(l.exp), l.exp)) });
  if (i.short)
    notes.push({
      warn: true,
      text: RCT.note.short(
        Math.max(0, Math.floor((i.days ?? 0) / 30)),
        expText(normExp(l.exp), l.exp),
      ),
    });
  if (i.per > 0 && i.per !== m.per && m.per > 1)
    notes.push({ warn: false, text: RCT.note.pack(i.per, m.per) });
  if (i.rc) notes.push({ warn: true, text: RCT.note.recall(l.batch, i.rc.notice, i.rc.why) });
  if (!i.priceDiff && l.cost !== "" && i.per > 0 && m.price > 0 && Number(l.cost) / i.per > m.price)
    notes.push({
      warn: false,
      text: RCT.note.abovePrice(num(Math.round(Number(l.cost) / i.per)), m.unit, num(m.price)),
    });
  if (i.priceDiff)
    notes.push({
      warn: true,
      text: RCT.note.price(Number(l.cost), i.priceDiff.fromOrder, i.priceDiff.ref, i.priceDiff.pct),
    });
  if (m.vaccine && i.counted && (i.vvmBad || i.frozen))
    notes.push({ warn: true, text: i.vvmBad ? RCT.note.vvmBad : RCT.note.frozen });

  return (
    <div className="border-ink-200 mt-3 flex flex-col gap-4 border-t pt-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label={E.batch} error={bad(P.batch(l.no))}>
          {(a) => (
            <input
              {...a}
              ref={batchRef}
              className={cn(inputCls(!!a["aria-invalid"]), "font-mono")}
              autoComplete="off"
              value={l.batch}
              onChange={text("batch")}
            />
          )}
        </Field>
        <Field label={E.exp} error={bad(P.exp(l.no), P.badExp(l.no), P.expired(l.no))}>
          {(a) => (
            <input
              {...a}
              className={inputCls(!!a["aria-invalid"])}
              autoComplete="off"
              placeholder={E.expPh}
              value={l.exp}
              onChange={text("exp")}
            />
          )}
        </Field>
        <Field label={E.packs} error={bad(P.packs(l.no))}>
          {(a) => (
            <input
              {...a}
              className={cn(inputCls(!!a["aria-invalid"]), "tabular-nums")}
              inputMode="numeric"
              value={l.packs}
              onChange={text("packs")}
            />
          )}
        </Field>
        <Field label={E.per(m.unit)} error={bad(P.per(l.no, m.unit))}>
          {(a) => (
            <input
              {...a}
              className={cn(inputCls(!!a["aria-invalid"]), "tabular-nums")}
              inputMode="numeric"
              value={l.per}
              onChange={text("per")}
            />
          )}
        </Field>
        {!d.blind || i.counted ? (
          <Field label={E.note}>
            {(a) => (
              <input
                {...a}
                className={cn(inputCls(), "tabular-nums")}
                inputMode="numeric"
                placeholder={i.ol && !d.blind ? E.notePh(num(i.owed)) : ""}
                value={l.notePacks}
                onChange={text("notePacks")}
              />
            )}
          </Field>
        ) : null}
        <Field label={E.cost}>
          {(a) => (
            <input
              {...a}
              className={cn(inputCls(), "tabular-nums")}
              inputMode="numeric"
              value={l.cost}
              onChange={text("cost")}
            />
          )}
        </Field>
      </div>

      {canAll ? (
        <div>
          <button
            type="button"
            className={pillCls}
            onClick={() => set({ packs: String(expectedPacks) })}
          >
            {E.allArrived(num(expectedPacks))}
          </button>
        </div>
      ) : null}

      {notes.length ? (
        <div className="flex flex-col gap-1.5">
          {notes.map((n) =>
            n.warn ? (
              <Said key={n.text} tone="warn" className="font-normal">
                {n.text}
              </Said>
            ) : (
              <p key={n.text} className="text-ink-600 m-0 text-[13px] leading-5">
                {n.text}
              </p>
            ),
          )}
        </div>
      ) : null}

      {m.cold || m.vaccine ? (
        <div className="flex flex-col gap-4">
          <Field label={E.temp} error={bad(P.temp(l.no), P.coldBroken(l.no))} className="max-w-xs">
            {(a) => (
              <input
                {...a}
                className={cn(inputCls(!!a["aria-invalid"]), "tabular-nums")}
                inputMode="decimal"
                value={l.temp}
                onChange={text("temp")}
              />
            )}
          </Field>
          {m.vaccine ? (
            <>
              <ChipRadio
                label={E.vvm}
                value={l.vvm}
                onChange={(v) => set({ vvm: v })}
                options={E.vvmStage}
                error={bad(P.vvm(l.no), P.vvmBad(l.no))}
              />
              <ChipRadio
                label={E.freeze}
                value={l.freeze}
                onChange={(v) => set({ freeze: v })}
                options={E.freezeOptions}
                error={bad(P.freeze(l.no), P.frozen(l.no))}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {needsDecision ? (
        <div className="flex flex-col gap-3">
          <ChipRadio
            label={E.decide}
            value={l.decision}
            onChange={(v) => set({ decision: v })}
            options={E.decisions}
            error={bad(P.decide(l.no))}
          />
          {needsApproval ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-foreground text-[13px] leading-[18px] font-semibold">
                {E.approval}
              </span>
              {l.approvedBy ? (
                <Said tone="ok">{E.approved(l.approvedBy)}</Said>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {l.approvalAsked ? (
                    <Said tone="warn">{E.waiting}</Said>
                  ) : (
                    <LabButton
                      variant="secondary"
                      className="h-11 sm:h-9"
                      onClick={() => void ask()}
                      disabledReason={online ? null : E.askOffline}
                    >
                      {E.ask}
                    </LabButton>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {m.regLapsed && i.acc > 0 ? (
        <div className="flex flex-col gap-3">
          <Said tone="warn" className="font-normal">
            {E.regCaution}
          </Said>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={E.regWhy} error={bad(P.reg(l.no))}>
              {(a) => (
                <select
                  {...a}
                  className={selectCls(!!a["aria-invalid"])}
                  value={l.regReason}
                  onChange={text("regReason")}
                >
                  <option value="">{E.regChoose}</option>
                  {E.regOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {l.regReason === "other" ? (
              <Field label={E.regNote} error={bad(P.regNote(l.no))}>
                {(a) => (
                  <input
                    {...a}
                    className={inputCls(!!a["aria-invalid"])}
                    value={l.regNote}
                    onChange={text("regNote")}
                  />
                )}
              </Field>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-[14px] leading-5 font-semibold sm:min-h-9">
          <input
            type="checkbox"
            className="accent-primary focus-visible:ring-primary/30 size-5 rounded outline-none focus-visible:ring-2"
            checked={l.rejOn}
            onChange={(e) => set({ rejOn: e.target.checked })}
          />
          {E.rejToggle}
        </label>
        {l.rejOn ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={E.rejPacks} error={bad(P.rejMore(l.no))}>
              {(a) => (
                <input
                  {...a}
                  className={cn(inputCls(!!a["aria-invalid"]), "tabular-nums")}
                  inputMode="numeric"
                  value={l.rejPacks}
                  onChange={text("rejPacks")}
                />
              )}
            </Field>
            <Field label={E.rejWhy} error={bad(P.rejWhy(l.no))}>
              {(a) => (
                <select
                  {...a}
                  className={selectCls(!!a["aria-invalid"])}
                  value={l.rejWhy}
                  onChange={text("rejWhy")}
                >
                  <option value="">{E.rejChoose}</option>
                  {WHY.map((w) => (
                    <option key={w} value={w}>
                      {RC.why[w]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="sm:col-span-2">
              <ChipRadio
                label={E.rejWhere}
                value={l.rejFate}
                onChange={(v) => set({ rejFate: v })}
                options={E.fates}
              />
            </div>
          </div>
        ) : null}
        {canRejectAll ? (
          <div>
            <button type="button" className={pillCls} onClick={rejectAll}>
              {E.rejectAll}
            </button>
          </div>
        ) : null}
      </div>

      <div>
        <button type="button" className={pillCls} onClick={onDone}>
          {RCT.line.done}
        </button>
      </div>
    </div>
  );
}
