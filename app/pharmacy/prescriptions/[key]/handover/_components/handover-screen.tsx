"use client";

import type { PaymentStatus } from "@/lib/pharmacy/review/load";
import type { HandoverData, HandoverLineView } from "@/lib/pharmacy/supply/read";
import type { HandoverOutcome } from "@/lib/pharmacy/supply/store";
import type { SummaryLine } from "@/lib/pharmacy/supply/summary";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_WORDS, REVIEW } from "@/content/pharmacy-review";
import { expiryText } from "@/content/pharmacy-stock";
import { SUPPLY } from "@/content/pharmacy-supply";
import { proposeBatches } from "@/lib/pharmacy/stock/fefo";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { IDENTITY_COPY, MAX_WRONG_ATTEMPTS } from "@/lib/pharmacy/supply/identity";
import { outcomeWords, whenYouRecord } from "@/lib/pharmacy/supply/summary";
import { Refusal, SELECT, TARGET, TEXTAREA } from "../../../../_components/review-dialogs";
import * as reviewActions from "../../../../review-actions";
import * as actions from "../../../../supply-actions";

/**
 * The hand-over (5.6, wireframe §6): 1 who is at the window, 2 what is supplied now and the labels,
 * 3 what was explained, 4 payment status, then "When you record it" with real numbers. The second
 * identifier is typed by the supplier and compared on the server: the field starts empty, nothing
 * stored is ever sent here, and the answer is only "Matches." or "This does not match." (SU-4). One
 * client key for the whole hand-over, so a retry or a double tap records it once (SU-10).
 */

const H = SUPPLY.handover;
const newKey = () => crypto.randomUUID();
const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : undefined);
const SETTABLE = ["paid", "insured", "emergency", "not_recorded"] as const;

type Collector = "patient" | "representative" | "ward_staff";
interface LinePlan {
  qty: string;
  productId: string;
  strengthOk: boolean;
}

/** The batches a line takes: the staged decision's, or first to expire for a "Supply now" quantity. */
function rowsOf(line: HandoverLineView, plan: LinePlan, today: string) {
  if (line.mode === "staged" && line.staged?.batches)
    return { productId: line.staged.productId ?? plan.productId, rows: line.staged.batches };
  const q = int(plan.qty);
  if (!q) return { productId: plan.productId, rows: [] };
  const usable = line.stock.batches.filter((b) => !b.expired && b.productId === plan.productId);
  const p = proposeBatches({
    batches: usable.map((b) => ({ ...b, pointId: "", medicineId: "" })),
    balances: new Map(usable.map((b) => [b.id, b.balance])),
    quantity: q,
    localDate: today,
  });
  return { productId: plan.productId, rows: p.ok ? p.rows : [], short: p.ok ? null : p };
}

