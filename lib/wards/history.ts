/**
 * Undo and redo for the ward builder (ADR 0195 §3): a reducer over document snapshots. At most 50
 * snapshots back; a new edit clears redo; a drag is one step (`settle` with the document from before
 * it). Per ward in the session: the editor is keyed by ward, so switching wards starts a new history.
 */
export const HISTORY_LIMIT = 50;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const historyInit = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** A finished edit: the present goes back one step, redo is cleared. */
export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

/** A change in progress (a drag): no step yet. */
export function replace<T>(h: History<T>, next: T): History<T> {
  return next === h.present ? h : { ...h, present: next };
}

/** A drag ended: one step back to where it started, if it moved anything. */
export function settle<T>(h: History<T>, before: T): History<T> {
  if (before === h.present) return h;
  return { past: [...h.past, before].slice(-HISTORY_LIMIT), present: h.present, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return {
    past: h.past.slice(0, -1),
    present: prev,
    future: [...h.future, h.present].slice(-HISTORY_LIMIT),
  };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[h.future.length - 1];
  if (next === undefined) return h;
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    present: next,
    future: h.future.slice(0, -1),
  };
}

export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;
