import { describe, expect, it } from "vitest";
import {
  normalizePublicSharedList,
  payloadToPublicItems,
} from "./publicSharedListModel";

describe("publicSharedListModel", () => {
  it("rejects malformed snapshots", () => {
    expect(normalizePublicSharedList(null)).toBeNull();
    expect(normalizePublicSharedList({ ownerName: "Alex" })).toBeNull();
  });

  it("normalizes owner data, permissions, and item limits", () => {
    const result = normalizePublicSharedList({
      ownerId: "owner-1",
      ownerName: "  Alex  ",
      allowEdits: true,
      permissions: { toggle: true, add: false, remove: false },
      items: [{ id: "a", text: "  Apples  ", completed: true }],
    });

    expect(result).toEqual({
      ownerId: "owner-1",
      ownerName: "Alex",
      allowEdits: true,
      permissions: { toggle: true, add: false, remove: false },
      items: [
        expect.objectContaining({ id: "a", text: "Apples", completed: true }),
      ],
    });
  });

  it("disables editing when no permission is enabled", () => {
    expect(
      normalizePublicSharedList({
        ownerId: "owner-1",
        allowEdits: true,
        permissions: {},
        items: [],
      })?.allowEdits,
    ).toBe(false);
  });

  it("creates stable fallback ids for legacy items", () => {
    expect(
      payloadToPublicItems([{ text: "Tea", completed: false }])[0],
    ).toEqual(expect.objectContaining({ id: "0-Tea", index: 0 }));
  });
});
