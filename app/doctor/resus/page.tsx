import type { Metadata } from "next";

import { ResusBoard } from "@/app/nurse/resus/_components/resus-board";
import { fetchResusBoard } from "@/lib/resus/board";
import { requireResusScope } from "@/lib/resus/scope";

export const metadata: Metadata = {
  title: "Resus · MedSync",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /doctor/resus — the resus board for doctors. Same surface as /nurse/resus
 * (a resus is a whole-team act; requireResusScope admits any clinical cadre),
 * reusing the ResusBoard component with the doctor workspace base path so its
 * desk links + open-resus redirects stay inside /doctor.
 */
export default async function DoctorResusBoardPage() {
  const scope = await requireResusScope("/doctor/resus");
  const board = await fetchResusBoard({
    hospitalId: scope.hospitalId,
    clinicianUserId: scope.userId,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-rose-500 ring-2 ring-rose-500/20" />
          {scope.hospitalName} · {scope.departmentName} · Resus
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          Resuscitation board
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          The ABCDE surface for any patient at Red/L1 or a Step-0 life-threat. Opening a resus
          starts the immutable record and summons the team. The app records what the team does — the
          clinician leads.
        </p>
      </header>

      <ResusBoard
        board={board}
        leaderRecommended={scope.leaderRecommended}
        basePath="/doctor/resus"
      />
    </div>
  );
}
