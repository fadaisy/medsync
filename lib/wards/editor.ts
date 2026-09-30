/**
 * The ward builder's edits, as pure functions on the layout document (ADR 0191). The editor component
 * holds the document in a history (lib/wards/history.ts) and calls these; the Items list calls the same
 * ones, so drag is never the only way to do anything (ADR 0195 §6).
 */
import type {
  BedType,
  DividerKind,
  FixtureKind,
  LayoutBed,
  LayoutDivider,
  LayoutDoor,
  LayoutFixture,
  LayoutRoom,
  Rect,
  RoomKind,
  Rotation,
  ServiceCode,
  WardLayout,
} from "@/supabase/functions/_shared/ward-layout";

import {
  bedRect,
  clampRect,
  DIVIDER_KINDS,
  DOOR_CELLS,
  fixtureRect,
  fixtureSize,
  FLOOR_MAX,
  FLOOR_MIN,
  nextBedLabels,
  nextKey,
  ROOM_DEFAULT_SIZE,
  ROOM_KINDS,
  roomOfBed,
  roomRect,
  SERVICE_CODES,
  turned,
} from "@/supabase/functions/_shared/ward-layout";

export type ItemKind = "bed" | "room" | "divider" | "door" | "fixture";
export interface ItemRef {
  kind: ItemKind;
  key: string;
}

export type Tool =
  | "select"
  | "row"
  | "door"
  | `bed:${BedType}`
  | `divider:${DividerKind}`
  | `room:${RoomKind}`
  | `fixture:${FixtureKind}`;

export const dividerLabel = (kind: DividerKind) =>
  DIVIDER_KINDS.find((k) => k.code === kind)?.label ?? kind;

export const sameRef = (a: ItemRef | null, b: ItemRef | null) =>
  !!a && !!b && a.kind === b.kind && a.key === b.key;

const LIST: Record<ItemKind, keyof Omit<WardLayout, "v" | "floor">> = {
  bed: "beds",
  room: "rooms",
  divider: "dividers",
  door: "doors",
  fixture: "fixtures",
};

export function findItem(d: WardLayout, ref: ItemRef | null) {
  if (!ref) return null;
  const list = d[LIST[ref.kind]] as { key: string }[];
  return list.find((x) => x.key === ref.key) ?? null;
}

export const findBed = (d: WardLayout, key: string) => d.beds.find((b) => b.key === key) ?? null;
export const findRoom = (d: WardLayout, key: string) => d.rooms.find((r) => r.key === key) ?? null;
export const findDivider = (d: WardLayout, key: string) =>
  d.dividers.find((l) => l.key === key) ?? null;
export const findFixture = (d: WardLayout, key: string) =>
  d.fixtures.find((f) => f.key === key) ?? null;
export const findDoor = (d: WardLayout, key: string) => d.doors.find((o) => o.key === key) ?? null;

function mapList<K extends ItemKind>(
  d: WardLayout,
  kind: K,
  key: string,
  fn: (x: never) => unknown,
): WardLayout {
  const name = LIST[kind];
  const list = d[name] as { key: string }[];
  const i = list.findIndex((x) => x.key === key);
  if (i < 0) return d;
  const next = fn(list[i] as never);
  if (next === list[i]) return d;
  const copy = [...list];
  copy[i] = next as { key: string };
  return { ...d, [name]: copy };
}

export const patchBed = (d: WardLayout, key: string, patch: Partial<LayoutBed>) =>
  mapList(d, "bed", key, (b: LayoutBed) => ({ ...b, ...patch }));
export const patchRoom = (d: WardLayout, key: string, patch: Partial<LayoutRoom>) =>
  mapList(d, "room", key, (r: LayoutRoom) => ({ ...r, ...patch }));
export const patchDivider = (d: WardLayout, key: string, patch: Partial<LayoutDivider>) =>
  mapList(d, "divider", key, (l: LayoutDivider) => ({ ...l, ...patch }));
export const patchFixture = (d: WardLayout, key: string, patch: Partial<LayoutFixture>) =>
  mapList(d, "fixture", key, (f: LayoutFixture) => ({ ...f, ...patch }));
