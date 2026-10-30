"use client";

import type { OpenCheck, Visibility } from "@/lib/lab/profiles";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { LockIcon, TriangleAlertIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LAB2 } from "@/content/lab-phase-2";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import {
  activateProfileAction,
  createProfileAction,
  resolveCheckAction,
  setVerifiedAction,
  setVisibilityAction,
} from "@/lib/lab/catalogue-v2-actions";
import { PROFILES as C } from "../_lib/copy";
import { LabButton } from "@/components/tide/work/button";
import { Field, Said, useAct } from "../../criticals/_components/setup-forms";

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";

/** "Add a profile" (§5.11): a model and a bench, in a centred dialog. The new draft opens on the page. */
export function AddProfile({ models }: { models: { id: string; display: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState("");
  const [bench, setBench] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const create = () =>
    start(async () => {
      const r = await createProfileAction({ modelId, bench: bench.trim() || null });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      setModelId("");
      setBench("");
      setError(null);
      router.push(`/lab/setup/profiles?open=${r.id}`, { scroll: false });
      router.refresh();
    });
  return (
    <EditorDialog
      width="medium"
      open={open}
      onOpenChange={setOpen}
      trigger={<DialogTrigger render={<Button />}>{C.add}</DialogTrigger>}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>{C.addTitle}</SheetTitle>
          <SheetDescription>{C.addLede}</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid gap-4 sm:grid-cols-2">
          <Field label={C.model}>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                {C.chooseModel}
              </option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display}
                </option>
              ))}
            </select>
          </Field>
          <Field label={C.bench}>
            <Input
              value={bench}
              onChange={(e) => setBench(e.target.value)}
              maxLength={60}
              className="min-h-11 sm:min-h-9"
            />
          </Field>
          <div className="sm:col-span-2">
            <Said message={error ? { ok: false, text: error } : null} />
          </div>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {C.cancel}
          </Button>
          <LabButton
            type="button"
            variant="primary"
            onClick={create}
            busy={pending}
            disabledReason={modelId ? null : LABWS2_SETUP.sweep.whyNoModel}
          >
            {C.create}
          </LabButton>
        </SheetFooter>
      </div>
    </EditorDialog>
  );
}

type Row = {
  code: string;
  concept: string;
  visibility: Visibility;
  display: string;
  verified: boolean;
};

/**
 * One profile opened (§5.11; AP-1..AP-4): who sees each code, the open questions, what still blocks it,
 * and "Use this profile" with a fresh second factor. Read-only once in use.
 */
