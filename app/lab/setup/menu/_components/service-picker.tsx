"use client";

import { setTestServiceAction } from "@/lib/lab/one-menu-actions";
import { Said, useAct } from "../../criticals/_components/setup-forms";

/** §5.10: the hub offering that provides this test here (OM-1). Nothing else is edited here (Law 2). */
export function ServicePicker({
  testCode,
  testName,
  value,
  offerings,
}: {
  testCode: string;
  testName: string;
  value: string | null;
  offerings: { code: string; label: string }[];
}) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Service for ${testName}`}
        defaultValue={value ?? ""}
        disabled={pending}
        onChange={(e) =>
          act(
            () => setTestServiceAction({ testCode, offeringCode: e.target.value || null }),
            e.target.value ? "Linked." : "Link removed.",
          )
        }
        className="border-input bg-background text-body-s min-h-11 rounded-md border px-2 sm:min-h-9"
      >
        <option value="">Not linked</option>
        {offerings.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <Said message={message} />
    </div>
  );
}
