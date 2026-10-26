"use client";

import type { SignupDraft, Step } from "@patient-core/getting-in-signup";
import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import {
  buildSubmission,
  checkDob,
  formatUgPhone,
  initialDraft,
  isEmail,
  MINOR_NOTE,
  NAME_MAX,
  passwordStrength,
  phoneProblem,
  SEX_OPTIONS,
  STEP_NAMES,
  stepOfField,
  stepValid,
  typeDob,
  VILLAGE_MAX,
} from "@patient-core/getting-in-signup";
import { CheckIcon, ChevronLeftIcon, MapPinIcon, XIcon } from "lucide-react";

import { Chip, ChipRow, TextField } from "@/components/tide/controls";
import { Button, Card, ICON, IconDisc, Note, Pill } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { GETTING_IN_COPY as G } from "@/content/patient/getting-in";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import { cn } from "@/lib/utils";

/** The route's GET and POST, as the phone's data/signup.ts reads them. */
const URL_ = "/api/mobile/patient-signup";

interface SignupNotice {
  open: boolean;
  notice: { version: string; sha: string; body: string; effective: string } | null;
  summary: string[];
  agree: string;
  sms: {
    version: string;
    sha: string;
    body: string;
    label: string;
    declined: string;
    receipt: string;
  } | null;
}
interface PlaceOption {
  code: string;
  label: string;
  path: string;
}
type SignupResult =
  | { ok: true; next: string }
  | { ok: false; fieldErrors?: Record<string, string>; formError?: string };

type Patch = (next: Partial<SignupDraft>) => void;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

/**
 * The draft lives in memory only, never in browser storage. Consent binds to the notice on screen: its
 * version and hash ride with the answer. One idempotency key per draft, so a retried submit lands once.
 * The account's session cookie comes back with the POST (the web action signs up with the cookie client),
 * so "Continue" opens "A few more details" once; without a session the proxy sends the patient to sign in.
 */
export function SignupFlow({ phoneCodeOn }: { phoneCodeOn: boolean }) {
  const [step, setStep] = useState<Step | "done">(1);
  const [draft, setDraft] = useState<SignupDraft>(initialDraft);
  const [key] = useState(() => crypto.randomUUID());
  const [notice, setNotice] = useState<SignupNotice | null>(null);
  const [noticeTry, setNoticeTry] = useState(0);
  const [noticeLoading, setNoticeLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const now = new Date();

  const patch = useCallback<Patch>((next) => setDraft((d) => ({ ...d, ...next })), []);

  useEffect(() => {
    let live = true;
    fetch(URL_)
      .then((r) => (r.ok ? (r.json() as Promise<SignupNotice>) : null))
      .catch(() => null)
      .then((n) => {
        if (!live) return;
        setNotice(n);
        setNoticeLoading(false);
      });
    return () => {
      live = false;
    };
  }, [noticeTry]);

  const onDob = (part: "dobDay" | "dobMonth" | "dobYear", raw: string) =>
    setDraft((d) => typeDob(d, part, raw, new Date()).draft);

  const submit = async () => {
    const live = notice?.notice;
    if (!notice || !live) return;
    setBusy(true);
    let result: SignupResult;
    try {
      const res = await fetch(URL_, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: buildSubmission(draft, live, notice.sms), key }),
      });
      result = (await res.json()) as SignupResult;
    } catch {
      result = { ok: false, formError: W.offline };
    }
    setBusy(false);
    if (result.ok) {
      setStep("done");
      return;
    }
    const first = Object.entries(result.fieldErrors ?? {})[0];
    if (first) {
      setStep(stepOfField(first[0]));
      setProblem(first[1] === "under_18" ? G.under18 : first[1]);
      return;
    }
    setProblem(result.formError ?? G.failed);
  };

  if (step === "done")
    return (
      <Frame>
        <DoneStep firstName={draft.firstName.trim() || "[First name]"} />
        <Button
          className="self-start"
          busy={busy}
          onClick={() => {
            setBusy(true);
            window.location.assign("/patient/me/profile");
          }}
        >
          {G.continue}
        </Button>
      </Frame>
    );

  const valid = stepValid(step, draft, now);
  const next = () => {
    setProblem(null);
    if (step === 4) void submit();
    else setStep((step + 1) as Step);
  };
  const consentReady = Boolean(notice?.notice && notice.open);

  return (
    <Frame>
      <div className="flex items-center">
        {step === 1 ? (
          <Link href="/" className={cn(BACK, FOCUS)}>
            <XIcon className="size-5" {...ICON} />
            {G.cancel}
          </Link>
        ) : (
          <button
            type="button"
            className={cn(BACK, FOCUS)}
            onClick={() => {
              setProblem(null);
              setStep((step - 1) as Step);
            }}
          >
            <ChevronLeftIcon className="size-5" {...ICON} />
            {G.back}
          </button>
        )}
      </div>
      <StepProgress step={step} />
      {step === 1 ? <AboutStep draft={draft} patch={patch} today={now} onDob={onDob} /> : null}
      {step === 2 ? <PlaceStep draft={draft} patch={patch} /> : null}
      {step === 3 ? <SignInStep draft={draft} patch={patch} phoneCodeOn={phoneCodeOn} /> : null}
      {step === 4 ? (
        <ConsentStep
          draft={draft}
          patch={patch}
          notice={notice}
          loading={noticeLoading}
          onRetry={() => {
            setNoticeLoading(true);
            setNoticeTry((n) => n + 1);
          }}
        />
      ) : null}
      {problem ? (
        <div role="alert">
          <Note>{problem}</Note>
        </div>
      ) : null}
      {step === 4 && !consentReady ? null : (
        <Button
          className="self-start"
          onClick={next}
          busy={busy}
          disabledReason={valid ? undefined : G.notYet[step]}
        >
          {step === 4 ? G.create : G.continue}
        </Button>
      )}
    </Frame>
  );
}

