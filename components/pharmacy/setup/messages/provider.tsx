"use client";

import type { SectionProps } from "./index";
import { useState } from "react";

import {
  connectProviderAction,
  disconnectProviderAction,
  sendTestAction,
} from "@/app/pharmacy/setup/setup-actions";
import { inputCls, labelCls } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { Panel } from "@/components/tide/work/kit";
import { MSG } from "@/content/pharmacy-setup-messages";
import { normalisePhoneUG, senderId } from "@/lib/pharmacy/derive/setup/messages";
import { cn } from "@/lib/utils";

const M = MSG.provider;

/** §D2: the provider's fields (locked while connected), Connect / Disconnect, and the test SMS. */
export function Provider({
  view,
  toast,
  run,
  pending,
  testTo,
  setTestTo,
}: SectionProps & { testTo: string; setTestTo: (v: string) => void }) {
  const pv = view.provider;
  const connected = !!pv?.connected;
  const can = view.can.manage;
  const [f, setF] = useState({
    name: pv?.name ?? "",
    sender: pv?.senderId ?? "",
    // The saved key never comes back to the page: empty here keeps it.
    key: "",
    cost: pv?.costUgx ? String(pv.costUgx) : "",
    facility: pv?.facility ?? "",
  });
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const set = (patch: Partial<typeof f>) => {
    setF({ ...f, ...patch });
    setError("");
  };
  const locked = connected || !can;

  const toggleConn = () => {
    if (connected) {
      void run(
        () => disconnectProviderAction({}),
        () => M.disconnected,
      );
      return;
    }
    if (!f.name.trim() || !f.sender.trim() || (!f.key.trim() && !pv)) return setError(M.missing);
    if (!(parseInt(f.cost, 10) > 0)) return setError(M.noCost);
    void run(
      () =>
        connectProviderAction({
          name: f.name,
          senderId: f.sender,
          apiKey: f.key,
          costUgx: parseInt(f.cost, 10),
          facility: f.facility,
        }),
      () => M.connected,
    ).then((ok) => ok && setF((x) => ({ ...x, key: "" })));
  };

  const sendTest = () => {
    const to = normalisePhoneUG(testTo);
    if (!to) return toast(MSG.badPhone);
    setResult("");
    void run(
      () => sendTestAction({ phone: testTo, body: M.testBody }),
      (d: { sent: boolean }) => {
        setResult(d.sent ? M.testSent(to) : M.testNotSent(to));
        return null;
      },
    );
  };

  const field = (
    label: string,
    k: keyof typeof f,
    ph: string,
    o: { type?: string; numeric?: boolean; map?: (v: string) => string } = {},
  ) => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <input
        type={o.type ?? "text"}
        inputMode={o.numeric ? "numeric" : undefined}
        value={f[k]}
        disabled={locked}
        placeholder={ph}
        autoComplete="off"
        onChange={(e) => set({ [k]: o.map ? o.map(e.target.value) : e.target.value })}
        className={cn(inputCls, "disabled:bg-tide-sunken disabled:text-ink-600")}
      />
    </label>
  );

  return (
    <Panel title={M.title} note={connected ? M.line(pv!.senderId, pv!.costUgx) : M.lineOff}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {field(M.name, "name", M.namePh)}
        {field(M.sender, "sender", M.senderPh, { map: senderId })}
        {field(M.key, "key", pv ? M.keyMasked : M.keyPh, { type: "password" })}
        {field(M.cost, "cost", M.costPh, { numeric: true, map: (v) => v.replace(/\D/g, "") })}
        {field(M.facility, "facility", M.facilityPh)}
      </div>
      {error ? (
        <p
          role="alert"
          className="bg-tide-sunken text-body-s rounded-tide-tile px-3.5 py-2.5 font-semibold"
        >
          {error}
        </p>
      ) : null}
      {can ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <input
                type="tel"
                aria-label={M.testLabel}
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder={MSG.phonePh}
                className={cn(inputCls, "w-48")}
              />
              <LabButton
                type="button"
                onClick={sendTest}
                busy={connected ? pending : undefined}
                disabledReason={connected ? null : MSG.connectFirst}
              >
                {M.test}
              </LabButton>
            </span>
            {result ? (
              <p role="status" className="text-body-s text-ink-700">
                {result}
              </p>
            ) : null}
          </div>
          <LabButton
            type="button"
            variant={connected ? "secondary" : "primary"}
            onClick={toggleConn}
            busy={pending}
          >
            {connected ? M.disconnect : M.connect}
          </LabButton>
        </div>
      ) : null}
    </Panel>
  );
}
