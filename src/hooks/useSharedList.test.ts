import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSharedList } from "./useSharedList";

const { loadRaw, publish, permissions, revoke, allocate } = vi.hoisted(() => ({
  loadRaw: vi.fn(), publish: vi.fn(), permissions: vi.fn(), revoke: vi.fn(), allocate: vi.fn(),
}));
vi.mock("../services/sharedLists", () => ({
  loadRawSharedList: loadRaw,
  publishSharedList: publish,
  updateSharedListPermissions: permissions,
  revokeSharedList: revoke,
}));
vi.mock("../lib/allocateShareCode", () => ({ allocateShareCode: allocate }));

const user = { uid: "owner", displayName: "Owner" } as never;
function setup(onError = vi.fn()) {
  return renderHook(() => useSharedList({
    firestore: {} as never, user, ownerName: "Owner", items: [], onError,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  loadRaw.mockResolvedValue(null);
  allocate.mockResolvedValue("AB3DK7MP");
});

describe("useSharedList", () => {
  it("rolls an optimistic permission update back when persistence fails", async () => {
    loadRaw.mockResolvedValue({ ownerId: "owner", permissions: { toggle: true }, shareCode: "AB3DK7MP" });
    permissions.mockRejectedValue(new Error("denied"));
    const onError = vi.fn();
    const { result } = setup(onError);
    await waitFor(() => expect(result.current.isSharing).toBe(true));
    act(() => { void result.current.togglePermission("toggle", false); });
    await waitFor(() => {
      expect(result.current.permissions.toggle).toBe(true);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("Unable to update"));
    });
  });

  it("reports publish failures and clears busy state", async () => {
    publish.mockRejectedValue(new Error("offline"));
    const onError = vi.fn();
    const { result } = setup(onError);
    await act(() => result.current.startSharing());
    expect(result.current.shareBusy).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Unable to start"));
  });

  it("ignores a late load after unsubscribe", async () => {
    let resolve!: (value: Record<string, unknown>) => void;
    loadRaw.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result, unmount } = setup();
    unmount();
    await act(async () => resolve({ ownerId: "owner", permissions: { toggle: true } }));
    expect(result.current.isSharing).toBe(false);
  });
});
