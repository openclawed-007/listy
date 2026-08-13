import { describe, expect, it } from "vitest";
import {
  countEnabledPrefGroup,
  DEFAULT_INTERFACE_PREFERENCES,
  LOOK_PREF_OPTIONS,
  normalizeInterfacePreferences,
  normalizeUserPreferences,
  setPrefGroup,
  TIPS_PREF_OPTIONS,
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
      shareChangeNotices: false,
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

  it("toggles a preference group without touching the others", () => {
    const hiddenTips = setPrefGroup(
      DEFAULT_INTERFACE_PREFERENCES,
      TIPS_PREF_OPTIONS,
      false,
    );
    expect(countEnabledPrefGroup(hiddenTips, TIPS_PREF_OPTIONS)).toBe(0);
    expect(countEnabledPrefGroup(hiddenTips, LOOK_PREF_OPTIONS)).toBe(
      LOOK_PREF_OPTIONS.length,
    );
    expect(hiddenTips.shareChangeNotices).toBe(false);
    expect(hiddenTips.progressBar).toBe(true);
  });
});
