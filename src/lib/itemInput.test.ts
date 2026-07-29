import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  getDuplicateKey,
  guessCategory,
  mergeQuantities,
  parseItemInput,
} from "./itemInput";

describe("parseItemInput", () => {
  it("reads a leading count and tidies the item name", () => {
    expect(parseItemInput("2 milk")).toEqual({
      text: "Milk",
      quantity: "2",
      category: "Dairy & Eggs",
    });
  });

  it("keeps units attached to the amount", () => {
    expect(parseItemInput("500g flour")).toMatchObject({
      text: "Flour",
      quantity: "500 g",
      category: "Pantry",
    });
  });

  it("treats x as a bare multiplier, before or after the name", () => {
    expect(parseItemInput("2x bread")).toMatchObject({
      text: "Bread",
      quantity: "2",
    });
    expect(parseItemInput("bread x3")).toMatchObject({
      text: "Bread",
      quantity: "3",
    });
    expect(parseItemInput("bread 3x")).toMatchObject({
      text: "Bread",
      quantity: "3",
    });
  });

  it("drops a redundant quantity of one", () => {
    expect(parseItemInput("1 bread").quantity).toBeUndefined();
  });

  it("does not mistake part of a product name for a quantity", () => {
    expect(parseItemInput("2% milk")).toMatchObject({ text: "2% milk" });
    expect(parseItemInput("7up")).toMatchObject({ text: "7up" });
  });

  it("accepts an explicit #category and wins over the guess", () => {
    expect(parseItemInput("milk #treats")).toMatchObject({
      text: "Milk",
      category: "Treats",
    });
  });

  it("leaves unknown items uncategorised rather than guessing wrong", () => {
    expect(parseItemInput("gasket").category).toBeUndefined();
  });

  it("handles empty input safely", () => {
    expect(parseItemInput("   ")).toEqual({
      text: "",
      quantity: undefined,
      category: undefined,
    });
  });
});

describe("guessCategory", () => {
  it("matches plurals", () => {
    expect(guessCategory("grapes")).toBe("Produce");
    expect(guessCategory("tomatoes")).toBe("Produce");
    expect(guessCategory("berries")).toBe("Produce");
  });

  it("prefers the longer phrase", () => {
    expect(guessCategory("oat milk")).toBe("Dairy & Eggs");
    expect(guessCategory("dog food")).toBe("Pet");
    expect(guessCategory("frozen peas")).toBe("Frozen");
  });

  it("ignores case and punctuation", () => {
    expect(guessCategory("Free-range EGGS!")).toBe("Dairy & Eggs");
  });
});

describe("mergeQuantities", () => {
  it("adds plain counts, treating a missing quantity as one", () => {
    expect(mergeQuantities(undefined, undefined)).toBe("2");
    expect(mergeQuantities("2", undefined)).toBe("3");
    expect(mergeQuantities("2", "3")).toBe("5");
  });

  it("keeps a matching unit", () => {
    expect(mergeQuantities("500 g", "500 g")).toBe("1000 g");
  });

  it("leaves the existing value alone when it cannot add up", () => {
    expect(mergeQuantities("a few", "2")).toBe("a few");
    expect(mergeQuantities("2 kg", "500 g")).toBe("2 kg");
  });
});

describe("display helpers", () => {
  it("formats bare counts as a multiplier", () => {
    expect(formatQuantity("3")).toBe("x3");
    expect(formatQuantity("500 g")).toBe("500 g");
  });

  it("normalises duplicate keys", () => {
    expect(getDuplicateKey("  Whole  Milk ")).toBe("whole milk");
  });
});