export function ProfileDetail({
  id,
  title,
  editable,
  rows,
  research,
  checks,
  blockers,
}: {
  id: string;
  title: string;
  editable: boolean;
  rows: Row[];
  research: string[];
  checks: OpenCheck[];
  blockers: string[];
}) {
  const { pending, message, act, setMessage } = useAct();
  const [fresh, setFresh] = useState(false);
  const blockersId = useId();
  const activate = () =>
    act(async () => {
      const r = await activateProfileAction({ profileId: id });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to use this profile." };
      }
      return r;
    }, C.used);

  return (
    <section
      aria-labelledby="profile-heading"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="profile-heading" className="text-heading-s">
        {title}
      </h2>
      {!editable ? <p className="text-body-s text-muted-foreground">{C.readOnly}</p> : null}

      {checks.length ? (
        <section aria-labelledby="checks-heading" className="flex flex-col gap-2">
          <h3 id="checks-heading" className="text-body-s font-medium">
            {C.checksTitle}
          </h3>
          {checks.map((c) => (
            <CheckBlock
              key={c.code}
              check={c}
              editable={editable}
              pending={pending}
              onRecord={(resolution) =>
                act(
                  () => resolveCheckAction({ profileId: id, code: c.code, resolution }),
                  C.recorded,
                )
              }
            />
          ))}
        </section>
      ) : null}

      <div className="overflow-auto">
        <table className="text-body-s w-full border-collapse text-left">
          <thead>
            <tr className="bg-muted text-ink-600 text-caption">
              {C.columns.map((h) => (
                <th key={h} scope="col" className="border-border border-b px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.code} className="border-ink-150 border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">{m.code}</td>
                <td className="px-3 py-2">{m.display}</td>
                <td className="px-3 py-2">
                  {editable ? (
                    <select
                      aria-label={`Who sees ${m.code}`}
                      value={m.visibility}
                      disabled={pending}
                      onChange={(e) =>
                        act(
                          () =>
                            setVisibilityAction({
                              profileId: id,
                              code: m.code,
                              visibility: e.target.value,
                            }),
                          C.saved,
                        )
                      }
                      className={selectClass}
                    >
                      {(["clinician", "lab_only", "never"] as const).map((v) => (
                        <option key={v} value={v}>
                          {C.visibility[v]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    C.visibility[m.visibility]
                  )}
                </td>
                <td className="px-3 py-2">
                  {m.visibility === "never" ? (
                    <span className="text-muted-foreground">{C.notReleased}</span>
                  ) : (
                    <input
                      type="checkbox"
                      aria-label={C.verifiedLabel(m.code)}
                      checked={m.verified}
                      disabled={!editable || pending}
                      onChange={(e) =>
                        act(
                          () =>
                            setVerifiedAction({
                              profileId: id,
                              concept: m.concept,
                              verified: e.target.checked,
                            }),
                          C.saved,
                        )
                      }
                      className="size-4 accent-teal-600"
                    />
                  )}
                </td>
              </tr>
            ))}
            {research.length ? (
              <tr>
                <td className="px-3 py-2 font-mono">{research.join(", ")}</td>
                <td className="text-muted-foreground px-3 py-2">{LAB2.profile.researchUse}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    <LockIcon aria-hidden className="size-3.5" />
                    {C.visibility.never}
                  </span>
                </td>
                <td className="text-muted-foreground px-3 py-2">{C.notReleased}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editable ? (
        <section aria-labelledby="blockers-heading" className="flex flex-col gap-2">
          <h3 id="blockers-heading" className="text-body-s font-medium">
            {C.blockersTitle}
          </h3>
          <div id={blockersId}>
            {blockers.length ? (
              <ul className="text-body-s flex list-disc flex-col gap-0.5 pl-5">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="text-body-s">{C.noBlockers}</p>
            )}
          </div>
          {fresh ? (
            <FreshFactor
              onCancel={() => setFresh(false)}
              onConfirmed={() => {
                setFresh(false);
                setMessage(null);
                activate();
              }}
            />
          ) : (
            <div>
              <LabButton
                type="button"
                onClick={activate}
                aria-describedby={blockers.length ? blockersId : undefined}
                variant="primary"
                busy={pending}
                disabledReason={blockers.length > 0 ? LABWS2.reasons.problemsAbove : null}
              >
                {C.use}
              </LabButton>
            </div>
          )}
        </section>
      ) : null}
      <Said message={message} />
    </section>
  );
}

function CheckBlock({
  check,
  editable,
  pending,
  onRecord,
}: {
  check: OpenCheck;
  editable: boolean;
  pending: boolean;
  onRecord: (resolution: string) => void;
}) {
  const [text, setText] = useState("");
  if (check.resolution?.trim())
    return (
      <div className="border-border text-body-s rounded-md border p-3">
        <span className="font-mono">{check.code}</span> · {check.question}
        <p className="text-muted-foreground">{C.answered(check.resolution)}</p>
      </div>
    );
  return (
    <div className="bg-status-caution-bg text-body-s dark:text-status-caution-fg flex flex-col gap-2 rounded-md p-3 text-amber-800">
      <p className="flex items-start gap-1.5">
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span className="font-mono">{check.code}</span> · {check.question}
        </span>
      </p>
      {editable ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span>{C.found}</span>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              className="text-foreground min-h-11 min-w-64 sm:min-h-9"
            />
          </label>
          <LabButton
            type="button"
            variant="secondary"
            onClick={() => onRecord(text)}
            busy={pending}
            disabledReason={text.trim().length < 3 ? LABWS2_SETUP.sweep.whyShortNote : null}
          >
            {C.record}
            <span className="sr-only"> {check.code}</span>
          </LabButton>
        </div>
      ) : null}
    </div>
  );
}
