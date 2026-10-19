import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { Pill } from "@/components/ui/pill";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { diagnosticOfferings, labTestServices, loincCodes, testCatalogue } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labOneMenuLiveFor } from "@/lib/lab/feature";
import { menuToday } from "@/lib/lab/one-menu-read";
import { SetupHeader } from "../_components/setup-header";
import { ServicePicker } from "./_components/service-picker";

export const metadata: Metadata = { title: "Test menu · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const CLASS_WORDS: Record<string, string> = {
  hiv: "HIV",
  tb: "TB",
  mental_health: "Mental health",
  sexual_reproductive_health: "Sexual and reproductive health",
};

/**
 * The test menu (Lab Phase 2 §5.10, artboard 10; OM-1): each lab test, what the hub says it is here today,
 * and the service it is linked to. A test with no link cannot be ordered and is hidden from doctors. The
 * measurement facts stay on Test catalogue; section, hours and status stay in the hub (Law 2). The
 * restricted class is shown here and changed only by the CSO (CC-8).
 */
export default async function TestMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labOneMenuLiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const { show } = await searchParams;
  const { tests, offerings, links, today } = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(testCatalogue)
      .where(
        and(
          eq(testCatalogue.kind, "lab"),
          eq(testCatalogue.active, true),
          or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, scope.hospitalId)),
        ),
      )
      .orderBy(testCatalogue.display);
    const offers = await tx
      .select({
        code: diagnosticOfferings.code,
        provision: diagnosticOfferings.provision,
        name: loincCodes.display,
      })
      .from(diagnosticOfferings)
      .leftJoin(loincCodes, eq(loincCodes.code, diagnosticOfferings.code))
      .where(
        and(
          eq(diagnosticOfferings.hospitalId, scope.hospitalId),
          eq(diagnosticOfferings.kind, "lab"),
        ),
      );
    const linked = await tx
      .select()
      .from(labTestServices)
      .where(eq(labTestServices.hospitalId, scope.hospitalId));
    return {
      tests: rows,
      offerings: offers,
      links: linked,
      today: await menuToday(tx, scope.hospitalId),
    };
  });
  const byCode = new Map<string, (typeof tests)[number]>();
  for (const t of tests) if (!byCode.has(t.code) || t.hospitalId) byCode.set(t.code, t);
  const link = new Map(links.map((l) => [l.testCode, l.offeringCode]));
  const all = [...byCode.values()].map((t) => ({ t, today: today(t.code) }));
  const rows =
    show === "unlinked"
      ? all.filter((r) => r.today.state === "not_linked")
      : show === "restricted"
        ? all.filter((r) => r.t.restrictedClass)
        : all;
  const cannot = all.filter((r) => !r.today.orderable).length;
  const options = offerings.map((o) => ({
    code: o.code,
    label: `${o.name ?? o.code} (${o.code})${o.provision === "in_house" ? "" : o.provision === "referred" ? " · referred" : " · not offered"}`,
  }));
  const filter = (key: string | undefined, label: string) => (
    <Link
      href={key ? `/lab/setup/menu?show=${key}` : "/lab/setup/menu"}
      aria-current={show === key ? "page" : undefined}
      className="text-body-s rounded-full border px-3 py-1 aria-[current=page]:border-teal-600 aria-[current=page]:text-teal-800"
    >
      {label}
    </Link>
  );
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Test menu"
        right={
          cannot ? (
            <StatusWord tone="caution">
              {cannot} {cannot === 1 ? "test cannot" : "tests cannot"} be ordered yet
            </StatusWord>
          ) : (
            <StatusWord>Every test can be ordered</StatusWord>
          )
        }
      />
      <p className="text-body-s text-muted-foreground max-w-3xl">
        Link each test to the service that provides it here. What the lab can do today, its hours
        and its turnaround come from the Departments and services hub. A test with no service cannot
        be ordered and doctors do not see it.
      </p>
      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {filter(undefined, "All")}
        {filter("unlinked", "Not linked")}
        {filter("restricted", "Restricted")}
      </nav>
      <div className="overflow-x-auto">
        <table className="text-body-s w-full">
          <thead className="text-caption text-muted-foreground text-left">
            <tr className="border-b">
              <th className="py-2 pr-3 font-normal">Test</th>
              <th className="py-2 pr-3 font-normal">Today</th>
              <th className="py-2 pr-3 font-normal">Service</th>
              <th className="py-2 pr-3 font-normal">Restricted</th>
              <th className="py-2 font-normal">
                <span className="sr-only">Measurement</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, today: d }) => (
              <tr key={t.code} className="border-b align-top">
                <td className="py-3 pr-3 font-medium">{t.display}</td>
                <td className="py-3 pr-3">
                  {d.state === "in_house" ? (
                    <span>{d.words ?? "In the lab here"}</span>
                  ) : (
                    <StatusWord tone="caution">{d.words}</StatusWord>
                  )}
                </td>
                <td className="py-3 pr-3">
                  <ServicePicker
                    testCode={t.code}
                    testName={t.display}
                    value={link.get(t.code) ?? null}
                    offerings={options}
                  />
                </td>
                <td className="py-3 pr-3">
                  {t.restrictedClass ? (
                    <Pill tone="sensitive">
                      {CLASS_WORDS[t.restrictedClass] ?? t.restrictedClass}
                    </Pill>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </td>
                <td className="py-3">
                  <Link
                    href="/lab/setup/catalogue"
                    className="font-medium text-teal-700 underline-offset-4 hover:underline"
                  >
                    Measurement
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!offerings.length ? (
        <StatusWord tone="caution">
          No lab services are set up in the Departments and services hub yet: add them there first.
        </StatusWord>
      ) : null}
    </div>
  );
}