export const patchDoor = (d: WardLayout, key: string, patch: Partial<LayoutDoor>) =>
  mapList(d, "door", key, (o: LayoutDoor) => ({ ...o, ...patch }));

/** The footprint of anything with an area (beds, fixtures, rooms); dividers and doors have none. */
export function rectOf(d: WardLayout, ref: ItemRef): Rect | null {
  const it = findItem(d, ref);
  if (!it) return null;
  if (ref.kind === "bed") return bedRect(it as LayoutBed);
  if (ref.kind === "fixture") return fixtureRect(it as LayoutFixture);
  if (ref.kind === "room") return roomRect(it as LayoutRoom);
  return null;
}

const clampLine = (v: number, max: number) => Math.max(0, Math.min(max, v));

/** Move an item so its top-left (or a divider's first end, or a door) is at (x, y), kept on the floor. */
export function moveTo(d: WardLayout, ref: ItemRef, x: number, y: number): WardLayout {
  const { w: W, h: H } = d.floor;
  switch (ref.kind) {
    case "bed":
      return mapList(d, "bed", ref.key, (b: LayoutBed) => {
        const p = clampRect({ ...bedRect(b), x, y }, d.floor);
        return p.x === b.x && p.y === b.y ? b : { ...b, ...p };
      });
    case "fixture":
      return mapList(d, "fixture", ref.key, (f: LayoutFixture) => {
        const p = clampRect({ ...fixtureRect(f), x, y }, d.floor);
        return p.x === f.x && p.y === f.y ? f : { ...f, ...p };
      });
    case "room":
      return mapList(d, "room", ref.key, (r: LayoutRoom) => {
        const p = clampRect({ ...roomRect(r), x, y }, d.floor);
        return p.x === r.x && p.y === r.y ? r : { ...r, ...p };
      });
    case "door":
      return mapList(d, "door", ref.key, (o: LayoutDoor) => {
        const nx = clampLine(x, o.orient === "h" ? W - DOOR_CELLS : W);
        const ny = clampLine(y, o.orient === "v" ? H - DOOR_CELLS : H);
        return nx === o.x && ny === o.y ? o : { ...o, x: nx, y: ny };
      });
    case "divider":
      return mapList(d, "divider", ref.key, (l: LayoutDivider) => {
        const minX = Math.min(l.x1, l.x2);
        const minY = Math.min(l.y1, l.y2);
        const spanX = Math.abs(l.x2 - l.x1);
        const spanY = Math.abs(l.y2 - l.y1);
        const dx = clampLine(x, W - spanX) - minX;
        const dy = clampLine(y, H - spanY) - minY;
        return dx === 0 && dy === 0
          ? l
          : { ...l, x1: l.x1 + dx, x2: l.x2 + dx, y1: l.y1 + dy, y2: l.y2 + dy };
      });
  }
}

/** Where an item is, as the point moveTo takes. */
export function positionOf(d: WardLayout, ref: ItemRef): { x: number; y: number } | null {
  const it = findItem(d, ref);
  if (!it) return null;
  if (ref.kind === "divider") {
    const l = it as LayoutDivider;
    return { x: Math.min(l.x1, l.x2), y: Math.min(l.y1, l.y2) };
  }
  const p = it as unknown as { x: number; y: number };
  return { x: p.x, y: p.y };
}

export function nudge(d: WardLayout, ref: ItemRef, dx: number, dy: number): WardLayout {
  const p = positionOf(d, ref);
  return p ? moveTo(d, ref, p.x + dx, p.y + dy) : d;
}

const turn = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation;

/**
 * Rotate by 90°: beds and fixtures turn in place (kept on the floor); a room swaps width and depth; a
 * divider turns about its first end; a door switches between a wall across and a wall down.
 */
/**
 * A bed or fixture turned to `rot` about its middle (to the nearest cell), kept on the floor: what
 * dragging the rotate handle does, and what R and Rotate do a quarter turn at a time. The same
 * rotation hands back the same document, so a drag that ends where it began adds no undo step.
 */
