import type { PartnerTests } from "@/lib/exchange/partners";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, or } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { LAB4 } from "@/content/lab-phase-4";
import { db } from "@/db";
import { labSignedConfigs, testCatalogue } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadConnections } from "@/lib/lab/exchange-read";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { loadPartners, loadReferralSettings } from "@/lib/lab/referral-read";
import { cn } from "@/lib/utils";
import {
  PackingDialog,
  PartnerDialog,
  SettingsDialog,
  SignDraft,
  TestsDialog,
} from "./_components/partner-forms";

export const metadata: Metadata = { title: "Partners · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const KIND_WORDS: Record<string, string> = {
  national_reference: "National reference lab",
  public_lab: "Public lab",
  private_lab: "Private lab",
  abroad: "Lab outside Uganda",
  outbreak: "Outbreak destination",
  hub: "Hub",
};
const STATE_WORDS = {
  signed: "Signed",
  draft: "Draft, waiting for a signature",
  missing: "Not entered",
} as const;
const UNIT_WORDS = { hours: "hours", days: "days", working_days: "working days" } as const;

/**
 * Partners (Lab Phase 4 §5.10, artboard 10; PT-1..PT-6): the register, each partner's tests and stated turnaround,
 * packing checklists, what we send them and the legal record. The laboratory lead enters and signs tests and
 * packing here; the data protection lead signs the legal record and field list at the referral governance desk.
 * Nothing is proposed: every code, turnaround and item is typed by the person who signs it.
 */
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labReferralLiveFor(scope.hospitalId)
  )
    notFound();
  const { p } = await searchParams;
  const lead = scope.access.permissions.has("lab.manage");
  const machines = await loadConnections(scope.hospitalId);
  const [partners, settings, menu, authors] = await db.transaction(
    async (tx) =>
      [
        await loadPartners(tx, scope.hospitalId),
        await loadReferralSettings(tx, scope.hospitalId),
        await tx
          .select({ code: testCatalogue.code, display: testCatalogue.display })
          .from(testCatalogue)
          .where(
            and(
              eq(testCatalogue.kind, "lab"),
              or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, scope.hospitalId)),
            ),
          )
          .orderBy(asc(testCatalogue.display)),
        await tx
          .select({ id: labSignedConfigs.id, authoredBy: labSignedConfigs.authoredBy })
          .from(labSignedConfigs)
          .where(
            and(
              eq(labSignedConfigs.hospitalId, scope.hospitalId),
              eq(labSignedConfigs.status, "draft"),
            ),
          ),
      ] as const,
  );
  const mine = new Set(authors.filter((a) => a.authoredBy === scope.userId).map((a) => a.id));
  const sel = partners.find((x) => x.id === p) ?? partners[0] ?? null;
  const testName = new Map(menu.map((m) => [m.code, m.display]));
  const tests = (sel?.tests.payload as PartnerTests | null)?.tests ?? [];
  const ops = settings.ops.payload as {
    presenceMinutes?: number;
    stopSendingDaysAfterReview?: number;
    hmis104RecordsFrom?: string;
  } | null;
  const card = "border-border bg-card flex flex-col gap-3 rounded-lg border p-4";
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="Partners" />
      {lead ? (
        <div className="flex flex-wrap items-center gap-3">
          <PartnerDialog />
          <SettingsDialog
            initial={{
              presenceMinutes: ops?.presenceMinutes ?? null,
              stop: ops?.stopSendingDaysAfterReview ?? null,
              from: ops?.hmis104RecordsFrom ?? null,
            }}
          />
          <span className="text-body-s text-muted-foreground">
            Referral settings: {STATE_WORDS[settings.ops.state]}
          </span>
          {settings.ops.state === "draft" && settings.ops.draftId ? (
            <SignDraft
              kind="referral_ops"
              configId={settings.ops.draftId}
              authoredByMe={mine.has(settings.ops.draftId)}
              label="Sign the settings"
            />
          ) : null}
        </div>
      ) : null}
      {partners.length === 0 ? (
        <p className="border-border text-body-s text-muted-foreground rounded-lg border border-dashed p-8 text-center">
          No partners yet.
        </p>
      ) : (
        <div className="border-border bg-card overflow-auto rounded-lg border">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Partners</caption>
            <thead>
              <tr className="bg-muted">
                {[
                  "Partner",
                  "How results come back",
                  "Agreement",
                  "Data leaves Uganda",
                  "Connection",
                ].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partners.map((x) => (
                <tr
                  key={x.id}
                  className={cn(
                    "border-ink-150 border-b last:border-b-0",
                    sel?.id === x.id && "bg-teal-50",
                  )}
                >
                  <td className="text-body-s px-3 py-2">
                    <Link href={`?p=${x.id}`} className="underline-offset-4 hover:underline">
                      {x.name}
                    </Link>
                    <br />
                    <span className="text-caption text-muted-foreground">
                      {KIND_WORDS[x.kind] ?? x.kind}
                      {x.active ? "" : " · not active"}
                    </span>
                  </td>
                  <td className="text-body-s px-3 py-2">
                    {x.resultsReturn.map((r) => r.words).join(" · ") || "—"}
                  </td>
                  <td className="text-body-s px-3 py-2">
                    {x.review && x.review !== "ok" ? (
                      <StatusWord tone="caution">
                        {x.review === "pdpo_expired"
                          ? "PDPO registration expired"
                          : "Review date passed"}
                      </StatusWord>
                    ) : (
                      STATE_WORDS[x.legal.state]
                    )}
                  </td>
                  <td className="text-body-s px-3 py-2">{x.leavesUganda ? "Yes" : "No"}</td>
                  <td className="text-body-s px-3 py-2">
                    {(() => {
                      const m = machines.find((c) => c.partner === x.name && c.state !== "revoked");
                      if (m?.state === "active")
                        return m.retryingSince ? (
                          <StatusWord tone="caution">Connected · retrying</StatusWord>
                        ) : (
                          <StatusWord>Connected</StatusWord>
                        );
                      if (m) return <StatusWord>Pairing</StatusWord>;
                      return (
                        <>
                          <StatusWord>Not connected</StatusWord>
                          <span className="text-caption text-muted-foreground block max-w-xs">
                            {x.kind === "national_reference"
                              ? LAB4.notConnectedCphl
                              : "Results come on their report and are entered by hand."}
                          </span>
                        </>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sel ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className={card}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-heading-s">Tests and turnaround · {sel.name}</h2>
              <span className="text-caption text-muted-foreground">
                {STATE_WORDS[sel.tests.state]}
              </span>
              <span className="flex-1" />
              {lead ? (
                <PartnerDialog
                  initial={{
                    id: sel.id,
                    name: sel.name,
                    kind: sel.kind as never,
                    transport: sel.transport,
                    resultsReturn: sel.resultsReturn as never,
                    contacts: sel.contacts,
                    active: sel.active,
                  }}
                />
              ) : null}
              {lead ? (
                <TestsDialog
                  partnerId={sel.id}
                  partnerName={sel.name}
                  menu={menu}
                  tests={tests.map((t) => ({
                    testCode: t.testCode,
                    theirCode: t.theirCode,
                    category: t.category,
                    value: t.turnaround ? String(t.turnaround.value) : "",
                    unit: t.turnaround?.unit ?? "",
                    ids: t.requiredIds.map((r) => r.words).join(", "),
                    requirements: t.requirements ?? "",
                  }))}
                />
              ) : null}
            </div>
            {tests.length === 0 ? (
              <p className="text-body-s text-muted-foreground">
                No tests entered. A test with no code here shows &quot;Map before sending&quot; on
                To refer.
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    {["Our test", "Their code", "Stated turnaround", "They need"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="text-caption text-ink-600 border-border border-b py-1 pr-3 font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.testCode} className="border-ink-150 border-b last:border-b-0">
                      <td className="text-body-s py-1.5 pr-3">
                        {testName.get(t.testCode) ?? t.testCode}
                      </td>
                      <td className="text-body-s py-1.5 pr-3 font-mono">{t.theirCode}</td>
                      <td className="text-body-s py-1.5 pr-3">
                        {t.turnaround
                          ? `${t.turnaround.value} ${UNIT_WORDS[t.turnaround.unit]}`
                          : "Not stated"}
                      </td>
                      <td className="text-body-s py-1.5 pr-3">
                        {[...t.requiredIds.map((r) => r.words), t.requirements]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {lead && sel.tests.state === "draft" && sel.tests.draftId ? (
              <SignDraft
                kind="partner_tests"
                configId={sel.tests.draftId}
                authoredByMe={mine.has(sel.tests.draftId)}
                label="Sign the tests"
              />
            ) : null}
            <h3 className="text-heading-xs mt-2">Packing</h3>
            {Object.keys(sel.packing).length === 0 ? (
              <p className="text-body-s text-muted-foreground">
                Enter tests first: packing is per specimen category.
              </p>
            ) : null}
            {Object.entries(sel.packing).map(([cat, c]) => (
              <div key={cat} className="flex flex-col gap-2">
                <p className="text-body-s">
                  <b>{cat}</b> · {STATE_WORDS[c.state]}
                </p>
                {(c.payload as { items: { words: string }[] } | null)?.items.map((i) => (
                  <p key={i.words} className="text-body-s pl-3">
                    · {i.words}
                  </p>
                ))}
                <div className="flex flex-wrap gap-2">
                  {lead ? (
                    <PackingDialog
                      partnerId={sel.id}
                      partnerName={sel.name}
                      category={cat}
                      items={
                        (c.payload as { items: { words: string }[] } | null)?.items.map(
                          (i) => i.words,
                        ) ?? []
                      }
                    />
                  ) : null}
                  {lead && c.state === "draft" && c.draftId ? (
                    <SignDraft
                      kind="partner_packing"
                      configId={c.draftId}
                      authoredByMe={mine.has(c.draftId)}
                      label="Sign the packing"
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </section>
          <section className={card}>
            <h2 className="text-heading-s">What we send them</h2>
            <p className="text-body-s">
              {sel.fields.state === "signed"
                ? (sel.fields.payload as { fields: string[] }).fields
                    .map((f) => f.replaceAll("_", " "))
                    .join(", ")
                : `${STATE_WORDS[sel.fields.state]} by the data protection lead.`}
            </p>
            <p className="text-body-s text-muted-foreground">
              Diagnosis, phone number, address: never sent.
            </p>
            <h2 className="text-heading-s mt-2">Legal record</h2>
            <p className="text-body-s">
              {sel.legal.state === "signed"
                ? "Signed by the data protection lead."
                : `${STATE_WORDS[sel.legal.state]}. The data protection lead records it at the referral governance desk.`}
            </p>
            <p className="text-caption text-muted-foreground">
              Without a signed legal record and field list, nothing can be sent to this partner, on
              paper or electronically.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
