"use client";

import type { CreateHospitalState } from "../../tenants/actions";
import { useActionState, useState } from "react";
import { CopyIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { createHospitalAction } from "../../tenants/actions";

/**
 * Superadmin-initiated hospital creation (GATE E §G).
 *
 * Opens a right-anchored Sheet with the create form. On success, the
 * sheet flips to a "share this link with your admin" view containing
 * the plaintext invitation token + the claim URL. Email delivery is
 * a follow-up; for now the superadmin copies the URL and shares
 * out-of-band.
 *
 * Per ADR 0018: verification friction relaxes, agreement gate + setup
 * wizard do NOT — the form requires offline-evidence path + signatory
 * details, and the wizard runs as the invitee's session after they
 * claim the role.
 */

const FACILITY_LEVELS = [
  { value: "hc_ii", label: "Health Centre II" },
  { value: "hc_iii", label: "Health Centre III" },
  { value: "hc_iv", label: "Health Centre IV" },
  { value: "general", label: "General Hospital" },
  { value: "regional_referral", label: "Regional Referral" },
  { value: "national_referral", label: "National Referral" },
  { value: "private", label: "Private / clinic" },
  { value: "other", label: "Other" },
];

export function CreateHospitalButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CreateHospitalState, FormData>(
    createHospitalAction,
    {},
  );

  const succeeded = state.ok === true;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="primary" size="sm" />}>
        <PlusIcon className="size-3.5" /> Create hospital
      </SheetTrigger>
      <SheetContent widthClassName="w-full sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>Create a hospital tenant</SheetTitle>
          <SheetDescription>
            Superadmin path — for hospitals onboarded offline. The agreement gate still applies; an
            offline-signed DPA reference is required. A real hospital admin must accept the
            invitation before this tenant can go live.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {succeeded ? (
            <SuccessView state={state as CreateHospitalState & { ok: true }} />
          ) : (
            <form action={action} className="flex flex-col gap-3">
              <Field name="hospital_name" label="Hospital name" required>
                <Input name="hospital_name" required maxLength={160} />
              </Field>

              <Field name="facility_level" label="Facility level" required>
                <select
                  name="facility_level"
                  required
                  className="border-input bg-card w-full rounded-md border px-2.5 py-2 text-[13px]"
                  defaultValue="general"
                >
                  {FACILITY_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>

              <hr className="border-border my-1" />
              <p className="text-muted-foreground text-[12px]">
                Offline-signed Data-Processing Agreement (kickoff §G — required, not skippable):
              </p>

              <Field
                name="offline_evidence_path"
                label="Evidence path"
                description="Path or storage key of the signed PDF — record what you uploaded."
                required
              >
                <Input
                  name="offline_evidence_path"
                  placeholder="hospital-offline-agreements/…pdf"
                  required
                />
              </Field>
              <Field name="signatory_name" label="Signatory name" required>
                <Input name="signatory_name" required maxLength={120} />
              </Field>
              <Field name="signatory_title" label="Signatory title" required>
                <Input name="signatory_title" required maxLength={80} />
              </Field>

              <hr className="border-border my-1" />
              <p className="text-muted-foreground text-[12px]">
                Real hospital admin (no fake admin — kickoff §G):
              </p>

              <Field name="invitee_email" label="Admin email" required>
                <Input name="invitee_email" type="email" required />
              </Field>
              <Field name="invitee_name" label="Admin name (optional)">
                <Input name="invitee_name" maxLength={120} />
              </Field>

              <hr className="border-border my-1" />

              <Field
                name="reason"
                label="Reason / provenance"
                description="≥ 8 chars; recorded in sa_audit_log. State who authorised this and how the agreement was signed."
                required
              >
                <Input
                  name="reason"
                  required
                  minLength={8}
                  placeholder="e.g. Met with Dr X at MoH HQ on 24 May; signed DPA returned via email."
                />
              </Field>

              {state.error ? (
                <p
                  role="alert"
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {state.error}
                </p>
              ) : null}
            </form>
          )}
        </SheetBody>

        <SheetFooter>
          {succeeded ? (
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="submit"
                form=""
                variant="primary"
                disabled={pending}
                onClick={(e) => {
                  // Submit the inner form (button is in the footer outside it).
                  const f = (
                    e.currentTarget.closest("[data-slot='sheet-content']") as HTMLElement
                  )?.querySelector("form");
                  if (f) (f as HTMLFormElement).requestSubmit();
                }}
              >
                {pending ? "Creating…" : "Create + invite admin"}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function Field({
  name,
  label,
  description,
  required,
  children,
}: {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>
        {label}
        {required ? <span className="text-muted-foreground ml-0.5">*</span> : null}
      </Label>
      {description ? (
        <p className="text-muted-foreground text-[11.5px] leading-relaxed">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

function SuccessView({ state }: { state: CreateHospitalState & { ok: true } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-[12.5px] text-teal-900 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200">
        ✓ Hospital created in <span className="font-mono">{state.hospital_slug}</span>. Tenant is in{" "}
        <span className="font-medium">provisioning</span>; the invited admin must claim their role +
        complete the setup wizard before the hospital can go live.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label>Share this URL with the invited admin (single-use, 14-day expiry)</Label>
        <div className="flex items-stretch gap-2">
          <Input value={state.claim_url} readOnly className="flex-1 font-mono text-[11.5px]" />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(state.claim_url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <CopyIcon className="size-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <p className={cn("text-muted-foreground text-[11.5px]")}>
        Email delivery of this link ships in a follow-up release. Until then, copy + send manually
        via your usual secure channel.
      </p>
    </div>
  );
}
