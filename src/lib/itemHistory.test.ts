import { beforeEach, describe, expect, it } from "vitest";
import {
  historyKey,
  historyScore,
  MAX_HISTORY_ENTRIES,
  normalizeHistoryEntry,
  rankHistory,
  recordHistoryUse,
  type HistoryEntry,
} from "./itemHistory";

describe("itemHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes entries and drops junk", () => {
    expect(normalizeHistoryEntry(null)).toBeNull();
    expect(normalizeHistoryEntry({ text: "  " })).toBeNull();
    expect(
      normalizeHistoryEntry({
        text: "  Milk  ",
        category: " Dairy ",
        note: " oat ",
        count: 2.7,
        lastUsedAt: 100,
      }),
    ).toEqual({
      text: "Milk",
      category: "Dairy",
      note: "oat",
      count: 2,
      lastUsedAt: 100,
    });
  });

  it("merges uses by case-insensitive text key", () => {
    const first = recordHistoryUse([], {
      text: "Milk",
      category: "Dairy & Eggs",
      at: 1000,
    });
    const second = recordHistoryUse(first, {
      text: "milk",
      note: "oat",
      at: 2000,
    });
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      text: "Milk",
      category: "Dairy & Eggs",
      note: "oat",
      count: 2,
      lastUsedAt: 2000,
    });
    expect(historyKey("Milk")).toBe(historyKey("milk"));
  });

  it("ranks prefix matches above substring and prefers frequent items", () => {
    const entries: HistoryEntry[] = [
      {
        text: "Almond milk",
        count: 10,
        lastUsedAt: 1,
      },
      {
        text: "Milk",
        count: 3,
        lastUsedAt: Date.now(),
      },
      {
        text: "Bread",
        count: 50,
        lastUsedAt: Date.now(),
      },
    ];
    const ranked = rankHistory("mi", entries);
    expect(ranked.map((e) => e.text)).toEqual(["Milk", "Almond milk"]);
  });

  it("returns nothing for empty query", () => {
    expect(
      rankHistory("  ", [
        { text: "Milk", count: 1, lastUsedAt: 1 },
      ]),
    ).toEqual([]);
  });

  it("caps store by dropping lowest score when full", () => {
    const filled: HistoryEntry[] = Array.from(
      { length: MAX_HISTORY_ENTRIES },
      (_, i) => ({
        text: `Item ${i}`,
        count: i + 1,
        lastUsedAt: i,
      }),
    );
    // Lowest score is Item 0 (count 1). Adding a new item should not drop the
    // new high-value entry if something weaker exists.
    const next = recordHistoryUse(filled, {
      text: "Fresh staple",
      at: Date.now(),
    });
    expect(next).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(next.some((e) => e.text === "Fresh staple")).toBe(true);
    expect(next.some((e) => e.text === "Item 0")).toBe(false);
  });

  it("scores recency within the boost window", () => {
    const now = Date.now();
    const recent = historyScore(
      { text: "A", count: 1, lastUsedAt: now - 1000 },
      now,
    );
    const old = historyScore(
      { text: "B", count: 1, lastUsedAt: now - 30 * 24 * 60 * 60 * 1000 },
      now,
    );
    expect(recent).toBeGreaterThan(old);
  });
});
