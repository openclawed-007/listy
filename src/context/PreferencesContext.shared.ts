import { createContext } from "react";
import type { InterfacePreferences } from "../lib/userPreferences";
import type { ShoppingReminderSettings } from "../lib/shoppingReminders";

export interface PreferencesContextValue {
  interfacePrefs: InterfacePreferences;
  reminderSettings: ShoppingReminderSettings;
  /** Replace interface prefs and persist (local + cloud when signed in). */
  setInterfacePrefs: (next: InterfacePreferences) => Promise<void>;
  /** Replace reminder settings locally (cloud save still goes through Settings save). */
  setReminderSettingsLocal: (next: ShoppingReminderSettings) => void;
  /** Load remote userSettings when auth changes. */
  refreshFromCloud: () => Promise<void>;
  /** Persist a full snapshot (used by Settings dialog Save). */
  persistUserSettings: (input: {
    interface: InterfacePreferences;
    shoppingReminders: ShoppingReminderSettings;
  }) => Promise<void>;
}

export const PreferencesContext =
  createContext<PreferencesContextValue | null>(null);
