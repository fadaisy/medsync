import Link from "next/link";
import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";

import { RecordHeader } from "@/components/medsync/record-header";
import { facilityStatus } from "@/lib/ncdreg/admin";
import { can } from "@/lib/ncdreg/context";
import { REVIEW_LABELS } from "@/lib/ncdreg/read/derive";
import { personDetails, personView } from "@/lib/ncdreg/read/views";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import {
  ADMISSION_REASON,
  ALCOHOL,
  EVENT_TYPE,
  KNOWN_CVD,
  labelOf,
  MEDICINE_LIST,
  TOBACCO,
} from "@/lib/ncdreg/standard/code-lists";
import { OTHER_ANNUAL_ITEMS_MODULES } from "@/lib/ncdreg/standard/conditions";
import { cn } from "@/lib/utils";
import { ClassChip, ConditionTags, fmtDate, Num, Page } from "../../_components/kit";
import { LateLab } from "./_components/late-lab";
import { RecordActions, ShowNumber } from "./_components/record-actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  active: "Active",
  overdue: "Overdue",
  lost_to_follow_up: "Lost to follow-up",
  transferred_out: "Transferred out",
  died: "Died",
  withdrawn: "Withdrawn",
};
const BAND: Record<string, string> = {
  hypertension_only: "Hypertension only",
  diabetes_only: "Diabetes only",
  both_without_complications: "Both, without complications",
  either_with_complications: "Either, with complications",
};
const TABS = ["details", "visits", "reviews", "events"] as const;

