"use client";

import type { MenuProfile, TestMenuData } from "@/lib/lab/test-menu-read";
import { useState } from "react";
import { InfoIcon, PlusIcon } from "lucide-react";

import { LabButton } from "@/app/lab/_components/v2/button";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import { namesRestricted, rankTests, sectionFor, sectionName } from "@/lib/lab/test-menu";
import { retireProfileAction, saveProfileAction } from "@/lib/lab/test-menu-actions";
import { cn } from "@/lib/utils";
import { newKey, useMenuAction } from "./use-menu-action";

/**
 * Hospital profiles (board 17; TM-10, TM-D07): an ordering shortcut over menu tests. Each test keeps its own
 * section, results and restricted class; a profile whose test is no longer offered is flagged, never changed.
 */
export function HospitalProfiles({ data }: { data: TestMenuData }) {
  const [editing, setEditing] = useState<MenuProfile | "new" | null>(null);
  const tests = new Map(data.tests.map((t) => [t.code, t]));
  const offering = new Map(data.menu.map((o) => [o.code, o]));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-s text-ink-600 max-w-prose">{C.profileNote}</p>
        <LabButton type="button" variant="primary" onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden className="size-4" />
          {C.newProfile}
        </LabButton>
      </div>
      {data.profiles.length === 0 ? (
        <p className="bg-card shadow-tide-card text-body-s text-ink-600 rounded-xl p-6">
          {C.noProfiles}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.profiles.map((p) => (
            <li key={p.id} className="bg-card shadow-tide-card flex flex-col gap-3 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-heading-s text-foreground">{p.name}</h3>
                <LabButton type="button" variant="text" onClick={() => setEditing(p)}>
                  {C.editProfile}
                  <span className="sr-only">: {p.name}</span>
                </LabButton>
              </div>
              {p.flagged ? (
                <p className="text-body-s text-ink-700 flex items-start gap-1">
                  <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {C.profileFlagged}
                </p>
              ) : null}
              <ul className="text-body-s flex flex-col gap-1.5">
                {p.testCodes.map((code) => {
                  const t = tests.get(code);
                  return (
                    <li key={code} className="flex justify-between gap-2">
                      <span className="text-foreground">
                        {t ? (t.masked ? C.restrictedTest : t.display) : code}
                      </span>
                      <span className="text-ink-600 text-right">
                        {t ? sectionName(sectionFor(offering.get(code), t)) : ""}
                        {t?.components.length ? ` · ${C.results(t.components.length)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {p.note ? <p className="text-body-s text-ink-600">{p.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <ProfileDialog
          data={data}
          profile={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ProfileDialog(props: {
  data: TestMenuData;
  profile: MenuProfile | null;
  onClose: () => void;
}) {
  const { data, profile } = props;
  const act = useMenuAction();
  const [name, setName] = useState(profile?.name ?? "");
  const [note, setNote] = useState(profile?.note ?? "");
  const [codes, setCodes] = useState<string[]>(profile?.testCodes ?? []);
  const [query, setQuery] = useState("");
  const offered = new Set(data.menu.filter((o) => o.where !== "not_offered").map((o) => o.code));
  const pool = data.tests.filter((t) => offered.has(t.code));
  const shown = (query.trim() ? rankTests(pool, query) : pool).slice(0, 40);
  const refused = name.trim() && namesRestricted(name, C.restrictedNames);
  const field =
    "border-ink-300 bg-card focus-visible:shadow-focus h-10 w-full rounded-lg border px-3 text-[14px] outline-none";
  return (
    <EditorDialog open onOpenChange={(o) => !o && props.onClose()} width="wide">
      <SheetHeader>
        <SheetTitle>{profile ? C.editProfile : C.newProfile}</SheetTitle>
        <SheetDescription>{C.profileNote}</SheetDescription>
      </SheetHeader>
      <SheetBody className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="text-body-s flex flex-col gap-1.5 font-medium">
            {C.profileName}
            <input
              className={field}
              maxLength={80}
              value={name}
              aria-invalid={!!refused}
              aria-describedby="tm-profile-name"
              onChange={(e) => setName(e.target.value)}
            />
            <span
              id="tm-profile-name"
              className={cn(
                "text-caption font-normal",
                refused ? "text-amber-800" : "text-ink-600",
              )}
            >
              {C.profileRefused}
            </span>
          </label>
          <label className="text-body-s flex flex-col gap-1.5 font-medium">
            {C.profileNoteLabel}
            <textarea
              className={cn(field, "h-20 py-2")}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <ol className="text-body-s flex flex-col gap-1">
            {codes.map((c) => (
              <li key={c} className="flex justify-between gap-2">
                {data.tests.find((t) => t.code === c)?.display ?? c}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setCodes(codes.filter((x) => x !== c))}
                >
                  {C.clear}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-s mb-1 font-medium">{C.profileTests}</legend>
          <p className="text-caption text-ink-600">{C.profileNeedsOffered}</p>
          <input
            type="search"
            aria-label={C.search}
            placeholder={C.search}
            className={field}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="flex max-h-72 flex-col overflow-auto">
            {shown.map((t) => (
              <li key={t.code}>
                <label className="text-body-s flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    className="accent-tide-navy-900 size-4"
                    checked={codes.includes(t.code)}
                    onChange={() =>
                      setCodes(
                        codes.includes(t.code)
                          ? codes.filter((x) => x !== t.code)
                          : [...codes, t.code],
                      )
                    }
                  />
                  {t.masked ? C.restrictedTest : t.display}
                  <span className="text-ink-600">· {sectionName(t.section)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </SheetBody>
      <SheetFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {profile ? (
            <LabButton
              type="button"
              variant="quiet"
              busy={act.pending}
              onClick={() =>
                act.run(
                  () => retireProfileAction({ surface: data.surface, id: profile.id }),
                  C.saved,
                  props.onClose,
                )
              }
            >
              {C.removeProfile}
            </LabButton>
          ) : null}
          {act.message ? (
            <p
              role="status"
              className={cn("text-body-s", act.message.ok ? "text-ink-700" : "text-amber-800")}
            >
              {act.message.text}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <LabButton type="button" onClick={props.onClose}>
            {C.cancel}
          </LabButton>
          <LabButton
            type="button"
            variant="primary"
            busy={act.pending}
            disabledReason={
              refused
                ? C.profileRefused
                : name.trim().length >= 2 && codes.length
                  ? undefined
                  : C.profileNeedsOffered
            }
            onClick={() =>
              act.run(
                () =>
                  saveProfileAction({
                    surface: data.surface,
                    clientKey: newKey(),
                    id: profile?.id ?? null,
                    name,
                    note: note.trim() || null,
                    testCodes: codes,
                  }),
                C.saved,
                props.onClose,
              )
            }
          >
            {C.save}
          </LabButton>
        </div>
      </SheetFooter>
    </EditorDialog>
  );
}
