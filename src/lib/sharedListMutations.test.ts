import { describe, expect, it } from "vitest";
import {
  applySharedListMutation,
  findRawItemIndex,
  isMutationPermitted,
  mutationPermissionGate,
} from "./sharedListMutations";

const apples = { id: "a1", text: "Apples", completed: false, quantity: "2" };
const tea = { id: "t1", text: "Tea", completed: false };

describe("applySharedListMutation", () => {
  it("sets completed absolutely so a retry does not flip twice", () => {
    const once = applySharedListMutation([apples, tea], {
      type: "setCompleted",
      target: apples,
      completed: true,
    });
    const twice = applySharedListMutation(once, {
      type: "setCompleted",
      target: apples,
      completed: true,
    });

    expect(once[0]?.completed).toBe(true);
    expect(twice[0]?.completed).toBe(true);
    expect(twice[1]?.completed).toBe(false);
  });

  it("keeps the other row when removing by stable id", () => {
    const next = applySharedListMutation([apples, tea], {
      type: "remove",
      target: { id: "t1", text: "Tea" },
    });
    expect(next).toEqual([
      { id: "a1", text: "Apples", completed: false, quantity: "2" },
    ]);
  });

  it("appends an add and refuses a duplicate id", () => {
    const bread = { id: "b1", text: "Bread", completed: false };
    const added = applySharedListMutation([apples], {
      type: "add",
      item: bread,
    });
    const dup = applySharedListMutation(added, { type: "add", item: bread });

    expect(added).toHaveLength(2);
    expect(dup).toHaveLength(2);
  });

  it("replaces a row in place for an edit", () => {
    const next = applySharedListMutation([apples, tea], {
      type: "replace",
      target: apples,
      item: { ...apples, text: "Green apples" },
    });
    expect(next[0]?.text).toBe("Green apples");
    expect(next[1]?.text).toBe("Tea");
  });
});

describe("findRawItemIndex", () => {
  it("prefers the owner's published id over a stale index", () => {
    const items = [tea, apples];
    expect(
      findRawItemIndex(items, {
        id: "a1",
        index: 0,
        text: "Apples",
      }),
    ).toBe(1);
  });
});

describe("permission gates", () => {
  it("maps mutations onto the owner's flags", () => {
    expect(mutationPermissionGate({ type: "remove", target: apples })).toBe(
      "remove",
    );
    expect(
      mutationPermissionGate({
        type: "replace",
        target: apples,
        item: apples,
      }),
    ).toBe("edit");
  });

  it("requires both add and remove for an in-place edit", () => {
    const perms = { toggle: true, add: true, remove: false };
    expect(isMutationPermitted(perms, true, "edit")).toBe(false);
    expect(isMutationPermitted({ ...perms, remove: true }, true, "edit")).toBe(
      true,
    );
    expect(isMutationPermitted(perms, false, "toggle")).toBe(false);
  });
});
