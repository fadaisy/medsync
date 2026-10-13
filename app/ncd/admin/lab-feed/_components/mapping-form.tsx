"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Button } from "@/components/ui/button";
import { saveFieldMappingAction, signFieldMappingAction } from "@/lib/ncd/lab-feed-actions";

const input = "border-input h-9 rounded-lg border bg-transparent px-2 text-[14px]";
const METHODS = [
  ["lab", "Lab"],
  ["bedside", "Bedside"],
] as const;

/**
 * NF-1, D-LAB2-14: one field's mapping as the registry lead drafts it. No value is defaulted in code: the
 * concept and unit start from the suggestion, no method is ticked and the window is empty. Signing asks for
 * a fresh second factor in place.
 */
export function MappingForm({
  field,
  initial,
  openDraft,
}: {
  field: string;
  initial: { concept: string; unit: string; methods: string[]; windowDays: string };
  /** The unsigned draft, if one is open: the lead signs it here. */
  openDraft: { id: string; authoredByMe: boolean } | null;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const days = Number(v.windowDays);

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveFieldMappingAction({
        field,
        concept: v.concept.trim(),
        unit: v.unit.trim(),
        methods: v.methods,
        windowDays: v.windowDays.trim() === "" ? null : days,
      });
      setMsg(r.ok ? "Draft saved." : r.error);
      if (r.ok) router.refresh();
    });
  const sign = () =>
    start(async () => {
      if (!openDraft) return;
      setMsg(null);
      const r = await signFieldMappingAction({
        configId: openDraft.id,
        exceptionNote: note.trim() || null,
      });
      if (needsFreshFactor(r)) return setFresh(true);
      setMsg(r.ok ? "Signed. Waiting for the CSO." : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <fieldset disabled={pending} className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-label">Result (concept)</span>
          <input
            className={`${input} w-56 font-mono`}
            value={v.concept}
            onChange={(e) => setV({ ...v, concept: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label">Unit</span>
          <input
            className={`${input} w-40 font-mono`}
            value={v.unit}
            onChange={(e) => setV({ ...v, unit: e.target.value })}
          />
        </label>
        <div role="group" aria-label="Accepted methods" className="flex flex-col gap-1">
          <span className="text-label">Accepted methods</span>
          <div className="flex h-9 items-center gap-4">
            {METHODS.map(([code, word]) => (
              <label key={code} className="text-body-s inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={v.methods.includes(code)}
                  onChange={(e) =>
                    setV({
                      ...v,
                      methods: e.target.checked
                        ? [...v.methods, code]
                        : v.methods.filter((m) => m !== code),
                    })
                  }
                />
                {word}
              </label>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-label">Look-back window, days</span>
          <input
            className={`${input} w-24 font-mono`}
            inputMode="numeric"
            value={v.windowDays}
            onChange={(e) => setV({ ...v, windowDays: e.target.value })}
          />
        </label>
        <Button type="button" variant="secondary" onClick={save}>
          Save draft
        </Button>
      </fieldset>
      {openDraft ? (
        fresh ? (
          <FreshFactor
            onCancel={() => setFresh(false)}
            onConfirmed={() => {
              setFresh(false);
              sign();
            }}
          />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            {openDraft.authoredByMe ? (
              <label className="flex min-w-72 flex-1 flex-col gap-1">
                <span className="text-caption text-ink-600">
                  You wrote this draft. Another registry lead signs it, or say why no one else can.
                </span>
                <input
                  className={input}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            ) : null}
            <Button type="button" onClick={sign} disabled={pending}>
              Sign as registry lead
            </Button>
          </div>
        )
      ) : null}
      {msg ? (
        <p role="status" className="text-body-s text-ink-800">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
