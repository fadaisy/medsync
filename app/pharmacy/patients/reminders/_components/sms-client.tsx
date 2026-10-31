"use client";

import type { SmsRule } from "@/db/schema/pharmacy-rework-patients";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ActionDialog, Field, inputCls } from "@/app/pharmacy/patients/_components/kit";
import { smsBuildAction, smsMessageAction, smsRuleAction, smsSendAllAction } from "@/app/pharmacy/patients/actions";
import { LabButton } from "@/components/tide/work/button";
import { fill, PRW } from "@/content/pharmacy-rework-patients";

const S = PRW.sms;

/** A one-tap action button: runs, shows a refusal in words beside it, refreshes on success. */
function Run({ label, run, variant = "secondary", blocked }: { label: string; run: () => Promise<{ ok: boolean; error?: string }>; variant?: "primary" | "secondary" | "text"; blocked?: string | null }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col">
      <LabButton
        variant={variant}
        size="sm"
        busy={pending}
        disabledReason={blocked ?? null}
        onClick={() =>
          start(async () => {
            const r = await run();
            setErr(r.ok ? null : (r.error ?? PRW.common.failed));
            if (r.ok) router.refresh();
          })
        }
      >
        {label}
      </LabButton>
      {err ? (
        <span role="alert" className="text-caption">
          {err}
        </span>
      ) : null}
    </span>
  );
}

export function BuildButton() {
  return <Run variant="primary" label={S.build} run={() => smsBuildAction()} />;
}

export function MessageActions({ id, status, connected }: { id: string; status: string; connected: boolean }) {
  const off = connected ? null : S.notConnected;
  if (status === "scheduled")
    return (
      <span className="flex flex-wrap gap-1">
        <Run label={S.sendNow} blocked={off} run={() => smsMessageAction({ id, act: "send" })} />
        <Run variant="text" label={S.skip} run={() => smsMessageAction({ id, act: "skip" })} />
        <Run variant="text" label={S.recordOptOut} run={() => smsMessageAction({ id, act: "optout" })} />
      </span>
    );
  if (status === "failed")
    return (
      <span className="flex flex-wrap gap-1">
        <Run label={S.retry} blocked={off} run={() => smsMessageAction({ id, act: "send" })} />
        <Run variant="text" label={S.called} run={() => smsMessageAction({ id, act: "called" })} />
      </span>
    );
  return null;
}

export function SendAll({ ids, connected }: { ids: string[]; connected: boolean }) {
  if (!ids.length) return null;
  return <Run variant="primary" label={S.sendAll} blocked={connected ? null : S.notConnected} run={() => smsSendAllAction({ ids })} />;
}

export function RuleRow({ rule, enabled, en, lg }: { rule: SmsRule; enabled: boolean; en: string | null; lg: string | null }) {
  const [open, setOpen] = useState(false);
  const [e, setE] = useState(en ?? S.templates[rule]!.en);
  const [l, setL] = useState(lg ?? S.templates[rule]!.lg);
  const base = S.templates[rule]!;
  const keep = (v: string, d: string) => (v.trim() === d ? null : v.trim());
  return (
    <span className="flex flex-wrap gap-1">
      <Run
        label={enabled ? S.turnOff : S.turnOn}
        run={() => smsRuleAction({ rule, enabled: !enabled, en, lg })}
      />
      <LabButton variant="text" size="sm" onClick={() => setOpen(true)}>
        {S.edit}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        wide
        title={fill(S.editTitle, { rule: S.rules[rule]! })}
        submit={PRW.common.save}
        blocked={e.trim().length < 10 ? S.english : null}
        foot={S.templateDraft}
        run={() => smsRuleAction({ rule, enabled, en: keep(e, base.en), lg: keep(l, base.lg) })}
      >
        <p className="text-body-s">{S.slots}</p>
        <Field label={`${S.english} · ${e.length}/160`}>
          <textarea className={`${inputCls} h-auto py-2`} rows={3} maxLength={160} value={e} onChange={(x) => setE(x.target.value)} />
        </Field>
        <Field label={`${S.luganda} · ${l.length}/160`}>
          <textarea className={`${inputCls} h-auto py-2`} rows={3} maxLength={160} value={l} onChange={(x) => setL(x.target.value)} />
        </Field>
        <p className="text-caption text-muted-foreground">{S.lugandaDraft}</p>
      </ActionDialog>
    </span>
  );
}
