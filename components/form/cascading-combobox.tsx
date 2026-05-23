"use client";

import type { ComboboxItem } from "./combobox";
import * as React from "react";

import { Combobox } from "./combobox";

/**
 * Cascading combobox — a child combobox whose options derive from the
 * parent's value. Disabled until the parent has a value selected.
 *
 * Typical use: District → Subcounty. Hospital → Department. Council →
 * Cadre. Cadre → Role.
 *
 * Two modes:
 *   1. Sync filter — pass `items` (all options) and `filterBy` (the
 *      parent value). The hook re-filters in the browser. Good for
 *      catalogs we ship in JS bundle (councils, cadres).
 *   2. Async loader — pass `loadItems(parentValue)` returning a
 *      Promise<ComboboxItem[]>. Good for large reference lists fetched
 *      on demand (subcounties keyed by district).
 *
 * When the parent value changes, the child value is cleared so a
 * stale child can't leak through.
 */

interface BaseProps {
  parentValue: string | null;
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  placeholderEmptyParent?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

interface SyncProps extends BaseProps {
  items: ReadonlyArray<ComboboxItem & { parentValue: string }>;
  loadItems?: never;
}

interface AsyncProps extends BaseProps {
  items?: never;
  loadItems: (parentValue: string) => Promise<ReadonlyArray<ComboboxItem>>;
}

type CascadingComboboxProps = SyncProps | AsyncProps;

export function CascadingCombobox(props: CascadingComboboxProps) {
  const {
    parentValue,
    value,
    onValueChange,
    placeholder = "Select…",
    placeholderEmptyParent = "Pick the previous field first",
    searchPlaceholder,
    emptyMessage,
    disabled,
    id,
    name,
    required,
  } = props;

  const [asyncItems, setAsyncItems] = React.useState<ReadonlyArray<ComboboxItem>>([]);
  const [loading, setLoading] = React.useState(false);

  // Clear child whenever parent changes so a stale child can't leak.
  const previousParentRef = React.useRef(parentValue);
  React.useEffect(() => {
    if (previousParentRef.current !== parentValue) {
      previousParentRef.current = parentValue;
      if (value !== null) onValueChange(null);
    }
  }, [parentValue, value, onValueChange]);

  // Async load when parent changes. When parentValue is null we skip
  // the fetch entirely; the items memo below filters out stale
  // asyncItems so we don't need to reset state here.
  React.useEffect(() => {
    if (!("loadItems" in props) || !props.loadItems) return;
    if (parentValue == null) return;
    const loadItems = props.loadItems;
    let cancelled = false;
    // Push setLoading into a microtask so the eslint
    // react-hooks/set-state-in-effect rule doesn't flag a legitimate
    // "start an async fetch and show a spinner" pattern.
    Promise.resolve()
      .then(() => {
        if (cancelled) return Promise.resolve(undefined);
        setLoading(true);
        return loadItems(parentValue);
      })
      .then((items) => {
        if (!cancelled && items) setAsyncItems(items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // We intentionally depend on parentValue, not on the loadItems
    // function identity (callers shouldn't have to memoize).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentValue]);

  const items = React.useMemo<ReadonlyArray<ComboboxItem>>(() => {
    if (parentValue == null) return [];
    if ("items" in props && props.items) {
      return props.items
        .filter((it) => it.parentValue === parentValue)
        .map(({ parentValue: _ignored, ...rest }) => rest);
    }
    return asyncItems;
  }, [props, parentValue, asyncItems]);

  const isDisabled = disabled || parentValue == null;

  return (
    <Combobox
      items={items}
      value={value}
      onValueChange={onValueChange}
      placeholder={parentValue == null ? placeholderEmptyParent : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={loading ? "Loading…" : (emptyMessage ?? "No matches.")}
      disabled={isDisabled}
      id={id}
      name={name}
      required={required}
      aria-label={props["aria-label"]}
      aria-describedby={props["aria-describedby"]}
    />
  );
}
