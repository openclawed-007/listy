// Bridge between reminder settings and the browser notification surface.
// Prefers the service worker (background capable); falls back to page-level
// Notification + in-app due checks.

import { registerServiceWorker } from "../offline";
import {
  buildReminderSchedule,
  dueReminders,
  markReminderFired,
  notificationPermission,
  notificationsAvailableInThisContext,
  notificationsSupported,
  readFiredReminderKeys,
  readLocalReminderSettings,
  requestNotificationPermission,
  settingsAreReady,
  type ScheduledReminder,
  type ShoppingReminderSettings,
  writeLocalReminderSettings,
} from "./shoppingReminders";

const SW_TAG_PREFIX = "cartlink-reminder-";
/** Full-color tile for notification `icon` (not a light/white square). */
const NOTIFICATION_ICON = "/notification-icon.png";
/** Monochrome white-on-transparent for Android `badge`. */
const NOTIFICATION_BADGE = "/notification-badge.png";

function supportsTimestampTrigger(): boolean {
  return (
    typeof ServiceWorkerRegistration !== "undefined" &&
    "showNotification" in ServiceWorkerRegistration.prototype &&
    typeof (globalThis as { TimestampTrigger?: unknown }).TimestampTrigger ===
      "function"
  );
}

async function getReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    registerServiceWorker({ force: true });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function clearScheduledNotifications(
  registration: ServiceWorkerRegistration,
) {
  try {
    // includeTriggered is Chrome-only; ignore if unsupported.
    const existing = await registration.getNotifications(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { includeTriggered: true } as any,
    );
    existing
      .filter((note) => (note.tag ?? "").startsWith(SW_TAG_PREFIX))
      .forEach((note) => note.close());
  } catch {
    try {
      const existing = await registration.getNotifications();
      existing
        .filter((note) => (note.tag ?? "").startsWith(SW_TAG_PREFIX))
        .forEach((note) => note.close());
    } catch {
      // Best effort.
    }
  }
}

async function scheduleViaTriggers(
  registration: ServiceWorkerRegistration,
  reminders: ScheduledReminder[],
) {
  const Trigger = (globalThis as {
    TimestampTrigger?: new (timestamp: number) => unknown;
  }).TimestampTrigger;
  if (!Trigger) return false;

  await clearScheduledNotifications(registration);

  // Cap so we do not flood the OS notification scheduler.
  const upcoming = reminders
    .filter((item) => item.at > Date.now())
    .slice(0, 16);

  await Promise.all(
    upcoming.map((item) =>
      registration.showNotification(item.title, {
        tag: `${SW_TAG_PREFIX}${item.key}`,
        body: item.body,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        data: { url: "/", reminderKey: item.key },
        // showTrigger is experimental (Notification Triggers).
        showTrigger: new Trigger(item.at),
      } as NotificationOptions),
    ),
  );

  return true;
}

async function showNow(
  registration: ServiceWorkerRegistration | null,
  reminder: ScheduledReminder,
) {
  markReminderFired(reminder.key);

  if (registration) {
    try {
      await registration.showNotification(reminder.title, {
        tag: `${SW_TAG_PREFIX}${reminder.key}`,
        body: reminder.body,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        data: { url: "/", reminderKey: reminder.key },
      });
      return;
    } catch {
      // Fall through to page Notification.
    }
  }

  if (notificationPermission() === "granted") {
    try {
       
      new Notification(reminder.title, {
        tag: `${SW_TAG_PREFIX}${reminder.key}`,
        body: reminder.body,
        icon: NOTIFICATION_ICON,
        // badge is SW-only on most browsers
        data: { url: "/", reminderKey: reminder.key },
      });
    } catch {
      // Silent — in-app banner still covers the user.
    }
  }
}

/** Fire any due reminders that were missed while the browser was closed. */
export async function flushDueReminders(
  settings: ShoppingReminderSettings = readLocalReminderSettings(),
) {
  if (!settingsAreReady(settings)) return;
  if (notificationPermission() !== "granted") return;

  const due = dueReminders(settings, new Date(), readFiredReminderKeys());
  if (due.length === 0) return;

  const registration = await getReadyRegistration();
  for (const reminder of due) {
    await showNow(registration, reminder);
  }
}