const BACK =
  "text-pw-accent-text -ml-1 inline-flex min-h-12 items-center gap-1 text-[15px] font-semibold";

function Frame({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-xl flex-col gap-6">{children}</main>;
}

/** "Step 2 of 4 · Where you live" over four segments: done lagoon, current ink. */
function StepProgress({ step }: { step: Step }) {
  return (
    <div
      className="flex flex-col gap-2"
      role="group"
      aria-label={`${G.stepOf(step)}, ${STEP_NAMES[step]}`}
    >
      <div aria-hidden className="text-pw-ink-3 flex justify-between text-[13px] font-semibold">
        <span>{G.stepOf(step)}</span>
        <span>{STEP_NAMES[step]}</span>
      </div>
      <div aria-hidden className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < step ? "bg-pw-accent-pressed" : i === step ? "bg-pw-ink" : "bg-pw-line",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Step 1 · About you ─────────────────────────────────────────────── */

function AboutStep({
  draft,
  patch,
  today,
  onDob,
}: {
  draft: SignupDraft;
  patch: Patch;
  today: Date;
  onDob: (part: "dobDay" | "dobMonth" | "dobYear", raw: string) => void;
}) {
  const dob = checkDob(draft.dobDay, draft.dobMonth, draft.dobYear, today);
  const phoneId = useId();
  const phoneErr = phoneProblem(draft.phone);
  return (
    <>
      <PageHeader title={G.about.title} subtitle={G.about.sub} />
      <div className="flex flex-col gap-5">
        <TextField
          label={G.firstName}
          value={draft.firstName}
          onChange={(e) => patch({ firstName: e.target.value })}
          placeholder={G.firstNameEg}
          autoComplete="given-name"
          maxLength={NAME_MAX}
        />
        <TextField
          label={G.surname}
          value={draft.surname}
          onChange={(e) => patch({ surname: e.target.value })}
          placeholder={G.surnameEg}
          autoComplete="family-name"
          maxLength={NAME_MAX}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-base leading-5 font-semibold">{G.sex}</span>
          <ChipRow label={G.sex}>
            {SEX_OPTIONS.map((o) => (
              <Chip
                key={o.key}
                selected={draft.sex === o.key}
                onClick={() => patch({ sex: o.key })}
              >
                {o.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-base leading-5 font-semibold">{G.dob}</legend>
          <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-2">
            {(["dobDay", "dobMonth", "dobYear"] as const).map((part) => (
              <TextField
                key={part}
                label={G.dobParts[part][0]}
                value={draft[part]}
                onChange={(e) => onDob(part, e.target.value)}
                placeholder={G.dobParts[part][1]}
                inputMode="numeric"
                maxLength={part === "dobYear" ? 4 : 2}
                className="[&_input]:text-center"
              />
            ))}
          </div>
          {!dob.ok && dob.message ? (
            <p role="alert" className="text-pw-ink text-[13px] leading-[18px] font-semibold">
              {dob.message}
            </p>
          ) : null}
          {draft.refusedMinor ? (
            <Note tone="info">
              {`${G.under18} `}
              {MINOR_NOTE}
            </Note>
          ) : null}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={phoneId} className="text-base leading-5 font-semibold">
            {G.phone}
          </label>
          <div
            className={cn(
              "rounded-pw-field bg-pw-surface ring-pw-line-strong focus-within:ring-pw-focus flex h-[52px] items-center ring-[1.5px] ring-inset focus-within:ring-2",
              phoneErr && "ring-pw-ink ring-2",
            )}
          >
            <span aria-hidden className="text-pw-ink-2 pl-4 text-[17px] font-semibold">
              +256
            </span>
            <input
              id={phoneId}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={draft.phone}
              onChange={(e) => patch({ phone: formatUgPhone(e.target.value) })}
              placeholder="772 123 456"
              aria-invalid={phoneErr ? true : undefined}
              aria-describedby={phoneErr ? `${phoneId}-e` : undefined}
              className="text-pw-ink placeholder:text-pw-ink-4 h-full min-w-0 flex-1 bg-transparent px-2 text-[17px] tabular-nums focus:outline-none"
            />
          </div>
          {phoneErr ? (
            <p
              id={`${phoneId}-e`}
              role="alert"
              className="text-pw-ink text-[13px] leading-[18px] font-semibold"
            >
              {phoneErr}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ─── Step 2 · Where you live ────────────────────────────────────────── */

/** The web's UBOS place search through the route's `?q=`, a moment after typing stops. No map on the web. */
function PlaceStep({ draft, patch }: { draft: SignupDraft; patch: Patch }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; places: PlaceOption[] } | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const id = setTimeout(() => {
      fetch(`${URL_}?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ places: PlaceOption[] }>) : { places: [] }))
        .catch(() => ({ places: [] }))
        .then(({ places }) => {
          if (live) setFound({ q, places });
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q]);

  const results = found && found.q === q && q.trim().length >= 2 ? found.places : null;

  return (
    <>
      <PageHeader title={G.where.title} subtitle={G.where.sub} />
      <div className="flex flex-col gap-5">
        {draft.place ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-base leading-5 font-semibold">{G.placeLabel}</span>
            <div className="rounded-pw-field bg-pw-surface ring-pw-accent-pressed flex min-h-[54px] items-center gap-2 pr-2 pl-3.5 ring-2 ring-inset">
              <MapPinIcon className="size-[18px] shrink-0" {...ICON} />
              <span className="flex-1 font-semibold">{draft.place.label}</span>
              <button
                type="button"
                onClick={() => patch({ place: null })}
                aria-label={G.placeChangeLabel}
                className={cn(
                  "text-pw-accent-text min-h-12 px-2.5 text-[15px] font-semibold",
                  FOCUS,
                )}
              >
                {G.placeChange}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <TextField
              label={G.placeLabel}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={G.placeSearch}
              type="search"
              autoComplete="off"
            />
            {results === null ? (
              <p className="text-pw-ink-3 text-[15px]">{G.placeType}</p>
            ) : results.length === 0 ? (
              <p className="text-pw-ink-3 text-[15px]">{G.placeNone}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="text-pw-ink-3 text-[15px]">{G.placePick}</p>
                {results.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => {
                      patch({ place: { code: p.code, label: p.label } });
                      setQ("");
                    }}
                    className={cn(
                      "rounded-pw-row bg-pw-surface shadow-pw-card hover:bg-pw-surface-2 flex min-h-12 items-center gap-2 px-3 py-2 text-left",
                      FOCUS,
                    )}
                  >
                    <MapPinIcon className="text-pw-ink-2 size-4 shrink-0" {...ICON} />
                    <span className="flex flex-col">
                      <span className="text-[15px] font-semibold">{p.label}</span>
                      <span className="text-pw-ink-3 text-[13px]">{p.path}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <TextField
          label={`${G.village} (${G.optional})`}
          value={draft.village}
          onChange={(e) => patch({ village: e.target.value })}
          placeholder={G.villageEg}
          maxLength={VILLAGE_MAX}
          autoComplete="street-address"
        />
      </div>
    </>
  );
}

/* ─── Step 3 · Your sign-in ──────────────────────────────────────────── */

const BAR = ["bg-pw-line", "bg-pw-ink-4", "bg-pw-ink-3", "bg-pw-accent", "bg-pw-accent-pressed"];

function SignInStep({
  draft,
  patch,
  phoneCodeOn,
}: {
  draft: SignupDraft;
  patch: Patch;
  phoneCodeOn: boolean;
}) {
  const [show, setShow] = useState(false);
  const strength = passwordStrength(draft.password);
  const hintId = useId();
  return (
    <>
      <PageHeader
        title={G.signIn.title}
        subtitle={phoneCodeOn ? G.signIn.sub : G.signInSubNoCode}
      />
      <div className="flex flex-col gap-5">
        <TextField
          label={G.email}
          type="email"
          value={draft.email}
          onChange={(e) => patch({ email: e.target.value })}
          error={draft.email && !isEmail(draft.email) ? G.emailBad : undefined}
          placeholder="name@example.com"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={120}
        />
        <div className="flex flex-col gap-2">
          <TextField
            label={G.password}
            type={show ? "text" : "password"}
            value={draft.password}
            onChange={(e) => patch({ password: e.target.value })}
            placeholder={G.passwordEg}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={hintId}
          />
          <div aria-hidden className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i <= strength.score ? BAR[strength.score] : "bg-pw-line",
                )}
              />
            ))}
          </div>
          {/* The words carry the strength; the bar only repeats them (never colour alone). */}
          <p
            id={hintId}
            aria-live="polite"
            className="text-pw-ink-2 text-[13px] leading-[18px] font-medium"
          >
            {strength.hint}
          </p>
          <Button tone="soft" size="s" className="self-start" onClick={() => setShow((s) => !s)}>
            {show ? G.hidePassword : G.showPassword}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ─── Step 4 · Consent ───────────────────────────────────────────────── */

function ConsentStep({
  draft,
  patch,
  notice,
  loading,
  onRetry,
}: {
  draft: SignupDraft;
  patch: Patch;
  notice: SignupNotice | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const [full, setFull] = useState(false);
  const live = notice?.notice ?? null;
  return (
    <>
      <PageHeader title={G.consent.title} subtitle={G.consent.sub} />
      {loading ? (
        <Note>{G.noticeLoading}</Note>
      ) : !notice || !live ? (
        <div className="flex flex-col items-start gap-2">
          <Note>{G.noticeFailed}</Note>
          <Button tone="outline" size="m" onClick={onRetry}>
            {G.tryAgain}
          </Button>
        </div>
      ) : !notice.open ? (
        <Note>{G.notOpen}</Note>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold">{G.noticeHead}</h2>
              <Pill>{G.noticeTag(live.version)}</Pill>
            </div>
            {notice.summary.map((line) => (
              <p key={line} className="text-pw-ink-2 text-[15px] leading-[21px]">
                {line}
              </p>
            ))}
            {full ? (
              <p className="text-pw-ink-2 text-[15px] leading-[21px] whitespace-pre-line">
                {live.body}
              </p>
            ) : null}
            <button
              type="button"
              aria-expanded={full}
              onClick={() => setFull((f) => !f)}
              className={cn(
                "text-pw-accent-text min-h-12 self-start text-left font-semibold underline-offset-4 hover:underline",
                FOCUS,
              )}
            >
              {full ? G.noticeHide : G.noticeShow(live.version, live.effective)}
            </button>
          </Card>
          <CheckRow
            checked={draft.consent}
            onToggle={(v) => patch({ consent: v })}
            title={notice.agree}
            sub={G.required}
          />
          {notice.sms ? (
            <CheckRow
              checked={draft.sms}
              onToggle={(v) => patch({ sms: v })}
              title={notice.sms.label}
              sub={`${notice.sms.body} ${notice.sms.declined} ${notice.sms.receipt}`}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

/** A tick box as a whole card: the hit area is the sentence, not the square. */
function CheckRow({
  checked,
  onToggle,
  title,
  sub,
}: {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  title: string;
  sub?: string;
}) {
  return (
    <label
      className={cn(
        "rounded-pw-row bg-pw-surface flex cursor-pointer items-start gap-3 p-3.5 ring-2 ring-inset",
        checked ? "ring-pw-accent-pressed" : "ring-pw-line",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className={cn("accent-pw-accent-pressed mt-0.5 size-6 shrink-0", FOCUS)}
      />
      <span className="flex flex-col gap-1">
        <span className="text-[15px] leading-[19px] font-semibold">{title}</span>
        {sub ? <span className="text-pw-ink-2 text-[13px] leading-[18px]">{sub}</span> : null}
      </span>
    </label>
  );
}

/* ─── Done ───────────────────────────────────────────────────────────── */

function DoneStep({ firstName }: { firstName: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <IconDisc tone="accent" className="size-[84px]">
          <CheckIcon className="size-10" {...ICON} />
        </IconDisc>
        <PageHeader title={G.welcome(firstName)} subtitle={G.ready} />
      </div>
      <Card className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold">{G.nextDetails}</h2>
        <p className="text-pw-ink-2 text-[15px]">{G.nextDetailsSub}</p>
        <div className="flex flex-wrap gap-1.5">
          {G.later.map((w) => (
            <Pill key={w}>{w}</Pill>
          ))}
        </div>
      </Card>
    </div>
  );
}