/** Patient record (§11.3 item 3): header, tabs, review cards "from latest result", a timeline. */
export default async function PatientRecord({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { ctx } = await requireNcdScope();
  const { personId } = await params;
  const tab = (TABS as readonly string[]).includes((await searchParams).tab ?? "")
    ? (await searchParams).tab!
    : "details";
  const [pv, details, status] = await Promise.all([
    personView(ctx, personId),
    personDetails(ctx, personId),
    facilityStatus(ctx),
  ]);
  if (!pv || !details) notFound();
  const id = pv.identity;
  const p = pv.person;
  const mods = pv.modules.map((m) => m.module);
  const reviewComponents = [
    ...new Set([
      ...pv.reviews.map((r) => r.component),
      ...(mods.some((m) => (OTHER_ANNUAL_ITEMS_MODULES as readonly string[]).includes(m.code))
        ? (["other"] as const)
        : []),
    ]),
  ];
  const alive = !["died", "withdrawn", "transferred_out"].includes(pv.status);
  const addable = ctx.catalogue.filter(
    (m) => status.enabled.includes(m.code) && !mods.some((x) => x.code === m.code),
  );
  const visits = [...p.visits]
    .filter((v) => !v.invalid)
    .sort((a, b) => b.date.localeCompare(a.date));
  const timeline = [
    ...p.visits
      .filter((v) => v.closed && !v.invalid)
      .map((v) => ({
        date: v.date,
        kind: "Visit",
        text: [
          v.bp ? `BP ${v.bp[0]}/${v.bp[1]}` : null,
          v.glucose ? `glucose ${v.glucose.value.toFixed(1)}` : null,
          v.weightKg != null ? `${v.weightKg} kg` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    ...p.reviews.map((r) => ({
      date: r.date,
      kind: "Review",
      text: REVIEW_LABELS[r.component as keyof typeof REVIEW_LABELS] ?? "Other annual items",
    })),
    ...p.events.map((e) => ({
      date: e.date,
      kind: "Event",
      text: `${labelOf(EVENT_TYPE, e.type)}${e.admissionReason ? `: ${labelOf(ADMISSION_REASON, e.admissionReason)}` : ""}`,
    })),
    ...p.calls.map((c) => ({ date: c.date, kind: "Call", text: c.outcome.replace(/_/g, " ") })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Page>
      <RecordHeader
        domain="patients"
        icon={<UsersIcon />}
        crumb="NCD registry"
        title={id.name}
        monogram={id.name}
        actions={
          <RecordActions
            personId={personId}
            personName={id.name}
            modules={mods}
            addable={addable}
            reviewComponents={reviewComponents}
            today={ctx.today}
            alive={alive}
            can={{
              visit: can(ctx, "nurse_visit_write", "clinician_visit_write"),
              event: can(ctx, "event_write"),
              enrol: can(ctx, "enrol"),
              review: can(ctx, "review_write"),
            }}
          />
        }
        meta={
          <div className="flex flex-col gap-1">
            <p className="text-body-s text-ink-600 flex flex-wrap items-center gap-2">
              <Num>{id.registryNumber}</Num> · {id.sex === "female" ? "Female" : "Male"} · {id.age}{" "}
              y{details.dobEstimated ? " (estimated)" : ""}
              {id.isSynthetic ? (
                <span className="border-ink-300 rounded border px-1.5 text-[11px]">Synthetic</span>
              ) : null}
            </p>
            <p className="text-body-s flex flex-wrap items-center gap-3">
              <span>
                Status: <strong className="font-medium">{STATUS[pv.status]}</strong>
              </span>
              {pv.careBand ? (
                <span>
                  Care band: <strong className="font-medium">{BAND[pv.careBand]}</strong>
                </span>
              ) : null}
              <ConditionTags conditions={mods.map((m) => ({ code: m.code, label: m.label }))} />
            </p>
            {details.mergedIntoId ? (
              <p className="text-body-s text-ink-800">
                This record was merged.{" "}
                <Link href={`/ncd/patients/${details.mergedIntoId}`} className="underline">
                  Open the surviving record
                </Link>
                .
              </p>
            ) : null}
          </div>
        }
      />

      <nav aria-label="Record sections" className="border-border flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "text-label -mb-px border-b-2 px-3 py-2 capitalize",
              tab === t
                ? "border-foreground text-foreground"
                : "text-ink-600 hover:text-foreground border-transparent",
            )}
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === "details" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-2 text-[14px]">
            <Attr k="Hospital number" v={details.hospitalNumber} />
            <Attr k="National ID" v={details.nationalIdMasked} />
            <Attr
              k="Date of birth"
              v={
                details.dateOfBirth
                  ? fmtDate(details.dateOfBirth)
                  : `Born about ${details.birthYear}`
              }
            />
            <dt className="text-ink-600">Phone</dt>
            <dd className="flex flex-col gap-1">
              {id.phones.length
                ? id.phones.map((ph) =>
                    ph.invalid ? (
                      <span key={ph.slot} className="text-muted-foreground">
                        Number {ph.slot} flagged invalid
                      </span>
                    ) : (
                      <ShowNumber
                        key={ph.slot}
                        personId={personId}
                        slot={ph.slot}
                        masked={ph.masked}
                        demo={id.isSynthetic}
                      />
                    ),
                  )
                : "No phone recorded"}
            </dd>
            <Attr
              k="Next of kin"
              v={[details.nokName, details.nokPhoneMasked].filter(Boolean).join(" · ") || null}
            />
            <Attr
              k="Residence"
              v={
                [details.village, details.parish, details.subcounty, details.district]
                  .filter(Boolean)
                  .join(", ") || null
              }
            />
            <Attr
              k="Contact"
              v={`${id.smsAllowed ? "SMS allowed" : "No SMS"} · ${id.callsAllowed ? "calls allowed" : "no calls"}${details.smsOptedOutAt ? " · opted out of SMS" : ""}`}
            />
            <Attr
              k="Privacy notice"
              v={`Version ${details.privacyNoticeVersion}, acknowledged ${fmtDate(details.privacyNoticeAckAt.slice(0, 10))}`}
            />
            <Attr k="Height" v={details.heightCm != null ? `${details.heightCm} cm` : null} />
            <Attr
              k="Tobacco · alcohol"
              v={
                [
                  details.tobacco ? labelOf(TOBACCO, details.tobacco) : null,
                  details.alcohol ? labelOf(ALCOHOL, details.alcohol) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || null
              }
            />
            <Attr
              k="Known cardiovascular disease"
              v={
                details.knownCvd.length
                  ? details.knownCvd.map((c) => labelOf(KNOWN_CVD, c)).join(", ")
                  : "None recorded"
              }
            />
            <Attr
              k="Conditions"
              v={pv.modules
                .map(({ reg, module: m }) => `${m.label} since ${fmtDate(reg.date)}`)
                .join("; ")}
            />
          </dl>
          <section
            aria-labelledby="latest-h"
            className="border-border flex flex-col gap-3 rounded-xl border p-4"
          >
            <h2 id="latest-h" className="text-heading-s">
              At the last visit
            </h2>
            {pv.lastClasses.length ? (
              <ul className="flex flex-col gap-2">
                {pv.lastClasses.map((c) => (
                  <li
                    key={c.module.code}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-body-s">{c.module.label}</span>
                    <ClassChip
                      label={c.label}
                      leading={c.leading}
                      cls={c.cls}
                      clinicianRecorded={c.clinicianRecorded}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-s text-muted-foreground">No closed visit yet.</p>
            )}
            {pv.grade?.grade ? (
              <p className="text-caption text-ink-600">
                Hypertension grade {pv.grade.grade} from the latest reading ({pv.grade.bp[0]}/
                {pv.grade.bp[1]}, {fmtDate(pv.grade.date)}). Grade from latest reading, draft
                thresholds.
              </p>
            ) : null}
            {pv.appointment ? (
              <p className="text-body-s">
                Next appointment{" "}
                <strong className="font-medium">{fmtDate(pv.appointment.date)}</strong>
                {pv.overdueDays ? ` · ${pv.overdueDays} days overdue` : ""}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === "visits" ? (
        <div className="border-border overflow-x-auto border-y">
          <table className="w-full min-w-[820px] text-[14px]">
            <caption className="sr-only">Visits</caption>
            <thead>
              <tr className="text-ink-600 border-border border-b text-left text-[13px]">
                {[
                  "Date",
                  "Type",
                  "Blood pressure",
                  "Glucose",
                  "HbA1c",
                  "Weight",
                  "Medicines",
                  "",
                ].map((h) => (
                  <th key={h} scope="col" className="h-11 px-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} className="border-border border-b last:border-b-0">
                  <td className="h-14 px-3">
                    <Link href={`/ncd/visit/${v.id}`} className="hover:underline">
                      <Num>{fmtDate(v.date)}</Num>
                    </Link>
                    {v.historical ? (
                      <span className="text-muted-foreground ml-1 text-[11px]">back-entry</span>
                    ) : null}
                    {!v.closed ? (
                      <span className="text-muted-foreground ml-1 text-[11px]">open</span>
                    ) : null}
                  </td>
                  <td className="px-3">{v.type.replace(/_/g, " ")}</td>
                  <td className="px-3">{v.bp ? <Num>{`${v.bp[0]}/${v.bp[1]}`}</Num> : "–"}</td>
                  <td className="px-3">
                    {v.glucose ? (
                      <Num>{`${v.glucose.value.toFixed(1)} ${v.glucose.type === "fasting" ? "F" : v.glucose.type === "random" ? "R" : "PM"}`}</Num>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-3">
                    {v.hba1c ? <Num>{`${v.hba1c.percent.toFixed(1)}%`}</Num> : "–"}
                  </td>
                  <td className="px-3">
                    {v.weightKg != null ? <Num>{v.weightKg.toFixed(1)}</Num> : "–"}
                  </td>
                  <td className="text-ink-700 px-3 text-[13px]">
                    {v.medicines
                      .map((m) => MEDICINE_LIST.medicines.find((x) => x.code === m)?.label ?? m)
                      .join(", ") || "–"}
                  </td>
                  <td className="px-3 text-right">
                    {v.closed &&
                    can(ctx, "late_lab_results", "clinician_visit_write") &&
                    mods.some((m) => m.visit_fields.some((f) => f.code === "hba1c")) ? (
                      <LateLab
                        visitId={v.id}
                        personId={personId}
                        visitDate={v.date}
                        today={ctx.today}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "reviews" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pv.reviews.map((r) => {
            const last = [...p.reviews]
              .filter((x) => x.component === r.component)
              .sort((a, b) => a.date.localeCompare(b.date))
              .at(-1);
            return (
              <section
                key={r.component}
                className="border-border flex flex-col gap-2 rounded-xl border p-4"
                aria-label={REVIEW_LABELS[r.component]}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-heading-s">{REVIEW_LABELS[r.component]}</h2>
                  {r.due ? (
                    <span className="border-ink-300 text-ink-800 rounded-md border px-2 text-[12px]">
                      due
                    </span>
                  ) : r.dueSoon ? (
                    <span className="text-ink-600 text-[12px]">due {fmtDate(r.dueOn)}</span>
                  ) : null}
                </div>
                <p className="text-caption text-ink-600">
                  {r.last ? `Last ${fmtDate(r.last)}` : "Never recorded"}
                </p>
                {last ? <ReviewSummary data={last.data} derived={last.derived} /> : null}
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "events" || tab === "details" ? (
        <section aria-labelledby="tl-h" className="flex flex-col gap-2">
          <h2 id="tl-h" className="text-heading-s">
            {tab === "events" ? "Events" : "Timeline"}
          </h2>
          <ol className="border-border flex flex-col border-l pl-4">
            {(tab === "events"
              ? timeline.filter((t) => t.kind === "Event")
              : timeline.slice(0, 20)
            ).map((t, i) => (
              <li key={`${t.date}-${i}`} className="text-body-s flex gap-3 py-1.5">
                <Num className="text-ink-600 w-24 shrink-0">{fmtDate(t.date)}</Num>
                <span className="text-ink-600 w-16 shrink-0">{t.kind}</span>
                <span>{t.text}</span>
              </li>
            ))}
            {!timeline.length ? (
              <li className="text-body-s text-muted-foreground">Nothing recorded yet.</li>
            ) : null}
          </ol>
        </section>
      ) : null}
      <p className="text-caption text-muted-foreground">
        Categories are shown as category from latest result, never as a diagnosis.
      </p>
    </Page>
  );
}

function Attr({ k, v }: { k: string; v: string | null }) {
  return (
    <>
      <dt className="text-ink-600">{k}</dt>
      <dd>{v ?? <span className="text-muted-foreground">Not recorded</span>}</dd>
    </>
  );
}

function ReviewSummary({
  data,
  derived,
}: {
  data: Readonly<Record<string, unknown>>;
  derived: Readonly<Record<string, unknown>>;
}) {
  const lines: string[] = [];
  if (data.creatinineUmol != null) lines.push(`Creatinine ${String(data.creatinineUmol)} µmol/L`);
  if (derived.egfr != null)
    lines.push(
      `eGFR ${String(derived.egfr)}, category ${String(derived.kdigoG)} from latest result`,
    );
  if (data.urineTest === "acr" && data.acrMgMmol != null)
    lines.push(
      `ACR ${String(data.acrMgMmol)} mg/mmol${derived.kdigoA ? `, category ${String(derived.kdigoA)}` : ""}`,
    );
  if (data.urineTest === "dipstick" && data.dipstick)
    lines.push(`Dipstick protein ${String(data.dipstick)}`);
  if (data.examined === true)
    lines.push(
      `Examined; ${String(data.retinopathyGrade ?? "grade not recorded").replace(/_/g, " ")}`,
    );
  if (data.examined === false) lines.push("Not examined");
  if (derived.footRisk != null)
    lines.push(`Foot risk category ${String(derived.footRisk)} from latest result`);
  if (data.totalCholesterol != null)
    lines.push(`Total cholesterol ${String(data.totalCholesterol)} mmol/L`);
  if (data.ldl != null) lines.push(`LDL ${String(data.ldl)} mmol/L`);
  return (
    <ul className="text-body-s flex flex-col gap-0.5">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
