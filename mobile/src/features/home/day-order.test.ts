import { dropIndex, moved, travel } from "@/components/tide/reorder-cascade";
import { DEFAULT_ORDER, orderFrom, sortByOrder } from "@/features/home/day-order";

describe("day order", () => {
  it("sorts cards by their group, keeping each group's own order", () => {
    const cards = [
      { key: "d1", group: "medicine" as const },
      { key: "d2", group: "medicine" as const },
      { key: "move", group: "move" as const },
      { key: "eat", group: "eat" as const },
    ];
    expect(sortByOrder(cards, ["eat", "move", "medicine", "reading"]).map((c) => c.key)).toEqual([
      "eat",
      "move",
      "d1",
      "d2",
    ]);
  });

  it("keeps groups not shown today in their place after a drag", () => {
    expect(orderFrom(["eat", "medicine", "move"], DEFAULT_ORDER)).toEqual([
      "eat",
      "medicine",
      "move",
      "reading",
    ]);
  });
});

describe("drag maths", () => {
  const strides = [80, 120, 80, 80];

  it("passes a neighbour after half its stride, either way", () => {
    expect(dropIndex(strides, 0, 59)).toBe(0);
    expect(dropIndex(strides, 0, 61)).toBe(1);
    expect(dropIndex(strides, 0, 161)).toBe(2);
    expect(dropIndex(strides, 3, -41)).toBe(2);
    expect(dropIndex(strides, 3, -500)).toBe(0);
    expect(dropIndex(strides, 3, 500)).toBe(3);
  });

  it("measures the settle distance and moves the item", () => {
    expect(travel(strides, 0, 2)).toBe(200);
    expect(travel(strides, 3, 1)).toBe(-200);
    expect(moved(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
});
