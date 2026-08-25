import { useMemo } from "react";
import { sortItemsForMode, type ListSortMode } from "../lib/listOrder";
import {
  groupItemsByCategory,
  type ShoppingItem,
} from "../lib/shoppingItem";

/** Derives search results, sections, and headline statistics for a list view. */
export function useListView(
  items: ShoppingItem[],
  search: string,
  sortMode: ListSortMode,
) {
  return useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();
    const filtered = normalizedQuery
      ? items.filter((item) =>
          [item.text, item.quantity, item.category, item.note]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : items;

    const activeItems = sortItemsForMode(
      filtered.filter((item) => !item.completed),
      sortMode,
    );
    const doneItems = sortItemsForMode(
      filtered.filter((item) => item.completed),
      sortMode,
    );
    const allDoneCount = items.filter((item) => item.completed).length;
    const totalCount = items.length;
    const isSearching = normalizedQuery.length > 0;

    return {
      activeItems,
      doneItems,
      doneGroups: groupItemsByCategory(doneItems),
      activeCount: activeItems.length,
      doneCount: doneItems.length,
      filteredCount: filtered.length,
      allDoneCount,
      totalCount,
      isSearching,
      progress: totalCount
        ? Math.round((allDoneCount / totalCount) * 100)
        : 0,
      statsLeft: isSearching
        ? activeItems.length
        : totalCount - allDoneCount,
      statsDone: isSearching ? doneItems.length : allDoneCount,
    };
  }, [items, search, sortMode]);
}
