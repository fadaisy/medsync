"use client";

import { useState } from "react";

import { Pop, selectClass } from "@/app/lab/_components/pop";
import { Said, useAct } from "@/app/lab/setup/criticals/_components/setup-forms";
import { SignButton } from "@/app/lab/setup/drafts/_components/sign-button";
import { Button } from "@/components/ui/button";
import { LAB3_HMIS, LAB3_HMIS_DESK } from "@/content/lab-phase-3";
import {
  coSignHmisMappingAction,
  endDesignationAction,
  setDesignationAction,
  signHmis105Action,
} from "@/lib/lab/hmis-actions";

const D = LAB3_HMIS_DESK;

/** HM-10: the In-Charge's signature (fresh second factor, asked in place). */
export function SignReport({ month, revision }: { month: string; revision: number }) {
  return (
    <SignButton
      label={LAB3_HMIS.sign}
      okText={LAB3_HMIS.signedOk}
      authoredByMe={false}
      noteLabel=""
      onSign={() => signHmis105Action({ month, revision })}
    />
  );
}

/** HM-2: the HMIS focal person's co-signature on the lead-signed mapping. */
export function CoSignMapping({ configId }: { configId: string }) {
  return (
    <SignButton
      label={D.coSign}
      okText={D.coSigned}
      authoredByMe={false}
      noteLabel=""
      onSign={() => coSignHmisMappingAction({ configId, exceptionNote: null })}
    />
  );
}

/** E-LAB3-11: the hospital admin designates the In-Charge and the focal person (audited by trigger). */
export function Designate({
  staff,
  today,
}: {
  staff: { id: string; name: string }[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ role: "in_charge", userId: staff[0]?.id ?? "", startsOn: today });
  const { pending, message, act } = useAct();
  return (
    <Pop
      label={D.designate}
      title={D.designate}
      lede={D.designationsLede}
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await setDesignationAction(f);
              if (r.ok) setOpen(false);
              return r;
            }, D.saved)
          }
        >
          {D.designate}
        </Button>
      }
    >
      <label className="text-body-s flex flex-col gap-1">
        <span className="text-muted-foreground">{D.role}</span>
        <select
          className={selectClass}
          value={f.role}
          onChange={(e) => setF({ ...f, role: e.target.value })}
        >
          <option value="in_charge">{D.roles.in_charge}</option>
          <option value="focal">{D.roles.focal}</option>
        </select>
      </label>
      <label className="text-body-s flex flex-col gap-1">
        <span className="text-muted-foreground">{D.person}</span>
        <select
          className={selectClass}
          value={f.userId}
          onChange={(e) => setF({ ...f, userId: e.target.value })}
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-body-s flex flex-col gap-1">
        <span className="text-muted-foreground">{D.from}</span>
        <input
          type="date"
          className={selectClass}
          value={f.startsOn}
          onChange={(e) => setF({ ...f, startsOn: e.target.value })}
        />
      </label>
      <Said message={message} />
    </Pop>
  );
}

export function EndDesignation({ id, today, who }: { id: string; today: string; who: string }) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => act(() => endDesignationAction({ id, endsOn: today }), D.ended)}
      >
        {D.end}
        <span className="sr-only"> {who}</span>
      </Button>
      <Said message={message} />
    </div>
  );
}
