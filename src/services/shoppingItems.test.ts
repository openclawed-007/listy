import { describe, expect, it, vi } from "vitest";
import { subscribeToShoppingItems } from "./shoppingItems";

const { mockOnSnapshot } = vi.hoisted(() => ({ mockOnSnapshot: vi.fn() }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({
    field,
    operator,
    value,
  })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  onSnapshot: mockOnSnapshot,
}));

describe("subscribeToShoppingItems", () => {
  it("normalizes, rejects invalid rows, sorts, and returns unsubscribe", () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockImplementation((_query, next) => {
      next({
        docs: [
          {
            id: "b",
            data: () => ({ text: "Bread", completed: false, userId: "u", sortOrder: 2 }),
          },
          { id: "bad", data: () => ({ text: "Invalid" }) },
          {
            id: "a",
            data: () => ({ text: "Apples", completed: false, userId: "u", sortOrder: 0 }),
          },
        ],
      });
      return unsubscribe;
    });
    const onItems = vi.fn();

    const result = subscribeToShoppingItems(
      { app: "test" } as never,
      "u",
      onItems,
      vi.fn(),
    );

    expect(onItems.mock.calls[0][0].map((item: { id: string }) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(result).toBe(unsubscribe);
  });

  it("forwards subscription errors", () => {
    const onError = vi.fn();
    const failure = new Error("offline");
    mockOnSnapshot.mockImplementation((_query, _next, fail) => {
      fail(failure);
      return vi.fn();
    });

    subscribeToShoppingItems(
      { app: "test" } as never,
      "u",
      vi.fn(),
      onError,
    );

    expect(onError).toHaveBeenCalledWith(failure);
  });
});
