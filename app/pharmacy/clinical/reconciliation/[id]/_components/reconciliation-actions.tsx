"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RECON_UI as U } from "@/content/pharmacy-reconciliation";
import {
  ActButton,
  Field,
  newKey,
  SELECT,
  StoreDialog,
  str,
  TARGET,
} from "../../../../store/places/_components/store-kit";
import { recordReconciliationEvent } from "../../../actions";

function Explain({
  reconciliationId,
  discrepancy,
  reasons,
}: {
  reconciliationId: string;
  discrepancy: string;
  reasons: readonly string[];
}) {
  return (
    <StoreDialog
      label={U.explain}
      title={U.explain}
      submit={U.save}
      disabled={!reasons.length}
      onSave={(clientKey, d) =>
        recordReconciliationEvent({
          clientKey,
          reconciliationId,
          kind: "explained",
          discrepancy,
          reason: str(d, "reason"),
        })
      }
    >
      <Field label={U.explainReason} id="reason">
        <select id="reason" name="reason" className={SELECT} required>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
    </StoreDialog>
  );
}

/** MR-4 and MR-6: confirm (off with its reasons shown), add a discrepancy, close with a reason, print the sheet. */
function Bar({
  reconciliationId,
  blockers,
  confirmed,
}: {
  reconciliationId: string;
  blockers: readonly string[];
  confirmed: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <ActButton
          label={U.confirm}
          disabled={blockers.length > 0 || confirmed}
          run={() =>
            recordReconciliationEvent({ clientKey: newKey(), reconciliationId, kind: "confirmed" })
          }
        />
        {confirmed ? (
          <Button
            variant="secondary"
            className={TARGET}
            onClick={() => {
              void recordReconciliationEvent({
                clientKey: newKey(),
                reconciliationId,
                kind: "printed",
              });
              window.print();
            }}
          >
            {U.printSheet}
          </Button>
        ) : null}
        <StoreDialog
          label={U.addTitle}
          title={U.addTitle}
          submit={U.save}
          onSave={(clientKey, d) =>
            recordReconciliationEvent({
              clientKey,
              reconciliationId,
              kind: "added",
              reason: str(d, "reason"),
              note: str(d, "note"),
            })
          }
        >
          <Field label={U.explainReason} id="reason">
            <select id="reason" name="reason" className={SELECT} required>
              {Object.entries(U.addKinds).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label={U.note} id="note">
            <Input
              id="note"
              name="note"
              required
              minLength={2}
              maxLength={1000}
              className={TARGET}
            />
          </Field>
        </StoreDialog>
        {confirmed ? null : (
          <StoreDialog
            label={U.close}
            title={U.close}
            submit={U.save}
            onSave={(clientKey, d) =>
              recordReconciliationEvent({
                clientKey,
                reconciliationId,
                kind: "closed",
                reason: str(d, "reason"),
                note: str(d, "note"),
              })
            }
          >
            <Field label={U.explainReason} id="reason">
              <select id="reason" name="reason" className={SELECT} required>
                {Object.entries(U.closeReasons).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={U.note} id="note">
              <Input
                id="note"
                name="note"
                required
                minLength={2}
                maxLength={1000}
                className={TARGET}
              />
            </Field>
          </StoreDialog>
        )}
      </div>
      {blockers.length ? (
        <div className="text-body-s">
          <p>{U.confirmOff}</p>
          <ul className="list-disc pl-5">
            {blockers.slice(0, 8).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export const ReconciliationActions = { Explain, Bar };
