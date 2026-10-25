import type { Metadata } from "next";

import { StatusPanel } from "@/app/emergency/status/_components/status-panel";
import { TideScope } from "@/components/medsync/tide-scope";
import { Note } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { HELP_COPY } from "@/content/patient/help";

export const metadata: Metadata = { title: "Your pre-alert" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * E3 (PRD §8.4): the old page's `StatusPanel`, reused. It polls `pt-pre-arrival-status` with the token the
 * form kept for this tab; the id alone confirms nothing, so another device reads "not found".
 */
export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const C = HELP_COPY.status;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader back={{ href: "/emergency/lines", label: C.back }} title={C.title} />
      {id && UUID.test(id) ? (
        <TideScope group="public" light>
          <StatusPanel id={id} />
        </TideScope>
      ) : (
        <Note>{C.none}</Note>
      )}
    </div>
  );
}
