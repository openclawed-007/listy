import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUndoDelete } from "./useUndoDelete";

afterEach(() => vi.useRealTimers());

describe("useUndoDelete", () => {
  it("offers the latest removal until it is taken or the window closes", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoDelete<string>(1000));

    act(() => result.current.hold("milk"));
    act(() => result.current.hold("bread"));
    expect(result.current.pending).toBe("bread");

    let taken: string | null = null;
    act(() => {
      taken = result.current.take();
    });
    expect(taken).toBe("bread");
    expect(result.current.pending).toBeNull();

    act(() => result.current.hold("eggs"));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.pending).toBeNull();
  });
});
