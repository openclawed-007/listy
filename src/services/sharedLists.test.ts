import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  publishSharedList,
  revokeSharedList,
  subscribeToSharedList,
  updateSharedListAnonymousEdits,
  updateSharedListPermissions,
} from "./sharedLists";

const { onSnapshot, unsubscribe, deleteDoc, setDoc, updateDoc } = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, ...parts: string[]) => ({ path: parts.join("/") })),
  onSnapshot,
  deleteDoc,
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "now"),
  setDoc,
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

  it("only stores allowAnonymousEdits when a permission is actually granted", async () => {
    setDoc.mockResolvedValue(undefined);
    updateDoc.mockResolvedValue(undefined);
    const base = { ownerId: "owner", ownerName: "Owner", items: [], allowAnonymousEdits: true };

    await publishSharedList({} as never, { ...base, permissions: { toggle: true, add: false, remove: false } });
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: "sharedLists/owner" },
      expect.objectContaining({ allowEdits: true, allowAnonymousEdits: true }),
    );

    // View-only list: the anonymous flag is meaningless and must not leak through.
    await publishSharedList({} as never, { ...base, permissions: { toggle: false, add: false, remove: false } });
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: "sharedLists/owner" },
      expect.objectContaining({ allowEdits: false, allowAnonymousEdits: false }),
    );

    await updateSharedListPermissions({} as never, "owner", { toggle: false, add: false, remove: false }, true);
    expect(updateDoc).toHaveBeenLastCalledWith(
      { path: "sharedLists/owner" },
      expect.objectContaining({ allowEdits: false, allowAnonymousEdits: false }),
    );

    await updateSharedListAnonymousEdits({} as never, "owner", true);
    expect(updateDoc).toHaveBeenLastCalledWith(
      { path: "sharedLists/owner" },
      { allowAnonymousEdits: true, updatedAt: "now" },
    );
  });

  it("does not hide a share-code revoke failure", async () => {
    deleteDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
    await expect(revokeSharedList({} as never, "owner", "AB3DK7MP")).rejects.toThrow("denied");
  });
});
