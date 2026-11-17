"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { Pill } from "@/components/ui/pill";
import { createClient } from "@/lib/supabase/client";

/**
 * Paid, on the desk (patient app v2 §5.4, PA5, S16): the desk reads the same `payment_status` view as the
 * patient's ticket, every 5 seconds while the tab is visible, for today's rows only (one small query). Before
 * migration 0299 is applied the view is missing and nothing shows. A payment state is a workflow state: a
 * neutral pill with words, never green (DESIGN-medsync: red, amber and green are the patient's clinical state).
 */
type Paid = { status: string; method: string | null; receipt: number | null };
const PaidContext = createContext<ReadonlyMap<string, Paid>>(new Map());

export function DeskPaidProvider({
  appointmentIds,
  children,
}: {
  appointmentIds: readonly string[];
  children: React.ReactNode;
}) {
  const [paid, setPaid] = useState<ReadonlyMap<string, Paid>>(new Map());
  const key = appointmentIds.join(",");
  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const sb = createClient();
    let alive = true;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await sb
        .from("payment_status")
        .select("appointment_id, status, method, receipt_number")
        .in("appointment_id", ids)
        .eq("kind", "visit");
      if (!alive || error || !data) return;
      setPaid(
        new Map(
          (
            data as {
              appointment_id: string;
              status: string;
              method: string | null;
              receipt_number: number | null;
            }[]
          ).map((r) => [
            r.appointment_id,
            { status: r.status, method: r.method, receipt: r.receipt_number },
          ]),
        ),
      );
    };
    void read();
    const t = window.setInterval(read, 5_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [key]);
  return <PaidContext.Provider value={paid}>{children}</PaidContext.Provider>;
}

export function DeskPaidPill({ appointmentId }: { appointmentId: string }) {
  const p = useContext(PaidContext).get(appointmentId);
  if (!p) return null;
  const words =
    p.status === "paid"
      ? `Paid · ${p.method === "counter" ? "counter" : "Mobile Money"}${p.receipt ? ` · R ${String(p.receipt).padStart(4, "0")}` : ""}`
      : p.status === "refunded"
        ? "Refunded"
        : p.status === "part_paid"
          ? "Part paid"
          : "To pay";
  return (
    <span role="status" aria-live="polite">
      <Pill tone="neutral">{words}</Pill>
    </span>
  );
}
