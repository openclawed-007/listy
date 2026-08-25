import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useListView } from "./useListView";
import type { ShoppingItem } from "../lib/shoppingItem";

const items: ShoppingItem[] = [
  {
    id: "milk",
    text: "Milk",
    completed: false,
    userId: "u1",
    category: "Dairy",
    note: "oat",
    sortOrder: 1,
  },
  {
    id: "apples",
    text: "Apples",
    completed: true,
    userId: "u1",
    category: "Produce",
    sortOrder: 0,
  },
  {
    id: "bread",
    text: "Bread",
    completed: false,
    userId: "u1",
    category: "Bakery",
    sortOrder: 2,
  },
];

describe("useListView", () => {
  it("partitions, sorts, groups, and counts the full list", () => {
    const { result } = renderHook(() => useListView(items, "", "manual"));

    expect(result.current.activeItems.map((item) => item.id)).toEqual([
      "milk",
      "bread",
    ]);
    expect(result.current.doneGroups[0].category).toBe("Produce");
    expect(result.current.statsLeft).toBe(2);
    expect(result.current.statsDone).toBe(1);
    expect(result.current.progress).toBe(33);
  });

  it("searches item metadata and reports result-specific statistics", () => {
    const { result } = renderHook(() => useListView(items, "oat", "aisle"));

    expect(result.current.activeItems.map((item) => item.id)).toEqual(["milk"]);
    expect(result.current.doneItems).toEqual([]);
    expect(result.current.isSearching).toBe(true);
    expect(result.current.statsLeft).toBe(1);
    expect(result.current.statsDone).toBe(0);
  });

  it("sorts alphabetically when requested", () => {
    const { result } = renderHook(() => useListView(items, "", "alpha"));

    expect(result.current.activeItems.map((item) => item.id)).toEqual([
      "bread",
      "milk",
    ]);
  });
});
