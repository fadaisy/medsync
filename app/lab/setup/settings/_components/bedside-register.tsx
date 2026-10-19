"use client";

import { useState } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  addLotAction,
  registerDeviceAction,
  setDeviceStateAction,
  setOperatorAction,
} from "@/lib/lab/bedside-actions";
import { SETTINGS } from "../_lib/copy";
import { LabButton } from "../../../_components/v2/button";
import { DateField } from "../../../_components/v2/fields";
import { Field, Said, useAct } from "../../criticals/_components/setup-forms";

const C = SETTINGS.bedside;
const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";
type Kind = keyof typeof C.kinds;

/** §5.14: register a device or kit. It starts not verified (PC-10). */
export function AddDevice({
  wards,
  tests,
}: {
  wards: readonly { id: string; name: string }[];
  tests: readonly { code: string; display: string }[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | "">("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [testCode, setTestCode] = useState("");
  const [wardId, setWardId] = useState("");
  const save = () =>
    act(async () => {
      if (!kind || !testCode || model.trim().length < 2) return { ok: false, error: C.incomplete };
      const r = await registerDeviceAction({
        kind,
        model: model.trim(),
        serial: serial.trim() || null,
        testCode,
        wardId: wardId || null,
      });
      if (r.ok) {
        setOpen(false);
        setKind("");
        setModel("");
        setSerial("");
        setTestCode("");
        setWardId("");
      }
      return r;
    }, C.added);
  return (
    <div className="flex flex-col gap-1">
      <EditorDialog
        open={open}
        onOpenChange={setOpen}
        width="medium"
        trigger={
          <DialogTrigger render={<Button variant="secondary" className="w-fit" />}>
            {C.add}
          </DialogTrigger>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>{C.addTitle}</SheetTitle>
            <SheetDescription>{C.addLede}</SheetDescription>
          </SheetHeader>
          <SheetBody className="grid gap-4 sm:grid-cols-2">
            <Field label={C.kind}>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className={selectClass}
              >
                <option value="">{C.choose}</option>
                {(Object.keys(C.kinds) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {C.kinds[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={C.test}>
              <select
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                className={selectClass}
              >
                <option value="">{C.choose}</option>
                {tests.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.display}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={C.model}>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                maxLength={80}
                className="min-h-11 sm:min-h-9"
              />
            </Field>
            <Field label={C.serial}>
              <Input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                maxLength={60}
                className="min-h-11 font-mono sm:min-h-9"
              />
            </Field>
            <Field label={C.where}>
              <select
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
                className={selectClass}
              >
                <option value="">{C.hospitalWide}</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Said message={message} />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {SETTINGS.cancel}
            </Button>
            <LabButton type="button" onClick={save} variant="primary" busy={pending}>
              {C.save}
            </LabButton>
          </SheetFooter>
        </div>
      </EditorDialog>
      {!open ? <Said message={message} /> : null}
    </div>
  );
}

/** One device's actions: verify (with a note, PC-10), retire, and add a lot with its use-by date. */
export function DeviceActions({
  deviceId,
  model,
  state,
}: {
  deviceId: string;
  model: string;
  state: string;
}) {
  const { pending, message, act } = useAct();
  const [dialog, setDialog] = useState<"verify" | "lot" | null>(null);
  const [note, setNote] = useState("");
  const [lot, setLot] = useState("");
  const [useBy, setUseBy] = useState("");
  const verify = () =>
    act(async () => {
      if (note.trim().length < 3) return { ok: false, error: C.noteShort };
      const r = await setDeviceStateAction({ deviceId, state: "in_use", note: note.trim() });
      if (r.ok) setDialog(null);
      return r;
    }, C.verified);
  const addLot = () =>
    act(async () => {
      if (!lot.trim() || !useBy) return { ok: false, error: C.lotIncomplete };
      const r = await addLotAction({ deviceId, lot: lot.trim(), useBy });
      if (r.ok) {
        setDialog(null);
        setLot("");
        setUseBy("");
      }
      return r;
    }, C.lotAdded);
  const trigger = (label: string) => (
    <DialogTrigger
      render={<Button variant="secondary" size="sm" className="min-h-11 sm:min-h-7" />}
    >
      {label}
      <span className="sr-only"> {model}</span>
    </DialogTrigger>
  );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {state !== "in_use" ? (
          <EditorDialog
            open={dialog === "verify"}
            onOpenChange={(o) => setDialog(o ? "verify" : null)}
            width="medium"
            trigger={trigger(C.verify)}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <SheetHeader>
                <SheetTitle>{C.verifyTitle(model)}</SheetTitle>
                <SheetDescription>{C.verifyLede}</SheetDescription>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-3">
                <Field label={C.note}>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    className="min-h-11 sm:min-h-9"
                  />
                </Field>
                <Said message={message} />
              </SheetBody>
              <SheetFooter>
                <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
                  {SETTINGS.cancel}
                </Button>
                <LabButton type="button" onClick={verify} variant="primary" busy={pending}>
                  {C.verify}
                </LabButton>
              </SheetFooter>
            </div>
          </EditorDialog>
        ) : null}
        {state !== "retired" ? (
          <>
            <EditorDialog
              open={dialog === "lot"}
              onOpenChange={(o) => setDialog(o ? "lot" : null)}
              width="medium"
              trigger={trigger(C.addLot)}
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <SheetHeader>
                  <SheetTitle>{C.lotTitle(model)}</SheetTitle>
                  <SheetDescription>{C.lotLede}</SheetDescription>
                </SheetHeader>
                <SheetBody className="grid gap-4 sm:grid-cols-2">
                  <Field label={C.lot}>
                    <Input
                      value={lot}
                      onChange={(e) => setLot(e.target.value)}
                      maxLength={60}
                      className="min-h-11 font-mono sm:min-h-9"
                    />
                  </Field>
                  <DateField label={C.useBy} value={useBy} onChange={setUseBy} allowFuture />
                  <div className="sm:col-span-2">
                    <Said message={message} />
                  </div>
                </SheetBody>
                <SheetFooter>
                  <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
                    {SETTINGS.cancel}
                  </Button>
                  <LabButton type="button" onClick={addLot} variant="primary" busy={pending}>
                    {C.save}
                  </LabButton>
                </SheetFooter>
              </div>
            </EditorDialog>
            <LabButton
              type="button"
              variant="quiet"
              size="sm"
              onClick={() =>
                act(
                  () => setDeviceStateAction({ deviceId, state: "retired", note: null }),
                  C.retired,
                )
              }
              className="min-h-11 sm:min-h-7"
              busy={pending}
            >
              {C.retire}
              <span className="sr-only"> {model}</span>
            </LabButton>
          </>
        ) : null}
      </div>
      {dialog === null ? <Said message={message} /> : null}
    </div>
  );
}

/** D-LAB2-09: grant or revoke bedside testing for one person. */
export function OperatorToggle({
  userId,
  name,
  granted,
}: {
  userId: string;
  name: string;
  granted: boolean;
}) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col items-end gap-1">
      <LabButton
        type="button"
        variant={granted ? "quiet" : "secondary"}
        size="sm"
        onClick={() =>
          act(
            () => setOperatorAction({ userId, granted: !granted }),
            granted ? C.revokedNow(name) : C.grantedNow(name),
          )
        }
        className="min-h-11 sm:min-h-7"
        busy={pending}
      >
        {granted ? C.revoke : C.grant}
        <span className="sr-only"> {name}</span>
      </LabButton>
      <Said message={message} />
    </div>
  );
}