export function rotateTo(d: WardLayout, ref: ItemRef, rot: Rotation): WardLayout {
  const about = <T extends { x: number; y: number; rot: Rotation }>(
    item: T,
    rectOf: (t: T) => Rect,
  ): T => {
    if (item.rot === rot) return item;
    const was = rectOf(item);
    const n = { ...item, rot };
    const size = rectOf({ ...n, x: 0, y: 0 });
    const x = Math.round(was.x + was.w / 2 - size.w / 2);
    const y = Math.round(was.y + was.h / 2 - size.h / 2);
    return { ...n, ...clampRect({ x, y, w: size.w, h: size.h }, d.floor) };
  };
  if (ref.kind === "bed") return mapList(d, "bed", ref.key, (b: LayoutBed) => about(b, bedRect));
  if (ref.kind === "fixture")
    return mapList(d, "fixture", ref.key, (f: LayoutFixture) => about(f, fixtureRect));
  return d;
}

/** The rotation a drag of the rotate handle asks for: where it started, plus the quarter turns
 *  the pointer has swept about the item's middle (angles in radians, screen y down). */
export function rotationFromDrag(start: Rotation, fromAngle: number, toAngle: number): Rotation {
  let delta = ((toAngle - fromAngle) * 180) / Math.PI;
  delta = (((delta % 360) + 540) % 360) - 180;
  const quarters = Math.round(delta / 90);
  return ((((start + quarters * 90) % 360) + 360) % 360) as Rotation;
}

export function rotate(d: WardLayout, ref: ItemRef): WardLayout {
  switch (ref.kind) {
    case "bed": {
      const b = d.beds.find((x) => x.key === ref.key);
      return b ? rotateTo(d, ref, turn(b.rot)) : d;
    }
    case "fixture": {
      const f = d.fixtures.find((x) => x.key === ref.key);
      return f ? rotateTo(d, ref, turn(f.rot)) : d;
    }
    case "room":
      return mapList(d, "room", ref.key, (r: LayoutRoom) => {
        const w = Math.min(r.h, d.floor.w);
        const h = Math.min(r.w, d.floor.h);
        return { ...r, w, h, ...clampRect({ x: r.x, y: r.y, w, h }, d.floor) };
      });
    case "door":
      return mapList(d, "door", ref.key, (o: LayoutDoor) => {
        const orient = o.orient === "h" ? "v" : "h";
        return {
          ...o,
          orient,
          x: Math.min(o.x, d.floor.w - (orient === "h" ? DOOR_CELLS : 0)),
          y: Math.min(o.y, d.floor.h - (orient === "v" ? DOOR_CELLS : 0)),
        };
      });
    case "divider":
      return mapList(d, "divider", ref.key, (l: LayoutDivider) => {
        const len = Math.abs(l.x2 - l.x1) + Math.abs(l.y2 - l.y1);
        return l.y1 === l.y2
          ? { ...l, x2: l.x1, y2: Math.min(d.floor.h, l.y1 + len) }
          : { ...l, y2: l.y1, x2: Math.min(d.floor.w, l.x1 + len) };
      });
  }
}

export function remove(d: WardLayout, ref: ItemRef): WardLayout {
  const name = LIST[ref.kind];
  const list = d[name] as { key: string }[];
  const next = list.filter((x) => x.key !== ref.key);
  return next.length === list.length ? d : { ...d, [name]: next };
}

