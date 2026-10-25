"use client";

import type {
  CatalogItem,
  Classification,
} from "@/supabase/functions/_shared/symptom-catalog/types";
import type { SymptomDuration } from "@/supabase/functions/_shared/symptoms";
import type { AudienceChoice, StepsSelection } from "@patient-core/symptoms";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  CHILD_BANDS,
  DEFAULT_AUDIENCE,
  followUps,
  interruptOf,
  noteFor,
  toAudience,
} from "@patient-core/symptoms";
import { CheckIcon } from "lucide-react";

import {
  emergencyEventAction,
  requestSameDayAction,
  submitSymptomsAction,
} from "@/app/patient/symptoms/actions";
import { DangerResult, DangerSigns, GetHelpLink, HelpPanel } from "@/components/tide/book-danger";
import { Chip, ChipRow } from "@/components/tide/controls";
import { Button, ButtonLink, Card, Note } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { BOOK_COPY as C, WRONG_COPY as W } from "@/content/patient/book";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { toSlot } from "@/lib/patient-web/opaque";
import { cn } from "@/lib/utils";
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import {
  classify,
  t as say,
  visibleCategories,
  visibleItems,
} from "@/supabase/functions/_shared/symptom-catalog/classify";
import {
  MAX_FREE_TEXT,
  MAX_SELECTED_ITEMS,
  TIER_LABEL_KEY,
} from "@/supabase/functions/_shared/symptom-catalog/types";
import { SYMPTOM_DURATIONS, symptomDurationLabel } from "@/supabase/functions/_shared/symptoms";
import { StepHead, TextArea } from "../../_components/fields";

type Step = "pick" | "ask" | "review";
type Sub = { id: string; tier: Classification["tier"] };
type Done = { code: string | null; confirmed: boolean };

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

/**
 * The three steps (the phone's (app)/symptoms.tsx with features/symptoms/steps.tsx): 1 · tick what fits in one
 * body area, emergency signs in their own card; 2 · each chosen item's own follow-up questions and when it
 * started; 3 · what to do, with what the clinic will see. An emergency sign or answer opens Help in place the
 * moment it is chosen (local `classify`). The report is submitted once, when the patient picks a door; the
 * server's tier replaces the local one, and a failed submit keeps every choice on screen with its sentence.
 */
