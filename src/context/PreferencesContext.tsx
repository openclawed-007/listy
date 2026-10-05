import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import {
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
import {
  PreferencesContext,
  type PreferencesContextValue,
} from "./PreferencesContext.shared";

/**
 * Settings sync is the only reason this always-mounted provider would need
 * Firestore, so load it on demand: signed-out visitors never download it.
 */
async function loadSettingsStore() {
  const [{ db }, settings] = await Promise.all([
    import("../firestore"),
    import("../services/userSettings"),
  ]);
  return db ? { db, ...settings } : null;
}

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  // Anonymous share-page sessions keep preferences on the device only; they
  // have no account to sync to (and the rules block their userSettings writes).
  const uid = user && !user.isAnonymous ? user.uid : null;
  const [interfacePrefs, setInterfaceState] = useState<InterfacePreferences>(
    () => readLocalUserPreferences().interface,
  );
  const [reminderSettings, setReminderState] =
    useState<ShoppingReminderSettings>(() => readLocalReminderSettings());

  // Drive the text-size CSS variable from preferences (all screen sizes).
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ui-scale",
      String(interfacePrefs.displayScale / 100),
    );
  }, [interfacePrefs.displayScale]);

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

      if (!uid) return;
      const store = await loadSettingsStore();
      await store?.saveUserSettings(store.db, uid, {
        interface: nextInterface,
        shoppingReminders: nextReminders,
      });
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

  // Cloud-only refresh. Signed-out state already mirrors local storage —
  // every change writes through to it — so there is no sync fallback here,
  // which also keeps setState out of the synchronous effect path.
  const refreshFromCloud = useCallback(async () => {
    if (!uid) {
      const local = readLocalUserPreferences();
      setInterfaceState(local.interface);
      setReminderState(readLocalReminderSettings());
      return;
    }

    try {
      const store = await loadSettingsStore();
      if (!store) return;
      const data = await store.loadUserSettings(store.db, uid);
      if (!data) return;
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
    // Legitimate external sync: state updates only land after the Firestore
    // read resolves, never synchronously within the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
