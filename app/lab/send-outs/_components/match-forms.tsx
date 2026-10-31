"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { resolveMatchAction } from "@/lib/lab/match-actions";
import { inputClass, Pop, selectClass } from "../../_components/pop";
import { LabButton } from "@/components/tide/work/button";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

/* The decisions on a waiting item (Lab Phase 4 §5.7; MA-6, MA-7). "Ask the reference lab" is the first move. */

type Action =
  | "file_after_confirming"
  | "not_ours"
  | "set_aside"
  | "keep_unordered"
  | "asked_partner";
const TITLES: Record<Action, string> = {
  asked_partner: "Ask the reference lab",
  file_after_confirming: "File after confirming",
  not_ours: "Not ours, send back",
  set_aside: "Set aside",
  keep_unordered: "Keep as unordered",
};

export function ResolveDialog({
  itemId,
  action,
  colleagues,
  primary = false,
}: {
  itemId: string;
  action: Action;
  colleagues: { id: string; name: string }[];
  primary?: boolean;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ method: "", spokeTo: "", second: "", reason: "" });
  const confirm = action === "file_after_confirming";
  const save = () =>
    act(
      async () => {
        const r = await resolveMatchAction({
          itemId,
          action,
          method: confirm ? f.method || null : null,
          spokeTo: confirm && f.method === "phone_call" ? f.spokeTo || null : null,
          secondUserId: confirm ? f.second || null : null,
          reason: f.reason,
        });
        if (r.ok) setOpen(false);
        return r;
      },
      confirm
        ? "Confirmed. Enter the result from its referral: it will say it was filed by hand after a mismatch."
        : "Recorded.",
    );
  return (
    <Pop
      label={TITLES[action]}
      variant={primary ? "primary" : "secondary"}
      title={TITLES[action]}
      lede={
        confirm
          ? "How it was confirmed, a second person, and why. The doctor will see it was filed by hand after a mismatch."
          : undefined
      }
      open={open}
      setOpen={setOpen}
      width={confirm ? "wide" : "medium"}
      action={
        <LabButton type="button" onClick={save} variant="primary" busy={pending}>
          Record
        </LabButton>
      }
    >
      {confirm ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="How it was confirmed">
            <select
              className={selectClass}
              value={f.method}
              onChange={(e) => setF({ ...f, method: e.target.value })}
            >
              <option value="">Choose</option>
              <option value="corrected_report">A corrected report came</option>
              <option value="phone_call">A phone call</option>
            </select>
          </Field>
          {f.method === "phone_call" ? (
            <Field label="Who you spoke to">
              <Input
                className={inputClass}
                value={f.spokeTo}
                onChange={(e) => setF({ ...f, spokeTo: e.target.value })}
                maxLength={120}
              />
            </Field>
          ) : null}
          <Field label="Second person">
            <select
              className={selectClass}
              value={f.second}
              onChange={(e) => setF({ ...f, second: e.target.value })}
            >
              <option value="">Choose</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
      <Field label="Why">
        <Input
          className={inputClass}
          value={f.reason}
          onChange={(e) => setF({ ...f, reason: e.target.value })}
          maxLength={1000}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}
