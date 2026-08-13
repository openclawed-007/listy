import { beforeEach, describe, expect, it } from "vitest";
import {
  addCustomList,
  buildListTabs,
  canAddCustomList,
  ensureListInRegistry,
  isOwnedCustomListId,
  isOwnedListId,
  isSharedImportListId,
  MAX_CUSTOM_LISTS,
  MAX_STORED_LISTS,
  normalizeUserLists,
  removeCustomList,
  renameCustomList,
  resolveRemoteLists,
  sharedOwnerIdFromListId,
} from "./userLists";

describe("userLists", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recognizes id kinds", () => {
    expect(isOwnedCustomListId("list_abc")).toBe(true);
    expect(isOwnedListId("personal")).toBe(true);
    expect(isOwnedListId("list_abc")).toBe(true);
    expect(isSharedImportListId("shared:uid")).toBe(true);
    expect(isOwnedListId("shared:uid")).toBe(false);
    expect(sharedOwnerIdFromListId("shared:uid")).toBe("uid");
    expect(sharedOwnerIdFromListId("list_abc")).toBeUndefined();
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

  it("builds tabs from the registry plus leftover and shared item ids", () => {
    const tabs = buildListTabs(
      [{ id: "list_costco", name: "Costco", createdAt: 1 }],
      [
        { listId: "list_costco", listName: "Stale" },
        { listId: "list_orphan", listName: "  Farmer  " },
        { listId: "shared:alex", listName: "Alex" },
        { listId: "personal" },
      ],
    );
    expect(tabs.map((tab) => tab.id)).toEqual([
      "personal",
      "list_costco",
      "list_orphan",
      "shared:alex",
    ]);
    expect(tabs[1].name).toBe("Costco");
    expect(tabs[2].name).toBe("Farmer");
  });

  it("records leftover list ids without applying the create cap", () => {
    const full = Array.from({ length: MAX_CUSTOM_LISTS }, (_, i) => ({
      id: `list_${i}`,
      name: `L${i}`,
      createdAt: i,
    }));
    const next = ensureListInRegistry(full, "list_extra", "Extra");
    expect(next).toHaveLength(MAX_CUSTOM_LISTS + 1);
    expect(next.at(-1)).toMatchObject({ id: "list_extra", name: "Extra" });
    expect(ensureListInRegistry(next, "list_extra", "Again")).toBe(next);
  });

  it("lets an empty remote lists field win, and uploads local when the field is missing", () => {
    localStorage.setItem(
      "cartlink:user-lists:v1",
      JSON.stringify([{ id: "list_1", name: "Costco", createdAt: 1 }]),
    );
    expect(
      resolveRemoteLists({ exists: true, data: { lists: [] } }),
    ).toEqual({ lists: [], uploadLocal: false });
    expect(resolveRemoteLists({ exists: false })).toEqual({
      lists: [{ id: "list_1", name: "Costco", createdAt: 1 }],
      uploadLocal: true,
    });
    expect(
      resolveRemoteLists({ exists: true, data: { interface: {} } }),
    ).toMatchObject({ uploadLocal: true });
    expect(MAX_STORED_LISTS).toBeGreaterThan(MAX_CUSTOM_LISTS);
  });
});
