/**
 * The ward builder's keyboard (ADR 0195), pure so it is tested without a browser. The editor calls
 * `rootKeyAction` from its root element's onKeyDown and `planKeyAction` from the plan's; neither is
 * ever registered on window or document.
 */

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
  target: unknown;
}

/** An input, textarea, select or contenteditable keeps its own keys (and its own undo). */
export function isTextTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/**
 * Cmd+Z / Ctrl+Z undo; Shift+Cmd+Z, Shift+Ctrl+Z and Ctrl+Y redo. Nothing in a text field, nothing in
 * live mode.
 */
export function rootKeyAction(e: KeyLike, opts: { live: boolean }): "undo" | "redo" | null {
  if (opts.live || isTextTarget(e.target)) return null;
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && e.ctrlKey && !e.shiftKey) return "redo";
  return null;
}

export type PlanKeyAction =
  | { type: "rotate" }
  | { type: "remove" }
  | { type: "nudge"; dx: number; dy: number }
  | { type: "escape" }
  | { type: "place" };

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * On the plan (focused): R rotates, Delete / Backspace removes, the arrows nudge, Escape stops placing
 * and clears the selection, Enter places the armed item at the plan's centre. Modified keys are left
 * alone (Cmd+R reloads the page; Cmd+Z is the root's).
 */
export function planKeyAction(
  e: KeyLike,
  opts: { live: boolean; selected: boolean; armed: boolean },
): PlanKeyAction | null {
  if (opts.live || isTextTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === "Escape") return { type: "escape" };
  if (e.key === "Enter" && opts.armed) return { type: "place" };
  if (!opts.selected) return null;
  if (e.key === "r" || e.key === "R") return { type: "rotate" };
  if (e.key === "Delete" || e.key === "Backspace") return { type: "remove" };
  const n = NUDGE[e.key];
  return n ? { type: "nudge", dx: n[0], dy: n[1] } : null;
}

export const isMacPlatform = (platform: string) => /Mac|iPhone|iPad/.test(platform);

/** The words the undo and redo buttons show, per platform. */
export function shortcutWords(mac: boolean) {
  return mac
    ? { undo: "⌘Z", redo: "⇧⌘Z", undoTitle: "Undo (⌘Z)", redoTitle: "Redo (⇧⌘Z)" }
    : { undo: "Ctrl+Z", redo: "Ctrl+Y", undoTitle: "Undo (Ctrl+Z)", redoTitle: "Redo (Ctrl+Y)" };
}
