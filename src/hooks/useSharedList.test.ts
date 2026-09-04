import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSharedList } from "./useSharedList";

const { loadRaw, publish, permissions, anonymousEdits, revoke, allocate } = vi.hoisted(() => ({
  loadRaw: vi.fn(), publish: vi.fn(), permissions: vi.fn(), anonymousEdits: vi.fn(),
  revoke: vi.fn(), allocate: vi.fn(),
}));
vi.mock("../services/sharedLists", () => ({
  loadRawSharedList: loadRaw,
  publishSharedList: publish,
  updateSharedListPermissions: permissions,
  updateSharedListAnonymousEdits: anonymousEdits,
  revokeSharedList: revoke,
}));
vi.mock("../lib/allocateShareCode", () => ({ allocateShareCode: allocate }));

const user = { uid: "owner", displayName: "Owner" } as never;
// Stable like the real `db` singleton: a fresh object per render would re-run
// the load effect on every state change and reload the seeded doc over the
// state under test.
const firestore = {} as never;
function setup(onError = vi.fn()) {
  return renderHook(() => useSharedList({
    firestore, user, ownerName: "Owner", items: [], onError,
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

  describe("anonymous editing opt-in", () => {
    const sharedDoc = {
      ownerId: "owner", permissions: { toggle: true, add: true, remove: false },
      allowAnonymousEdits: true, shareCode: "AB3DK7MP",
    };

    it("loads the stored flag and publishes it when sharing starts", async () => {
      loadRaw.mockResolvedValue(sharedDoc);
      publish.mockResolvedValue(undefined);
      const { result } = setup();
      await waitFor(() => expect(result.current.allowAnonymousEdits).toBe(true));
      act(() => { void result.current.startSharing(); });
      await waitFor(() => expect(publish).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ allowAnonymousEdits: true }),
      ));
    });

    it("persists the toggle and rolls back on failure", async () => {
      loadRaw.mockResolvedValue({ ...sharedDoc, allowAnonymousEdits: false });
      anonymousEdits.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
      const onError = vi.fn();
      const { result } = setup(onError);
      await waitFor(() => expect(result.current.isSharing).toBe(true));

      act(() => { void result.current.toggleAnonymousEdits(true); });
      await waitFor(() => {
        expect(result.current.allowAnonymousEdits).toBe(true);
        expect(anonymousEdits).toHaveBeenCalledWith(expect.anything(), "owner", true);
      });

      act(() => { void result.current.toggleAnonymousEdits(false); });
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.stringContaining("Unable to update"));
        expect(result.current.allowAnonymousEdits).toBe(true);
      });
    });

    it("refuses to enable anonymous editing with no permission granted", async () => {
      loadRaw.mockResolvedValue({ ...sharedDoc, permissions: {}, allowAnonymousEdits: false });
      anonymousEdits.mockResolvedValue(undefined);
      const { result } = setup();
      await waitFor(() => expect(result.current.isSharing).toBe(true));
      act(() => { void result.current.toggleAnonymousEdits(true); });
      await waitFor(() =>
        expect(anonymousEdits).toHaveBeenCalledWith(expect.anything(), "owner", false),
      );
      expect(result.current.allowAnonymousEdits).toBe(false);
    });

    it("switches anonymous editing off when the last permission is revoked", async () => {
      loadRaw.mockResolvedValue({ ...sharedDoc, permissions: { toggle: true } });
      permissions.mockResolvedValue(undefined);
      const { result } = setup();
      await waitFor(() => expect(result.current.allowAnonymousEdits).toBe(true));
      act(() => { void result.current.togglePermission("toggle", false); });
      await waitFor(() => expect(permissions).toHaveBeenCalledWith(
        expect.anything(), "owner", expect.objectContaining({ toggle: false }), false,
      ));
      expect(result.current.allowAnonymousEdits).toBe(false);
    });

    it("clears the flag when sharing stops", async () => {
      loadRaw.mockResolvedValue(sharedDoc);
      revoke.mockResolvedValue(undefined);
      const { result } = setup();
      await waitFor(() => expect(result.current.allowAnonymousEdits).toBe(true));
      act(() => { void result.current.stopSharing(); });
      await waitFor(() => expect(result.current.isSharing).toBe(false));
      expect(result.current.allowAnonymousEdits).toBe(false);
    });
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
