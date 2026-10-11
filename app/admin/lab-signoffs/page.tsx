import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, inArray } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { criticalResponseVersions } from "@/db/schema/lab-safety";
import { users } from "@/db/schema/users";
import { getAuthState } from "@/lib/auth";
import { CsoSign } from "./_components/cso-sign";

export const metadata: Metadata = { title: "Lab sign-offs · Admin · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Lab sign-offs (Lab Phase 1 D-LAB1-11): sets the laboratory lead has signed and the CSO countersigns.
 * Response times today; reference ranges and critical limits join here when their set-up ships.
 * The CSO works from this console; no in-app CSO role exists, so the superadmin signs as CSO and the
 * governance gap stays recorded (§12, hazard 21).
 */
export default async function LabSignoffsPage() {
  const state = await getAuthState();
  if (!state.user || !state.roles.includes("superadmin")) redirect("/admin");
  const versions = await db
    .select()
    .from(criticalResponseVersions)
    .orderBy(desc(criticalResponseVersions.createdAt))
    .limit(100);
  const hospitalIds = [...new Set(versions.map((v) => v.hospitalId))];
  const people = [
    ...new Set(
      versions
        .flatMap((v) => [v.authoredBy, v.leadSignedBy, v.csoSignedBy])
        .filter((u): u is string => !!u),
    ),
  ];
  const [hs, us] = await Promise.all([
    hospitalIds.length
      ? db
          .select({ id: hospitals.id, name: hospitals.name })
          .from(hospitals)
          .where(inArray(hospitals.id, hospitalIds))
      : [],
    people.length
      ? db
          .select({ id: users.id, name: users.fullName })
          .from(users)
          .where(inArray(users.id, people))
      : [],
  ]);
  const hospital = new Map(hs.map((h) => [h.id, h.name]));
  const person = new Map(us.map((u) => [u.id, u.name]));
  const waiting = versions.filter((v) => v.status === "draft" && v.leadSignedBy);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-heading-m">Lab sign-offs</h1>
        <p className="text-body-s text-muted-foreground">
          Response times for critical results, signed by a hospital&apos;s laboratory lead, wait
          here for the CSO. A set is in force from the CSO&apos;s signature. Nothing here proposes a
          number.
        </p>
      </header>
      {waiting.length === 0 ? (
        <p className="text-body-s text-muted-foreground">Nothing is waiting for the CSO.</p>
      ) : null}
      {waiting.map((v) => (
        <section key={v.id} className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord tone="caution">Waiting for the CSO</StatusWord>
            <span className="font-medium">{hospital.get(v.hospitalId) ?? "Hospital"}</span>
            <span className="text-muted-foreground">version {v.version}</span>
          </p>
          <dl className="text-body-s grid gap-x-6 gap-y-1 sm:grid-cols-[14rem_1fr]">
            <dt className="text-muted-foreground">Acknowledge within</dt>
            <dd className="font-mono tabular-nums">{v.ackWithinMin} min</dd>
            <dt className="text-muted-foreground">Level 1 waits</dt>
            <dd className="font-mono tabular-nums">
              {v.level1AfterMin ? `${v.level1AfterMin} min` : "Not set (no automatic level 2)"}
            </dd>
            <dt className="text-muted-foreground">Overdue at level 2 after</dt>
            <dd className="font-mono tabular-nums">
              {v.level2AfterMin ? `${v.level2AfterMin} min` : "Not set"}
            </dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd>{v.source}</dd>
            <dt className="text-muted-foreground">Drafted by</dt>
            <dd>{person.get(v.authoredBy) ?? "Staff"}</dd>
            <dt className="text-muted-foreground">Signed by the laboratory lead</dt>
            <dd>
              {person.get(v.leadSignedBy!) ?? "Staff"}
              {v.leadSignedAt ? `, ${fmt.format(v.leadSignedAt)}` : ""}
              {v.exceptionNote ? ` (exception: ${v.exceptionNote})` : ""}
            </dd>
          </dl>
          <CsoSign
            hospitalId={v.hospitalId}
            versionId={v.id}
            sameAsLead={v.leadSignedBy === state.user!.id}
          />
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="text-heading-s">In force</h2>
        {versions
          .filter((v) => v.status === "signed")
          .map((v) => (
            <p key={v.id} className="text-body-s">
              {hospital.get(v.hospitalId) ?? "Hospital"}: version {v.version}, acknowledge within{" "}
              {v.ackWithinMin} min · signed by {person.get(v.leadSignedBy!) ?? "Staff"} and{" "}
              {person.get(v.csoSignedBy!) ?? "Staff"}
              {v.csoSignedAt ? `, ${fmt.format(v.csoSignedAt)}` : ""}
            </p>
          ))}
      </section>
    </div>
  );
}
