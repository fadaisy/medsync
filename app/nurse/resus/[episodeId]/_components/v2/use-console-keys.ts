"use client";

import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

/**
 * Arrest console keyboard (prompt §5.9): R rhythm · S shock · A adrenaline ·
 * M antiarrhythmic · O ROSC · U undo · ? help. Console only (the listener lives while the
 * console is mounted), never while typing, never inside a dialog / popover / menu, and no
 * animation: a key focuses or clicks the control marked `data-console-key="<key>"` inside
 * the console root (programmatic clicks never trigger the `:active` press), so a key and a
 * tap always do exactly the same thing. U and ? are passed in.
 *
 * WCAG 2.1.4 (character key shortcuts): keys act only while focus is inside the console
 * (or on the page body), so typing elsewhere never logs a shock; and the KeysHelp dialog
 * turns them off per device (default on, ADR 0104).
 */

const PREF_KEY = "medsync.resus.consoleKeys";
const prefListeners = new Set<() => void>();
// In memory too: a blocked localStorage (private window) still honours the switch this session.
let prefMemo: boolean | null = null;

export function consoleKeysOn(): boolean {
  if (prefMemo !== null) return prefMemo;
  try {
    return window.localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setConsoleKeysOn(on: boolean): void {
  prefMemo = on;
  try {
    window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // Per-device convenience only: the in-memory value stands.
  }
  prefListeners.forEach((l) => l());
}

function subscribePref(l: () => void) {
  prefListeners.add(l);
  return () => prefListeners.delete(l);
}

export function useConsoleKeysOn(): boolean {
  return useSyncExternalStore(subscribePref, consoleKeysOn, () => true);
}

const CLICK_KEYS = new Set(["s", "a", "m", "o"]);

function ignoreTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')) return true;
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement
  );
}

export function useConsoleKeys(
  root: RefObject<HTMLElement | null>,
  extra: { u?: () => void; "?"?: () => void },
): void {
  const extraRef = useRef(extra);
  useLayoutEffect(() => {
    extraRef.current = extra;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!consoleKeysOn()) return;
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (ignoreTarget(e.target)) return;
      // The console stays mounted (hidden) behind the "Survey (paused)" tab: no keys there.
      if (!root.current || root.current.closest("[hidden]")) return;
      const a = document.activeElement;
      if (a && a !== document.body && !root.current.contains(a)) return;
      // A modal opened elsewhere (prescribe dialog, termination review) owns the keyboard.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const k = e.key === "?" ? "?" : e.key.toLowerCase();
      const fn = k === "u" || k === "?" ? extraRef.current[k] : undefined;
      if (fn) {
        e.preventDefault();
        fn();
        return;
      }
      const el = root.current?.querySelector<HTMLElement>(`[data-console-key="${k}"]`);
      if (!el || (el instanceof HTMLButtonElement && el.disabled)) return;
      e.preventDefault();
      if (k === "r") el.focus();
      else if (CLICK_KEYS.has(k)) el.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [root]);
}
