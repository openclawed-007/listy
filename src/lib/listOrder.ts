// Sort modes and reorder helpers for shopping lists.
//
// Manual order is stored as `sortOrder` on each item. Older rows without it
// fall back to newest-first (createdAt), matching historical behaviour.

export type ListSortMode = "aisle" | "manual" | "alpha";

export const LIST_SORT_MODES: Array<{
  id: ListSortMode;
  label: string;
  shortLabel: string;
}> = [
  { id: "aisle", label: "By aisle", shortLabel: "Aisle" },
  { id: "manual", label: "My order", shortLabel: "Order" },
  { id: "alpha", label: "A–Z", shortLabel: "A–Z" },
];

const SORT_STORAGE_KEY = "cartlink:list-sort:v1";
const DONE_COLLAPSED_KEY = "cartlink:done-collapsed:v1";

export function isListSortMode(value: unknown): value is ListSortMode {
  return value === "aisle" || value === "manual" || value === "alpha";
}

export function readListSortMode(): ListSortMode {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    return isListSortMode(raw) ? raw : "aisle";
  } catch {
    return "aisle";
  }
}

export function writeListSortMode(mode: ListSortMode) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch {
    // Privacy modes may block storage; preference just won't persist.
  }
}

export function readDoneCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(DONE_COLLAPSED_KEY);
    // Default collapsed so a long "done" tail does not dominate the screen.
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function writeDoneCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(DONE_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Same as sort preference — non-fatal.
  }
}

type Orderable = {
  id: string;
  text: string;
  important?: boolean;
  sortOrder?: number;
  createdAt?: { toMillis?: () => number } | number;
};

function createdAtMillis(item: Orderable): number {
  const value = item.createdAt;
  if (typeof value === "number") return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

/** Stable manual order: explicit sortOrder first, then newest-first. */
export function compareManualOrder(a: Orderable, b: Orderable): number {
  const ao = typeof a.sortOrder === "number" ? a.sortOrder : null;
  const bo = typeof b.sortOrder === "number" ? b.sortOrder : null;

  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;

  const timeDiff = createdAtMillis(b) - createdAtMillis(a);
  if (timeDiff !== 0) return timeDiff;
  return a.text.localeCompare(b.text, undefined, { sensitivity: "base" });
}

export function compareAlphaOrder(a: Orderable, b: Orderable): number {
  const byText = a.text.localeCompare(b.text, undefined, {
    sensitivity: "base",
  });
  if (byText !== 0) return byText;
  return compareManualOrder(a, b);
}

/**
 * Sort for display.
 * - Aisle / A–Z: important items float to the top (then aisle or alpha).
 * - Manual: pure user order — star is visual only so "my order" stays trusted.
 */
export function sortItemsForMode<T extends Orderable>(
  items: T[],
  mode: ListSortMode,
): T[] {
  const copy = [...items];
  if (mode === "manual") {
    copy.sort(compareManualOrder);
    return copy;
  }

  copy.sort((a, b) => {
    const aImportant = a.important === true;
    const bImportant = b.important === true;
    if (aImportant !== bImportant) return aImportant ? -1 : 1;
    if (mode === "alpha") return compareAlphaOrder(a, b);
    return compareManualOrder(a, b);
  });
  return copy;
}

/** New items land at the top of the active list (smallest sortOrder). */
export function nextTopSortOrder(items: Array<{ sortOrder?: number }>): number {
  let min = 0;
  let found = false;
  for (const item of items) {
    if (typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)) {
      min = found ? Math.min(min, item.sortOrder) : item.sortOrder;
      found = true;
    }
  }
  return found ? min - 1 : 0;
}

/**
 * Move `draggedId` to the position of `targetId` within `items`.
 * Returns a new array; does not mutate the input.
 */
export function reorderById<T extends { id: string }>(
  items: T[],
  draggedId: string,
  targetId: string,
): T[] {
  if (draggedId === targetId) return items;
  const from = items.findIndex((item) => item.id === draggedId);
  const to = items.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Move one step up or down; no-op at list ends. */
export function moveItemByOffset<T extends { id: string }>(
  items: T[],
  id: string,
  offset: -1 | 1,
): T[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return items;
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  return reorderById(items, id, items[target].id);
}

/** Assign dense 0..n-1 sortOrder values after a reorder. */
export function assignSequentialOrders(
  items: Array<{ id: string }>,
  start = 0,
): Array<{ id: string; sortOrder: number }> {
  return items.map((item, index) => ({
    id: item.id,
    sortOrder: start + index,
  }));
}
