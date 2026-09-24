"use client";

import type { ResusRole } from "@/lib/resus/types";
import { useRef, useState, useTransition } from "react";
import { Popover } from "@base-ui/react/popover";
import { CheckIcon, ChevronDownIcon, StarIcon, UsersIcon } from "lucide-react";

import { respondV2, setRoleV2 } from "@/app/nurse/resus/_v2/actions-survey";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RESUS_ROLES } from "@/lib/resus/types";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";

const ROLE_LABEL: Record<ResusRole, string> = {
  leader: "Leader",
  airway: "Airway",
  circulation: "Circulation",
  scribe: "Scribe",
  runner: "Runner",
  cpr_provider: "CPR",
  family_liaison: "Family",
};

type Result = { ok: true } | { ok: false; error: string };

const smallBtn =
  "tap border-border text-body-s hover:bg-muted inline-flex min-h-11 shrink-0 items-center rounded-md border px-3 font-medium disabled:opacity-50";

/**
 * The team chip (prompt §5.7 ⓑ): "Leader You · 4 responding" → a popover with
 * the seven roles. Claim / Take / Assign to… (setRoleV2 — claiming marks you as
 * responding) and "I'm responding" (respondV2). Roster and responders come from
 * the store's snapshot, so a change re-reads it (store.refresh full) — no page
 * reload, no second patient-name reveal.
 */
export function TeamChip() {
  const { initial, store } = useDeskCtx();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { me } = initial;
  const { roster, responders } = store;
  const episodeId = initial.episode.id;

  const byRole = new Map(roster.map((r) => [r.role, r]));
  // Responding = acknowledged alerts ∪ role holders (holding a role lists you).
  const responding = new Set([
    ...responders.filter((r) => r.responding).map((r) => r.userId),
    ...roster.map((r) => r.userId),
  ]);
  const nameOf = (userId: string, fullName: string | null) =>
    userId === me.userId ? "You" : (fullName ?? "Unnamed staff");
  const staff = new Map<string, string>();
  for (const p of [...responders, ...roster])
    if (!staff.has(p.userId)) staff.set(p.userId, nameOf(p.userId, p.fullName));

  const leader = byRole.get("leader");
  const leaderName = leader ? nameOf(leader.userId, leader.fullName) : "not set";
  const iAmResponding = responding.has(me.userId);
  const myAlert = responders.some((r) => r.userId === me.userId);
  const holdsRole = roster.some((r) => r.userId === me.userId);

  function run(fn: () => Promise<Result>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn().catch(
        (): Result => ({ ok: false, error: "No connection — try again." }),
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOk?.();
      await store.refresh({ full: true });
    });
  }

  // One idempotency key per role change until it succeeds: a retried tap after a
  // lost response replays the first attempt instead of writing a second row.
  const intent = useRef<{ key: string; id: string } | null>(null);
  function setRole(role: ResusRole, userId?: string) {
    const key = `${role}:${userId ?? me.userId}`;
    if (intent.current?.key !== key) intent.current = { key, id: crypto.randomUUID() };
    const clientEventId = intent.current.id;
    run(
      () => setRoleV2({ episodeId, role, userId, clientEventId }),
      () => {
        intent.current = null;
      },
    );
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Team: leader ${leaderName}, ${responding.size} responding`}
        className="tap border-border text-body-s hover:bg-muted data-popup-open:bg-muted inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 font-medium"
      >
        <UsersIcon aria-hidden className="text-muted-foreground size-4" />
        <span className="hidden sm:inline">
          Leader {leaderName} <span className="text-muted-foreground">·</span>{" "}
        </span>
        <span className="tabular-nums">{responding.size}</span>
        <span className="hidden sm:inline">responding</span>
        <ChevronDownIcon aria-hidden className="text-muted-foreground size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Popover.Popup
            className={cn(
              "bg-popover text-popover-foreground shadow-popover max-h-(--available-height) w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-4 outline-none",
              "ease-expo-out origin-(--transform-origin) transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none",
            )}
          >
            <Popover.Title className="text-body-m font-medium">Team</Popover.Title>
            <ul className="mt-2 flex flex-col gap-1">
              {RESUS_ROLES.map((role) => {
                const holder = byRole.get(role);
                const mine = holder?.userId === me.userId;
                const others = [...staff].filter(
                  ([id]) => id !== me.userId && id !== holder?.userId,
                );
                return (
                  <li key={role} className="flex min-h-11 items-center gap-2">
                    <span className="text-caption text-muted-foreground flex w-24 shrink-0 items-center gap-1">
                      {ROLE_LABEL[role]}
                      {role === "leader" && !holder ? (
                        <StarIcon aria-hidden className="size-3" />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "text-body-s min-w-0 flex-1 truncate",
                        !holder && "text-muted-foreground",
                      )}
                    >
                      {holder ? nameOf(holder.userId, holder.fullName) : "Open"}
                    </span>
                    {mine ? null : (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`${holder ? "Take" : "Claim"} ${ROLE_LABEL[role]}`}
                        className={smallBtn}
                        onClick={() => setRole(role)}
                      >
                        {holder ? "Take" : "Claim"}
                      </button>
                    )}
                    {others.length > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={busy}
                          render={
                            <button
                              type="button"
                              aria-label={`Assign ${ROLE_LABEL[role]} to…`}
                              className={smallBtn}
                            />
                          }
                        >
                          Assign…
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuLabel className="text-caption">Assign to…</DropdownMenuLabel>
                          {others.map(([id, name]) => (
                            <DropdownMenuItem
                              key={id}
                              className="text-body-s min-h-11 px-3"
                              onClick={() => setRole(role, id)}
                            >
                              {name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="text-caption text-muted-foreground mt-3 flex gap-1.5">
              <StarIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
              {me.leaderRecommended
                ? "Leader recommended for your cadre. Roles never block — claim what you're doing."
                : "Leader is usually a doctor or clinical officer. Roles never block — claim what you're doing."}
            </p>
            {iAmResponding ? (
              <p className="text-body-s mt-3 flex items-center gap-1.5 font-medium text-teal-700">
                <CheckIcon aria-hidden className="size-4" />
                {holdsRole ? "You're responding" : "You're responding — claim a role above"}
              </p>
            ) : myAlert ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => respondV2({ episodeId }))}
                className="tap text-body-s bg-primary text-primary-foreground hover:bg-primary-hover mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 font-medium disabled:opacity-50"
              >
                {"I'm responding"}
              </button>
            ) : (
              <p className="text-caption text-muted-foreground mt-3">
                Claim a role to be listed as responding.
              </p>
            )}
            {error ? (
              <p role="alert" className="text-body-s mt-2 text-amber-800 dark:text-amber-200">
                {error}
              </p>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
