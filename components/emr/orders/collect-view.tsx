import type { CollectDraft, CollectTarget, FastingState, PatientIdentity } from "./model";
import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleCheckIcon, ClockIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAB2 } from "@/content/lab-phase-2";
import { StatusWord } from "../status-word";
import { ChoiceChips } from "./choice-chips";
import {
  collectIssues,
  CONTAINER_OPTIONS,
  containerWords,
  FASTING_OPTIONS,
  paymentWords,
  PRIORITY_WORD,
  SPECIMEN_OPTIONS,
  specimenWords,
} from "./model";

/**
 * Specimen collection at the bedside (gate-a E.8). The two identifiers are read back to the
 * patient and confirmed with a required check; the fasting chip appears only when the test or a
 * component needs it, with no definition text while REF-DM-FASTING-DEF is unsigned; the specimen
 * and container come from the test menu; the collector is whoever is signed in.
 *
 * Lab Phase 2 (§5.2), only when `target.lab` is present (its flags on): the amber high-risk block,
 * the payment chip and its reason, and the label check: the tube's label is scanned or typed and
 * must match this order before Mark collected (ID-2); a mismatch has no override (D-LAB2-04).
 */
export function CollectView({
  identity,
  target,
  draft,
  collectorName,
  pending = false,
  message = null,
  labelHref = null,
  onConfirm,
  onFasting,
  onFastingHours,
  onCollectedAt,
  onSpecimen,
  onContainer,
  onSave,
  printHref = null,
  labelCheck = null,
  onLabelNo,
  onWristband,
  onCheckLabel,
  onVoidLabel,
  onPaymentReason,
}: {
  identity: PatientIdentity;
  target: CollectTarget;
  draft: CollectDraft;
  collectorName: string | null;
  pending?: boolean;
  message?: { ok: boolean; text: string } | null;
  /** Set once the specimen is saved: the label to print. */
  labelHref?: string | null;
  onConfirm?: (v: boolean) => void;
  onFasting?: (v: FastingState) => void;
  onFastingHours?: (v: string) => void;
  onCollectedAt?: (v: string) => void;
  onSpecimen?: (v: string) => void;
  onContainer?: (v: string) => void;
  onSave?: () => void;
  /** Lab Phase 2: the order's label route, to print before collection. */
  printHref?: string | null;
  /** Lab Phase 2: what the last label check said, for the words under the field. */
  labelCheck?: LabelCheckShown | null;
  /** `method`: "scan" when the value arrived within about 150 ms of its first character. */
  onLabelNo?: (v: string, method: "scan" | "typed") => void;
  onWristband?: (v: boolean) => void;
  onCheckLabel?: () => void;
  onVoidLabel?: (reason: string) => void;
  onPaymentReason?: (v: string) => void;
}) {
  const issues = collectIssues(target, draft);
  const lab = target.lab;
  const pay = lab?.payment && lab.payment.state !== "not_required" ? lab.payment : null;
  const informReason = pay?.state === "awaiting" && pay.mode !== "hold";
  // The identifier check leads the form, so its absence is said by the checkbox, not repeated;
  // likewise the payment reason, whose field says it.
  const shown = issues.filter(
    (i) =>
      (draft.identifiersConfirmed || !i.startsWith("Confirm the")) &&
      !(informReason && i === LAB2.payment.collectInform),
  );
  const issuesId = `collect-issues-${target.orderId}`;
  const specimen = [specimenWords(target.specimenType), containerWords(target.container)].filter(
    Boolean,
  );
  return (
    <div className="flex flex-col gap-5">
      {lab?.highRisk ? (
        <HighRiskBlock manual={lab.highRisk.manual} procedure={lab.procedure} announce />
      ) : null}
      <p className="text-body-s flex flex-wrap items-center gap-x-3">
        <span className="font-medium">{target.display}</span>
        {target.priority ? <span>{PRIORITY_WORD[target.priority] ?? target.priority}</span> : null}
        {target.rejection ? <StatusWord tone="caution">{target.rejection}</StatusWord> : null}
      </p>

      {pay ? (
        <Field label="Payment">
          <div className="flex flex-col gap-2">
            <span>
              {pay.state === "awaiting" ? (
                <StatusWord tone="caution" glyph={ClockIcon}>
                  {paymentWords(pay.state)}
                </StatusWord>
              ) : (
                <StatusWord>{paymentWords(pay.state, pay.receipt)}</StatusWord>
              )}
            </span>
            {informReason ? (
              <label className="flex flex-col gap-1">
                {LAB2.payment.collectInform}
                <Input
                  required
                  value={draft.paymentReason ?? ""}
                  onChange={(e) => onPaymentReason?.(e.target.value)}
                  className="min-h-11 sm:min-h-9"
                />
              </label>
            ) : null}
          </div>
        </Field>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-s text-muted-foreground mb-1">Confirm with the patient</legend>
        <p className="text-body-m flex flex-wrap gap-x-4">
          <span className="font-medium">{identity.name}</span>
          <span className="font-mono tabular-nums">{identity.mrn}</span>
          {identity.ageSex.split(" · ").map((p) => (
            <span key={p}>{p}</span>
          ))}
        </p>
        <label className="text-body-s has-[:focus-visible]:shadow-focus inline-flex min-h-11 items-center gap-3 rounded-md sm:min-h-9">
          <input
            type="checkbox"
            required
            checked={draft.identifiersConfirmed}
            onChange={(e) => onConfirm?.(e.target.checked)}
            className="size-5 accent-teal-600"
          />
          Name and MRN confirmed with the patient (required)
        </label>
      </fieldset>

      {lab?.checkOn ? (
        <LabelCheck
          identity={identity}
          target={target}
          draft={draft}
          pending={pending}
          printHref={printHref}
          labelCheck={labelCheck}
          onLabelNo={onLabelNo}
          onWristband={onWristband}
          onCheckLabel={onCheckLabel}
          onVoidLabel={onVoidLabel}
        />
      ) : null}

      <Field label="Specimen">
        <div className="flex flex-col gap-2">
          {specimen.length ? (
            <span className="flex flex-wrap gap-x-3">
              {specimen.map((s) => (
                <span key={s}>{s}</span>
              ))}
              <span className="text-muted-foreground">(test menu)</span>
            </span>
          ) : null}
          {target.specimenType ? null : (
            <ChoiceChips
              name={`specimen-${target.orderId}`}
              label="Specimen"
              options={SPECIMEN_OPTIONS}
              value={draft.specimenType}
              onChange={onSpecimen}
            />
          )}
          {target.container ? null : (
            <ChoiceChips
              name={`container-${target.orderId}`}
              label="Container"
              options={CONTAINER_OPTIONS}
              value={draft.container}
              onChange={onContainer}
            />
          )}
        </div>
      </Field>

      {target.needsFasting ? (
        <Field label="Fasting">
          <div className="flex flex-col gap-2">
            <ChoiceChips
              name={`fasting-${target.orderId}`}
              label="Fasting state"
              options={FASTING_OPTIONS}
              value={draft.fastingState}
              onChange={onFasting}
            />
            {draft.fastingState === "fasting" ? (
              <label className="text-body-s flex flex-wrap items-center gap-2">
                Hours since food or drink
                <Input
                  inputMode="decimal"
                  value={draft.fastingHours}
                  onChange={(e) => onFastingHours?.(e.target.value)}
                  className="min-h-11 w-24 font-mono tabular-nums sm:min-h-9"
                />
              </label>
            ) : null}
          </div>
        </Field>
      ) : null}

      <Field label="Collected">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="sr-only" htmlFor={`collected-${target.orderId}`}>
            Collection time (empty is now)
          </label>
          <Input
            id={`collected-${target.orderId}`}
            type="datetime-local"
            value={draft.collectedAt}
            onChange={(e) => onCollectedAt?.(e.target.value)}
            className="min-h-11 w-auto font-mono tabular-nums sm:min-h-9"
          />
          {draft.collectedAt ? null : <span className="text-muted-foreground">Now</span>}
          <span>by {collectorName ?? "you"}</span>
        </div>
      </Field>

      {shown.length ? (
        <ul id={issuesId} className="flex flex-col gap-1">
          {shown.map((i) => (
            <li key={i}>
              <StatusWord tone="caution">{i}</StatusWord>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {labelHref ? (
          <Link
            href={labelHref}
            className="tap inline-flex min-h-11 items-center font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
          >
            Print label
          </Link>
        ) : (
          <Button
            type="button"
            onClick={onSave}
            disabled={pending || issues.length > 0}
            aria-describedby={issues.length && shown.length ? issuesId : undefined}
            className="min-h-11 sm:min-h-9"
          >
            {pending ? "Saving…" : lab?.checkOn ? "Mark collected" : "Save and print label"}
          </Button>
        )}
        <span role="status" aria-live="polite" className="text-body-s">
          {message ? (
            message.ok ? (
              message.text
            ) : (
              <StatusWord tone="caution">{message.text}</StatusWord>
            )
          ) : null}
        </span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-body-s grid gap-x-4 gap-y-1 sm:grid-cols-[6rem_1fr] sm:items-start">
      <span className="text-muted-foreground sm:pt-1.5">{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** What the last label check said (lib/emr/actions/orders.ts checkLabel). */
export interface LabelCheckShown {
  labelNo: string;
  outcome: string;
  /** The other patient's two identifiers, when the label is theirs. */
  other: { name: string; mrn: string } | null;
}

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

/**
 * HR-3: the high-risk specimen warning. Amber (never red), a 2 px border, an icon and the words;
 * the hospital's procedure as a link, or its title. `announce`: role="alert", read once when the
 * block is inserted (its words never change while it is shown).
 */
export function HighRiskBlock({
  manual,
  procedure,
  announce = false,
  children,
}: {
  manual: boolean;
  procedure: string | null;
  announce?: boolean;
  children?: ReactNode;
}) {
  const text = manual ? LAB2.highRisk.manual : LAB2.highRisk.block;
  const cut = text.indexOf(". ") + 1;
  return (
    <div
      role={announce ? "alert" : undefined}
      className="border-status-caution-fg bg-status-caution-bg text-body-s dark:text-status-caution-fg flex items-start gap-3 rounded-md border-2 p-3 text-amber-800"
    >
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-2">
        <p>
          <strong className="font-medium">{text.slice(0, cut)}</strong>
          {text.slice(cut)}
        </p>
        {procedure ? (
          isUrl(procedure) ? (
            <a
              href={procedure.trim()}
              target="_blank"
              rel="noreferrer"
              className="tap inline-flex min-h-11 items-center self-start font-medium underline underline-offset-4 sm:min-h-0"
            >
              Open the procedure
            </a>
          ) : (
            <p>
              Procedure: <span className="font-medium">{procedure}</span>
            </p>
          )
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** ID-1..ID-5: the label to print, the scan or typed check, the wristband, void and print new. */
function LabelCheck({
  identity,
  target,
  draft,
  pending,
  printHref,
  labelCheck,
  onLabelNo,
  onWristband,
  onCheckLabel,
  onVoidLabel,
}: {
  identity: PatientIdentity;
  target: CollectTarget;
  draft: CollectDraft;
  pending: boolean;
  printHref: string | null;
  labelCheck: LabelCheckShown | null;
  onLabelNo?: (v: string, method: "scan" | "typed") => void;
  onWristband?: (v: boolean) => void;
  onCheckLabel?: () => void;
  onVoidLabel?: (reason: string) => void;
}) {
  // ponytail: a keyboard-wedge scanner types the whole label within ~150 ms; a paste reads as a
  // scan too. Swap for the scanner's prefix/suffix if a hospital's scanner is configured with one.
  const firstKey = useRef<number | null>(null);
  const mismatch = useRef<HTMLDivElement>(null);
  const [voiding, setVoiding] = useState(false);
  const [why, setWhy] = useState("");
  const outcome = labelCheck?.outcome ?? null;
  useEffect(() => {
    if (outcome === "other_patient") mismatch.current?.focus();
  }, [outcome, labelCheck]);

  const id = `label-${target.orderId}`;
  const typed = draft.labelNo?.trim() ?? "";
  const checked = labelCheck?.labelNo ?? "";
  const words =
    outcome === "match"
      ? LAB2.label.match(checked, identity.name, identity.mrn, target.display)
      : outcome === "unknown_label"
        ? LAB2.label.unknown(checked)
        : outcome === "voided_label"
          ? LAB2.label.voided(checked)
          : outcome === "other_order_same_patient"
            ? LAB2.label.otherOrder(checked)
            : null;

  return (
    <Field label="Label">
      <div className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted-foreground">Label to print</span>
          <span className="text-body-l font-mono font-medium tabular-nums">
            {target.lab?.labelNo ?? "No label issued"}
          </span>
          {printHref && target.lab?.labelNo ? (
            <Link
              href={printHref}
              className="tap inline-flex min-h-11 items-center font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
            >
              Print label
            </Link>
          ) : null}
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor={id}>Scan or type the label on the tube</label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={id}
              value={draft.labelNo ?? ""}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value;
                const now = Date.now();
                if (!v) firstKey.current = null;
                else firstKey.current ??= now;
                const fast = firstKey.current !== null && now - firstKey.current <= 150;
                onLabelNo?.(v, fast ? "scan" : "typed");
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (typed && !pending) onCheckLabel?.();
              }}
              className="min-h-11 w-48 font-mono tabular-nums sm:min-h-9"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={onCheckLabel}
              disabled={pending || !typed}
              className="min-h-11 sm:min-h-9"
            >
              Check
            </Button>
          </div>
        </div>

        <label className="has-[:focus-visible]:shadow-focus inline-flex min-h-11 items-center gap-3 rounded-md sm:min-h-9">
          <input
            type="checkbox"
            checked={!!draft.wristband}
            onChange={(e) => onWristband?.(e.target.checked)}
            className="size-5 accent-teal-600"
          />
          {LAB2.label.wristband}
        </label>

        <div role="status" aria-live="polite">
          {outcome === "match" && words ? (
            <p className="border-teal-edge bg-teal-tint text-teal-text flex items-start gap-2 rounded-md border p-2">
              <CircleCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{words}</span>
            </p>
          ) : words ? (
            <StatusWord tone="caution">{words}</StatusWord>
          ) : null}
        </div>
        {outcome === "other_patient" ? (
          <div
            ref={mismatch}
            role="alert"
            tabIndex={-1}
            aria-labelledby={`${id}-mismatch`}
            className="border-status-caution-fg bg-status-caution-bg focus-visible:shadow-focus dark:text-status-caution-fg flex items-start gap-3 rounded-md border-2 p-3 text-amber-800 outline-none"
          >
            <TriangleAlertIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
            <div className="flex flex-col gap-1">
              <h3 id={`${id}-mismatch`} className="text-heading-s">
                Wrong patient&apos;s label
              </h3>
              <p>
                {LAB2.label.mismatch(
                  checked,
                  labelCheck?.other?.name ?? "another patient",
                  labelCheck?.other?.mrn ?? "MRN not shown",
                  identity.name,
                )}
              </p>
            </div>
          </div>
        ) : null}

        {voiding ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              Why is this label voided? (required)
              <Input
                required
                autoFocus
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                className="min-h-11 w-64 sm:min-h-9"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || why.trim().length < 3}
              onClick={() => {
                onVoidLabel?.(why.trim());
                setVoiding(false);
                setWhy("");
              }}
              className="min-h-11 sm:min-h-9"
            >
              Void and print new
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setVoiding(false)}
              className="min-h-11 sm:min-h-9"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setVoiding(true)}
            disabled={pending}
            className="min-h-11 self-start sm:min-h-9"
          >
            Void and print new
          </Button>
        )}
      </div>
    </Field>
  );
}