export function WrongSteps({
  draft,
  initialArea,
  showPregnancy,
  hospital,
  doctor,
}: {
  draft: boolean;
  initialArea: string | null;
  showPregnancy: boolean;
  hospital: { name: string | null; emergencyPhone: string | null } | null;
  /** Ask for a day with a doctor (Home): the day request goes back to them. Opaque ids. */
  doctor: Record<string, string>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [choice, setChoice] = useState<AudienceChoice>(DEFAULT_AUDIENCE);
  const [items, setItems] = useState<string[]>([]);
  const [qualifiers, setQualifiers] = useState<StepsSelection["qualifiers"]>({});
  const [area, setArea] = useState<string | null>(initialArea);
  const [note, setNote] = useState("");
  const [since, setSince] = useState<SymptomDuration | null>(null);
  const [classification, setClassification] = useState<Classification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noSlot, setNoSlot] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  // The server's answer, once it has one; the same-day key rides with it.
  const submissionRef = useRef<Sub | null>(null);
  const keyRef = useRef<string | null>(null);

  const audience = toAudience(choice);
  const selection: StepsSelection = { audience, pregnant: choice.pregnant, items, qualifiers };
  const visible = visibleItems(CATALOG, audience);
  const categories = visibleCategories(CATALOG, audience);
  const shownArea = categories.some((c) => c.key === area) ? (area as string) : categories[0]!.key;
  const chosen = visible.filter((i) => items.includes(i.key));
  const interrupt = interruptOf(selection, [], CATALOG);
  const hospitalName = hospital?.name ?? null;
  const shown = classification ?? classify(selection, CATALOG);
  const tier = shown.tier;
  const freeText = noteFor(note, since);

  /** A changed choice is a new report: the old id no longer describes it. */
  const changed = () => {
    submissionRef.current = null;
    keyRef.current = null;
    setClassification(null);
    setNoSlot(false);
  };

  const drop = (key: string) => {
    setItems((now) => now.filter((k) => k !== key));
    setQualifiers(({ [key]: _gone, ...rest }) => rest);
  };

  const toggle = (item: CatalogItem) => {
    changed();
    if (items.includes(item.key)) return drop(item.key);
    if (items.length >= MAX_SELECTED_ITEMS) return; // the report's cap; the server refuses more
    setItems([...items, item.key]);
  };

  const changeChoice = (next: AudienceChoice) => {
    changed();
    setChoice(next);
    // What the new audience cannot see is dropped, not carried silently.
    const still = new Set(visibleItems(CATALOG, toAudience(next)).map((i) => i.key));
    setItems(items.filter((k) => still.has(k)));
  };

  const answer = (itemKey: string, qualifierKey: string, optionKey: string) => {
    changed();
    setQualifiers({
      ...qualifiers,
      [itemKey]: { ...qualifiers[itemKey], [qualifierKey]: optionKey },
    });
  };

  const event = (e: "interrupt_shown" | "declined" | "call_tapped", itemKey: string) =>
    void emergencyEventAction({
      event: e,
      item_key: itemKey,
      ...(submissionRef.current ? { submission_id: submissionRef.current.id } : {}),
    }).catch(() => {});

  const helpPanel = interrupt ? (
    <HelpPanel
      itemKey={interrupt.key}
      itemLabel={say(CATALOG, interrupt.labelKey)}
      calm={interrupt.flags?.includes("crisis_route") ?? false}
      hospitalName={hospitalName}
      emergencyPhone={hospital?.emergencyPhone ?? null}
      onEvent={event}
      // S10: "This is not happening now" unticks it, and the panel closes.
      onNotNow={() => {
        changed();
        drop(interrupt.key);
      }}
    />
  ) : null;

  /** Submit once per selection; the server's tier replaces the local one. Null = failed, said. */
  const ensureSubmission = async (): Promise<Sub | null> => {
    if (submissionRef.current) return submissionRef.current;
    const res = await submitSymptomsAction({
      audience,
      items,
      qualifiers,
      free_text: freeText || null,
    }).catch(() => ({ ok: false as const, error: PATIENT_WEB_COPY.offline }));
    if (!res.ok) {
      setError(W.keptTryAgain(res.error));
      return null;
    }
    const s = res.submission;
    submissionRef.current = { id: s.submission_id, tier: s.tier };
    setClassification({
      ...shown,
      tier: s.tier,
      reasons: s.reasons,
      flags: s.flags,
      serviceLineHint: s.service_line_hint,
      catalogVersion: s.catalog_version,
    });
    return submissionRef.current;
  };

  const run = async (then: (sub: Sub) => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const sub = await ensureSubmission();
      if (sub) await then(sub);
    } finally {
      setBusy(false);
    }
  };

  const onSameDay = () =>
    run(async (sub) => {
      if (!hospital) return setError(W.chooseHospitalFirst);
      keyRef.current ??= crypto.randomUUID();
      const res = await requestSameDayAction({
        submissionId: sub.id,
        idempotencyKey: keyRef.current,
      }).catch(() => ({ ok: false as const, error: PATIENT_WEB_COPY.offline }));
      if (res.ok) {
        setDone({ code: res.receipt.booking_code, confirmed: res.receipt.status === "confirmed" });
        return;
      }
      if ("noSlot" in res && res.noSlot) {
        // `no_same_day_slot`: not an error, the cue to offer today's line (S11).
        setNoSlot(true);
        return;
      }
      setError(res.error);
    });

  /** Today's line or a day: the report's opaque id rides there (W4). */
  const door = (to: "today" | "day") =>
    run((sub) => {
      const params = new URLSearchParams({
        r: toSlot(PATIENT_REASON_CODES, "new_concern"),
        s: sub.id,
        ...(to === "day" ? doctor : {}),
      });
      router.push(`/patient/book/${to}?${params}`);
    });

  if (done) {
    return (
      <>
        <PageHeader title={W.placeToday} />
        <Card className="flex max-w-2xl flex-col items-start gap-3">
          <h2 className="text-[22px] leading-[27px] font-semibold">
            {done.confirmed ? W.timeYours : W.timeAsked}
          </h2>
          {done.code ? (
            <div className="flex flex-col gap-1">
              <p className="text-pw-ink-2 text-[13px] font-semibold">{W.bookingCode}</p>
              <p
                className="font-pw-mono text-[30px] font-semibold tracking-[0.12em]"
                aria-label={`${W.bookingCode} ${done.code.split("").join(" ")}`}
              >
                {done.code}
              </p>
              <p className="text-pw-ink-2 text-[15px]">{W.showAtDesk}</p>
            </div>
          ) : null}
          <p className="text-pw-ink-2 text-[15px]">{hospitalName ?? W.yourHospital}</p>
          <p className="text-pw-ink-2 text-[15px]">{W.answerInVisits}</p>
          <ButtonLink href="/patient">{W.done}</ButtonLink>
        </Card>
      </>
    );
  }

  const canGo = step === "pick" ? chosen.length > 0 || note.trim() !== "" : since !== null;
  const because = chosen
    .filter((i) => shown.reasons.includes(i.key))
    .map((i) => say(CATALOG, i.labelKey));
  const told = [
    ...chosen.map((i) => say(CATALOG, i.labelKey)),
    ...(note.trim() ? [W.inYourWords(note.trim())] : []),
    ...(since
      ? [
          W.started(
            symptomDurationLabel(since)
              .replace(/^Started /, "")
              .toLowerCase(),
          ),
        ]
      : []),
  ];
  const watermark = draft ? <Note>{PATIENT_WEB_COPY.unsignedCatalogue}</Note> : null;
  const at = step === "pick" ? 0 : step === "ask" ? 1 : 2;
  const n = step === "pick" ? 1 : step === "ask" ? 2 : 3;
  const words = W.stepWords[at];
  const head = <StepHead n={n} words={words} text={W.step(n, words)} />;
  const second = (label: string, onClick: () => void) => (
    <Button tone="outline" size="m" busy={busy} onClick={onClick}>
      {label}
    </Button>
  );
  const backStep =
    step === "pick" ? null : (
      <Button tone="outline" size="m" onClick={() => setStep(step === "review" ? "ask" : "pick")}>
        {C.back}
      </Button>
    );

  return (
    <>
      <PageHeader
        back={{ href: "/patient/book", label: C.back }}
        overline={W.overline}
        area="visits"
        title={W.title}
      />
      <div className="flex max-w-2xl flex-col gap-5">
        {step === "pick" ? (
          <>
            {head}
            {watermark}
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[26px] leading-[30px] font-semibold tracking-[-0.02em]">
                {W.fitsTitle}
              </h2>
              <p className="text-pw-ink-2 text-[17px] leading-[25px]">{W.fitsLine}</p>
            </div>
            <Who choice={choice} onChoice={changeChoice} showPregnancy={showPregnancy} />
            <ChipRow label={W.areaLabel}>
              {categories.map((c) => (
                <Chip key={c.key} selected={c.key === shownArea} onClick={() => setArea(c.key)}>
                  {say(CATALOG, c.labelKey)}
                </Chip>
              ))}
            </ChipRow>
            <PickArea
              items={visible.filter((i) => i.category === shownArea)}
              selected={items}
              full={items.length >= MAX_SELECTED_ITEMS}
              onToggle={toggle}
              helpPanel={helpPanel}
            />
            <TextArea
              label={W.noteLabel}
              hint={W.noteOptional}
              value={note}
              maxLength={MAX_FREE_TEXT}
              placeholder={W.notePlaceholder}
              onChange={(e) => {
                changed();
                setNote(e.target.value);
              }}
            />
          </>
        ) : step === "ask" ? (
          <>
            {helpPanel}
            {head}
            <h2 className="text-[26px] leading-[30px] font-semibold tracking-[-0.02em]">
              {W.quickTitle}
            </h2>
            {followUps(chosen).map(({ item, q }) => (
              <Question
                key={item.key + q.key}
                about={say(CATALOG, item.labelKey)}
                prompt={say(CATALOG, q.promptKey)}
                options={q.options.map((o) => ({ key: o.key, label: say(CATALOG, o.labelKey) }))}
                value={qualifiers[item.key]?.[q.key] ?? null}
                onPick={(o) => answer(item.key, q.key, o)}
              />
            ))}
            <Question
              about={W.forAll}
              prompt={W.whenStarted}
              options={SYMPTOM_DURATIONS.map((d) => ({ key: d.code, label: d.label }))}
              value={since}
              onPick={(o) => {
                changed();
                setSince(o as SymptomDuration);
              }}
            />
          </>
        ) : (
          <>
            {head}
            {watermark}
            {tier === "E" ? (
              <DangerResult tag={say(CATALOG, TIER_LABEL_KEY.E)} because={because} />
            ) : (
              <ResultCard
                tier={tier}
                lede={
                  tier === "R" && shown.serviceLineHint
                    ? W.startWith(W.serviceLine[shown.serviceLineHint])
                    : tier === "U"
                      ? W.earliestToday(hospitalName ?? W.yourHospital)
                      : null
                }
              />
            )}
            <Card className="flex flex-col gap-2.5 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[17px] leading-[22px] font-semibold">{W.toldTitle}</h2>
                <Button tone="outline" size="s" onClick={() => setStep("pick")}>
                  {W.change}
                </Button>
              </div>
              <ul className="flex flex-col gap-2">
                {told.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[17px] leading-6">
                    <CheckIcon
                      className="text-pw-ink-2 mt-1 size-4 shrink-0"
                      strokeWidth={3}
                      aria-hidden
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
            {error ? <Note>{error}</Note> : null}
            <p className="text-pw-ink-3 text-[13px] leading-[18px]">
              {say(CATALOG, "catalog.note")}
            </p>
          </>
        )}

        <div className="flex flex-col gap-2">
          {step === "review" ? (
            tier === "E" ? (
              <>
                <GetHelpLink />
                {second(W.bookInstead, () => void door("day"))}
              </>
            ) : tier === "U" ? (
              <>
                {noSlot ? (
                  <Button busy={busy} onClick={() => void door("today")}>
                    {W.joinTodaysLine}
                  </Button>
                ) : (
                  <Button busy={busy} onClick={() => void onSameDay()}>
                    {W.comeToday}
                  </Button>
                )}
                {second(W.askDayInstead, () => void door("day"))}
              </>
            ) : (
              <>
                <Button busy={busy} onClick={() => void door("day")}>
                  {W.askDay}
                </Button>
                {second(W.comeTodayInstead, () => void door("today"))}
              </>
            )
          ) : (
            <>
              {step === "pick" ? (
                <p aria-live="polite" className="text-pw-ink-2 text-[15px] font-semibold">
                  {chosen.length
                    ? W.chosen(
                        chosen.length,
                        chosen.some((i) => i.category !== shownArea),
                      )
                    : W.tapWhatFits}
                </p>
              ) : null}
              <Button
                disabledReason={canGo ? undefined : step === "pick" ? W.tapWhatFits : W.whenStarted}
                onClick={() => {
                  if (step === "pick") return setStep("ask");
                  setClassification(classify(selection, CATALOG));
                  setStep("review");
                }}
              >
                {step === "pick" ? W.continue : W.seeWhatToDo}
              </Button>
            </>
          )}
          {backStep}
        </div>
      </div>
    </>
  );
}

