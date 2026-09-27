import type { ReactElement, ReactNode } from "react";
import { isValidElement } from "react";

/**
 * Pressing hook-free components in tests: `walk` renders function components by calling them and
 * collects the host elements, so a button's own onClick can be called (the tap-count budgets count
 * those calls). `text` flattens static markup to words.
 */

export type El = ReactElement<Record<string, unknown>>;

export function walk(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const n of node) walk(n as ReactNode, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as El;
  if (typeof el.type === "function")
    return walk((el.type as (p: unknown) => ReactNode)(el.props), out);
  // Host elements, and primitives (forwardRef objects such as ui/Button's) with their props.
  if (typeof el.type === "string" || typeof el.type === "object") out.push(el);
  walk(el.props.children as ReactNode, out);
  return out;
}

/** A host <button> or a Button primitive. */
export const isButton = (e: El) => e.type === "button" || typeof e.type === "object";

export const words = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => words(n as ReactNode)).join("");
  if (!isValidElement(node)) return "";
  const el = node as El;
  if (typeof el.type === "function") return words((el.type as (p: unknown) => ReactNode)(el.props));
  return words(el.props.children as ReactNode);
};

export const text = (m: string) =>
  m
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
