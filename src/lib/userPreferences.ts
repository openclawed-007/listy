// User-facing display preferences: hide coaching / chrome once you know the app.
//
// Defaults stay helpful for first-time users. Preferences are stored locally
// immediately and mirrored to Firestore when signed in.

export interface InterfacePreferences {
  /** Empty-state coaching ("Try 2 milk…", first-run tips). */
  emptyTips: boolean;
  /** Live parse preview under the add field (qty / aisle chips). */
  addHints: boolean;
  /** Guest / public sign-in blurbs and similar onboarding copy. */
  onboardingCopy: boolean;
  /** Sort toolbar helper ("Drag to reorder"). */
  sortHints: boolean;
  /** Shopping-day reminder banner on the list. */
  shoppingBanners: boolean;
  /** Thin progress bar under list stats. */
  progressBar: boolean;
  /** Important-star control and row accent on list items. */
  importantStars: boolean;
  /** Brand mark icon in the top-left (name stays, shifts flush left). */
  brandLogo: boolean;
  /**
   * Browser notification when a shared list changes in the background.
   * Default off — opt-in after permission.
   */
  shareChangeNotices: boolean;
  /**
   * Desktop display scale in percent (100 = the base fluid ramp).
   * Applied via the `--ui-scale` CSS variable on screens ≥1024px only;
   * phones and tablets keep the compact layout regardless.
   */
  displayScale: number;
}

/** Boolean-only preference keys (everything a settings switch can flip). */
export type InterfaceToggleKey = Exclude<
  keyof InterfacePreferences,
  "displayScale"
>;

export interface PrefOption {
  id: InterfaceToggleKey;
  label: string;
  description: string;
}

const MIN_DISPLAY_SCALE = 80;
const MAX_DISPLAY_SCALE = 130;
/** Slightly under the base ramp — roomy but not oversized out of the box. */
const DEFAULT_DISPLAY_SCALE = 95;

/** Presets for the settings segmented control. */
export const DISPLAY_SCALE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 85, label: "Small" },
  { value: DEFAULT_DISPLAY_SCALE, label: "Default" },
  { value: 105, label: "Large" },
  { value: 115, label: "XL" },
];

interface UserPreferences {
  interface: InterfacePreferences;
}

export const DEFAULT_INTERFACE_PREFERENCES: InterfacePreferences = {
  emptyTips: true,
  addHints: true,
  onboardingCopy: true,
  sortHints: true,
  shoppingBanners: true,
  progressBar: true,
  importantStars: true,
  brandLogo: true,
  shareChangeNotices: false,
  displayScale: DEFAULT_DISPLAY_SCALE,
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  interface: { ...DEFAULT_INTERFACE_PREFERENCES },
};

/** Coaching copy — Show all / Hide all only touches this group. */
export const TIPS_PREF_OPTIONS: PrefOption[] = [
  {
    id: "emptyTips",
    label: "Empty-list tips",
    description: "Hints when the list is empty, like “try 2 milk”.",
  },
  {
    id: "addHints",
    label: "Add-field preview",
    description: "Shows quantity and aisle as you type a new item.",
  },
  {
    id: "onboardingCopy",
    label: "Sign-in & help text",
    description: "Guest prompts, join blurb, and similar coaching copy.",
  },
  {
    id: "sortHints",
    label: "Sort helper text",
    description: "“Drag to reorder” and similar toolbar hints.",
  },
];

/** Visible list chrome on the Look tab. */
export const LOOK_PREF_OPTIONS: PrefOption[] = [
  {
    id: "progressBar",
    label: "Progress bar",
    description: "Thin bar under the list stats as you check items off.",
  },
  {
    id: "importantStars",
    label: "Important stars",
    description: "Star control on each row to mark must-get items.",
  },
  {
    id: "brandLogo",
    label: "Header logo",
    description: "CartLink icon top-left. Name stays; it moves flush left.",
  },
];

const LOCAL_KEY = "cartlink:user-preferences:v1";

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asScale(value: unknown, fallback: number): number {
  const num =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_DISPLAY_SCALE, Math.max(MIN_DISPLAY_SCALE, Math.round(num)));
}

export function normalizeInterfacePreferences(
  value: unknown,
): InterfacePreferences {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const base = DEFAULT_INTERFACE_PREFERENCES;
  return {
    emptyTips: asBool(raw.emptyTips, base.emptyTips),
    addHints: asBool(raw.addHints, base.addHints),
    onboardingCopy: asBool(raw.onboardingCopy, base.onboardingCopy),
    sortHints: asBool(raw.sortHints, base.sortHints),
    shoppingBanners: asBool(raw.shoppingBanners, base.shoppingBanners),
    progressBar: asBool(raw.progressBar, base.progressBar),
    importantStars: asBool(raw.importantStars, base.importantStars),
    brandLogo: asBool(raw.brandLogo, base.brandLogo),
    shareChangeNotices: asBool(raw.shareChangeNotices, base.shareChangeNotices),
    displayScale: asScale(raw.displayScale, base.displayScale),
  };
}

export function normalizeUserPreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== "object") {
    return {
      interface: { ...DEFAULT_INTERFACE_PREFERENCES },
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    interface: normalizeInterfacePreferences(raw.interface ?? raw),
  };
}

export function readLocalUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { interface: { ...DEFAULT_INTERFACE_PREFERENCES } };
    return normalizeUserPreferences(JSON.parse(raw));
  } catch {
    return { interface: { ...DEFAULT_INTERFACE_PREFERENCES } };
  }
}

export function writeLocalUserPreferences(prefs: UserPreferences) {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify(normalizeUserPreferences(prefs)),
    );
  } catch {
    // Private mode may block storage.
  }
}

export function setPrefGroup(
  prefs: InterfacePreferences,
  options: PrefOption[],
  on: boolean,
): InterfacePreferences {
  const next = { ...prefs };
  for (const option of options) next[option.id] = on;
  return next;
}

export function countEnabledPrefGroup(
  prefs: InterfacePreferences,
  options: PrefOption[],
): number {
  return options.filter((option) => prefs[option.id]).length;
}