/** A copy one cell down and right (a bed takes the next number and no register id). */
export function duplicate(d: WardLayout, ref: ItemRef): { doc: WardLayout; ref: ItemRef | null } {
  const it = findItem(d, ref);
  if (!it) return { doc: d, ref: null };
  const prefix = { bed: "b", room: "r", divider: "d", door: "o", fixture: "f" } as const;
  const key = nextKey(d, prefix[ref.kind]);
  let copy: { key: string } & Record<string, unknown>;
  if (ref.kind === "bed") {
    const { bedId: _id, ...b } = it as LayoutBed;
    void _id;
    copy = {
      ...b,
      key,
      label: nextBedLabels(
        d.beds.map((x) => x.label),
        1,
      )[0]!,
    };
  } else if (ref.kind === "divider") {
    const l = it as LayoutDivider;
    copy = { ...l, key, x1: l.x1 + 1, x2: l.x2 + 1, y1: l.y1 + 1, y2: l.y2 + 1 };
  } else {
    copy = { ...(it as unknown as Record<string, unknown>), key };
  }
  const name = LIST[ref.kind];
  const added = { ...d, [name]: [...(d[name] as { key: string }[]), copy] } as WardLayout;
  const newRef = { kind: ref.kind, key };
  if (ref.kind === "divider") return { doc: added, ref: newRef };
  const p = positionOf(added, newRef)!;
  return { doc: moveTo(added, newRef, p.x + 1, p.y + 1), ref: newRef };
}

/** Place one item from the palette with its top-left at `cell` (dividers are drawn with two clicks). */
export function place(
  d: WardLayout,
  tool: Exclude<Tool, "select" | "row" | `divider:${DividerKind}`>,
  cell: { x: number; y: number },
  line: { x: number; y: number },
): { doc: WardLayout; ref: ItemRef } {
  if (tool === "door") {
    const key = nextKey(d, "o");
    const door: LayoutDoor = {
      key,
      orient: "h",
      x: Math.max(0, Math.min(d.floor.w - DOOR_CELLS, line.x)),
      y: Math.max(0, Math.min(d.floor.h, line.y)),
    };
    return { doc: { ...d, doors: [...d.doors, door] }, ref: { kind: "door", key } };
  }
  const [kind, sub] = tool.split(":") as [string, string];
  if (kind === "bed") {
    const key = nextKey(d, "b");
    const b: LayoutBed = {
      key,
      label: nextBedLabels(
        d.beds.map((x) => x.label),
        1,
      )[0]!,
      type: sub as BedType,
      x: cell.x,
      y: cell.y,
      rot: 0,
      services: [],
      status: "in",
    };
    const p = clampRect(bedRect(b), d.floor);
    return { doc: { ...d, beds: [...d.beds, { ...b, ...p }] }, ref: { kind: "bed", key } };
  }
  if (kind === "fixture") {
    const key = nextKey(d, "f");
    const fk = sub as FixtureKind;
    const f: LayoutFixture = {
      key,
      kind: fk,
      label: fixtureSize(fk).label,
      x: cell.x,
      y: cell.y,
      rot: 0,
    };
    const p = clampRect(fixtureRect(f), d.floor);
    return {
      doc: { ...d, fixtures: [...d.fixtures, { ...f, ...p }] },
      ref: { kind: "fixture", key },
    };
  }
  // A room: a bay is empty; a single room comes with one bed, head to the far wall.
  const rk = sub as RoomKind;
  const size = ROOM_DEFAULT_SIZE[rk];
  const key = nextKey(d, "r");
  const count = d.rooms.filter((r) => r.kind === rk).length + 1;
  const name =
    rk === "bay"
      ? `Bay ${String.fromCharCode(64 + Math.min(26, d.rooms.filter((r) => r.kind === "bay").length + 1))}`
      : `${ROOM_KINDS.find((k) => k.code === rk)!.label.replace(" room", "")} ${count}`;
  const w = Math.min(size.w, d.floor.w);
  const h = Math.min(size.h, d.floor.h);
  const room: LayoutRoom = {
    key,
    kind: rk,
    name,
    ...clampRect({ x: cell.x, y: cell.y, w, h }, d.floor),
    w,
    h,
    door: "bottom",
    features:
      rk === "bay"
        ? {}
        : { ensuite: true, sink: true, ...(rk === "isolation" ? { anteroom: true } : {}) },
  };
  let doc: WardLayout = { ...d, rooms: [...d.rooms, room] };
  if (rk !== "bay") {
    const bedKey = nextKey(doc, "b");
    const b: LayoutBed = {
      key: bedKey,
      label: nextBedLabels(
        doc.beds.map((x) => x.label),
        1,
      )[0]!,
      type: "standard",
      x: room.x + Math.floor((room.w - 2) / 2),
      y: room.y + 1,
      rot: 0,
      services: [],
      status: "in",
    };
    doc = { ...doc, beds: [...doc.beds, { ...b, ...clampRect(bedRect(b), doc.floor) }] };
  }
  return { doc, ref: { kind: "room", key } };
}

