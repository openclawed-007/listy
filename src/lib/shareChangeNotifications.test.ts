import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyShareListChange,
  resetShareNotifyDebounce,
  shouldNotifyShareChange,
} from "./shareChangeNotifications";

describe("shareChangeNotifications", () => {
  afterEach(() => {
    resetShareNotifyDebounce();
    vi.restoreAllMocks();
  });

  it("requires enablement, changes, background, and permission", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    // Permission is mocked via shoppingReminders path — when not granted, false.
    expect(
      shouldNotifyShareChange({
        enabled: true,
        ownerId: "u1",
        changeCount: 2,
      }),
    ).toBe(false);

    expect(
      shouldNotifyShareChange({
        enabled: false,
        ownerId: "u1",
        changeCount: 2,
      }),
    ).toBe(false);

    expect(
      shouldNotifyShareChange({
        enabled: true,
        ownerId: "u1",
        changeCount: 0,
      }),
    ).toBe(false);
  });

  it("debounces repeated notices for the same owner", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    const shown: string[] = [];
    const original = globalThis.Notification;
    class FakeNotification {
      static permission = "granted";
      constructor(title: string) {
        shown.push(title);
      }
    }
    // @ts-expect-error test stub
    globalThis.Notification = FakeNotification;

    try {
      const first = await notifyShareListChange({
        enabled: true,
        ownerId: "u1",
        changeCount: 1,
      });
      const second = await notifyShareListChange({
        enabled: true,
        ownerId: "u1",
        changeCount: 1,
      });
      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(shown).toHaveLength(1);
    } finally {
      globalThis.Notification = original;
    }
  });
});
