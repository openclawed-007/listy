import { describe, expect, it, vi } from "vitest";
import { saveUserSettings, subscribeToUserSettings } from "./userSettings";

const { setDoc, onSnapshot, unsubscribe } = vi.hoisted(() => ({ setDoc: vi.fn(), onSnapshot: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, ...parts: string[]) => ({ path: parts.join("/") })),
  getDoc: vi.fn(), onSnapshot, setDoc, serverTimestamp: vi.fn(() => "now"),
}));

describe("user settings service", () => {
  it("merges writes with a server timestamp", async () => {
    setDoc.mockResolvedValue(undefined);
    await saveUserSettings({} as never, "u", { lists: [] });
    expect(setDoc).toHaveBeenCalledWith({ path: "userSettings/u" }, { lists: [], updatedAt: "now" }, { merge: true });
  });

  it("returns the listener unsubscribe", () => {
    onSnapshot.mockReturnValue(unsubscribe);
    expect(subscribeToUserSettings({} as never, "u", vi.fn(), vi.fn())).toBe(unsubscribe);
  });
});