/** Who it is for (PRD §6.1): me, a child (with its age band), or someone else; Pregnant when it applies. */
function Who({
  choice,
  onChoice,
  showPregnancy,
}: {
  choice: AudienceChoice;
  onChoice: (next: AudienceChoice) => void;
  showPregnancy: boolean;
}) {
  const pregnancyApplies = choice.who === "other" || (choice.who === "me" && showPregnancy);
  return (
    <div className="flex flex-col gap-2">
      <ChipRow label={W.whoLabel}>
        {(
          [
            ["me", W.whoMe],
            ["child", W.whoChild],
            ["other", W.whoOther],
          ] as const
        ).map(([who, label]) => (
          <Chip
            key={who}
            selected={choice.who === who}
            onClick={() => onChoice({ ...choice, who })}
          >
            {label}
          </Chip>
        ))}
        {pregnancyApplies ? (
          <Chip
            selected={choice.pregnant}
            onClick={() => onChoice({ ...choice, pregnant: !choice.pregnant })}
          >
            {say(CATALOG, "audience.pregnant")}
          </Chip>
        ) : null}
      </ChipRow>
      {choice.who === "child" ? (
        <ChipRow label={W.whoChild}>
          {CHILD_BANDS.map((band) => (
            <Chip
              key={band}
              selected={choice.band === band}
              onClick={() => onChoice({ ...choice, band })}
            >
              {say(CATALOG, `audience.${band}`)}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
    </div>
  );
}

/** One area: its emergency signs in their own card, then the other signs as 64 px rows. */
function PickArea({
  items,
  selected,
  full,
  onToggle,
  helpPanel,
}: {
  items: CatalogItem[];
  selected: string[];
  full: boolean;
  onToggle: (item: CatalogItem) => void;
  helpPanel: ReactNode;
}) {
  const signs = items.filter((i) => i.tier === "E");
  const rest = items.filter((i) => i.tier !== "E");
  return (
    <>
      {signs.length ? (
        <DangerSigns
          signs={signs.map((i) => ({ key: i.key, label: say(CATALOG, i.labelKey) }))}
          selected={selected}
          onToggle={(key) => onToggle(signs.find((i) => i.key === key)!)}
        >
          {helpPanel}
        </DangerSigns>
      ) : (
        // An emergency from another area still shows its panel here.
        helpPanel
      )}
      {rest.length ? (
        <Card className="overflow-hidden p-0">
          <div className="divide-pw-line divide-y">
            {rest.map((item) => {
              const on = selected.includes(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={!on && full ? true : undefined}
                  onClick={() => onToggle(item)}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left focus-visible:-outline-offset-2",
                    FOCUS,
                    on ? "bg-pw-accent-tint" : "bg-pw-surface hover:bg-pw-surface-2",
                    !on && full && "opacity-60",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg",
                      on
                        ? "bg-pw-act text-pw-on-act"
                        : "ring-pw-line-strong bg-pw-surface ring-2 ring-inset",
                    )}
                  >
                    {on ? <CheckIcon className="size-[15px]" strokeWidth={3.2} /> : null}
                  </span>
                  <span className="flex-1 text-[17px] leading-[22px] font-semibold">
                    {say(CATALOG, item.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}
    </>
  );
}

function Question({
  about,
  prompt,
  options,
  value,
  onPick,
}: {
  about: string;
  prompt: string;
  options: { key: string; label: string }[];
  value: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-pw-ink-3 text-[13px] font-semibold">{about}</p>
      <p className="text-[19px] leading-6 font-semibold">{prompt}</p>
      <ChipRow label={prompt}>
        {options.map((o) => (
          <Chip key={o.key} selected={value === o.key} onClick={() => onPick(o.key)}>
            {o.label}
          </Chip>
        ))}
      </ChipRow>
    </Card>
  );
}

/** Step 3's words for Urgent and Routine; the tag is the catalogue's own tier word (W2). */
function ResultCard({ tier, lede }: { tier: "U" | "R"; lede: string | null }) {
  const [title, line] = tier === "U" ? W.resultU : W.resultR;
  return (
    <section className="rounded-pw-card bg-pw-surface ring-pw-accent flex flex-col gap-2.5 p-5 ring-2 ring-inset">
      <p className="text-pw-ink-2 text-xs font-semibold tracking-[0.06em] uppercase">
        {say(CATALOG, TIER_LABEL_KEY[tier])}
      </p>
      <h2 className="text-[26px] leading-[30px] font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="text-pw-ink-2 text-[17px] leading-[25px]">{line}</p>
      {lede ? <p className="text-[15px] font-semibold">{lede}</p> : null}
    </section>
  );
}
