import type { ViewLine } from "@/lib/pharmacy/prescription-view";
import type { PatientFacts } from "@/lib/pharmacy/read";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClockIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import {
  COSIGN_CAUTION,
  NOT_CONTINUED_CAUTION,
  OVERRIDE_CAUTION,
  PHARMACY,
} from "@/content/pharmacy";
import { identitiesFor } from "@/lib/emr/read/results";
import { buildPrescriptionView } from "@/lib/pharmacy/prescription-view";
import { getPrescription, logPrescriptionViewed, patientFacts } from "@/lib/pharmacy/read";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { PharmacyNotice } from "../../_components/pharmacy-notice";

export const dynamic = "force-dynamic";

/**
 * One prescription, read-only (§5.4; canvas 0.2). Exactly the signed read list (D-PH0-05); every
 * stored text field shown character for character (Law 5); only stored check answers (Law 6).
 * Opening it writes one view-log row (RV-6). Nothing on this page changes anything: the only link
 * goes back to the queue.
 */
const V = PHARMACY.view;
const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});
const day = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});
const dayOf = (d: Date | string) => day.format(new Date(d));

export default async function PharmacyPrescriptionPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const scope = await requirePharmacyScope();
  const key = decodeURIComponent((await params).key);
  const rx = await getPrescription(scope.hospitalId, key);
  if (!rx) notFound();
  const now = new Date();
  const [ids, facts] = await Promise.all([
    identitiesFor(scope, [rx.patientUserId], "pharmacy_prescription"),
    patientFacts(rx.patientUserId, now),
    logPrescriptionViewed(scope.userId, scope.hospitalId, key),
  ]);
  const who = ids.get(rx.patientUserId) ?? { name: "Name withheld", mrn: "", ageSex: "" };
  const view = buildPrescriptionView({
    lines: rx.lines,
    encounter: rx.encounter,
    prescriberCadre: rx.prescriberCadre,
  });
  const answered = view.lines.flatMap((l) => l.checks.map((c) => ({ line: l, check: c })));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${PHARMACY.place}`}
        placeInTopBar
        title={V.title}
        subline={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusWord tone="neutral">{PHARMACY.lane[view.lane]}</StatusWord>
            {view.from ? <StatusWord tone="neutral">{view.from}</StatusWord> : null}
            <StateWord state={view.state} />
            {rx.groupedByTime ? (
              <span className="text-muted-foreground text-caption">
                {PHARMACY.queue.groupedByTime}
              </span>
            ) : null}
          </span>
        }
      />

      <IdentityStrip name={who.name} mrn={who.mrn} ageSex={who.ageSex} facts={facts} />

      <PharmacyNotice hospitalId={scope.hospitalId} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-4">
          {view.cosign.kind === "awaiting" ? <CautionNotice lead={COSIGN_CAUTION.text} /> : null}
          <div className="border-border bg-card rounded-lg border">
            <div className="border-border flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-heading-s font-medium">{V.medicines(view.lines.length)}</h2>
              <span className="text-body-s text-muted-foreground">
                {V.written}{" "}
                <span className="font-mono tabular-nums">
                  {dayOf(view.writtenAt)} · {time.format(view.writtenAt)}
                </span>
              </span>
            </div>
            <ol className="divide-border flex flex-col divide-y">
              {view.lines.map((l) => (
                <Line key={l.id} line={l} />
              ))}
            </ol>
          </div>
          <p className="text-body-s text-muted-foreground">{V.footer}</p>
          <Link
            href="/pharmacy"
            className="text-body-s self-start font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            {V.back}
          </Link>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card title={V.prescriber}>
            <dl className="text-body-s grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">{V.writtenBy}</dt>
              <dd>
                {[view.prescriberCadre, view.from].filter(Boolean).join(", ") || V.notRecorded}
              </dd>
              <dt className="text-muted-foreground">{V.cosignature}</dt>
              <dd>
                {view.cosign.kind === "none"
                  ? V.cosignNone
                  : view.cosign.kind === "awaiting"
                    ? V.cosignAwaiting
                    : `${V.cosignSigned(view.cosign.cadre)}${view.cosign.at ? ` · ${time.format(view.cosign.at)}` : ""}`}
              </dd>
              <dt className="text-muted-foreground">{V.printed}</dt>
              <dd>{V.printedNotRecorded}</dd>
            </dl>
          </Card>
          <Card title={V.checked}>
            {answered.length ? (
              <ul className="text-body-s flex flex-col gap-2">
                {answered.map(({ line, check }) => (
                  <li key={`${line.id}-${check.code}`} className="flex items-start gap-2">
                    <StatusWord tone={check.level === "stop" ? "caution" : "neutral"}>
                      {V.level[check.level]}
                    </StatusWord>
                    <span>
                      {check.title}, {line.input.drugName}.
                      <span className="text-muted-foreground block">
                        {check.answer ? `${V.answered}: "${check.answer}".` : V.answered}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-s text-muted-foreground">{V.checkedNone}</p>
            )}
          </Card>
          <Card title={V.notCheckedTitle}>
            {PHARMACY.notChecked.split(" · ").map((t) => (
              <p key={t} className="text-body-s">
                {t}
              </p>
            ))}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StateWord({ state }: { state: ViewLine["state"] }) {
  if (state === "prescribed")
    return <StatusWord tone="neutral">{PHARMACY.rowState[state]}</StatusWord>;
  return (
    <StatusWord tone="caution" glyph={state === "awaiting_cosign" ? ClockIcon : undefined}>
      {PHARMACY.rowState[state]}
    </StatusWord>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-border bg-card rounded-lg border">
      <h2 className="border-border text-heading-s border-b px-4 py-3 font-medium">{title}</h2>
      <div className="flex flex-col gap-2 px-4 py-3">{children}</div>
    </div>
  );
}

function IdentityStrip({
  name,
  mrn,
  ageSex,
  facts,
}: {
  name: string;
  mrn: string;
  ageSex: string;
  facts: PatientFacts;
}) {
  const a = facts.allergies;
  const allergies =
    a.kind === "listed"
      ? a.items.map((i) => `${i.substance} (${dayOf(i.at)})`).join(", ")
      : a.kind === "none_known"
        ? `${V.noneKnown} (${dayOf(a.at)})`
        : a.kind === "unable"
          ? `${V.unable} (${dayOf(a.at)})`
          : V.notRecorded;
  return (
    <div className="border-border bg-card text-body-s flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border px-4 py-3">
      <span className="text-foreground font-medium">{name}</span>
      <span className="font-mono tabular-nums">{mrn}</span>
      <span className="text-muted-foreground">{ageSex}</span>
      <span className="flex-1" />
      <Fact label={V.weight}>
        {facts.weight ? (
          <>
            <span className="font-mono tabular-nums">{facts.weight.kg}</span> kg ·{" "}
            {dayOf(facts.weight.at)}
          </>
        ) : (
          V.notRecorded
        )}
      </Fact>
      <Fact label={V.creatinine}>
        {facts.creatinine ? (
          <>
            <span className="font-mono tabular-nums">{facts.creatinine.value}</span>{" "}
            {facts.creatinine.unit} · {dayOf(facts.creatinine.at)}
          </>
        ) : (
          V.notRecorded
        )}
      </Fact>
      <Fact label={V.allergies}>{allergies}</Fact>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-muted-foreground text-caption">{label}</span>
      <span>{children}</span>
    </span>
  );
}

/** One line, as written (Law 5): each stored field exactly as stored, never joined into new words. */
function Line({ line }: { line: ViewLine }) {
  const r = line.input;
  const struck = line.state === "cancelled";
  const fields: [string, string | null][] = [
    [V.directions, [r.dose, r.route, r.frequency].filter(Boolean).join(" · ")],
    [V.method, [r.method, r.infusionOver, r.diluent].filter(Boolean).join(" · ") || null],
    [V.duration, r.duration],
    [V.quantity, r.quantity],
    [V.prn, r.prn ? V.yes : null],
    [V.purpose, r.fluidPurpose],
    [V.volume, r.volumeMl],
    [V.over, r.overMinutes === null ? null : String(r.overMinutes)],
    [V.instructions, r.instructions],
  ];
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {struck ? <span className="sr-only">{V.cancelledSr}</span> : null}
        <span className={struck ? "line-through" : undefined}>
          <span className="text-foreground font-medium">{r.drugName}</span>
          {r.concentration ? (
            <span className="text-muted-foreground"> · {r.concentration}</span>
          ) : null}
        </span>
        {line.state === "cancelled" ? (
          <StatusWord tone="caution">
            {(line.stateByCadre
              ? PHARMACY.state.cancelledView
              : PHARMACY.state.cancelledViewNoCadre
            )
              .replace("{time}", line.stateAt ? time.format(line.stateAt) : "")
              .replace("{cadre}", line.stateByCadre ?? "")}
          </StatusWord>
        ) : line.state === "not_continued" ? (
          <StatusWord tone="caution">{NOT_CONTINUED_CAUTION.text}</StatusWord>
        ) : line.state === "awaiting_cosign" ? (
          <StatusWord tone="caution" glyph={ClockIcon}>
            {PHARMACY.rowState.awaiting_cosign}
          </StatusWord>
        ) : null}
        {r.controlled ? <StatusWord tone="neutral">{V.controlled}</StatusWord> : null}
        <span className="flex-1" />
        {r.indication ? (
          <span className="text-body-s text-muted-foreground">
            {V.forProblem}: {r.indication}
          </span>
        ) : null}
      </div>
      <dl
        className={`text-body-s grid gap-x-6 gap-y-1 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] ${struck ? "line-through" : ""}`}
      >
        {fields
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-muted-foreground text-caption">{k}</dt>
              <dd className="whitespace-pre-wrap">{v}</dd>
            </div>
          ))}
        {line.doseSource ? (
          <div className="flex flex-col">
            <dt className="text-muted-foreground text-caption">{V.doseSource}</dt>
            <dd>{line.doseSource === "regimen" ? V.fromRegimen : V.typed}</dd>
          </div>
        ) : null}
      </dl>
      {r.edits.length ? (
        <ul className="text-body-s text-muted-foreground flex flex-col gap-0.5">
          {r.edits.map((e) => (
            <li key={e.field}>
              {e.field}: <s>{e.from}</s> → <span className="text-foreground">{e.to}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {line.overriddenStops.length ? (
        <CautionNotice
          lead={OVERRIDE_CAUTION.lead.replace("{check}", line.overriddenStops.join(", "))}
        >
          {OVERRIDE_CAUTION.body.replace("{reasons}", r.reasons ?? V.notRecorded)}
        </CautionNotice>
      ) : null}
    </li>
  );
}
