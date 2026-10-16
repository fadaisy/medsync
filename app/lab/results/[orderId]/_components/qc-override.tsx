"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputClass, Pop } from "../../../_components/pop";
import { QUALITY } from "../../../quality/_lib/copy";

const H = QUALITY.hold;

/**
 * QH-4: the override dialog, loaded only when the card shows (holders of lab.qc.override, while a hold stands), so
 * the result page does not carry the dialog's code for everyone else (§11, added JS).
 */
export default function QcOverride({
  held,
  pending,
  open,
  setOpen,
  release,
}: {
  held: string[];
  pending: boolean;
  open: boolean;
  setOpen: (o: boolean) => void;
  release: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Pop
      label={H.override(held.join(", "))}
      title={H.override(held.join(", "))}
      lede={H.overrideLede}
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          onClick={() => release(reason)}
          disabled={pending || reason.trim().length < 3}
        >
          {H.override(held.join(", "))}
        </Button>
      }
    >
      <label className="text-body-s flex flex-col gap-1">
        <span className="text-muted-foreground">{H.reason}</span>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          className={inputClass}
        />
      </label>
    </Pop>
  );
}