/** A divider from `a` to `b` (already snapped straight); none when it has no length. */
export function addDivider(
  d: WardLayout,
  kind: DividerKind,
  a: { x: number; y: number },
  b: { x: number; y: number },
): { doc: WardLayout; ref: ItemRef } | null {
  if (a.x === b.x && a.y === b.y) return null;
  const key = nextKey(d, "d");
  const l: LayoutDivider = {
    key,
    kind,
    x1: clampLine(a.x, d.floor.w),
    y1: clampLine(a.y, d.floor.h),
    x2: clampLine(b.x, d.floor.w),
    y2: clampLine(b.y, d.floor.h),
  };
  return { doc: { ...d, dividers: [...d.dividers, l] }, ref: { kind: "divider", key } };
}

/** Stretch one end of a divider along its own line (never to zero length). */
export function setDividerEnd(
  d: WardLayout,
  key: string,
  end: 1 | 2,
  to: { x: number; y: number },
) {
  return mapList(d, "divider", key, (l: LayoutDivider) => {
    const across = l.y1 === l.y2;
    const v = across ? clampLine(to.x, d.floor.w) : clampLine(to.y, d.floor.h);
    const n = across
      ? end === 1
        ? { ...l, x1: v }
        : { ...l, x2: v }
      : end === 1
        ? { ...l, y1: v }
        : { ...l, y2: v };
    return n.x1 === n.x2 && n.y1 === n.y2 ? l : n;
  });
}

/** Set a divider's length (in cells) from its first end, in the direction it runs. */
export function setDividerLength(d: WardLayout, key: string, len: number) {
  return mapList(d, "divider", key, (l: LayoutDivider) => {
    const n = Math.max(1, Math.round(len));
    if (l.y1 === l.y2) {
      const dir = Math.sign(l.x2 - l.x1) || 1;
      return { ...l, x2: clampLine(l.x1 + dir * n, d.floor.w) };
    }
    const dir = Math.sign(l.y2 - l.y1) || 1;
    return { ...l, y2: clampLine(l.y1 + dir * n, d.floor.h) };
  });
}

/** Resize a room from its top-left: at least 1.5 m a side, never past the floor. */
export function resizeRoom(d: WardLayout, key: string, w: number, h: number) {
  return mapList(d, "room", key, (r: LayoutRoom) => {
    const nw = Math.max(3, Math.min(d.floor.w - r.x, Math.round(w)));
    const nh = Math.max(3, Math.min(d.floor.h - r.y, Math.round(h)));
    return nw === r.w && nh === r.h ? r : { ...r, w: nw, h: nh };
  });
}

/** A bed's type changes its footprint: keep it on the floor. */
export function setBedType(d: WardLayout, key: string, type: BedType) {
  return mapList(d, "bed", key, (b: LayoutBed) => {
    const n = { ...b, type };
    return { ...n, ...clampRect(bedRect(n), d.floor) };
  });
}

export function toggleService(d: WardLayout, key: string, code: ServiceCode) {
  return mapList(d, "bed", key, (b: LayoutBed) => ({
    ...b,
    services: b.services.includes(code)
      ? b.services.filter((s) => s !== code)
      : SERVICE_CODES.filter((c) => c === code || b.services.includes(c)),
  }));
}

/** The beds that share a place with this one: its room, or the open ward. */
export function companions(d: WardLayout, key: string): LayoutBed[] {
  const bed = findBed(d, key);
  if (!bed) return [];
  const room = roomOfBed(bed, d.rooms);
  return d.beds.filter(
    (b) => b.key !== key && (roomOfBed(b, d.rooms)?.key ?? null) === (room?.key ?? null),
  );
}

