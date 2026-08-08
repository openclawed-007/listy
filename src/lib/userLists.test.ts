import { describe, expect, it } from "vitest";
import {
  addCustomList,
  canAddCustomList,
  isOwnedCustomListId,
  isOwnedListId,
  isSharedImportListId,
  MAX_CUSTOM_LISTS,
  normalizeUserLists,
  removeCustomList,
  renameCustomList,
} from "./userLists";

describe("userLists", () => {
  it("recognizes id kinds", () => {
    expect(isOwnedCustomListId("list_abc")).toBe(true);
    expect(isOwnedListId("personal")).toBe(true);
    expect(isOwnedListId("list_abc")).toBe(true);
    expect(isSharedImportListId("shared:uid")).toBe(true);
    expect(isOwnedListId("shared:uid")).toBe(false);
  });

  it("adds and renames lists", () => {
    const created = addCustomList([], "  Costco  ");
    expect("list" in created).toBe(true);
    if ("error" in created) return;
    expect(created.list.name).toBe("Costco");
    expect(created.list.id.startsWith("list_")).toBe(true);

    const renamed = renameCustomList(created.lists, created.list.id, "Sam's");
    expect("lists" in renamed).toBe(true);
    if ("error" in renamed) return;
    expect(renamed.lists[0].name).toBe("Sam's");
  });

  it("enforces cap and normalizes junk", () => {
    let lists = normalizeUserLists(
      Array.from({ length: MAX_CUSTOM_LISTS }, (_, i) => ({
        id: `list_${i}`,
        name: `L${i}`,
        createdAt: i,
      })),
    );
    expect(lists).toHaveLength(MAX_CUSTOM_LISTS);
    expect(canAddCustomList(lists)).toBe(false);
    const blocked = addCustomList(lists, "Extra");
    expect(blocked).toHaveProperty("error");

    lists = removeCustomList(lists, "list_0");
    expect(canAddCustomList(lists)).toBe(true);

    expect(
      normalizeUserLists([
        { id: "personal", name: "Nope" },
        { id: "list_ok", name: " Ok " },
        null,
      ]),
    ).toEqual([{ id: "list_ok", name: "Ok", createdAt: 0 }]);
  });
});
