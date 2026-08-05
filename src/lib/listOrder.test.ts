import { describe, expect, it } from "vitest";
import {
  assignSequentialOrders,
  compareManualOrder,
  moveItemByOffset,
  nextTopSortOrder,
  reorderById,
  sortItemsForMode,
} from "./listOrder";

describe("listOrder", () => {
  it("puts lower sortOrder first, then newest without order", () => {
    const a = { id: "a", text: "A", sortOrder: 2, createdAt: 10 };
    const b = { id: "b", text: "B", sortOrder: 1, createdAt: 20 };
    const c = { id: "c", text: "C", createdAt: 30 };
    const d = { id: "d", text: "D", createdAt: 5 };

    expect(sortItemsForMode([a, b, c, d], "manual").map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("sorts alphabetically in alpha mode", () => {
    const items = [
      { id: "1", text: "Zucchini", createdAt: 1 },
      { id: "2", text: "Apples", createdAt: 2 },
      { id: "3", text: "milk", createdAt: 3 },
    ];
    expect(sortItemsForMode(items, "alpha").map((i) => i.text)).toEqual([
      "Apples",
      "milk",
      "Zucchini",
    ]);
  });

  it("reorders by id and assigns dense sortOrder", () => {
    const items = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
    ];
    const moved = reorderById(items, "c", "a");
    expect(moved.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(assignSequentialOrders(moved)).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("moves by offset and no-ops at ends", () => {
    const items = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ];
    expect(moveItemByOffset(items, "a", -1)).toEqual(items);
    expect(moveItemByOffset(items, "a", 1).map((i) => i.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("computes next top sortOrder", () => {
    expect(nextTopSortOrder([])).toBe(0);
    expect(nextTopSortOrder([{ sortOrder: 3 }, { sortOrder: 1 }])).toBe(0);
    expect(nextTopSortOrder([{}])).toBe(0);
  });

  it("compareManualOrder is stable for equal timestamps", () => {
    const a = { id: "a", text: "Alpha", createdAt: 1 };
    const b = { id: "b", text: "Beta", createdAt: 1 };
    expect(compareManualOrder(a, b)).toBeLessThan(0);
  });
});