/** "Copy these services to every bed in this room / bay / the open ward." */
export function copyServicesToCompanions(d: WardLayout, key: string): WardLayout {
  const bed = findBed(d, key);
  if (!bed) return d;
  const keys = new Set(companions(d, key).map((b) => b.key));
  if (!keys.size) return d;
  return {
    ...d,
    beds: d.beds.map((b) => (keys.has(b.key) ? { ...b, services: [...bed.services] } : b)),
  };
}

/** The furthest right and down any item reaches: the floor can't shrink past it. */
export function extent(d: WardLayout): { w: number; h: number } {
  let w = 0;
  let h = 0;
  const see = (x: number, y: number) => {
    w = Math.max(w, x);
    h = Math.max(h, y);
  };
  for (const b of d.beds) {
    const r = bedRect(b);
    see(r.x + r.w, r.y + r.h);
  }
  for (const f of d.fixtures) {
    const r = fixtureRect(f);
    see(r.x + r.w, r.y + r.h);
  }
  for (const r of d.rooms) see(r.x + r.w, r.y + r.h);
  for (const l of d.dividers) see(Math.max(l.x1, l.x2), Math.max(l.y1, l.y2));
  for (const o of d.doors)
    see(o.x + (o.orient === "h" ? DOOR_CELLS : 0), o.y + (o.orient === "v" ? DOOR_CELLS : 0));
  return { w, h };
}

/** Change the floor size (cells), between 4 and 60 m and never smaller than what is on it. */
export function setFloor(d: WardLayout, w: number, h: number): WardLayout {
  const e = extent(d);
  const nw = Math.max(FLOOR_MIN, e.w, Math.min(FLOOR_MAX, Math.round(w)));
  const nh = Math.max(FLOOR_MIN, e.h, Math.min(FLOOR_MAX, Math.round(h)));
  return nw === d.floor.w && nh === d.floor.h ? d : { ...d, floor: { w: nw, h: nh } };
}

/** Every item, for the Items list: its kind, key, name and where it is, in reading order. */
export function itemsOf(d: WardLayout) {
  const rows: { ref: ItemRef; name: string; x: number; y: number; rot: number | null }[] = [];
  for (const b of d.beds)
    rows.push({ ref: { kind: "bed", key: b.key }, name: b.label, x: b.x, y: b.y, rot: b.rot });
  for (const r of d.rooms)
    rows.push({ ref: { kind: "room", key: r.key }, name: r.name, x: r.x, y: r.y, rot: null });
  for (const l of d.dividers)
    rows.push({
      ref: { kind: "divider", key: l.key },
      name: dividerLabel(l.kind),
      x: Math.min(l.x1, l.x2),
      y: Math.min(l.y1, l.y2),
      rot: null,
    });
  for (const o of d.doors)
    rows.push({ ref: { kind: "door", key: o.key }, name: "Door", x: o.x, y: o.y, rot: null });
  for (const f of d.fixtures)
    rows.push({ ref: { kind: "fixture", key: f.key }, name: f.label, x: f.x, y: f.y, rot: f.rot });
  // A name shared within a kind ("Window", "Door", two B3s in a draft) is counted, so each row's
  // controls have a label of their own for a screen reader: "Window (2 of 3)".
  const total = new Map<string, number>();
  for (const r of rows)
    total.set(`${r.ref.kind}:${r.name}`, (total.get(`${r.ref.kind}:${r.name}`) ?? 0) + 1);
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const k = `${r.ref.kind}:${r.name}`;
    const of = total.get(k)!;
    if (of < 2) return r;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return { ...r, name: `${r.name} (${n} of ${of})` };
  });
}

