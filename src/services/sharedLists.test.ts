import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeSharedList, subscribeToSharedList, updateSharedListPermissions } from "./sharedLists";

const { onSnapshot, unsubscribe, deleteDoc, updateDoc } = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, ...parts: string[]) => ({ path: parts.join("/") })),
  onSnapshot,
  deleteDoc,
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "now"),
  setDoc: vi.fn(),
  updateDoc,
}));

describe("shared list service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the Firestore unsubscribe function", () => {
    onSnapshot.mockReturnValue(unsubscribe);
    const result = subscribeToSharedList({} as never, "owner", vi.fn(), vi.fn());
    expect(result).toBe(unsubscribe);
  });

  it("writes normalized permission capability", async () => {
    updateDoc.mockResolvedValue(undefined);
    await updateSharedListPermissions({} as never, "owner", { toggle: true, add: false, remove: false });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: "sharedLists/owner" },
      expect.objectContaining({ allowEdits: true }),
    );
  });

  it("does not hide a share-code revoke failure", async () => {
    deleteDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
    await expect(revokeSharedList({} as never, "owner", "AB3DK7MP")).rejects.toThrow("denied");
  });
});
