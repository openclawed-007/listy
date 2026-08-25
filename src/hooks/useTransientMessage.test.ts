import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTransientMessage } from "./useTransientMessage";

afterEach(() => vi.useRealTimers());

describe("useTransientMessage", () => {
  it("clears the latest message and cancels its timer on unsubscribe", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTransientMessage(100));
    act(() => result.current[1]("saved"));
    expect(result.current[0]).toBe("saved");
    act(() => vi.advanceTimersByTime(100));
    expect(result.current[0]).toBe("");
    act(() => result.current[1]("again"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
