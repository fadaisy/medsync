import type { Metadata } from "next";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { loadEqa } from "@/lib/lab/eqa-read";
import { labEqaLiveFor } from "@/lib/lab/feature";
import {
  AltDialog,
  CoverageDialog,
  EqaSettingsDialog,
  outcomeChip,
  ResultsDialog,
  RoundDialog,
  RoundPanel,
  SchemeDialog,
  ScoresDialog,
} from "../_components/eqa-forms";
import { QcChip } from "../_components/qc-chip";
import { QUALITY } from "../_lib/copy";
import { requireQualityScope } from "../_lib/scope";
import { RecordList } from "../../_components/record-list";
import { dayWords } from "../../_lib/days";

export const metadata: Metadata = { title: "External quality assessment · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const E = QUALITY.eqa;
const card = "border-border bg-card shadow-card flex flex-col gap-3 rounded-lg border p-4";

/**
 * External quality assessment (Lab Phase 3 §5.8, artboard 8; labEqa): the coverage chip opening the tests with no
 * EQA, the schemes table, rounds with the panel (our results, the provider's scores as given, tested by with the
 * EA-2 warning, the provider's report reference, the nonconformity an unacceptable result opened), alternative
 * assessments and the two operational settings. Scores are never re-scored here (EA-3).
 */
export default async function EqaPage() {
  const { scope, lead, staff } = await requireQualityScope(labEqaLiveFor);
  const manage = lead || scope.access.permissions.has("lab.eqa.manage");
  const v = await db.transaction((t) => loadEqa(t as never, scope.hospitalId, new Date()));
  const missing = v.coverage.filter((c) => c.covered === "none");
  const rounds = v.schemes.flatMap((s) => s.rounds);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title={E.title} />
      <p className="text-body-s text-muted-foreground max-w-[75ch]">{E.lede}</p>
      <div className="flex flex-wrap items-center gap-3">
        {v.tests.length === 0 ? (
          <p className="text-body-s">{E.noTests}</p>
        ) : missing.length ? (
          <CoverageDialog missing={missing} total={v.coverage.length} />
        ) : (
          <QcChip tone="passed">{E.allCovered}</QcChip>
        )}
        {manage ? <SchemeDialog tests={v.tests} /> : null}
        {staff && v.schemes.length ? (
          <RoundDialog schemes={v.schemes.filter((s) => s.active)} />
        ) : null}
      </div>
      <RecordList
        caption={E.schemes}
        rows={v.schemes}
        rowKey={(s) => s.id}
        empty={E.none}
        columns={[
          {
            id: "scheme",
            header: E.columns[0]!,
            cell: (s) => (
              <span className="flex flex-col gap-1">
                <span className="font-medium">{s.name}</span>
                <span className="text-caption text-muted-foreground">{s.provider}</span>
                {manage ? (
                  <SchemeDialog
                    tests={v.tests}
                    initial={{
                      id: s.id,
                      name: s.name,
                      provider: s.provider,
                      covers: s.covers,
                      roundsPerYear: s.roundsPerYear,
                      active: s.active,
                    }}
                  />
                ) : null}
              </span>
            ),
          },
          { id: "covers", header: E.columns[1]!, cell: (s) => s.coversNames.join(", ") },
          {
            id: "rounds",
            header: E.columns[2]!,
            cell: (s) => (s.roundsPerYear ? E.perYear(s.roundsPerYear) : E.notSet),
          },
          {
            id: "next",
            header: E.columns[3]!,
            cell: (s) =>
              s.next ? (
                <span className="flex flex-col gap-1">
                  <span>{s.next.label}</span>
                  {s.next.dueOn ? (
                    s.next.overdue ? (
                      <QcChip tone="amber">{`${E.overdue} · ${E.nextDue(dayWords(s.next.dueOn))}`}</QcChip>
                    ) : (
                      <span className="text-caption text-muted-foreground">
                        {E.nextDue(dayWords(s.next.dueOn))}
                      </span>
                    )
                  ) : null}
                </span>
              ) : (
                "—"
              ),
          },
          {
            id: "last",
            header: E.columns[4]!,
            cell: (s) =>
              s.last ? (
                <span className="flex flex-col gap-1">
                  <span>{s.last.label}</span>
                  {outcomeChip(s.last.outcome)}
                  <span className="text-caption text-muted-foreground">
                    {E.ofAcceptable(s.last.acceptable, s.last.scored)}
                  </span>
                </span>
              ) : (
                "—"
              ),
          },
        ]}
      />
      <section aria-labelledby="rounds" className={card}>
        <h2 id="rounds" className="text-heading-s font-medium">
          {E.round}
        </h2>
        <RecordList
          caption={E.round}
          rows={rounds}
          rowKey={(r) => r.id}
          empty="—"
          columns={[
            {
              id: "round",
              header: E.round,
              cell: (r) => (
                <span className="flex flex-col gap-1">
                  <span>{`${r.scheme} · ${r.label}`}</span>
                  <span className="text-caption text-muted-foreground">
                    {`${E.receivedOn} ${dayWords(r.receivedOn)}`}
                  </span>
                </span>
              ),
            },
            {
              id: "state",
              header: E.columns[3]!,
              cell: (r) =>
                r.outcome ? (
                  outcomeChip(r.outcome)
                ) : r.submittedOn ? (
                  <span className="flex flex-col gap-1">
                    <span>{E.submitted(dayWords(r.submittedOn))}</span>
                    <span className="text-caption text-muted-foreground">{E.awaiting}</span>
                  </span>
                ) : r.overdue ? (
                  <QcChip tone="amber">{E.overdue}</QcChip>
                ) : r.dueOn ? (
                  E.nextDue(dayWords(r.dueOn))
                ) : (
                  "—"
                ),
            },
            {
              id: "do",
              header: E.open,
              cell: (r) => (
                <span className="flex flex-wrap items-start gap-2">
                  <RoundPanel round={r} />
                  {staff && !r.submittedOn ? <ResultsDialog round={r} staff={v.staff} /> : null}
                  {manage && r.submittedOn && !r.outcome ? <ScoresDialog round={r} /> : null}
                </span>
              ),
            },
          ]}
        />
      </section>
      <section aria-labelledby="alts" className={card}>
        <h2 id="alts" className="text-heading-s font-medium">
          {E.alts}
        </h2>
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{E.coverageNote}</p>
        {v.settings.altPeriodDays === null ? <QcChip tone="amber">{E.altPeriodNone}</QcChip> : null}
        <RecordList
          caption={E.alts}
          rows={v.alternatives}
          rowKey={(a) => a.id}
          empty="—"
          columns={[
            { id: "test", header: E.altColumns[0]!, cell: (a) => a.display },
            {
              id: "method",
              header: E.altColumns[1]!,
              cell: (a) =>
                `${E.methods[a.method as keyof typeof E.methods] ?? a.method}${a.partner ? ` · ${a.partner}` : ""}`,
            },
            { id: "done", header: E.altColumns[2]!, cell: (a) => dayWords(a.doneOn) },
            { id: "conclusion", header: E.altColumns[3]!, cell: (a) => a.conclusion },
          ]}
        />
        {manage && v.tests.length ? <AltDialog tests={v.tests} /> : null}
      </section>
      <section aria-labelledby="eqa-settings" className={card}>
        <h2 id="eqa-settings" className="text-heading-s font-medium">
          {E.settings}
        </h2>
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{E.settingsLede}</p>
        <dl className="text-body-s grid gap-1 sm:grid-cols-[18rem_1fr]">
          <dt className="text-muted-foreground">{E.testerWindow}</dt>
          <dd>
            {v.settings.testerWindowSet
              ? v.settings.testerWindowDays
              : E.testerWindowDefault(v.settings.testerWindowDays)}
          </dd>
          <dt className="text-muted-foreground">{E.altPeriod}</dt>
          <dd>{v.settings.altPeriodDays ?? E.notSet}</dd>
        </dl>
        {manage ? <EqaSettingsDialog initial={v.settings} /> : null}
      </section>
    </div>
  );
}
