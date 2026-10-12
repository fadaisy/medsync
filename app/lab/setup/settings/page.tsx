import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labCatalogueV2LiveFor } from "@/lib/lab/feature";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { loadLabSettingsPage } from "@/lib/lab/settings-read";
import { EgfrSwitch, ElevationForm, HivEditor, SignAsLead } from "./_components/settings-forms";
import { SETTINGS as C } from "./_lib/copy";

export const metadata: Metadata = { title: "Lab settings · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={id} className="text-heading-s">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Lab settings (Lab Phase 2 §5.14, artboard 14): the hospital's elevation and HIV algorithm (each signed by
 * the laboratory lead and the CSO, DS-7) and eGFR reporting (EG-1). No field is pre-filled: a value shows
 * only when a saved draft or a signed version holds it.
 */
export default async function LabSettingsPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labCatalogueV2LiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const s = await db.transaction((tx) => loadLabSettingsPage(tx as never, scope.hospitalId));
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: LAB_TIME_ZONE,
  });
  const when = (d: Date | null) => (d ? date.format(d) : "");
  const { elevation: el, hiv } = s;
  const hivSummary = (p: NonNullable<typeof hiv.signed>["payload"]) =>
    C.hiv.summary(
      p.assays.map((a) => `${a.step}. ${a.kit}`).join(", "),
      p.rules.length,
      p.retestDays,
      p.circular,
    );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title={C.title} />

      {/* Payment before the sample (§5.14, labPayment) and High-risk specimen procedure (§5.14,
          labHighRiskWarning) go here in a later step: s.paymentMode and s.highRiskProcedure are read
          already. No UI until then. */}

      <Section id="elevation-heading" title={C.elevation.title}>
        <p className="text-body-s">
          {el.signed
            ? C.elevation.signed(
                el.signed.payload.metres,
                el.signed.payload.source,
                when(el.signed.inForceFrom),
              )
            : C.elevation.none}
        </p>
        {el.awaitingCso ? (
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord tone="caution">{C.waiting}</StatusWord>
            {C.elevation.awaiting(el.awaitingCso.payload.metres)}
          </p>
        ) : null}
        {el.draft ? <StatusWord className="w-fit">{C.draftOpen}</StatusWord> : null}
        <ElevationForm
          key={el.draft?.id ?? el.awaitingCso?.id ?? "new"}
          initial={el.draft?.payload ?? el.awaitingCso?.payload ?? el.signed?.payload ?? null}
        />
        {el.draft ? (
          <SignAsLead configId={el.draft.id} authoredByMe={el.draft.authoredBy === scope.userId} />
        ) : null}
        <p className="text-body-s text-muted-foreground">{C.csoLine}</p>
      </Section>

      <Section id="egfr-heading" title={C.egfr.title}>
        <EgfrSwitch on={s.reportEgfr} />
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{C.egfr.line}</p>
      </Section>

      <Section id="hiv-heading" title={C.hiv.title}>
        <p className="text-body-s">
          {hiv.signed ? (
            <>
              {hivSummary(hiv.signed.payload)}
              <span className="text-muted-foreground">
                {" "}
                · {C.hiv.signedOn(when(hiv.signed.inForceFrom))}
              </span>
            </>
          ) : (
            C.hiv.notSet
          )}
        </p>
        {hiv.awaitingCso ? (
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord tone="caution">{C.waiting}</StatusWord>
            {hivSummary(hiv.awaitingCso.payload)}
          </p>
        ) : null}
        {hiv.draft ? (
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord>{C.draftOpen}</StatusWord>
            {hiv.draft.payload ? hivSummary(hiv.draft.payload) : null}
          </p>
        ) : null}
        <HivEditor
          key={hiv.draft?.id ?? hiv.awaitingCso?.id ?? "new"}
          initial={hiv.draft?.payload ?? hiv.awaitingCso?.payload ?? hiv.signed?.payload ?? null}
        />
        {hiv.draft ? (
          <SignAsLead
            configId={hiv.draft.id}
            authoredByMe={hiv.draft.authoredBy === scope.userId}
          />
        ) : null}
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{C.hiv.line}</p>
        <p className="text-body-s text-muted-foreground">{C.csoLine}</p>
      </Section>
    </div>
  );
}
