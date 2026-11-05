import type { SignedCopy } from "@/content/signed-copy";

import { KIT_RANGE, kitAbove } from "@/content/pharmacy-rules";

/** Health and lab supplies, the words every tab shares (SUPPLIES.md, verbatim). Draft until the CSO signs. */
export const PHARMACY_SUPPLIES_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export type ItemType = "medicine" | "health_supply" | "lab_supply";
export type TypeFilter = "all" | ItemType;

export const TYPE_SWITCH = {
  aria: "What to show",
  order: ["all", "medicine", "health_supply", "lab_supply"] as readonly TypeFilter[],
  label: {
    all: "Everything",
    medicine: "Medicines",
    health_supply: "Health supplies",
    lab_supply: "Lab supplies",
  } satisfies Record<TypeFilter, string>,
};

/** The filter's words (§C) and the sub-heading after the switch (§D). */
export const TYPE_WORD: Record<ItemType, string> = {
  medicine: "Medicine",
  health_supply: "Health supply",
  lab_supply: "Laboratory supply",
};
export const TYPE_SUB: Record<TypeFilter, string> = {
  all: "everything",
  medicine: "medicines",
  health_supply: "health supplies",
  lab_supply: "lab supplies",
};
/** The grid's name column follows the switch (§C). */
export const NAME_HEAD: Record<TypeFilter, string> = {
  all: "Item",
  medicine: "Medicine",
  health_supply: "Supply",
  lab_supply: "Supply",
};
export const itemsCount = (medicines: number, supplies: number) =>
  `${medicines} ${medicines === 1 ? "medicine" : "medicines"} · ${supplies} ${supplies === 1 ? "supply" : "supplies"}`;

/** The chip under a supply's name (§D). */
export const typeTag = (type: ItemType, f: { sterile?: boolean; kit?: boolean }) =>
  type === "lab_supply"
    ? `Lab supply${f.kit ? ` · ${KIT_RANGE}` : ""}`
    : type === "health_supply"
      ? `Health supply${f.sterile ? " · sterile" : ""}`
      : "";

export const SUPPLY_SALE = "Supply (issued, not dispensed)";
export const NO_EXPIRY_WORD = "no expiry";
export const emhsluGroup = (level: string) => `EMHSLU 2023 · from ${level}`;
export const SUPPLY_UNITS = ["piece", "pair", "packet", "roll", "test", "strip", "bottle"] as const;
export const SUPPLY_FORMS = [
  "Syringe",
  "Cannula",
  "Set",
  "Swab",
  "Disinfectant",
  "Cotton wool",
  "Gauze swab",
  "Adhesive plaster",
  "Catheter",
  "Tube",
  "Bag",
  "Gloves",
  "Suture",
  "Container",
  "Mask",
  "Clamp",
  "Test kit",
  "Test strips",
] as const;

/** The EMHSLU sub-headings (§A), used where medicines use the class. */
export const SUPPLY_CLASSES = [
  "Administration sets, cannulas, needles and syringes",
  "Antiseptics, detergents and disinfectants",
  "Bandages and dressings",
  "Catheters and tubes",
  "Gloves",
  "Ligatures, suture materials and surgicals",
  "Protectives",
  "Ward and theatre supplies",
  "Laboratory: rapid tests",
  "Laboratory: test strips",
] as const;

export const levelWarn = (level: string) => `Above this hospital's level: from ${level}`;

export const SECTION_C = {
  title: "Specialist supplies (EMHSLU Section C)",
  body: "Dental, ENT, eye, orthopaedic, renal and radiology items. Off until this hospital uses them.",
  on: "Section C is on: specialist supplies show in the catalogue.",
  off: "Section C is off: specialist supplies are hidden from the catalogue.",
  refused: "Only the in-charge turns this on or off.",
};

export const RECEIVE_SUPPLY = {
  tag: {
    health: "Health supply",
    lab: "Lab supply",
    sterile: "Sterile",
    kit: `Kit · ${KIT_RANGE}`,
    noExpiry: "No expiry",
    keepSealed: "Sterile · keep sealed",
  },
  seal: {
    label: "Packaging and sterile seal on the packs",
    options: [
      { value: "ok", label: "Intact, dry and in date" },
      { value: "broken", label: "Broken, wet or torn" },
    ],
    word: "Sterile seal broken",
    note: "A broken, wet or torn sterile pack is not sterile. Tick Some are not accepted, count the broken packs as damaged, and give them back to the driver.",
    missing: (no: number) => `Line ${no}: check the packaging and sterile seal on the packs.`,
    problem: (no: number) =>
      `Line ${no}: the sterile seal is broken. It cannot go into stock: reject the broken packs as damaged.`,
  },
  kit: {
    label: `Were the test kits kept at ${KIT_RANGE} on the way?`,
    options: [
      { value: "ok", label: `Yes, ${KIT_RANGE}` },
      { value: "hot", label: "No, it got hot" },
    ],
    word: `Kits kept ${kitAbove}`,
    note: `Test kits kept ${kitAbove} can give false results. Keep them apart and ask the supplier, or reject them.`,
    missing: (no: number) => `Line ${no}: confirm the test kits were kept at ${KIT_RANGE}.`,
    problem: (no: number) =>
      `Line ${no}: the kits were kept ${kitAbove}. Reject them, or keep them apart until the supplier answers.`,
  },
  noExpiry: {
    label: "Expiry (none for this item)",
    note: "This item has no expiry date. Give the batch or lot number only.",
  },
  picker: {
    find: "Find a medicine or supply",
    none: "Nothing by that name in your medicines and supplies.",
    kitSub: `Kit, ${KIT_RANGE}`,
  },
} as const;

const PICK_PREFIX = { health_supply: "[Supply]", lab_supply: "[Lab]" };
/** A picker option in the store's dialogs (§D). */
export const pickLabel = (name: string, type: ItemType) =>
  type === "medicine" ? name : `${PICK_PREFIX[type]} ${name}`;
