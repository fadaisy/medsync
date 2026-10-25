"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REACTIONS_UI as U } from "@/content/pharmacy-clinical";
import { DateField } from "../../../../../lab/_components/v2/fields";
import {
  Field,
  newKey,
  SELECT,
  StoreDialog,
  str,
  TARGET,
} from "../../../../store/places/_components/store-kit";
import { recordReportEvent } from "../../../actions";

/** AR-6 on one report: causality, print and copy (both logged), submitted (route and date) or closed with a reason. */
export function ReportActions({
  reportId,
  text,
  state,
}: {
  reportId: string;
  text: string;
  state: "to_submit" | "submitted" | "closed_not_submitted";
}) {
  const [copied, setCopied] = useState(false);
  const log = (kind: "printed" | "copied") =>
    void recordReportEvent({ clientKey: newKey(), reportId, kind });
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button
        variant="secondary"
        className={TARGET}
        onClick={() => {
          log("printed");
          window.print();
        }}
      >
        {U.print}
      </Button>
      <Button
        variant="secondary"
        className={TARGET}
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          log("copied");
          setCopied(true);
        }}
      >
        {copied ? U.copied : U.copy}
      </Button>
      <StoreDialog
        label={U.causality}
        title={U.causality}
        submit={U.save}
        onSave={(clientKey, d) =>
          recordReportEvent({
            clientKey,
            reportId,
            kind: "causality",
            causality: str(d, "causality"),
          })
        }
      >
        <Field label={U.causality} id="causality">
          <select id="causality" name="causality" className={SELECT} required>
            {Object.entries(U.causalities).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </StoreDialog>
      {state === "to_submit" ? (
        <>
          <StoreDialog
            label={U.submitted}
            title={U.submitted}
            description={U.notSent}
            submit={U.save}
            variant="primary"
            onSave={(clientKey, d) =>
              recordReportEvent({
                clientKey,
                reportId,
                kind: "submitted",
                route: str(d, "route"),
                submittedOn: str(d, "submittedOn"),
                reference: str(d, "reference") || null,
              })
            }
          >
            <Field label={U.route} id="route">
              <select id="route" name="route" className={SELECT} required>
                {U.routes.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <DateField label={U.submittedOn} name="submittedOn" required />
            <Field label={U.reference} id="reference">
              <Input id="reference" name="reference" maxLength={120} className={TARGET} />
            </Field>
          </StoreDialog>
          <StoreDialog
            label={U.close}
            title={U.close}
            submit={U.save}
            onSave={(clientKey, d) =>
              recordReportEvent({
                clientKey,
                reportId,
                kind: "closed_not_submitted",
                note: str(d, "note"),
              })
            }
          >
            <Field label={U.closeReason} id="note">
              <Input
                id="note"
                name="note"
                minLength={3}
                maxLength={1000}
                required
                className={TARGET}
              />
            </Field>
          </StoreDialog>
        </>
      ) : null}
    </div>
  );
}
