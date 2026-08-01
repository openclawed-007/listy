import { beforeEach, describe, expect, it } from "vitest";
import { readGuestItems, writeGuestItems } from "./guestItems";

describe("guest items", () => {
  beforeEach(() => localStorage.clear());

  it("persists a guest list on this device", () => {
    writeGuestItems([{ id: "one", text: "Milk", completed: false, category: "Dairy & Eggs", createdAt: 1 }]);
    expect(readGuestItems()).toEqual([{ id: "one", text: "Milk", completed: false, category: "Dairy & Eggs", createdAt: 1, quantity: undefined }]);
  });

  it("drops malformed local data instead of breaking the list", () => {
    localStorage.setItem("cartlink:guest-items:v1", JSON.stringify([null, { id: "bad", text: "" }, { id: "ok", text: " Bread ", completed: true }]));
    expect(readGuestItems()).toEqual([{ id: "ok", text: "Bread", completed: true, createdAt: 0, quantity: undefined, category: undefined }]);
  });
});
