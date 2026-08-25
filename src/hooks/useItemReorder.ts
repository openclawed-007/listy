import React from "react";
import { DEFAULT_CATEGORY } from "../lib/itemInput";
import { captureItemRects, playItemFlip } from "../lib/listFlip";
import {
  assignSequentialOrders,
  moveItemByOffset,
  reorderById,
  type ListSortMode,
} from "../lib/listOrder";
import type { ItemReorderState } from "../components/ItemRow";

export interface ReorderCommit<T> {
  /** Full active list in its new order, with dense sequential sortOrders. */
  nextActive: T[];
  /** id → sortOrder pairs for `nextActive`. */
  orders: Array<{ id: string; sortOrder: number }>;
  /**
   * Natural write scope: the whole active list for manual moves/drops,
   * or just the affected aisle group for aisle-constrained keyboard moves.
   */
  scopeItems: T[];
  /** False when a drop landed back in the original order. */
  changed: boolean;
}

export interface UseItemReorderOptions<T> {
  /** Active (not-done) items in display order. */
  activeItems: T[];
  sortMode: ListSortMode;
  /** Drag interactions are only wired up when enabled. */
  enabled: boolean;
  /**
   * Optional gate for keyboard moves (e.g. require sign-in or an idle add
   * field). Drag preview/commit paths are gated by `enabled` instead.
   */
  canReorder?: () => boolean;
  /**
   * Persist a committed order — update local state and, when signed in,
   * the remote list. Called after the hook has updated its live refs.
   */
  onCommitOrder: (commit: ReorderCommit<T>) => void | Promise<void>;
}

interface ReorderableItem {
  id: string;
  category?: string;
}

/**
 * Shared drag + keyboard reorder machinery for shopping lists.
 *
 * Owns the preview-order state, FLIP animation bookkeeping and the
 * aisle-constrained reorder algorithm so the owner list and the guest list
 * behave identically. Persistence stays with the caller via `onCommitOrder`.
 */
