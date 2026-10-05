import { useEffect, useMemo } from "react";
import { usePreferences } from "../context/usePreferences";
import {
  startReminderWatch,
  syncReminderSchedule,
} from "../lib/reminderNotifications";
import { shoppingDayBanner } from "../lib/shoppingReminders";

/**
 * Keeps shopping-day reminders armed while a list is open and returns the
 * in-app banner for today, if there is one and banners are switched on.
 */
export function useShoppingReminders() {
  const { interfacePrefs, reminderSettings } = usePreferences();

  useEffect(() => {
    void syncReminderSchedule(reminderSettings);
    return startReminderWatch(() => reminderSettings);
  }, [reminderSettings]);

  return useMemo(
    () =>
      interfacePrefs.shoppingBanners ? shoppingDayBanner(reminderSettings) : null,
    [interfacePrefs.shoppingBanners, reminderSettings],
  );
}
