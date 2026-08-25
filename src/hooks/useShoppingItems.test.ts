import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useShoppingItems } from "./useShoppingItems";

const { mockOnSnapshot } = vi.hoisted(() => ({
  mockOnSnapshot: vi.fn(),
}));

vi.mock("../firebase", () => ({
  db: { app: "test" },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({
    field,
    operator,
    value,
  })),
  onSnapshot: mockOnSnapshot,
}));

type SnapshotHandler = (snapshot: {
  docs: Array<{ id: string; data: () => Record<string, unknown> }>;
}) => void;

describe("useShoppingItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes, sorts, and exposes live items", () => {
    let emit: SnapshotHandler | undefined;
    mockOnSnapshot.mockImplementation((_query, next) => {
      emit = next;
      return vi.fn();
    });

    const { result } = renderHook(() => {
      const [error, setError] = useState("old error");
      return { ...useShoppingItems("user-1", setError), error };
    });

    act(() => {
      emit?.({
        docs: [
          {
            id: "later",
            data: () => ({
              text: "Bread",
              completed: false,
              userId: "user-1",
              sortOrder: 2,
            }),
          },
          {
            id: "first",
            data: () => ({
              text: "Apples",
              completed: false,
              userId: "user-1",
              sortOrder: 0,
            }),
          },
          { id: "invalid", data: () => ({ text: "Missing fields" }) },
        ],
      });
    });

    expect(result.current.items.map((item) => item.id)).toEqual([
      "first",
      "later",
    ]);
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBe("");
  });

  it("reports subscription failures", () => {
    let fail: ((error: Error) => void) | undefined;
    mockOnSnapshot.mockImplementation((_query, _next, onError) => {
      fail = onError;
      return vi.fn();
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { result } = renderHook(() => {
      const [error, setError] = useState("");
      return { ...useShoppingItems("user-1", setError), error };
    });

    act(() => fail?.(new Error("offline")));

    expect(result.current.error).toMatch(/could not sync/i);
  });

  it("does not subscribe without a user", () => {
    renderHook(() => {
      const [, setError] = useState("");
      return useShoppingItems(undefined, setError);
    });

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});
