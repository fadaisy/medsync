"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Input } from "@/components/ui/input";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import {
  approveSmsTemplateAction,
  editSmsTemplateAction,
  saveLabSettingsAction,
  saveResponseDraftAction,
  seedSmsTemplatesAction,
  setContactsAction,
  signResponseAsLeadAction,
} from "@/lib/lab/criticals/setup-actions";
import { LabButton } from "@/components/tide/work/button";

/**
 * Critical-results set-up forms (§5.8). Every value is typed by the hospital: no field ships with a
 * number in it (Law 5, D-LAB1-08). Each form says its outcome in a polite live region and re-reads.
 */

type Result = { ok: true } | { ok: false; error: string };

export function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const act = (fn: () => Promise<Result>, okText: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: okText });
      router.refresh();
    });
  return { pending, message, act, setMessage };
}

export function Said({ message }: { message: { ok: boolean; text: string } | null }) {
  return (
    <p role="status" aria-live="polite" className="text-body-s min-h-5">
      {message ? (
        message.ok ? (
          message.text
        ) : (
          <StatusWord tone="caution">{message.text}</StatusWord>
        )
      ) : null}
    </p>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-body-s flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const minutesOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function SettingsForm({
  initial,
}: {
  initial: { labPhone: string | null; secondCheck: boolean; smsLive: boolean };
}) {
  const { pending, message, act } = useAct();
  const [labPhone, setLabPhone] = useState(initial.labPhone ?? "");
  const [secondCheck, setSecondCheck] = useState(initial.secondCheck);
  const [smsLive, setSmsLive] = useState(initial.smsLive);
  return (
    <div className="flex flex-col gap-3">
      <Field label="The lab's phone number (shown to doctors as Call the lab)">
        <Input
          name="labPhone"
          value={labPhone}
          onChange={(e) => setLabPhone(e.target.value)}
          maxLength={40}
          className="min-h-11 max-w-xs sm:min-h-9"
        />
      </Field>
      <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
        <input
          type="checkbox"
          checked={secondCheck}
          onChange={(e) => setSecondCheck(e.target.checked)}
          className="size-4 accent-teal-600"
        />
        A second lab user checks every critical before release (or the technologist records why they
        are working alone)
      </label>
      <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
        <input
          type="checkbox"
          checked={smsLive}
          onChange={(e) => setSmsLive(e.target.checked)}
          className="size-4 accent-teal-600"
        />
        Send SMS (only from approved templates, to staff numbers on file; turning this on confirms
        the numbers are right)
      </label>
      <div>
        <LabButton
          type="button"
          onClick={() =>
            act(
              () =>
                saveLabSettingsAction({ labPhone: labPhone.trim() || null, secondCheck, smsLive }),
              "Settings saved.",
            )
          }
          variant="primary"
          busy={pending}
        >
          Save settings
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}

export function ResponseDraftForm({
  draft,
}: {
  draft: {
    ackWithinMin: number;
    level1AfterMin: number | null;
    level2AfterMin: number | null;
    source: string;
  } | null;
}) {
  const { pending, message, act } = useAct();
  const [ack, setAck] = useState(draft ? String(draft.ackWithinMin) : "");
  const [l1, setL1] = useState(draft?.level1AfterMin != null ? String(draft.level1AfterMin) : "");
  const [l2, setL2] = useState(draft?.level2AfterMin != null ? String(draft.level2AfterMin) : "");
  const [source, setSource] = useState(draft?.source ?? "");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Acknowledge within (minutes)">
          <Input
            name="ackWithinMin"
            value={ack}
            onChange={(e) => setAck(e.target.value)}
            inputMode="numeric"
            className="min-h-11 w-32 tabular-nums sm:min-h-9"
          />
        </Field>
        <Field label="Then level 1, waiting (minutes)">
          <Input
            name="level1AfterMin"
            value={l1}
            onChange={(e) => setL1(e.target.value)}
            inputMode="numeric"
            className="min-h-11 w-32 tabular-nums sm:min-h-9"
          />
        </Field>
        <Field label="At level 2, overdue after (minutes)">
          <Input
            name="level2AfterMin"
            value={l2}
            onChange={(e) => setL2(e.target.value)}
            inputMode="numeric"
            className="min-h-11 w-32 tabular-nums sm:min-h-9"
          />
        </Field>
      </div>
      <Field label="Source (the lab's procedure, the guidance consulted)">
        <Input
          name="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          maxLength={500}
          className="min-h-11 sm:min-h-9"
        />
      </Field>
      <div>
        <LabButton
          type="button"
          variant="secondary"
          busy={pending}
          disabledReason={ack.trim() === "" ? LABWS2_SETUP.sweep.whyNoAck : null}
          onClick={() =>
            act(
              () =>
                saveResponseDraftAction({
                  ackWithinMin: Number(ack),
                  level1AfterMin: minutesOrNull(l1),
                  level2AfterMin: minutesOrNull(l2),
                  source,
                }),
              "Draft saved. It is not in force until it is signed.",
            )
          }
        >
          Save draft
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}

export function SignAsLead({ versionId, author }: { versionId: string; author: boolean }) {
  const { pending, message, act, setMessage } = useAct();
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const sign = () =>
    act(async () => {
      const r = await signResponseAsLeadAction({ versionId, exceptionNote: note.trim() || null });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to sign." };
      }
      return r;
    }, "Signed as laboratory lead. The CSO signs next.");
  return (
    <div className="flex flex-col gap-2">
      {author ? (
        <Field label="You wrote this draft. If no other laboratory lead can sign, say why">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="min-h-11 sm:min-h-9"
          />
        </Field>
      ) : null}
      {fresh ? (
        <FreshFactor
          onCancel={() => setFresh(false)}
          onConfirmed={() => {
            setFresh(false);
            setMessage(null);
            sign();
          }}
        />
      ) : (
        <div>
          <LabButton type="button" onClick={sign} variant="primary" busy={pending}>
            Sign as laboratory lead
          </LabButton>
        </div>
      )}
      <Said message={message} />
    </div>
  );
}

export function ContactsEditor({
  departmentId,
  level,
  chosen,
  options,
}: {
  departmentId: string | null;
  level: 1 | 2;
  chosen: { userId: string; name: string }[];
  options: { userId: string; label: string }[];
}) {
  const { pending, message, act } = useAct();
  const [list, setList] = useState(chosen);
  const [pick, setPick] = useState("");
  const save = (next: { userId: string; name: string }[]) => {
    setList(next);
    act(
      () => setContactsAction({ departmentId, level, userIds: next.map((p) => p.userId) }),
      "Contacts saved.",
    );
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    save(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1">
        {list.map((p, i) => (
          <li key={p.userId} className="text-body-s flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground w-5 tabular-nums">{i + 1}.</span>
            <span className="min-w-0 flex-1">{p.name}</span>
            <LabButton
              type="button"
              size="sm"
              variant="quiet"
              onClick={() => move(i, -1)}
              className="min-h-11 sm:min-h-7"
              busy={pending}
              disabledReason={i === 0 ? LABWS2.reasons.alreadyFirst : null}
            >
              Up
            </LabButton>
            <LabButton
              type="button"
              size="sm"
              variant="quiet"
              onClick={() => move(i, 1)}
              className="min-h-11 sm:min-h-7"
              busy={pending}
              disabledReason={i === list.length - 1 ? LABWS2.reasons.alreadyLast : null}
            >
              Down
            </LabButton>
            <LabButton
              type="button"
              size="sm"
              variant="quiet"
              onClick={() => save(list.filter((x) => x.userId !== p.userId))}
              className="min-h-11 sm:min-h-7"
              busy={pending}
            >
              Remove
            </LabButton>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Add a contact"
          name={`contact-${departmentId ?? "hospital"}`}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9"
        >
          <option value="">Add a clinician</option>
          {options
            .filter((o) => !list.some((p) => p.userId === o.userId))
            .map((o) => (
              <option key={o.userId} value={o.userId}>
                {o.label}
              </option>
            ))}
        </select>
        <LabButton
          type="button"
          size="sm"
          variant="secondary"
          busy={pending}
          disabledReason={pick ? null : LABWS2_SETUP.sweep.whyNoPick}
          onClick={() => {
            const o = options.find((x) => x.userId === pick);
            if (o) save([...list, { userId: o.userId, name: o.label }]);
            setPick("");
          }}
          className="min-h-11 sm:min-h-7"
        >
          Add
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}

export function TemplateEditor({
  kind,
  label,
  current,
  pendingReview,
  draft,
  me,
}: {
  kind: "level0" | "escalation";
  label: string;
  current: { id: string; body: string } | null;
  pendingReview: { id: string; body: string; firstApprover: string | null } | null;
  draft: { id: string; body: string } | null;
  me: string;
}) {
  const { pending, message, act } = useAct();
  const [body, setBody] = useState(draft?.body ?? pendingReview?.body ?? current?.body ?? "");
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-s font-medium">{label}</p>
      <p className="text-body-s">
        {current ? (
          <>
            <StatusWord>Approved</StatusWord>{" "}
            <span className="text-muted-foreground">{current.body}</span>
          </>
        ) : (
          <StatusWord tone="caution">No approved message: SMS will not send</StatusWord>
        )}
      </p>
      <textarea
        aria-label={`${label} wording`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={320}
        className="border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border px-2.5 py-2 outline-none"
      />
      <span className="text-caption text-muted-foreground">
        Use {"{place}"} and {"{lab number}"} only. No patient, test or value.
      </span>
      <div className="flex flex-wrap gap-2">
        <LabButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => act(() => editSmsTemplateAction({ kind, body }), "Saved as a draft.")}
          className="min-h-11 sm:min-h-7"
          busy={pending}
        >
          Save wording
        </LabButton>
        {draft ? (
          <LabButton
            type="button"
            size="sm"
            onClick={() =>
              act(
                () => approveSmsTemplateAction({ templateId: draft.id }),
                "Approved once. A second person approves it next.",
              )
            }
            className="min-h-11 sm:min-h-7"
            variant="primary"
            busy={pending}
          >
            Approve (first of two)
          </LabButton>
        ) : null}
        {pendingReview ? (
          <LabButton
            type="button"
            size="sm"
            onClick={() =>
              act(
                () => approveSmsTemplateAction({ templateId: pendingReview.id }),
                "Approved. This wording now sends.",
              )
            }
            className="min-h-11 sm:min-h-7"
            variant="primary"
            busy={pending}
            disabledReason={
              pendingReview.firstApprover === me ? LABWS2.reasons.secondApprover : null
            }
          >
            {pendingReview.firstApprover === me
              ? "Waiting for a second approver"
              : "Approve (second of two)"}
          </LabButton>
        ) : null}
      </div>
      <Said message={message} />
    </div>
  );
}

export function SeedTemplates() {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <LabButton
          type="button"
          variant="secondary"
          onClick={() => act(() => seedSmsTemplatesAction(), "Draft messages added.")}
          busy={pending}
        >
          Start from the draft messages
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}
