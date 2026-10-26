/**
 * W4: a booking reason ("antenatal") or a symptom area is a condition, so the address carries only its place
 * in a list the server also holds ("?r=3"), never the word.
 * ponytail: positions shift when the list changes; a stale link lands on the wrong choice or none, which the
 * patient sees and changes before anything is sent.
 */
export const toSlot = (list: readonly string[], v: string): string => String(list.indexOf(v));

export function fromSlot<T extends string>(list: readonly T[], s: string | undefined): T | null {
  const i = Number(s);
  return s !== undefined && Number.isInteger(i) && i >= 0 && i < list.length ? list[i]! : null;
}
