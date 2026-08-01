import { describe, expect, it } from "vitest";
import {
  pruneTicks,
  readLocalTicks,
  resolveCompleted,
  sameTicks,
  toggleTick,
  writeLocalTicks,
} from "./localTicks";

const apples = { text: "Apples", completed: false };

describe("local ticks", () => {
  it("falls back to the owner's state for untouched items", () => {
    expect(resolveCompleted({}, apples)).toBe(false);
    expect(resolveCompleted({}, { text: "Tea", completed: true })).toBe(true);
  });

  it("lets a visitor tick and un-tick, including items the owner ticked", () => {
    const ticked = toggleTick({}, apples);
    expect(resolveCompleted(ticked, apples)).toBe(true);

    const ownerTicked = { text: "Tea", completed: true };
    const unticked = toggleTick({}, ownerTicked);
    expect(resolveCompleted(unticked, ownerTicked)).toBe(false);
  });

  it("matches on item text so an owner's quantity edit keeps the tick", () => {
    const ticks = toggleTick({}, apples);
    expect(resolveCompleted(ticks, { ...apples, text: "apples" })).toBe(true);
  });

  it("forgets overrides for removed items and ones the owner caught up with", () => {
    const ticks = { apples: true, tea: true, gone: true };

    expect(
      pruneTicks(ticks, [
        { text: "Apples", completed: false },
        { text: "Tea", completed: true },
      ]),
    ).toEqual({ apples: true });
  });

  it("round-trips through localStorage", () => {
    writeLocalTicks("alex-uid", { apples: true });
    expect(readLocalTicks("alex-uid")).toEqual({ apples: true });

    writeLocalTicks("alex-uid", {});
    expect(readLocalTicks("alex-uid")).toEqual({});
  });

  it("ignores corrupt stored data", () => {
    localStorage.setItem("cartlink:ticks:alex-uid", "[oops");
    expect(readLocalTicks("alex-uid")).toEqual({});
  });

  it("compares tick maps by value", () => {
    expect(sameTicks({ a: true }, { a: true })).toBe(true);
    expect(sameTicks({ a: true }, { a: false })).toBe(false);
    expect(sameTicks({ a: true }, {})).toBe(false);
  });
});
