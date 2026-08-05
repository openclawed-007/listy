import { useContext } from "react";
import {
  PreferencesContext,
  type PreferencesContextValue,
} from "./PreferencesContext.shared";
import { DEFAULT_USER_PREFERENCES } from "../lib/userPreferences";
import { readLocalReminderSettings } from "../lib/shoppingReminders";

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    // Safe fallback for tests that don't wrap the provider.
    return {
      interfacePrefs: DEFAULT_USER_PREFERENCES.interface,
      reminderSettings: readLocalReminderSettings(),
      setInterfacePrefs: async () => undefined,
      setReminderSettingsLocal: () => undefined,
      refreshFromCloud: async () => undefined,
      persistUserSettings: async () => undefined,
    };
  }
  return ctx;
}
