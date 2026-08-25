import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useItemActions } from "./useItemActions";

const item = { id: "1", text: "Milk", completed: false, userId: "u" };

describe("useItemActions", () => {
  it("keeps editing open after a failed save", async () => {
    const save = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useItemActions(save));
    act(() => result.current.edit.onStart(item));
    await act(() => result.current.edit.onCommit());
    expect(result.current.editingId).toBe("1");
  });

  it("closes editing after a successful save", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useItemActions(save));
    act(() => result.current.edit.onStart(item));
    act(() => result.current.edit.onTextChange("Oat milk"));
    await act(() => result.current.edit.onCommit());
    expect(save).toHaveBeenCalledWith("1", "Oat milk", "", "", "");
    expect(result.current.editingId).toBeNull();
  });
});
