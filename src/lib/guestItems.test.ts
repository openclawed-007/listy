import { beforeEach, describe, expect, it } from "vitest";
import {
  clearGuestItems,
  guestMigrationNotice,
  readGuestItems,
  writeGuestItems,
} from "./guestItems";

describe("guest items", () => {
  beforeEach(() => localStorage.clear());

  it("persists a guest list on this device", () => {
    writeGuestItems([
      {
        id: "one",
        text: "Milk",
        completed: false,
        category: "Dairy & Eggs",
        createdAt: 1,
      },
    ]);
    expect(readGuestItems()).toEqual([
      {
        id: "one",
        text: "Milk",
        completed: false,
        category: "Dairy & Eggs",
        createdAt: 1,
        quantity: undefined,
      },
    ]);
  });

  it("drops malformed local data instead of breaking the list", () => {
    localStorage.setItem(
      "cartlink:guest-items:v1",
      JSON.stringify([
        null,
        { id: "bad", text: "" },
        { id: "ok", text: " Bread ", completed: true },
      ]),
    );
    expect(readGuestItems()).toEqual([
      {
        id: "ok",
        text: "Bread",
        completed: true,
        createdAt: 0,
        quantity: undefined,
        category: undefined,
      },
    ]);
  });

  it("clears stored guest items after migration", () => {
    writeGuestItems([
      { id: "one", text: "Milk", completed: false, createdAt: 1 },
    ]);
    clearGuestItems();
    expect(readGuestItems()).toEqual([]);
  });

  it("explains what was migrated in plain language", () => {
    expect(guestMigrationNotice(2, 0)).toBe(
      "Brought over 2 items from your guest list.",
    );
    expect(guestMigrationNotice(1, 0)).toBe(
      "Brought over 1 item from your guest list.",
    );
    expect(guestMigrationNotice(0, 3)).toBe(
      "Merged 3 guest items into your list.",
    );
    expect(guestMigrationNotice(1, 2)).toBe(
      "Brought over your guest list (1 new, 2 merged).",
    );
  });
});
