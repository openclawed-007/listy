import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./useAuth";
import {
  DEFAULT_USER_PREFERENCES,
  normalizeInterfacePreferences,
  normalizeUserPreferences,
  readLocalUserPreferences,
  writeLocalUserPreferences,
  type InterfacePreferences,
} from "../lib/userPreferences";
import {
  normalizeReminderSettings,
  readLocalReminderSettings,
  writeLocalReminderSettings,
  type ShoppingReminderSettings,
} from "../lib/shoppingReminders";

interface PreferencesContextValue {
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

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [interfacePrefs, setInterfaceState] = useState<InterfacePreferences>(
    () => readLocalUserPreferences().interface,
  );
  const [reminderSettings, setReminderState] =
    useState<ShoppingReminderSettings>(() => readLocalReminderSettings());

  const persistUserSettings = useCallback(
    async (input: {
      interface: InterfacePreferences;
      shoppingReminders: ShoppingReminderSettings;
    }) => {
      const nextInterface = normalizeInterfacePreferences(input.interface);
      const nextReminders = normalizeReminderSettings(input.shoppingReminders);

      setInterfaceState(nextInterface);
      setReminderState(nextReminders);
      writeLocalUserPreferences({ interface: nextInterface });
      writeLocalReminderSettings(nextReminders);

      if (uid && db) {
        await setDoc(
          doc(db, "userSettings", uid),
          {
            interface: nextInterface,
            shoppingReminders: nextReminders,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
    },
    [uid],
  );

  const setInterfacePrefs = useCallback(
    async (next: InterfacePreferences) => {
      await persistUserSettings({
        interface: next,
        shoppingReminders: reminderSettings,
      });
    },
    [persistUserSettings, reminderSettings],
  );

  const setReminderSettingsLocal = useCallback(
    (next: ShoppingReminderSettings) => {
      const normalized = normalizeReminderSettings(next);
      setReminderState(normalized);
      writeLocalReminderSettings(normalized);
    },
    [],
  );

  const refreshFromCloud = useCallback(async () => {
    if (!uid || !db) {
      const local = readLocalUserPreferences();
      setInterfaceState(local.interface);
      setReminderState(readLocalReminderSettings());
      return;
    }

    try {
      const snap = await getDoc(doc(db, "userSettings", uid));
      if (!snap.exists()) return;
      const data = snap.data();
      const next = normalizeUserPreferences({
        interface: data.interface,
      });
      const reminders = normalizeReminderSettings(data.shoppingReminders);

      setInterfaceState(next.interface);
      writeLocalUserPreferences(next);
      setReminderState(reminders);
      writeLocalReminderSettings(reminders);
    } catch (error) {
      console.error("Load user preferences error:", error);
    }
  }, [uid]);

  useEffect(() => {
    void refreshFromCloud();
  }, [refreshFromCloud]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      interfacePrefs,
      reminderSettings,
      setInterfacePrefs,
      setReminderSettingsLocal,
      refreshFromCloud,
      persistUserSettings,
    }),
    [
      interfacePrefs,
      reminderSettings,
      setInterfacePrefs,
      setReminderSettingsLocal,
      refreshFromCloud,
      persistUserSettings,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

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