/** The item at a point on the plan (top-most first: handles aside, beds, fixtures, doors, dividers, rooms). */
export function hitTest(d: WardLayout, fx: number, fy: number): ItemRef | null {
  const inside = (r: Rect) => fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h;
  for (let i = d.beds.length - 1; i >= 0; i--)
    if (inside(bedRect(d.beds[i]!))) return { kind: "bed", key: d.beds[i]!.key };
  for (let i = d.fixtures.length - 1; i >= 0; i--)
    if (inside(fixtureRect(d.fixtures[i]!))) return { kind: "fixture", key: d.fixtures[i]!.key };
  for (let i = d.doors.length - 1; i >= 0; i--) {
    const o = d.doors[i]!;
    const r =
      o.orient === "h"
        ? { x: o.x, y: o.y - 0.5, w: DOOR_CELLS, h: 1 }
        : { x: o.x - 0.5, y: o.y, w: 1, h: DOOR_CELLS };
    if (inside(r)) return { kind: "door", key: o.key };
  }
  const near = 0.35;
  for (let i = d.dividers.length - 1; i >= 0; i--) {
    const l = d.dividers[i]!;
    const across = l.y1 === l.y2;
    const hit = across
      ? Math.abs(fy - l.y1) <= near &&
        fx >= Math.min(l.x1, l.x2) - near &&
        fx <= Math.max(l.x1, l.x2) + near
      : Math.abs(fx - l.x1) <= near &&
        fy >= Math.min(l.y1, l.y2) - near &&
        fy <= Math.max(l.y1, l.y2) + near;
    if (hit) return { kind: "divider", key: l.key };
  }
  for (let i = d.rooms.length - 1; i >= 0; i--)
    if (inside(roomRect(d.rooms[i]!))) return { kind: "room", key: d.rooms[i]!.key };
  return null;
}

/** The footprint a palette tool would place at `cell` (for the dashed preview). */
export function ghostRect(
  tool: Tool,
  cell: { x: number; y: number },
  floor: { w: number; h: number },
): Rect | null {
  const [kind, sub] = tool.split(":") as [string, string | undefined];
  let size: { w: number; h: number } | null = null;
  if (kind === "bed")
    size = turned(bedTypeSize(sub as BedType).w, bedTypeSize(sub as BedType).h, 0);
  else if (kind === "fixture") size = fixtureSize(sub as FixtureKind);
  else if (kind === "room") size = ROOM_DEFAULT_SIZE[sub as RoomKind];
  if (!size) return null;
  const w = Math.min(size.w, floor.w);
  const h = Math.min(size.h, floor.h);
  return { ...clampRect({ x: cell.x, y: cell.y, w, h }, floor), w, h };
}

function bedTypeSize(t: BedType) {
  return bedRect({ x: 0, y: 0, rot: 0, type: t });
}

/* ─── several at once: a box, Shift+click, and what a group can do ─── */

/** An item's extent on the floor, in cells (a door or divider is a line: one side is 0). */
export function extentOf(d: WardLayout, ref: ItemRef): Rect | null {
  switch (ref.kind) {
    case "bed": {
      const b = findBed(d, ref.key);
      return b ? bedRect(b) : null;
    }
    case "fixture": {
      const f = findFixture(d, ref.key);
      return f ? fixtureRect(f) : null;
    }
    case "room": {
      const r = findRoom(d, ref.key);
      return r ? roomRect(r) : null;
    }
    case "door": {
      const o = findDoor(d, ref.key);
      if (!o) return null;
      return o.orient === "h"
        ? { x: o.x, y: o.y, w: DOOR_CELLS, h: 0 }
        : { x: o.x, y: o.y, w: 0, h: DOOR_CELLS };
    }
    case "divider": {
      const l = findDivider(d, ref.key);
      if (!l) return null;
      const x = Math.min(l.x1, l.x2);
      const y = Math.min(l.y1, l.y2);
      return { x, y, w: Math.abs(l.x2 - l.x1), h: Math.abs(l.y2 - l.y1) };
    }
  }
}

const allRefs = (d: WardLayout): ItemRef[] => [
  ...d.beds.map((b) => ({ kind: "bed" as const, key: b.key })),
  ...d.fixtures.map((f) => ({ kind: "fixture" as const, key: f.key })),
  ...d.doors.map((o) => ({ kind: "door" as const, key: o.key })),
  ...d.dividers.map((l) => ({ kind: "divider" as const, key: l.key })),
  ...d.rooms.map((r) => ({ kind: "room" as const, key: r.key })),
];

