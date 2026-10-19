import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { LAB_TEST_MENU } from "@/content/lab-test-menu";
import { db } from "@/db";
import { hospitals, labCatalogueRequests } from "@/db/schema";
import { getAuthState } from "@/lib/auth";
import { RequestQueue } from "./_components/request-queue";

export const metadata: Metadata = { title: "Lab catalogue requests · Admin · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The MedSync catalogue team's queue (TM-11, TM-D08): hospitals ask for a test; the team reviews it, adds it
 * through a signed addendum, or declines it with a reason the requester sees. The admin layout gates auth and AAL2;
 * this also requires superadmin. Requests carry no patient data (§9).
 */
export default async function LabCatalogueRequestsPage() {
  const state = await getAuthState();
  if (!state.user || !state.roles.includes("superadmin")) redirect("/admin");
  const rows = await db
    .select({
      id: labCatalogueRequests.id,
      hospital: hospitals.name,
      name: labCatalogueRequests.name,
      purpose: labCatalogueRequests.purpose,
      specimen: labCatalogueRequests.specimen,
      route: labCatalogueRequests.route,
      reference: labCatalogueRequests.reference,
      state: labCatalogueRequests.state,
      reason: labCatalogueRequests.reason,
      testCode: labCatalogueRequests.testCode,
      at: labCatalogueRequests.createdAt,
    })
    .from(labCatalogueRequests)
    .innerJoin(hospitals, eq(hospitals.id, labCatalogueRequests.hospitalId))
    .orderBy(desc(labCatalogueRequests.createdAt))
    .limit(200);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-display-s text-foreground">{LAB_TEST_MENU.queueTitle}</h1>
        <p className="text-muted-foreground text-body-s">{LAB_TEST_MENU.noPatientData}</p>
      </header>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-body-s">{LAB_TEST_MENU.queueEmpty}</p>
      ) : (
        <RequestQueue rows={rows.map((r) => ({ ...r, at: r.at.toISOString() }))} />
      )}
    </div>
  );
}
