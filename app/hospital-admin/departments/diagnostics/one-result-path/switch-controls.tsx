"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveCutoverAction,
  recordBriefingAsAdminAction,
  requestCutoverAction,
} from "@/lib/lab/cutover-actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setSaid(
        r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Could not save." },
      );
      router.refresh();
    });
  const Said = () => (
    <p role="status" aria-live="polite" className="text-body-s min-h-5">
      {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
    </p>
  );
  return { pending, run, Said };
}

/** CO-2: request (all four met), or approve as a second admin. */
export function SwitchControls({
  state,
  cutoverId,
  mine,
}: {
  state: "ready" | "not_ready" | "requested" | "switched";
  cutoverId: string | null;
  mine: boolean;
}) {
  const { pending, run, Said } = useRun();
  return (
    <div className="flex flex-col gap-2">
      {state === "ready" ? (
        <div>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => requestCutoverAction(), "Requested. A second admin approves the switch.")
            }
          >
            Switch to the new path
          </Button>
        </div>
      ) : state === "not_ready" ? (
        <Button type="button" disabled>
          Switch to the new path
        </Button>
      ) : state === "requested" ? (
        mine ? (
          <StatusWord tone="caution">Waiting for a second admin to approve</StatusWord>
        ) : (
          <div>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => approveCutoverAction({ cutoverId }),
                  "Switched. The old list is read-only for this hospital.",
                )
              }
            >
              Approve the switch
            </Button>
          </div>
        )
      ) : null}
      <Said />
    </div>
  );
}

/** The fourth condition: who was briefed, and when. */
export function BriefingForm() {
  const { pending, run, Said } = useRun();
  const [heldOn, setHeldOn] = useState("");
  const [audience, setAudience] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-body-s flex flex-col gap-1">
          <span className="text-muted-foreground">Held on</span>
          <Input
            type="date"
            value={heldOn}
            onChange={(e) => setHeldOn(e.target.value)}
            className="min-h-11 w-44 sm:min-h-9"
          />
        </label>
        <label className="text-body-s flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-muted-foreground">Who was briefed</span>
          <Input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={300}
            className="min-h-11 sm:min-h-9"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !heldOn}
          onClick={() =>
            run(
              () => recordBriefingAsAdminAction({ heldOn, audience, notes: null }),
              "Briefing recorded.",
            )
          }
        >
          Record the briefing
        </Button>
      </div>
      <Said />
    </div>
  );
}