/** Everything on the plan (Ctrl/Cmd+A). */
export const selectAll = allRefs;

/**
 * What a box drawn across the plan catches: beds, fixtures and doors it touches; rooms and dividers
 * only when wholly inside it, so a box drawn inside a bay picks its beds, not the bay and its walls.
 */
export function itemsInBox(d: WardLayout, box: Rect): ItemRef[] {
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  return allRefs(d).filter((ref) => {
    const r = extentOf(d, ref);
    if (!r) return false;
    if (ref.kind === "room" || ref.kind === "divider")
      return r.x >= box.x && r.y >= box.y && r.x + r.w <= x1 && r.y + r.h <= y1;
    return r.x <= x1 && box.x <= r.x + r.w && r.y <= y1 && box.y <= r.y + r.h;
  });
}

/**
 * Moves items together by (dx, dy) cells as one group: at the floor's edge the whole group stops,
 * rather than the items nearest the edge bunching up. The same document when nothing moves.
 */
export function moveMany(d: WardLayout, refs: ItemRef[], dx: number, dy: number): WardLayout {
  const rects = refs.map((r) => extentOf(d, r)).filter((r): r is Rect => !!r);
  if (!rects.length) return d;
  const lo = (v: number[]) => Math.max(...v);
  const hi = (v: number[]) => Math.min(...v);
  const ddx = Math.min(
    hi(rects.map((r) => d.floor.w - r.x - r.w)),
    Math.max(lo(rects.map((r) => -r.x)), dx),
  );
  const ddy = Math.min(
    hi(rects.map((r) => d.floor.h - r.y - r.h)),
    Math.max(lo(rects.map((r) => -r.y)), dy),
  );
  if (!ddx && !ddy) return d;
  let next = d;
  for (const ref of refs) {
    if (ref.kind === "divider") {
      next = mapList(next, "divider", ref.key, (l: LayoutDivider) => ({
        ...l,
        x1: l.x1 + ddx,
        x2: l.x2 + ddx,
        y1: l.y1 + ddy,
        y2: l.y2 + ddy,
      }));
    } else {
      next = mapList(next, ref.kind, ref.key, (it: { x: number; y: number }) => ({
        ...it,
        x: it.x + ddx,
        y: it.y + ddy,
      }));
    }
  }
  return next;
}

export const removeMany = (d: WardLayout, refs: ItemRef[]) => refs.reduce(remove, d);
export const rotateEach = (d: WardLayout, refs: ItemRef[]) => refs.reduce(rotate, d);

/** Whether every, some or none of these beds has a service. */
export function serviceAcross(d: WardLayout, keys: string[], code: ServiceCode) {
  const beds = keys.map((k) => findBed(d, k)).filter((b): b is LayoutBed => !!b);
  const n = beds.filter((b) => b.services.includes(code)).length;
  return n === 0 ? "none" : n === beds.length ? "all" : "some";
}

/** A service on every one of these beds, or off every one. */
export function setServiceOn(d: WardLayout, keys: string[], code: ServiceCode, on: boolean) {
  let next = d;
  for (const key of keys)
    next = mapList(next, "bed", key, (b: LayoutBed) =>
      b.services.includes(code) === on
        ? b
        : {
            ...b,
            services: on
              ? SERVICE_CODES.filter((c) => c === code || b.services.includes(c))
              : b.services.filter((s) => s !== code),
          },
    );
  return next;
}

/** Shift+click: in the selection, or not. */
export function toggleRef(refs: ItemRef[], ref: ItemRef): ItemRef[] {
  return refs.some((r) => sameRef(r, ref)) ? refs.filter((r) => !sameRef(r, ref)) : [...refs, ref];
}

/** Two selections together, each item once. */
export function unionRefs(a: ItemRef[], b: ItemRef[]): ItemRef[] {
  return [...a, ...b.filter((r) => !a.some((x) => sameRef(x, r)))];
}
