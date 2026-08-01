import { describe, expect, it } from "vitest";
import {
  buildPublishedState,
  diffSharedState,
  hasSharedChanges,
  indexSharedItems,
  readPublishedState,
  writePublishedState,
  clearPublishedState,
} from "./sharedSync";

const milk = { text: "Milk", completed: false, quantity: "2" };
const bread = { text: "Bread", completed: false };

describe("diffSharedState", () => {
  it("reports nothing when the server still matches what we published", () => {
    const published = buildPublishedState([milk, bread]);
    const diff = diffSharedState(published, buildPublishedState([milk, bread]));

    expect(hasSharedChanges(diff)).toBe(false);
  });

  it("spots a collaborator ticking an item off", () => {
    const published = buildPublishedState([milk, bread]);
    const remote = buildPublishedState([{ ...milk, completed: true }, bread]);

    expect(diffSharedState(published, remote).toggled).toEqual([
      { key: expect.stringContaining("Milk"), completed: true },
    ]);
  });

  it("spots collaborator additions and removals", () => {
    const published = buildPublishedState([milk, bread]);
    const remote = buildPublishedState([milk, { text: "Tea", completed: false }]);
    const diff = diffSharedState(published, remote);

    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(indexSharedItems([{ text: "Tea", completed: false }]).size).toBe(1);
  });

  // The bug this module exists to prevent: the owner's own change lands
  // locally before the debounced publish reaches the server, so the shared doc
  // is momentarily "behind". Diffing against the last published snapshot must
  // treat that as no change at all — diffing against the live list would read
  // it as a collaborator adding the item back, or deleting the edited one.
  it("ignores a stale server copy of the owner's own edit", () => {
    const published = buildPublishedState([milk, bread]);

    // Owner has since deleted Bread and renamed Milk locally, but the server
    // still holds exactly what we last published.
    const diff = diffSharedState(published, buildPublishedState([milk, bread]));

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.toggled).toEqual([]);
  });

  it("treats a quantity change as a different item, not a toggle", () => {
    const published = buildPublishedState([milk]);
    const remote = buildPublishedState([{ ...milk, quantity: "3" }]);
    const diff = diffSharedState(published, remote);

    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
  });
});

describe("published state storage", () => {
  it("round-trips through localStorage and can be cleared", () => {
    const state = buildPublishedState([milk, bread]);
    writePublishedState("owner-uid", state);

    expect(readPublishedState("owner-uid")).toEqual(state);

    clearPublishedState("owner-uid");
    expect(readPublishedState("owner-uid")).toBeNull();
  });

  it("returns null rather than throwing on corrupt data", () => {
    localStorage.setItem("cartlink:published:owner-uid", "not json");
    expect(readPublishedState("owner-uid")).toBeNull();
  });
});