export function useItemReorder<T extends ReorderableItem>({
  activeItems,
  sortMode,
  enabled,
  canReorder,
  onCommitOrder,
}: UseItemReorderOptions<T>) {
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = React.useState<string | null>(null);
  const [dragOrderIds, setDragOrderIds] = React.useState<string[] | null>(null);
  const draggingIdRef = React.useRef<string | null>(null);
  const dragOrderIdsRef = React.useRef<string[] | null>(null);
  const flipFirstRef = React.useRef<Map<string, DOMRect> | null>(null);
  const activeItemsRef = React.useRef<T[]>([]);

  /**
   * While dragging, reorder is a pure display list of ids — item objects stay
   * untouched so the rest of the list does not re-render with new data.
   */
  const displayActiveItems = React.useMemo(() => {
    if (!dragOrderIds) return activeItems;
    const byId = new Map(activeItems.map((item) => [item.id, item]));
    const ordered: T[] = [];
    for (const id of dragOrderIds) {
      const item = byId.get(id);
      if (item) {
        ordered.push(item);
        byId.delete(id);
      }
    }
    for (const item of byId.values()) ordered.push(item);
    return ordered;
  }, [activeItems, dragOrderIds]);

  React.useLayoutEffect(() => {
    const first = flipFirstRef.current;
    if (!first) return;
    flipFirstRef.current = null;
    playItemFlip(first);
  });

  // Keep a live ref of the active list so rapid drag-over reorders stay in sync.
  React.useEffect(() => {
    // During a drag, the display order lives in dragOrderIds — don't clobber it.
    if (dragOrderIdsRef.current) {
      const byId = new Map(activeItems.map((item) => [item.id, item]));
      activeItemsRef.current = dragOrderIdsRef.current
        .map((id) => byId.get(id))
        .filter((item): item is T => Boolean(item));
      return;
    }
    activeItemsRef.current = activeItems;
  }, [activeItems]);

  const clearDragState = () => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  };

  /** Apply a committed keyboard move; FLIP animates the layout change. */
  const applyKeyboardReorder = (nextActive: T[], scopeItems: T[]) => {
    const orders = assignSequentialOrders(nextActive);
    const orderById = new Map(
      orders.map((entry) => [entry.id, entry.sortOrder]),
    );

    activeItemsRef.current = nextActive.map((item) => ({
      ...item,
      sortOrder: orderById.get(item.id) ?? item.sortOrder,
    }));

    flipFirstRef.current = captureItemRects();
    void onCommitOrder({
      nextActive: activeItemsRef.current,
      orders,
      scopeItems,
      changed: true,
    });
  };

  /** Preview-only reorder while the finger/pointer is still down. */
  const previewReorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId || sortMode === "alpha") return;

    const currentIds =
      dragOrderIdsRef.current ??
      activeItemsRef.current.map((item) => item.id);

    if (sortMode === "aisle") {
      const byId = new Map(
        activeItemsRef.current.map((item) => [item.id, item]),
      );
      const dragged = byId.get(draggedId);
      const target = byId.get(targetId);
      if (!dragged || !target) return;
      const draggedCat = dragged.category ?? DEFAULT_CATEGORY;
      const targetCat = target.category ?? DEFAULT_CATEGORY;
      if (draggedCat !== targetCat) return;

      // Reorder only within the aisle, keep other aisles fixed.
      const groupIds = currentIds.filter((id) => {
        const item = byId.get(id);
        return (item?.category ?? DEFAULT_CATEGORY) === draggedCat;
      });
      const reorderedGroup = reorderById(
        groupIds.map((id) => ({ id })),
        draggedId,
        targetId,
      ).map((entry) => entry.id);
      if (reorderedGroup.join("\0") === groupIds.join("\0")) return;

      const nextIds: string[] = [];
      let groupInserted = false;
      for (const id of currentIds) {
        const item = byId.get(id);
        const cat = item?.category ?? DEFAULT_CATEGORY;
        if (cat !== draggedCat) {
          nextIds.push(id);
          continue;
        }
        if (!groupInserted) {
          nextIds.push(...reorderedGroup);
          groupInserted = true;
        }
      }
      flipFirstRef.current = captureItemRects();
      dragOrderIdsRef.current = nextIds;
      setDragOrderIds(nextIds);
      return;
    }

    const nextIds = reorderById(
      currentIds.map((id) => ({ id })),
      draggedId,
      targetId,
    ).map((entry) => entry.id);
    if (nextIds.join("\0") === currentIds.join("\0")) return;

    flipFirstRef.current = captureItemRects();
    dragOrderIdsRef.current = nextIds;
    setDragOrderIds(nextIds);
  };

  const moveActiveItem = async (id: string, offset: -1 | 1) => {
    if (sortMode === "alpha") return;
    if (canReorder && !canReorder()) return;

    const currentActive = activeItemsRef.current;

    if (sortMode === "manual") {
      const next = moveItemByOffset(currentActive, id, offset);
      if (next !== currentActive) applyKeyboardReorder(next, currentActive);
      return;
    }

    const item = currentActive.find((entry) => entry.id === id);
    if (!item) return;
    const cat = item.category ?? DEFAULT_CATEGORY;
    const groupItems = currentActive.filter(
      (entry) => (entry.category ?? DEFAULT_CATEGORY) === cat,
    );
    const reorderedGroup = moveItemByOffset(groupItems, id, offset);
    if (reorderedGroup === groupItems) return;

    const nextActive: T[] = [];
    let groupInserted = false;
    for (const entry of currentActive) {
      const entryCat = entry.category ?? DEFAULT_CATEGORY;
      if (entryCat !== cat) {
        nextActive.push(entry);
        continue;
      }
      if (!groupInserted) {
        nextActive.push(...reorderedGroup);
        groupInserted = true;
      }
    }
    applyKeyboardReorder(nextActive, groupItems);
  };

  const commitDragOrder = () => {
    const orderIds = dragOrderIdsRef.current;
    if (!orderIds || orderIds.length === 0) {
      dragOrderIdsRef.current = null;
      setDragOrderIds(null);
      return;
    }

    // Use the pre-drag active list (from state) so object data stays stable.
    const sourceById = new Map(activeItems.map((item) => [item.id, item]));
    const nextActive = orderIds
      .map((id) => sourceById.get(id))
      .filter((item): item is T => Boolean(item));

    const unchanged =
      nextActive.length === activeItems.length &&
      nextActive.every((item, index) => item.id === activeItems[index]?.id);

    const orders = assignSequentialOrders(nextActive);
    const orderById = new Map(
      orders.map((entry) => [entry.id, entry.sortOrder]),
    );

    activeItemsRef.current = nextActive.map((item) => ({
      ...item,
      sortOrder: orderById.get(item.id) ?? item.sortOrder,
    }));

    // Write sortOrder under the existing visual order — no second FLIP/snap.
    // Clearing the preview in the same tick keeps the list visually still.
    void onCommitOrder({
      nextActive: activeItemsRef.current,
      orders,
      scopeItems: activeItems,
      changed: !unchanged,
    });

    dragOrderIdsRef.current = null;
    setDragOrderIds(null);
  };

  /** Discard any in-flight drag state without committing. */
  const resetDrag = () => {
    draggingIdRef.current = null;
    dragOrderIdsRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
    setDragOrderIds(null);
  };

  const reorderState: ItemReorderState = {
    enabled,
    draggingId,
    dropTargetId,
    onDragStart: (id) => {
      draggingIdRef.current = id;
      const ids = activeItemsRef.current.map((item) => item.id);
      dragOrderIdsRef.current = ids;
      setDragOrderIds(ids);
      setDraggingId(id);
      setDropTargetId(null);
    },
    onDragOver: (id) => {
      setDropTargetId((current) => (current === id ? current : id));
      const fromId = draggingIdRef.current;
      if (!fromId || fromId === id) return;
      previewReorder(fromId, id);
    },
    onDragEnd: () => {
      // Cancelled — discard preview order, keep original item data.
      dragOrderIdsRef.current = null;
      setDragOrderIds(null);
      clearDragState();
    },
    onDrop: () => {
      clearDragState();
      commitDragOrder();
    },
    onMove: (id, offset) => {
      void moveActiveItem(id, offset);
    },
  };

  return { reorderState, displayActiveItems, resetDrag };
}
