"use client";

import { useState } from "react";

import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Input } from "@/components/ui/input";
import {
  createPairingCodeAction,
  enableSenderAction,
  fileElectronicResultAction,
  openRawAction,
  retryOrSetAsideAction,
  revokeSenderAction,
} from "@/lib/lab/exchange-actions";
import { inputClass, newKey, Pop, selectClass } from "../../_components/pop";
import { LabButton } from "../../_components/v2/button";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

/* Connections (Lab Phase 4 §5.6): pairing (AB-6, B3), revoking, dead letters (EX-4), the raw view (EX-9). */

/** A one-time pairing code, shown once in this pop-up and never again. */
export function PairDialog({ partners }: { partners: { id: string; name: string }[] }) {
  const { pending, message, act, setMessage } = useAct();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [f, setF] = useState({ kind: "partner", partnerId: "", name: "" });
  const [code, setCode] = useState<string | null>(null);
  const save = () =>
    act(async () => {
      const r = await createPairingCodeAction({
        kind: f.kind,
        partnerId: f.kind === "partner" ? f.partnerId || null : null,
        name: f.name,
      });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to make a code." };
      }
      if (r.ok && r.data) setCode(r.data.code);
      return r;
    }, "Give this code to the person setting up the machine. It is shown once and expires in 30 minutes.");
  return (
    <Pop
      label="Pair a machine"
      title="Pair a machine"
      lede="A partner's system or a bridge in this lab. The code works once, expires in 30 minutes and locks after 10 wrong tries."
      open={open}
      setOpen={(o) => {
        setOpen(o);
        if (!o) setCode(null);
      }}
      action={
        code || fresh ? null : (
          <LabButton type="button" onClick={save} variant="primary" busy={pending}>
            Make the code
          </LabButton>
        )
      }
    >
      {fresh ? (
        <FreshFactor
          onCancel={() => setFresh(false)}
          onConfirmed={() => {
            setFresh(false);
            setMessage(null);
            save();
          }}
        />
      ) : null}
      {code ? (
        <p className="text-heading-m font-mono tracking-widest" aria-label="Pairing code">
          {code}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="What it is">
            <select
              className={selectClass}
              value={f.kind}
              onChange={(e) => setF({ ...f, kind: e.target.value })}
            >
              <option value="partner">A partner&apos;s system</option>
              <option value="bridge">A bridge in this lab</option>
            </select>
          </Field>
          {f.kind === "partner" ? (
            <Field label="Partner">
              <select
                className={selectClass}
                value={f.partnerId}
                onChange={(e) => setF({ ...f, partnerId: e.target.value })}
              >
                <option value="">Choose</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Name">
            <Input
              className={inputClass}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              maxLength={120}
            />
          </Field>
        </div>
      )}
      <Said message={message} />
    </Pop>
  );
}

/** B3: type the fingerprint the machine shows; MedSync compares it with the key it received. */
export function EnableDialog({ senderId, name }: { senderId: string; name: string }) {
  const { pending, message, act, setMessage } = useAct();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [fingerprint, setFingerprint] = useState("");
  const save = () =>
    act(async () => {
      const r = await enableSenderAction({ senderId, fingerprint });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to enable it." };
      }
      if (r.ok) setOpen(false);
      return r;
    }, "Enabled.");
  return (
    <Pop
      label="Check and enable"
      sr={name}
      title={`Enable ${name}`}
      lede="Read the fingerprint from the machine's own screen or its maker, not from an email, and type it here."
      open={open}
      setOpen={setOpen}
      action={
        fresh ? null : (
          <LabButton type="button" onClick={save} variant="primary" busy={pending}>
            Enable
          </LabButton>
        )
      }
    >
      <Field label="Fingerprint the machine shows">
        <Input
          className={`${inputClass} font-mono`}
          value={fingerprint}
          onChange={(e) => setFingerprint(e.target.value)}
          maxLength={80}
        />
      </Field>
      {fresh ? (
        <FreshFactor
          onCancel={() => setFresh(false)}
          onConfirmed={() => {
            setFresh(false);
            setMessage(null);
            save();
          }}
        />
      ) : null}
      <Said message={message} />
    </Pop>
  );
}

export function RevokeDialog({ senderId, name }: { senderId: string; name: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  return (
    <Pop
      label="Revoke"
      sr={name}
      variant="ghost"
      title={`Revoke ${name}`}
      lede="It stops at once: its next request is refused. Messages already received are kept."
      open={open}
      setOpen={setOpen}
      action={
        <LabButton
          type="button"
          onClick={() =>
            act(async () => {
              const r = await revokeSenderAction({ senderId });
              if (r.ok) setOpen(false);
              return r;
            }, "Revoked.")
          }
          variant="primary"
          busy={pending}
        >
          Revoke
        </LabButton>
      }
    >
      <Said message={message} />
    </Pop>
  );
}

/** EX-4: a message that stopped trying. Fix the cause first, then retry; or set it aside with a reason. */
export function DeadDialog({
  messageId,
  action,
}: {
  messageId: string;
  action: "retry" | "set_aside";
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const title = action === "retry" ? "Fix the cause, then retry" : "Set aside";
  return (
    <Pop
      label={title}
      variant={action === "retry" ? "primary" : "secondary"}
      title={title}
      open={open}
      setOpen={setOpen}
      action={
        <LabButton
          type="button"
          onClick={() =>
            act(async () => {
              const r = await retryOrSetAsideAction({ messageId, action, reason });
              if (r.ok) setOpen(false);
              return r;
            }, "Recorded.")
          }
          variant="primary"
          busy={pending}
        >
          Record
        </LabButton>
      }
    >
      <Field label="Why">
        <Input
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

/** EX-9: the message as received, with patient details, after an audited reason. Closing the pop-up drops it. */
export function RawDialog({ messageId }: { messageId: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <Pop
      label="Open the message"
      variant="ghost"
      title="The message as received"
      lede="It shows patient details. Your reason and the time are recorded."
      width="wide"
      open={open}
      setOpen={(o) => {
        setOpen(o);
        if (!o) setRaw(null);
      }}
      action={
        raw ? null : (
          <LabButton
            type="button"
            onClick={() =>
              act(async () => {
                const r = await openRawAction({ messageId, reason });
                if (r.ok && r.data) setRaw(r.data.raw);
                return r;
              }, "Opened. This is recorded.")
            }
            variant="primary"
            busy={pending}
          >
            Open
          </LabButton>
        )
      }
    >
      {raw ? (
        <pre className="bg-muted text-caption max-h-[50vh] overflow-auto rounded-md p-3 font-mono whitespace-pre-wrap">
          {raw}
        </pre>
      ) : (
        <Field label="Why you need to see it">
          <Input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </Field>
      )}
      <Said message={message} />
    </Pop>
  );
}

/** RB-10: a partner's result matched its referral; a lab user files it on the order. */
export function FileButton({ messageId }: { messageId: string }) {
  const { pending, message, act } = useAct();
  const [clientKey] = useState(newKey);
  return (
    <div className="flex flex-col gap-1">
      <LabButton
        type="button"
        className="min-h-11 w-fit sm:min-h-8"
        onClick={() =>
          act(() => fileElectronicResultAction({ messageId, clientKey }), "Filed on the order.")
        }
        variant="primary"
        busy={pending}
      >
        File on the order
      </LabButton>
      <Said message={message} />
    </div>
  );
}
