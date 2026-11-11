"use client";

import { useState } from "react";

import { useMenuAction } from "@/components/lab/test-menu/use-menu-action";
import { LabButton } from "@/components/tide/work/button";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import { decideRequestAction } from "@/lib/lab/test-menu-actions";

interface Row {
  id: string;
  hospital: string;
  name: string;
  purpose: string;
  specimen: string;
  route: string;
  reference: string | null;
  state: string;
  reason: string | null;
  testCode: string | null;
  at: string;
}

const field =
  "border-ink-300 bg-card focus-visible:shadow-focus h-9 w-full rounded-lg border px-3 text-[14px] outline-none";

/** TM-11: review, add (after the signed addendum) or decline with a reason the requester sees. */
export function RequestQueue({ rows }: { rows: Row[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <Request key={r.id} r={r} />
      ))}
    </ul>
  );
}

function Request({ r }: { r: Row }) {
  const act = useMenuAction();
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const open = r.state === "new" || r.state === "in_review";
  return (
    <li className="border-border bg-card flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading-s text-foreground">{r.name}</h2>
        <span className="text-body-s text-ink-600">
          {r.hospital} · {C.requestStates[r.state as keyof typeof C.requestStates] ?? r.state}
        </span>
      </div>
      <p className="text-body-s text-ink-700">{r.purpose}</p>
      <p className="text-body-s text-ink-600">
        {r.specimen} · {C.routes[r.route as keyof typeof C.routes] ?? r.route}
        {r.reference ? ` · ${r.reference}` : ""}
      </p>
      {r.reason ? <p className="text-body-s text-ink-700">{r.reason}</p> : null}
      {r.testCode ? <p className="text-body-s font-mono">{r.testCode}</p> : null}
      {open ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-body-s flex flex-col gap-1">
            {C.testIdLabel}
            <input
              className={field}
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
            />
          </label>
          <label className="text-body-s flex flex-col gap-1">
            {C.reasonLabel}
            <input
              className={field}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex items-end gap-2">
            {r.state === "new" ? (
              <LabButton
                type="button"
                busy={act.pending}
                onClick={() =>
                  act.run(
                    () => decideRequestAction({ id: r.id, state: "in_review" }),
                    C.requestStates.in_review,
                  )
                }
              >
                {C.review}
              </LabButton>
            ) : null}
            <LabButton
              type="button"
              busy={act.pending}
              disabledReason={code ? undefined : C.testIdLabel}
              onClick={() =>
                act.run(
                  () => decideRequestAction({ id: r.id, state: "added", testCode: code }),
                  C.requestStates.added,
                )
              }
            >
              {C.markAdded}
            </LabButton>
            <LabButton
              type="button"
              busy={act.pending}
              disabledReason={reason.trim().length >= 3 ? undefined : C.reasonLabel}
              onClick={() =>
                act.run(
                  () => decideRequestAction({ id: r.id, state: "declined", reason }),
                  C.requestStates.declined,
                )
              }
            >
              {C.decline}
            </LabButton>
          </div>
        </div>
      ) : null}
      {act.message ? (
        <p
          role="status"
          className={act.message.ok ? "text-body-s text-ink-700" : "text-body-s text-amber-800"}
        >
          {act.message.text}
        </p>
      ) : null}
    </li>
  );
}
