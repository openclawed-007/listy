import { describe, expect, it } from "vitest";
import {
  allInterfaceOff,
  allInterfaceOn,
  countEnabledInterfacePrefs,
  normalizeInterfacePreferences,
  normalizeUserPreferences,
} from "./userPreferences";

describe("userPreferences", () => {
  it("defaults missing fields to helpful on", () => {
    expect(normalizeInterfacePreferences(null).emptyTips).toBe(true);
    expect(normalizeInterfacePreferences({ emptyTips: false }).addHints).toBe(
      true,
    );
  });

  it("accepts explicit booleans only", () => {
    expect(
      normalizeInterfacePreferences({
        emptyTips: false,
        addHints: "nope",
        progressBar: true,
      }),
    ).toEqual({
      emptyTips: false,
      addHints: true,
      onboardingCopy: true,
      sortHints: true,
      shoppingBanners: true,
      progressBar: true,
      importantStars: true,
      brandLogo: true,
      displayScale: 95,
    });
  });

  it("clamps display scale to a sane range", () => {
    expect(normalizeInterfacePreferences({ displayScale: 105 }).displayScale).toBe(105);
    expect(normalizeInterfacePreferences({ displayScale: 500 }).displayScale).toBe(130);
    expect(normalizeInterfacePreferences({ displayScale: 10 }).displayScale).toBe(80);
    expect(normalizeInterfacePreferences({ displayScale: "big" }).displayScale).toBe(95);
    expect(normalizeInterfacePreferences(null).displayScale).toBe(95);
  });

  it("normalizes nested user preferences", () => {
    const prefs = normalizeUserPreferences({
      interface: { sortHints: false },
    });
    expect(prefs.interface.sortHints).toBe(false);
    expect(prefs.interface.emptyTips).toBe(true);
  });

  it("supports all-on / all-off presets", () => {
    expect(countEnabledInterfacePrefs(allInterfaceOn())).toBe(8);
    expect(countEnabledInterfacePrefs(allInterfaceOff())).toBe(0);
  });
});