/**
 * Recompute and arm the next reminders. Call after settings save and on app boot.
 */
export async function syncReminderSchedule(
  settings: ShoppingReminderSettings,
): Promise<{ scheduled: number; mode: "triggers" | "check" | "off" }> {
  writeLocalReminderSettings(settings);

  if (!settingsAreReady(settings)) {
    const registration = await getReadyRegistration();
    if (registration) await clearScheduledNotifications(registration);
    return { scheduled: 0, mode: "off" };
  }

  if (notificationPermission() !== "granted") {
    return { scheduled: 0, mode: "check" };
  }

  const schedule = buildReminderSchedule(settings);
  const registration = await getReadyRegistration();

  if (registration && supportsTimestampTrigger()) {
    const ok = await scheduleViaTriggers(registration, schedule);
    if (ok) {
      // Tell the SW to keep a copy for due-checks as well.
      registration.active?.postMessage({
        type: "cartlink:reminders-updated",
        settings,
        schedule,
      });
      return { scheduled: Math.min(schedule.length, 16), mode: "triggers" };
    }
  }

  if (registration?.active) {
    registration.active.postMessage({
      type: "cartlink:reminders-updated",
      settings,
      schedule,
    });
  }

  await flushDueReminders(settings);
  return { scheduled: schedule.length, mode: "check" };
}

export async function enableRemindersWithPermission(
  settings: ShoppingReminderSettings,
): Promise<{
  settings: ShoppingReminderSettings;
  permission: NotificationPermission | "unsupported";
  scheduled: number;
  mode: "triggers" | "check" | "off";
}> {
  const permission = await requestNotificationPermission();
  const next: ShoppingReminderSettings = {
    ...settings,
    enabled: true,
  };
  writeLocalReminderSettings(next);

  if (permission !== "granted") {
    return { settings: next, permission, scheduled: 0, mode: "check" };
  }

  const result = await syncReminderSchedule(next);
  return {
    settings: next,
    permission,
    scheduled: result.scheduled,
    mode: result.mode,
  };
}

/**
 * Ask the browser for notification permission (must be from a user gesture).
 * Returns the resulting permission string.
 */
export async function promptAllowNotifications(): Promise<
  NotificationPermission | "unsupported"
> {
  return requestNotificationPermission();
}

/**
 * Fire an immediate test notification so the user can verify alerts work.
 * Requires permission already granted (or will request it once).
 */
export async function sendTestNotification(): Promise<{
  ok: boolean;
  reason:
    | "sent"
    | "unsupported"
    | "insecure_context"
    | "denied"
    | "default"
    | "error";
}> {
  if (!notificationsSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  if (!notificationsAvailableInThisContext()) {
    return { ok: false, reason: "insecure_context" };
  }

  let permission: NotificationPermission | "unsupported" = Notification.permission;
  if (permission === "default") {
    permission = await requestNotificationPermission();
  }
  if (permission === "denied" || permission === "unsupported") {
    return { ok: false, reason: permission === "denied" ? "denied" : "unsupported" };
  }
  if (permission !== "granted") {
    return { ok: false, reason: "default" };
  }

  const registration = await getReadyRegistration();
  const title = "CartLink test";
  const body = "Notifications are working. You’ll get shopping reminders here.";
  const options = {
    tag: `${SW_TAG_PREFIX}test`,
    body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    data: { url: "/" },
  };

  try {
    if (registration) {
      await registration.showNotification(title, options);
    } else {
       
      new Notification(title, options);
    }
    return { ok: true, reason: "sent" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Keep reminders honest while a tab is open. */
export function startReminderWatch(
  getSettings: () => ShoppingReminderSettings,
): () => void {
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    void flushDueReminders(getSettings());
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };

  // Boot + focus + gentle interval (no need for aggressive polling).
  tick();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", tick);
  const intervalId = window.setInterval(tick, 5 * 60 * 1000);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", tick);
    window.clearInterval(intervalId);
  };
}
