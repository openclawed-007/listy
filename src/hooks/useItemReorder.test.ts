import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useItemReorder, type ReorderCommit } from "./useItemReorder";

vi.mock("../lib/listFlip", () => ({
  captureItemRects: vi.fn(() => new Map()),
  playItemFlip: vi.fn(),
}));

type Item = {
  id: string;
  category?: string;
  sortOrder?: number;
};

const items: Item[] = [
  { id: "apples", category: "Produce", sortOrder: 0 },
  { id: "bananas", category: "Produce", sortOrder: 1 },
  { id: "bread", category: "Bakery", sortOrder: 2 },
];

function setup(
  options: Partial<{
    sortMode: "manual" | "aisle" | "alpha";
    enabled: boolean;
    canReorder: () => boolean;
  }> = {},
) {
  const onCommitOrder = vi.fn<(commit: ReorderCommit<Item>) => void>();
  const hook = renderHook(() =>
    useItemReorder<Item>({
      activeItems: items,
      sortMode: options.sortMode ?? "manual",
      enabled: options.enabled ?? true,
      canReorder: options.canReorder,
      onCommitOrder,
    }),
  );
  return { ...hook, onCommitOrder };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useItemReorder", () => {
  it("commits a keyboard move with dense sort orders", () => {
    const { result, onCommitOrder } = setup();

    act(() => result.current.reorderState.onMove("bananas", -1));

    expect(onCommitOrder).toHaveBeenCalledOnce();
    const commit = onCommitOrder.mock.calls[0][0];
    expect(commit.nextActive.map((item) => item.id)).toEqual([
      "bananas",
      "apples",
      "bread",
    ]);
    expect(commit.orders).toEqual([
      { id: "bananas", sortOrder: 0 },
      { id: "apples", sortOrder: 1 },
      { id: "bread", sortOrder: 2 },
    ]);
    expect(commit.changed).toBe(true);
  });

  it("keeps aisle moves inside their category", () => {
    const { result, onCommitOrder } = setup({ sortMode: "aisle" });

    act(() => result.current.reorderState.onMove("bananas", 1));
    expect(onCommitOrder).not.toHaveBeenCalled();

    act(() => result.current.reorderState.onMove("bananas", -1));
    const commit = onCommitOrder.mock.calls[0][0];
    expect(commit.nextActive.map((item) => item.id)).toEqual([
      "bananas",
      "apples",
      "bread",
    ]);
    expect(commit.scopeItems.map((item) => item.id)).toEqual([
      "apples",
      "bananas",
    ]);
  });

  it("previews and commits a drag order", () => {
    const { result, onCommitOrder } = setup();

    act(() => result.current.reorderState.onDragStart("apples"));
    act(() => result.current.reorderState.onDragOver("bread"));

    expect(result.current.displayActiveItems.map((item) => item.id)).toEqual([
      "bananas",
      "bread",
      "apples",
    ]);

    act(() => result.current.reorderState.onDrop("bread"));

    expect(onCommitOrder.mock.calls[0][0].changed).toBe(true);
    expect(
      onCommitOrder.mock.calls[0][0].nextActive.map((item) => item.id),
    ).toEqual(["bananas", "bread", "apples"]);
    expect(result.current.reorderState.draggingId).toBeNull();
  });

  it("discards a cancelled drag without committing", () => {
    const { result, onCommitOrder } = setup();

    act(() => result.current.reorderState.onDragStart("apples"));
    act(() => result.current.reorderState.onDragOver("bread"));
    act(() => result.current.reorderState.onDragEnd());

    expect(onCommitOrder).not.toHaveBeenCalled();
    expect(result.current.displayActiveItems.map((item) => item.id)).toEqual([
      "apples",
      "bananas",
      "bread",
    ]);
  });

  it("honours the keyboard reorder gate", () => {
    const { result, onCommitOrder } = setup({ canReorder: () => false });

    act(() => result.current.reorderState.onMove("bananas", -1));

    expect(onCommitOrder).not.toHaveBeenCalled();
  });
});
