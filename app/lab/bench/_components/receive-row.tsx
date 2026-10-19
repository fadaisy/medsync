"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { receiveSpecimen } from "@/lib/emr/actions/orders";
import { LabButton } from "../../_components/v2/button";

const B = LABWS2.bench;

/**
 * Receive from the queue (prompt 5.5; Phase 0 LW-8, Phase 2 SR-3): the same action with the same arguments as
 * the worklist's row. A high-risk row asks for "Procedure followed" first, and the button says why it waits.
 */
export function ReceiveRow({
  patientUserId,
  specimenId,
  highRisk,
  procedure,
  label,
}: {
  patientUserId: string;
  specimenId: string;
  highRisk: boolean;
  procedure: string | null;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [followed, setFollowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 pt-1">
      {highRisk ? (
        <div className="bg-status-caution-bg text-body-s flex flex-col gap-1.5 rounded-[10px] px-3 py-2 text-amber-800">
          {procedure && /^https?:\/\//.test(procedure) ? (
            <a
              href={procedure}
              target="_blank"
              rel="noreferrer"
              className="w-fit underline underline-offset-2"
            >
              {B.openProcedure}
            </a>
          ) : (
            <span>{procedure ?? B.noProcedure}</span>
          )}
          <label className="text-foreground inline-flex min-h-9 items-center gap-2">
            <input
              type="checkbox"
              checked={followed}
              onChange={(e) => setFollowed(e.target.checked)}
              className="size-4 accent-teal-700"
            />
            {B.procedureFollowed}
          </label>
        </div>
      ) : null}
      <LabButton
        variant="secondary"
        size="sm"
        aria-label={`${B.receive}: ${label}`}
        busy={pending}
        disabledReason={highRisk && !followed ? B.receiveReason : null}
        onClick={() =>
          start(async () => {
            const r = await receiveSpecimen({
              surface: "lab",
              patientUserId,
              specimenId,
              ...(highRisk ? { procedureFollowed: true } : {}),
              clientKey: crypto.randomUUID(),
            });
            if (!r.ok) return setError(r.error);
            setError(null);
            router.refresh();
          })
        }
      >
        {B.receive}
      </LabButton>
      {error ? (
        <span role="status">
          <StatusWord tone="caution">{error}</StatusWord>
        </span>
      ) : null}
    </div>
  );
}
