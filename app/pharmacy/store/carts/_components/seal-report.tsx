"use client";

import type { Act } from "../../wards/_components/ward-dialogs";

import { Input } from "@/components/ui/input";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { ActionDialog, Field } from "../../wards/_components/ward-dialogs";

/** 4.14 (ADR 0465): a cart's seal reported broken. The cart goes on the check list; no stock moves. */
export function SealReport({ locationId, report }: { locationId: string; report: Act }) {
  const S = CATALOGUE.seal;
  return (
    <ActionDialog
      label={S.report}
      title={S.title}
      description={S.lede}
      submit={S.save}
      width="medium"
      onSave={async (_k, d) =>
        report({ locationId, note: String(d.get("note") ?? "").trim() || null })
      }
    >
      <Field label={S.note} id={`seal-note-${locationId}`}>
        <Input id={`seal-note-${locationId}`} name="note" maxLength={300} />
      </Field>
    </ActionDialog>
  );
}
