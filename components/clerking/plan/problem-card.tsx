"use client";

import type { PlanView } from "./model";
import type { PharmacyHandlers } from "./pharmacy";
import type { PlanDraft, PlanOrderLine } from "@/lib/clerking/plan/draft";
import type { ProblemCard as Card, ProblemTest } from "@/lib/clerking/plan/problems";
import type { OrderFrequency, OrderPriority } from "@/lib/emr/orders";
import { useId, useState } from "react";
import { PlusIcon, ShieldAlertIcon, StarIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { words } from "@/lib/clerking/impression/board";
import { problemAddressed, REASON_WORDS } from "@/lib/clerking/plan/checklist";
import { basketOf } from "@/lib/clerking/plan/draft";
import { standing } from "@/lib/clerking/plan/record";
import {
  ORDER_FREQUENCIES,
  ORDER_FREQUENCY_WORD,
  ORDER_PRIORITIES,
  ORDER_PRIORITY_DEFINITION,
  ORDER_PRIORITY_WORD,
} from "@/lib/emr/orders";
import { classById, drugsInClass, SUPPORTIVE_ITEMS } from "@/lib/prescribing/formulary";
import { cn } from "@/lib/utils";
import { Chevron, DraftLabel, FOCUS, inputClass, PriorityTag, Seg, Tag } from "./parts";
import { itemsForLine, PharmacyChips, PharmacyItemBlock } from "./pharmacy";
import { RepeatsLine } from "./repeats";

/**
 * One problem from 09 Impression (ADR 0184 §1): tests that would help decide, must not miss,
 * suggested care (empty until a signed list exists), treatment by class from the draft diagnosis
 * → class map, and a plan note. Nothing here is sent: tests and prescriptions go to the basket.
 */

export interface PrescribeTarget {
  problem: Card;
  drugId?: string;
  classId?: string;
  fluids?: boolean;
  /** Pharmacy Phase 4 (RN-3): this placement answers a renewal request. */
  renewalId?: string;
}

const PRIORITY_OPTIONS = ORDER_PRIORITIES.map((p) => ({
  id: p,
  label: ORDER_PRIORITY_WORD[p],
  critical: p === "emergency",
}));
const FREQUENCY_OPTIONS = ORDER_FREQUENCIES.map((f) => ({ id: f, label: ORDER_FREQUENCY_WORD[f] }));

const newKey = () => `plan-order-${crypto.randomUUID()}`;

function Timing({
  label,
  priority,
  frequency,
  onPriority,
  onFrequency,
  disabled,
}: {
  label: string;
  priority: OrderPriority;
  frequency: OrderFrequency | null;
  onPriority: (p: OrderPriority) => void;
  onFrequency: (f: OrderFrequency) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Seg
          label={`Priority, ${label}`}
          options={PRIORITY_OPTIONS}
          value={priority}
          onPick={onPriority}
          disabled={disabled}
        />
        {priority === "routine" ? (
          <Seg
            label={`How often, ${label}`}
            options={FREQUENCY_OPTIONS}
            value={frequency}
            onPick={onFrequency}
            disabled={disabled}
          />
        ) : null}
      </div>
      <p className="text-caption text-muted-foreground">
        {ORDER_PRIORITY_DEFINITION[priority]}{" "}
        <span className="italic">Proposed wording; the lab sets its own times.</span>
      </p>
    </div>
  );
}

function TestRow({
  t,
  card,
  v,
  canWrite,
  pending,
  onPending,
  onPlan,
  time,
}: {
  t: ProblemTest;
  card: Card;
  v: PlanView;
  canWrite: boolean;
  pending: { priority: OrderPriority; frequency: OrderFrequency | null };
  onPending: (p: { priority: OrderPriority; frequency: OrderFrequency | null }) => void;
  onPlan: (fn: (d: PlanDraft) => PlanDraft) => void;
  time: (iso: string) => string;
}) {
  const basket = basketOf(v.draft);
  const line = basket.orders.find((o) => o.testKey === t.key);
  const linked = v.draft.problems?.[card.logicalId]?.linked ?? [];
  const placed = v.record.orders.find((o) => o.testKey === t.key);
  const placedHere =
    placed && (placed.reasonConditionIds.includes(card.versionId) || linked.includes(placed.id));
  const setLine = (fn: (o: PlanOrderLine) => PlanOrderLine) =>
    onPlan((d) => {
      const b = basketOf(d);
      return {
        ...d,
        basket: { ...b, orders: b.orders.map((o) => (o.testKey === t.key ? fn(o) : o)) },
      };
    });
  const add = () =>
    t.testId &&
    onPlan((d) => {
      const b = basketOf(d);
      return {
        ...d,
        basket: {
          ...b,
          orders: [
            ...b.orders,
            {
              clientKey: newKey(),
              testId: t.testId!,
              testKey: t.key,
              display: t.display,
              priority: pending.priority,
              frequency: pending.priority === "routine" ? (pending.frequency ?? "once") : null,
              reasonConditionIds: [card.versionId],
            },
          ],
        },
      };
    });
  const remove = () =>
    onPlan((d) => {
      const b = basketOf(d);
      const o = b.orders.find((x) => x.testKey === t.key);
      if (!o) return d;
      const rest = o.reasonConditionIds.filter((id) => id !== card.versionId);
      return {
        ...d,
        basket: {
          ...b,
          orders: rest.length
            ? b.orders.map((x) => (x === o ? { ...x, reasonConditionIds: rest } : x))
            : b.orders.filter((x) => x !== o),
        },
      };
    });

  let state: React.ReactNode;
  if (placedHere && placed) {
    state = (
      <span className="text-caption text-muted-foreground flex flex-wrap items-center gap-1.5">
        <span className="font-mono tabular-nums">{`Placed ${time(placed.at)}`}</span>
        <span aria-hidden>·</span>
        {placed.priority ? (
          <PriorityTag priority={placed.priority} word={ORDER_PRIORITY_WORD[placed.priority]} />
        ) : null}
        {placed.statusText ? (
          <>
            <span aria-hidden>·</span>
            <span>{placed.statusText}</span>
          </>
        ) : null}
      </span>
    );
  } else if (placed) {
    state = (
      <Button
        size="sm"
        variant="secondary"
        disabled={!canWrite}
        onClick={() =>
          onPlan((d) => ({
            ...d,
            problems: {
              ...d.problems,
              [card.logicalId]: {
                ...d.problems?.[card.logicalId],
                linked: [...linked, placed.id],
              },
            },
          }))
        }
      >
        Link to this
      </Button>
    );
  } else if (line && line.reasonConditionIds.includes(card.versionId)) {
    state = (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Tag>In basket</Tag>
          <Button
            size="iconSm"
            variant="ghost"
            aria-label={`Remove ${t.display} from the basket`}
            disabled={!canWrite}
            onClick={remove}
          >
            <XIcon aria-hidden className="size-3.5" />
          </Button>
        </div>
        <Timing
          label={t.display}
          priority={line.priority}
          frequency={line.frequency}
          disabled={!canWrite}
          onPriority={(priority) =>
            setLine((o) => ({
              ...o,
              priority,
              frequency: priority === "routine" ? (o.frequency ?? "once") : null,
            }))
          }
          onFrequency={(frequency) => setLine((o) => ({ ...o, frequency }))}
        />
      </div>
    );
  } else if (line) {
    state = (
      <Button
        size="sm"
        variant="secondary"
        disabled={!canWrite}
        onClick={() =>
          setLine((o) => ({ ...o, reasonConditionIds: [...o.reasonConditionIds, card.versionId] }))
        }
      >
        Also for this
      </Button>
    );
  } else if (!t.testId) {
    state = (
      <span className="text-caption text-muted-foreground">
        {t.today ?? "Not on this hospital\u2019s menu"}
      </span>
    );
  } else {
    state = (
      <div className="flex flex-col gap-2">
        <Timing
          label={t.display}
          priority={pending.priority}
          frequency={pending.frequency}
          disabled={!canWrite}
          onPriority={(priority) =>
            onPending({
              priority,
              frequency: priority === "routine" ? (pending.frequency ?? "once") : null,
            })
          }
          onFrequency={(frequency) => onPending({ ...pending, frequency })}
        />
        {t.today ? <span className="text-caption text-muted-foreground">{t.today}</span> : null}
        <Button size="sm" className="self-start" disabled={!canWrite} onClick={add}>
          <PlusIcon aria-hidden />
          Add
        </Button>
      </div>
    );
  }

  return (
    <li className="border-border flex flex-col gap-2 border-t py-2.5 first:border-t-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-col sm:w-[220px] sm:shrink-0">
        <span className="text-body-s text-foreground">{t.display}</span>
        {t.specimen ? (
          <span className="text-caption text-muted-foreground">{t.specimen}</span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">{state}</div>
    </li>
  );
}

export function ProblemCard({
  card,
  v,
  editable,
  act,
  onPlan,
  onPrescribe,
  time,
  defaultOpen,
  pharmacy,
}: {
  card: Card;
  v: PlanView;
  editable: boolean;
  act: boolean;
  onPlan: (fn: (d: PlanDraft) => PlanDraft) => void;
  onPrescribe: (t: PrescribeTarget) => void;
  time: (iso: string) => string;
  defaultOpen: boolean;
  /** Pharmacy Phase 1 (5.4): the line's queries and notices; absent with the flag off. */
  pharmacy?: PharmacyHandlers;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [pending, setPending] = useState<
    Record<string, { priority: OrderPriority; frequency: OrderFrequency | null }>
  >({});
  const bodyId = useId();
  const noteId = useId();
  const mnmId = useId();
  const canWrite = editable && act;
  const draft = v.draft.problems?.[card.logicalId] ?? {};
  const setDraft = (patch: Partial<NonNullable<PlanDraft["problems"]>[string]>) =>
    onPlan((d) => ({
      ...d,
      problems: { ...d.problems, [card.logicalId]: { ...d.problems?.[card.logicalId], ...patch } },
    }));
  const addressed = problemAddressed(card, v.draft, v.record);
  const mnmOpen =
    card.mustNotMiss &&
    !addressed.test &&
    !addressed.treatment &&
    words(draft.mnmReason ?? "") < REASON_WORDS;
  const pendingOf = (key: string) =>
    pending[key] ?? { priority: "routine" as const, frequency: "once" as const };
  const basket = basketOf(v.draft);
  const notAdded = card.tests.filter(
    (t) =>
      t.testId &&
      !basket.orders.some((o) => o.testKey === t.key) &&
      !v.record.orders.some((o) => o.testKey === t.key),
  );
  const rxHere = v.record.prescriptions.filter(
    (r) => standing(r) && r.conditionId === card.versionId,
  );
  const rxBasket = basket.prescriptions.filter((r) => r.conditionId === card.versionId);
  const prescribing = v.payload.prescribing;
  const supportive = SUPPORTIVE_ITEMS.filter((s) => card.supportive.includes(s.id));
  const title = `${card.marker ? `${card.marker === "★" ? "Leading" : card.marker}. ` : ""}${card.display}`;

  return (
    <li className="border-border bg-card rounded-lg border">
      <h4 className="text-body-m text-foreground">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className={cn("flex w-full items-center gap-2.5 rounded-lg px-4 py-3 text-left", FOCUS)}
        >
          <span aria-hidden className="text-caption text-muted-foreground w-5 shrink-0 font-mono">
            {card.marker === "★" ? (
              <StarIcon className="size-3.5 fill-current text-teal-700" />
            ) : (
              card.marker
            )}
          </span>
          <span className="sr-only">{title}</span>
          <span aria-hidden className="min-w-0 flex-1 truncate">
            {card.display}
          </span>
          {card.mustNotMiss ? (
            <span className="text-caption bg-status-caution-bg dark:text-status-caution-fg inline-flex items-center gap-1 rounded px-2 py-0.5 text-amber-800">
              <ShieldAlertIcon aria-hidden className="size-3 shrink-0" />
              Must not miss
            </span>
          ) : null}
          <Chevron open={open} />
        </button>
      </h4>
      {open ? (
        <div id={bodyId} className="border-border flex flex-col gap-5 border-t px-4 py-4">
          {/* Tests that would help decide */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-caption text-muted-foreground tracking-[0.06em] uppercase">
                Tests that would help decide
              </span>
              {notAdded.length > 1 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canWrite}
                  onClick={() =>
                    onPlan((d) => {
                      const b = basketOf(d);
                      return {
                        ...d,
                        basket: {
                          ...b,
                          orders: [
                            ...b.orders,
                            ...notAdded.map((t) => {
                              const p = pendingOf(t.key);
                              return {
                                clientKey: newKey(),
                                testId: t.testId!,
                                testKey: t.key,
                                display: t.display,
                                priority: p.priority,
                                frequency:
                                  p.priority === "routine" ? (p.frequency ?? "once") : null,
                                reasonConditionIds: [card.versionId],
                              };
                            }),
                          ],
                        },
                      };
                    })
                  }
                >
                  Add all to basket
                </Button>
              ) : null}
            </div>
            {card.tests.length ? (
              <ul aria-label={`Tests for ${card.display}`}>
                {card.tests.map((t) => (
                  <TestRow
                    key={t.key}
                    t={t}
                    card={card}
                    v={v}
                    canWrite={canWrite}
                    pending={pendingOf(t.key)}
                    onPending={(p) => setPending((x) => ({ ...x, [t.key]: p }))}
                    onPlan={onPlan}
                    time={time}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-body-s text-muted-foreground">
                {card.profileId
                  ? "The catalogue lists no tests for this problem."
                  : "No catalogue profile for this problem: order from the order sheet."}
              </p>
            )}
          </div>

          {/* Must not miss (ADR 0184) */}
          {card.mustNotMiss && !addressed.test && !addressed.treatment ? (
            <div
              className={cn(
                "flex flex-col gap-2 rounded-md px-3 py-2.5",
                mnmOpen ? "bg-status-caution-bg" : "bg-muted",
              )}
            >
              <label
                htmlFor={mnmId}
                className={cn(
                  "text-body-s",
                  mnmOpen ? "dark:text-status-caution-fg text-amber-800" : "text-foreground",
                )}
              >
                {mnmOpen
                  ? "Must not miss: add a test or a treatment, or say why neither is needed."
                  : "Must not miss: no test or treatment, for this reason:"}
              </label>
              <input
                id={mnmId}
                value={draft.mnmReason ?? ""}
                maxLength={1000}
                disabled={!editable}
                onChange={(e) => setDraft({ mnmReason: e.target.value })}
                className={inputClass}
              />
            </div>
          ) : null}

          {/* Suggested care: empty until a signed list exists (owner decision) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted-foreground tracking-[0.06em] uppercase">
              Suggested care, not orders
            </span>
            <p className="text-body-s text-muted-foreground">
              No signed care items for this problem yet.
            </p>
          </div>

          {/* Treatment by class */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-muted-foreground tracking-[0.06em] uppercase">
                Treatment for this problem
              </span>
              {card.classes.length || card.supportive.length ? (
                <DraftLabel>Draft map, not CSO-signed</DraftLabel>
              ) : null}
            </div>
            {!prescribing ? (
              <p className="text-body-s text-muted-foreground">
                Prescribing from the plan is not switched on here.
              </p>
            ) : (
              <>
                {card.classes.length ? (
                  <ul className="flex flex-col gap-2">
                    {card.classes.map((id) => {
                      const cls = classById(id);
                      const drugs = drugsInClass(id);
                      return (
                        <li
                          key={id}
                          className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3"
                        >
                          <span className="text-body-s text-foreground sm:w-[220px] sm:shrink-0 sm:pt-1">
                            {cls?.name ?? id}
                          </span>
                          <div
                            role="group"
                            aria-label={cls?.name ?? id}
                            className="flex flex-wrap gap-1.5"
                          >
                            {drugs.map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                disabled={!canWrite}
                                onClick={() =>
                                  onPrescribe({ problem: card, classId: id, drugId: d.id })
                                }
                                className={cn(
                                  "text-body-s border-border bg-card hover:bg-muted min-h-[30px] rounded-sm border px-2.5 disabled:opacity-50 pointer-coarse:min-h-11",
                                  FOCUS,
                                )}
                              >
                                {d.generic}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-body-s text-muted-foreground">
                    No classes mapped to this problem.
                  </p>
                )}
                {supportive.map((s) =>
                  s.id === "fluids" ? (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => onPrescribe({ problem: card, fluids: true })}
                      className={cn(
                        "text-body-s border-border bg-card hover:bg-muted flex min-h-[30px] flex-col items-start self-start rounded-sm border px-2.5 py-1 text-left disabled:opacity-50",
                        FOCUS,
                      )}
                    >
                      <span>Supportive: IV fluids</span>
                      <span className="text-caption text-muted-foreground">
                        Opens a fluid balance chart
                      </span>
                    </button>
                  ) : (
                    <p key={s.id} className="text-body-s text-muted-foreground">
                      {`Supportive: ${s.name}. ${s.note}`}
                    </p>
                  ),
                )}
                {rxHere.length || rxBasket.length ? (
                  <ul
                    className="flex flex-col gap-1"
                    aria-label={`Prescriptions for ${card.display}`}
                  >
                    {rxHere.map((r) => (
                      <li key={r.id} className="text-body-s flex flex-wrap items-center gap-2">
                        <span>{r.display}</span>
                        <Tag>{r.awaitingCosign ? "Awaiting co-sign" : "Prescribed"}</Tag>
                        {v.payload.repeats?.lines[r.id] && v.payload.repeats.who ? (
                          <RepeatsLine
                            terms={v.payload.repeats.lines[r.id]!}
                            who={v.payload.repeats.who}
                            prescriptionId={r.id}
                            canWrite={canWrite}
                          />
                        ) : null}
                        {pharmacy && v.payload.pharmacy ? (
                          <>
                            <PharmacyChips view={v.payload.pharmacy} lineId={r.id} />
                            {itemsForLine(v.payload.pharmacy, r.id)
                              .filter((i) => i.kind === "not_supplied" || i.scope === "line")
                              .map((i) => (
                                <PharmacyItemBlock
                                  key={i.id}
                                  item={i}
                                  view={v.payload.pharmacy!}
                                  canWrite={canWrite}
                                  handlers={pharmacy}
                                />
                              ))}
                          </>
                        ) : null}
                      </li>
                    ))}
                    {rxBasket.map((r) => (
                      <li
                        key={r.clientKey}
                        className="text-body-s flex flex-wrap items-center gap-2"
                      >
                        <span>{r.display}</span>
                        <Tag>In basket</Tag>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  disabled={!canWrite}
                  onClick={() => onPrescribe({ problem: card })}
                >
                  Prescribe something else
                </Button>
              </>
            )}
          </div>

          {/* Plan note */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className="text-caption text-muted-foreground">
              Plan note for this problem (optional)
            </label>
            <textarea
              id={noteId}
              rows={2}
              value={draft.note ?? ""}
              maxLength={4000}
              disabled={!editable}
              onChange={(e) => setDraft({ note: e.target.value })}
              className={cn(inputClass, "py-2")}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}