export function HandoverScreen({
  data,
  canManage,
  timeZone,
}: {
  data: HandoverData;
  canManage: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [clientKey] = useState(newKey);
  const today = localDate(new Date(data.serverNow));
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  const ids = {
    name: useId(),
    rel: useId(),
    staff: useId(),
    second: useId(),
    note: useId(),
    lang: useId(),
    detail: useId(),
  };

  const ward = data.inpatientSupplyOn && data.origin === "ward";
  const [collector, setCollector] = useState<Collector>(ward ? "ward_staff" : "patient");
  const [repName, setRepName] = useState("");
  const [repRel, setRepRel] = useState("");
  const [staffId, setStaffId] = useState("");
  const [nameAttested, setNameAttested] = useState(false);
  const [kind, setKind] = useState<"date_of_birth" | "phone">("date_of_birth");
  const [typed, setTyped] = useState("");
  const [check, setCheck] = useState<{
    result: "match" | "mismatch" | "closed";
    attemptsLeft: number;
  } | null>(data.typedCheck.attemptsLeft === 0 ? { result: "closed", attemptsLeft: 0 } : null);
  const [another, setAnother] = useState(false);
  const [how, setHow] = useState("");
  const [howNote, setHowNote] = useState("");
  const [plans, setPlans] = useState<Record<string, LinePlan>>(() =>
    Object.fromEntries(
      data.lines.map((l) => {
        const withStock = l.stock.products.filter((p) =>
          l.stock.batches.some((b) => b.productId === p.id && !b.expired),
        );
        return [
          l.lineId,
          {
            qty: "",
            productId: l.staged?.productId ?? (withStock[0] ?? l.stock.products[0])?.id ?? "",
            strengthOk: false,
          },
        ];
      }),
    ),
  );
  const [byHand, setByHand] = useState(false);
  const [points, setPoints] = useState<string[]>([]);
  const [language, setLanguage] = useState("");
  const [payment, setPayment] = useState<PaymentStatus>(data.payment?.status ?? "not_recorded");
  const [detail, setDetail] = useState(data.payment?.detail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ id: string; lines: HandoverOutcome[]; at: string } | null>(
    null,
  );

  if (!data.lines.length)
    return (
      <div className="flex flex-col gap-4">
        {data.controlled.length ? (
          <CautionNotice lead={REVIEW.review.controlledBeforeStep7}>
            {data.controlled.join(", ")}
          </CautionNotice>
        ) : null}
        <p className="text-body-s">{H.nothing}</p>
        <BackLink href={`/pharmacy/prescriptions/${encodeURIComponent(data.key)}`} />
      </div>
    );

  const plan = (id: string) => plans[id]!;
  const patchPlan = (id: string, p: Partial<LinePlan>) =>
    setPlans((x) => ({ ...x, [id]: { ...x[id]!, ...p } }));

  // The lines as the server will be asked to write them.
  const built = data.lines.map((l) => {
    const p = plan(l.lineId);
    const r = rowsOf(l, p, today);
    const total = r.rows.reduce((s, x) => s + x.quantity, 0);
    const product = l.stock.products.find((x) => x.id === r.productId);
    const rest =
      l.mode === "staged"
        ? l.staged?.kind === "part" && l.staged.rest
          ? {
              outcome: l.staged.rest,
              quantityNotSupplied: l.staged.notSupplied ?? null,
              reasonCode: l.staged.reasonCode ?? undefined,
            }
          : undefined
        : l.left !== null && total > 0 && total < l.left && l.status !== "ready"
          ? { outcome: l.status, quantityNotSupplied: l.left - total }
          : undefined;
    return { line: l, plan: p, ...r, total, product, rest };
  });
  const summary: SummaryLine[] = built.map((b) => ({
    medicine: b.line.medicine,
    unit: b.product?.issueUnit ?? "",
    rows: b.rows.map((r) => ({
      batchNumber: b.line.stock.batches.find((x) => x.id === r.batchId)?.batchNumber ?? "",
      quantity: r.quantity,
    })),
    rest: b.rest ? { outcome: b.rest.outcome, notSupplied: b.rest.quantityNotSupplied } : null,
  }));

  const runCheck = () =>
    startCheck(async () => {
      const r = await actions.checkSecondIdentifier({
        clientKey,
        lineId: data.lines[0]!.lineId,
        kind,
        typed,
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      setTyped("");
      setCheck({ result: r.result ?? "mismatch", attemptsLeft: r.attemptsLeft ?? 0 });
    });

  const record = () =>
    start(async () => {
      const r = await actions.recordHandover({
        clientKey,
        lines: built.map((b) => ({
          lineId: b.line.lineId,
          productId: b.productId,
          rows: b.rows,
          ...(b.line.staged?.batchChoiceReason
            ? { batchChoiceReason: b.line.staged.batchChoiceReason }
            : {}),
          ...(b.rest ? { rest: b.rest } : {}),
          strengthConfirmed: b.plan.strengthOk,
          ...(b.line.staged?.daysCovered ? { daysCovered: b.line.staged.daysCovered } : {}),
        })),
        collector:
          collector === "patient"
            ? { kind: "patient" }
            : collector === "representative"
              ? { kind: "representative", name: repName, relationship: repRel }
              : { kind: "ward_staff", userId: staffId },
        identity:
          collector === "ward_staff"
            ? { route: "ward_staff" }
            : another
              ? {
                  route: "identified_another_way",
                  nameAttested,
                  how,
                  ...(howNote.trim() ? { note: howNote } : {}),
                }
              : { route: "two_identifiers", nameAttested },
        labelsWrittenAttested: byHand,
        counselling: points,
        ...(language.trim().length >= 2 ? { language } : {}),
        payment: {
          status: payment,
          ...((payment === "paid" || payment === "insured") && detail.trim() ? { detail } : {}),
        },
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      setDone({ id: r.id, lines: r.lines ?? [], at: r.serverTime });
      router.refresh();
    });

  if (done) return <Recorded data={data} done={done} time={time} />;

  const closed = check?.result === "closed";
  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-s text-muted-foreground">
        {data.head?.kind === "reviewed"
          ? H.reviewed(data.head.cadre, time.format(new Date(data.head.at)))
          : data.head?.kind === "without"
            ? H.without(data.head.reason)
            : data.head?.kind === "standard"
              ? H.standard
              : null}
      </p>
      {data.controlled.length ? (
        <CautionNotice lead={REVIEW.review.controlledBeforeStep7}>
          {data.controlled.join(", ")}
        </CautionNotice>
      ) : null}

      <Section n={1} title={H.section.who}>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label mb-1">{H.collectedBy}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Radio
              name="collector"
              checked={collector === "patient"}
              onChange={() => setCollector("patient")}
            >
              {H.patient}
            </Radio>
            <Radio
              name="collector"
              checked={collector === "representative"}
              onChange={() => setCollector("representative")}
            >
              {H.someone}
            </Radio>
            {ward ? (
              <Radio
                name="collector"
                checked={collector === "ward_staff"}
                onChange={() => setCollector("ward_staff")}
              >
                {H.wardStaff}
              </Radio>
            ) : null}
          </div>
          {collector === "representative" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={ids.name} label={H.name}>
                <Input
                  id={ids.name}
                  value={repName}
                  maxLength={120}
                  onChange={(e) => setRepName(e.target.value)}
                  className={TARGET}
                />
              </Field>
              <Field id={ids.rel} label={H.relationship}>
                <Input
                  id={ids.rel}
                  value={repRel}
                  maxLength={80}
                  onChange={(e) => setRepRel(e.target.value)}
                  className={TARGET}
                />
              </Field>
            </div>
          ) : null}
          {collector === "ward_staff" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={ids.staff} label={H.staffPick}>
                <select
                  id={ids.staff}
                  className={SELECT}
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                >
                  <option value="" disabled>
                    {H.choose}
                  </option>
                  {data.wardStaff.map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              {data.ward ? (
                <p className="text-body-s self-end">
                  <span className="text-muted-foreground">{H.ward}: </span>
                  {data.ward}
                </p>
              ) : null}
              <p className="text-body-s text-muted-foreground sm:col-span-2">{H.wardRoute}</p>
            </div>
          ) : null}
        </fieldset>

        {collector !== "ward_staff" ? (
          <div className="flex flex-col gap-3">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={nameAttested}
                onChange={(e) => setNameAttested(e.target.checked)}
              />
              <span className="text-body-s">
                <span className="text-muted-foreground">{H.first}: </span>
                {H.firstAttest}
              </span>
            </label>
            {!another ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-label mb-1">
                  {H.second}: {H.secondLabel}
                </legend>
                {closed ? (
                  <p className="text-body-s">
                    <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                      {H.closed}
                    </StatusWord>
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <span className="flex gap-4">
                      {(["date_of_birth", "phone"] as const).map((k) => (
                        <Radio
                          key={k}
                          name="second-kind"
                          checked={kind === k}
                          onChange={() => setKind(k)}
                        >
                          {H.kind[k]}
                        </Radio>
                      ))}
                    </span>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={ids.second} className="sr-only">
                        {H.kind[kind]}
                      </Label>
                      <Input
                        id={ids.second}
                        value={typed}
                        maxLength={40}
                        autoComplete="off"
                        spellCheck={false}
                        inputMode={kind === "phone" ? "tel" : "text"}
                        onChange={(e) => setTyped(e.target.value)}
                        className="min-h-11 w-56 font-mono tabular-nums"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className={TARGET}
                      disabled={checking || !typed.trim()}
                      onClick={runCheck}
                    >
                      {H.check}
                    </Button>
                  </div>
                )}
                <p role="status" className="text-body-s empty:hidden">
                  {check?.result === "match" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckIcon className="size-4" aria-hidden />
                      {H.match}
                    </span>
                  ) : check?.result === "mismatch" ? (
                    <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                      {IDENTITY_COPY.mismatch}{" "}
                      {H.attempt(MAX_WRONG_ATTEMPTS - check.attemptsLeft, MAX_WRONG_ATTEMPTS)}
                    </StatusWord>
                  ) : null}
                </p>
                {closed && canManage ? (
                  <span>
                    <Button
                      type="button"
                      variant="secondary"
                      className={TARGET}
                      onClick={() =>
                        start(async () => {
                          const r = await actions.reopenTypedCheck({
                            clientKey: newKey(),
                            lineId: data.lines[0]!.lineId,
                          });
                          if (!r.ok) return setError(r.error);
                          setCheck(null);
                        })
                      }
                    >
                      {H.reopen}
                    </Button>
                  </span>
                ) : null}
              </fieldset>
            ) : null}
            <p className="text-body-s text-muted-foreground">{IDENTITY_COPY.rule}</p>
            {data.identityRoutes ? (
              <div className="flex flex-col gap-2">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={another}
                    onChange={(e) => setAnother(e.target.checked)}
                  />
                  <span className="text-body-s">{H.anotherWay}</span>
                </label>
                {another ? (
                  <fieldset className="flex flex-col gap-1 pl-6">
                    <legend className="sr-only">{H.anotherWay}</legend>
                    {data.identityRoutes.map((r) => (
                      <Radio
                        key={r.code}
                        name="identified-how"
                        checked={how === r.code}
                        onChange={() => setHow(r.code)}
                      >
                        {r.words}
                      </Radio>
                    ))}
                    <Field id={ids.note} label={how === "other" ? H.noteOther : H.note}>
                      <textarea
                        id={ids.note}
                        value={howNote}
                        maxLength={500}
                        onChange={(e) => setHowNote(e.target.value)}
                        className={TEXTAREA}
                      />
                    </Field>
                  </fieldset>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section n={2} title={H.section.supplying}>
        <div className="overflow-x-auto">
          <table className="text-body-s w-full">
            <thead className="text-caption text-muted-foreground border-border border-b text-left">
              <tr>
                <th className="px-2 py-2 font-medium">{H.columns.medicine}</th>
                <th className="px-2 py-2 font-medium">{H.columns.quantity}</th>
                <th className="px-2 py-2 font-medium">{H.columns.batch}</th>
                <th className="px-2 py-2 font-medium">{H.columns.outcome}</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {built.map((b) => {
                const unit = b.product?.issueUnit ?? "";
                const name = [b.line.medicine, b.line.concentration].filter(Boolean).join(" · ");
                return (
                  <tr key={b.line.lineId} className="align-top">
                    <td className="px-2 py-3">
                      <span className="flex flex-col gap-1">
                        <span className="font-medium">{name}</span>
                        <span className="text-muted-foreground whitespace-pre-wrap">
                          {b.line.directions}
                        </span>
                        {b.product && b.product.match !== "same" ? (
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={b.plan.strengthOk}
                              onChange={(e) =>
                                patchPlan(b.line.lineId, { strengthOk: e.target.checked })
                              }
                            />
                            <span>
                              {b.product.name}
                              {b.product.strength ? ` · ${b.product.strength}` : ""}:{" "}
                              {H.strengthCheck}
                            </span>
                          </label>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {b.line.mode === "supply_now" ? (
                        <span className="flex flex-col gap-1">
                          <Label htmlFor={`qty-${b.line.lineId}`} className="sr-only">
                            {H.quantityName(b.line.medicine, unit)}
                          </Label>
                          <Input
                            id={`qty-${b.line.lineId}`}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            required
                            value={b.plan.qty}
                            onChange={(e) => patchPlan(b.line.lineId, { qty: e.target.value })}
                            className="min-h-11 w-24 font-mono tabular-nums"
                          />
                          {b.line.left !== null ? (
                            <span className="text-caption text-muted-foreground">
                              {H.left(b.line.left, unit)}
                            </span>
                          ) : null}
                          {"short" in b && b.short?.reason === "not_enough" ? (
                            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                              {H.noStock(b.short.available, unit)}
                            </StatusWord>
                          ) : null}
                        </span>
                      ) : (
                        <span className="font-mono tabular-nums">
                          {b.total} {unit}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex flex-col font-mono tabular-nums">
                        {b.rows.map((r) => {
                          const x = b.line.stock.batches.find((y) => y.id === r.batchId);
                          return (
                            <span key={r.batchId}>
                              {x ? `${x.batchNumber} · ${expiryText(x)}` : "—"}
                              {b.rows.length > 1 ? ` · ${r.quantity}` : ""}
                            </span>
                          );
                        })}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {b.rest ? H.outcome[b.rest.outcome] : H.outcome.supplied}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-body-s">{H.labelMode[data.labelMode]}</p>
        {data.labelMode === "by_hand" ? (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={byHand} onChange={(e) => setByHand(e.target.checked)} />
            <span className="text-body-s">{H.byHand}</span>
          </label>
        ) : (
          <p className="text-body-s text-muted-foreground">{H.labelsAfter}</p>
        )}
      </Section>

      <Section n={3} title={H.section.explained}>
        {data.counselling?.length ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-label mb-1">{H.counselling}</legend>
            {data.counselling.map((c) => (
              <label key={c.code} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={points.includes(c.code)}
                  onChange={(e) =>
                    setPoints((x) =>
                      e.target.checked ? [...x, c.code] : x.filter((y) => y !== c.code),
                    )
                  }
                />
                <span className="text-body-s">{c.words}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <Field id={ids.lang} label={H.language}>
          <Input
            id={ids.lang}
            value={language}
            maxLength={40}
            onChange={(e) => setLanguage(e.target.value)}
            className="min-h-11 max-w-xs"
          />
        </Field>
      </Section>

      <Section n={4} title={H.section.payment}>
        {data.paymentRequired ? (
          <p className="text-body-s text-muted-foreground">{H.paymentRequired}</p>
        ) : null}
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">{H.section.payment}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {SETTABLE.map((s) => (
              <Radio key={s} name="payment" checked={payment === s} onChange={() => setPayment(s)}>
                {PAYMENT_WORDS[s]}
              </Radio>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">
            {PAYMENT_WORDS.exempt}: {REVIEW.review.exemptUnsigned}
          </p>
        </fieldset>
        {payment === "paid" || payment === "insured" ? (
          <Field id={ids.detail} label={H.paymentDetail[payment]}>
            <Input
              id={ids.detail}
              value={detail}
              maxLength={200}
              onChange={(e) => setDetail(e.target.value)}
              className="min-h-11 max-w-sm"
            />
          </Field>
        ) : null}
      </Section>

      <section aria-labelledby="when" className="flex flex-col gap-2">
        <h2 id="when" className="text-heading-s font-medium">
          {H.when}
        </h2>
        <ul className="text-body-s flex list-disc flex-col gap-1 pl-5">
          {whenYouRecord(summary).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Refusal error={error} />
        <Link
          href={`/pharmacy/prescriptions/${encodeURIComponent(data.key)}`}
          prefetch={false}
          className="text-body-s inline-flex min-h-11 items-center px-3 font-medium text-teal-700 underline-offset-4 hover:underline"
        >
          {H.backTo}
        </Link>
        <Button
          type="button"
          className={TARGET}
          disabled={pending || !data.pointLive}
          onClick={record}
        >
          {H.record}
        </Button>
      </div>
    </div>
  );
}

/** After recording (5.6): each line's outcome in words; then the labels, and the slip for the rest. */
function Recorded({
  data,
  done,
  time,
}: {
  data: HandoverData;
  done: { id: string; lines: HandoverOutcome[]; at: string };
  time: Intl.DateTimeFormat;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const outside = done.lines.find((l) => l.kind === "buying_outside");
  return (
    <section
      role="status"
      className="border-border bg-card flex flex-col gap-3 rounded-lg border px-4 py-4"
    >
      <h2 className="text-heading-s font-medium">{H.recorded(time.format(new Date(done.at)))}</h2>
      <ul className="text-body-s flex flex-col gap-1">
        {done.lines.map((l) => {
          const line = data.lines.find((x) => x.lineId === l.lineId);
          return (
            <li key={l.lineId}>
              <span className="font-medium">{line?.medicine ?? ""}</span>: {outcomeWords(l.kind)}
              {l.quantitySupplied ? (
                <span className="font-mono tabular-nums"> · {l.quantitySupplied}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <span className="flex flex-wrap gap-3">
        {data.labelMode === "printed" ? (
          <Link
            href={`/pharmacy/labels/${done.id}`}
            prefetch={false}
            className={buttonVariants({ variant: "primary", size: "md", className: "min-h-11" })}
          >
            {H.printLabels}
          </Link>
        ) : null}
        {outside ? (
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const slip = await reviewActions.printSlip({
                  clientKey: newKey(),
                  lineId: outside.lineId,
                });
                if (slip.ok) router.push(`/pharmacy/slip/${slip.id}`);
                else setError(slip.error);
              })
            }
          >
            {H.printSlip}
          </Button>
        ) : null}
        <Link
          href="/pharmacy"
          prefetch={false}
          className="text-body-s inline-flex min-h-11 items-center px-3 font-medium text-teal-700 underline-offset-4 hover:underline"
        >
          {H.toQueue}
        </Link>
      </span>
      <Refusal error={error} />
    </section>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="border-border bg-card flex flex-col gap-3 rounded-lg border px-4 py-4"
    >
      <h2 id={id} className="text-heading-s font-medium">
        <span className="text-muted-foreground mr-2 font-mono tabular-nums">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-caption">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Radio({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span className="text-body-s">{children}</span>
    </label>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="text-body-s self-start font-medium text-teal-700 underline-offset-4 hover:underline"
    >
      {H.back}
    </Link>
  );
}
