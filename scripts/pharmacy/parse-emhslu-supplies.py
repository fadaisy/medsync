#!/usr/bin/env python3
"""EMHSLU 2023 Sections B, C, D -> data/emhslu-2023-supplies.csv. Parsed once; items are never hand-typed.

  swiftc -O scripts/pharmacy/emhslu-rows.swift -o /tmp/emhslu-rows -framework PDFKit
  /tmp/emhslu-rows docs/pharmacy/rework/EMHSLU-2023.pdf 52 113 > /tmp/rows.txt
  python3 -I scripts/pharmacy/parse-emhslu-supplies.py /tmp/rows.txt data/emhslu-2023-supplies.csv

Rows are rebuilt from text positions. B and C wrap below the row holding the level; D wraps above it.
The PDF has no unit column in B and C, so their unit stays empty rather than guessed.
"""
import collections, csv, re, sys

LOC = r"(HC[1-4]|HC IV|H|RR|NR|UBTS|[A-Z]{2,6})"
LOC_VEN = re.compile(rf"^{LOC}\s+([VEN])$")
TAIL = re.compile(rf"^(.*\S)\s+{LOC}\s+([VEN])$")
HEADING = re.compile(r"^(\d+(?:\.\d+)*)\.?\s*(.+)$")
SKIP = re.compile(r"EMHSLU|^ITEM DESCRIPTION|^SECTION [BCD]:|^Table 2")

# Top-level headings. The PDF fuses some words ("ANDDRESSINGS"), so B and C use a normalised spelling.
B = {1: "Administration sets, cannulas, needles and syringes", 2: "Antiseptics, detergents and disinfectants",
     3: "Bandages and dressings", 4: "Catheters and tubes", 5: "Gloves", 6: "Ligatures, suture materials and surgicals",
     7: "Protectives", 8: "Surgical instruments", 9: "Ward and theatre supplies", 10: "Packing bags",
     11: "Radiology and other imaging supplies", 12: "Stationery and stock management"}
C = {1: "Ligatures and suture materials and surgicals", 2: "Catheters and tubes", 3: "Orthopaedic supplies",
     4: "Dialysis supplies", 5: "Dental supplies", 6: "Ophthalmic supplies", 7: "Protectives", 8: "Bone marrow supplies"}


def load(path):
    pages = collections.defaultdict(lambda: collections.defaultdict(list))
    for line in open(path, encoding="utf-8"):
        p, y, x, r, s = line.rstrip("\n").split("|", 4)
        pages[int(p)][int(y)].append((int(x), s.strip()))
    return pages


def parse_bc(pages, first, last, section, heads, out, unparsed):
    cat, prev = None, None
    for p in range(first, last + 1):
        rows = pages[p]
        for y in sorted(rows, reverse=True):
            cells = sorted(rows[y])
            joined = " ".join(c[1] for c in cells)
            if SKIP.search(joined):
                continue
            m = HEADING.match(joined) if cells[0][0] < 290 and len(cells) == 1 else None
            if m:
                top = int(m.group(1).split(".")[0])
                if "." not in m.group(1) and top in heads:
                    cat = heads[top]
                prev = None
                continue
            name, spec, loc, ven = [], [], None, None
            for x, s in cells:
                if x >= 440:
                    lv = LOC_VEN.match(s)
                    if lv:
                        loc, ven = lv.groups()
                    elif re.fullmatch(LOC, s):
                        loc = s
                    elif s in "VEN":
                        ven = s
                    elif prev is not None and s.startswith("("):
                        pass  # "(HC1)" note under a level
                    else:
                        unparsed.append((p, y, joined))
                elif x >= 280:
                    t = TAIL.match(s)
                    if t:
                        spec.append(t.group(1))
                        loc, ven = t.group(2), t.group(3)
                    else:
                        spec.append(s)
                else:
                    name.append(s)
            if loc and ven:
                prev = {"section": section, "category": cat, "name": " ".join(name), "specification": " ".join(spec),
                        "unit": "", "level": loc, "ven": ven}
                if not prev["name"]:
                    unparsed.append((p, y, joined))
                out.append(prev)
            elif prev is not None and (name or spec):  # a wrap below the row
                prev["name"] = " ".join([prev["name"], *name]).strip()
                prev["specification"] = " ".join([prev["specification"], *spec]).strip()
            elif name or spec:
                unparsed.append((p, y, joined))


def parse_d(pages, first, last, out, unparsed):
    cat = None
    for p in range(first, last + 1):
        rows = pages[p]
        ys = sorted(rows, reverse=True)
        pending = []
        for i, y in enumerate(ys):
            cells = sorted(rows[y])
            joined = " ".join(c[1] for c in cells)
            if SKIP.search(joined):
                continue
            if joined == "L":  # tail of "NTRL NTR" + "L", the level repeated in the VEN column
                continue
            name = " ".join(s for x, s in cells if x < 380)
            unit = " ".join(s for x, s in cells if 380 <= x < 440)
            lv, ven = None, ""
            for x, s in cells:
                if x >= 440:
                    m = LOC_VEN.match(s)
                    if m:
                        lv, ven = m.group(1), m.group(2)
                    elif s == "NTRL NTR":
                        lv = "NTRL"
                elif x >= 380 and (t := TAIL.match(s)):
                    unit, lv, ven = t.group(1), t.group(2), t.group(3)
            if lv:
                out.append({"section": "D", "category": cat, "name": " ".join([*pending, name]).strip(),
                            "specification": "", "unit": unit, "level": lv, "ven": ven})
                pending = []
                continue
            if out and out[-1]["section"] == "D" and not pending and name and not unit and re.match(r"[a-z0-9(]", name):
                out[-1]["name"] += " " + name  # a wrap below the row
                continue
            if name.startswith("Haematology, ") and not unit:  # an item row the PDF left without a level
                out.append({"section": "D", "category": cat, "name": name, "specification": "", "unit": "", "level": "", "ven": ""})
                continue
            nxt = ys[i + 1] if i + 1 < len(ys) else None
            if nxt is not None and y - nxt < 13 and not unit:  # wraps into the next row
                pending.append(name)
            elif name and not unit:
                cat = re.sub(r"\s+", " ", name)
                pending = []
            else:
                unparsed.append((p, y, joined))


def main(src, dst):
    pages = load(src)
    items, unparsed = [], []
    parse_bc(pages, 52, 64, "B", B, items, unparsed)
    parse_bc(pages, 65, 70, "C", C, items, unparsed)
    parse_d(pages, 81, 113, items, unparsed)
    with open(dst, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["section", "category", "name", "specification", "unit", "level of care", "VEN"])
        for i in items:
            w.writerow([i["section"], i["category"], re.sub(r"\s+", " ", i["name"]), re.sub(r"\s+", " ", i["specification"]), i["unit"], i["level"], i["ven"]])
    print(collections.Counter(i["section"] for i in items))
    print("unparsed", len(unparsed))
    for u in unparsed:
        print(u)


main(sys.argv[1], sys.argv[2])
