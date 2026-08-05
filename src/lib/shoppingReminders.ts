// Shopping-day reminders: when people usually shop, and when to nudge them.
//
// Web notifications cannot reliably fire months ahead without a push server.
// We combine:
//  1) Notification Triggers (Chrome) for true scheduled OS notifications
//  2) Client/SW due-checks on open / focus / short intervals
//  3) An in-app banner as a guaranteed fallback when permission is denied

export type RemindWhen = "day_of" | "day_before" | "both";

export interface ShoppingReminderSettings {
  enabled: boolean;
  /** Days of week, Sunday = 0 … Saturday = 6 (matches Date#getDay). */
  days: number[];
  /** Usual shopping time, "HH:mm" — used in notification copy. */
  shopTime: string;
  /** When to fire the notification relative to shopping days. */
  when: RemindWhen;
  /** Clock time for the reminder itself, "HH:mm". */
  notifyTime: string;
}

export interface ScheduledReminder {
  /** Stable key for de-dupe, e.g. "2026-08-09:day_of". */
  key: string;
  /** Epoch ms when the notification should fire. */
  at: number;
  kind: "day_of" | "day_before";
  /** Shopping day this reminder is about (local date YYYY-MM-DD). */
  shoppingDate: string;
  title: string;
  body: string;
}

export const DEFAULT_REMINDER_SETTINGS: ShoppingReminderSettings = {
  enabled: false,
  days: [],
  shopTime: "17:00",
  when: "day_of",
  notifyTime: "09:00",
};

export const WEEKDAY_LABELS = [
  { day: 0, short: "Sun", long: "Sunday" },
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
] as const;

const LOCAL_KEY = "cartlink:shopping-reminders:v1";
const FIRED_KEY = "cartlink:shopping-reminders:fired:v1";
const MAX_FIRED_KEYS = 60;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function normalizeReminderSettings(
  value: unknown,
): ShoppingReminderSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_REMINDER_SETTINGS };
  }

  const raw = value as Record<string, unknown>;
  const days = Array.isArray(raw.days)
    ? Array.from(
        new Set(
          raw.days.filter(
            (day): day is number =>
              typeof day === "number" &&
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6,
          ),
        ),
      ).sort((a, b) => a - b)
    : [];

  const when: RemindWhen =
    raw.when === "day_before" || raw.when === "both" || raw.when === "day_of"
      ? raw.when
      : DEFAULT_REMINDER_SETTINGS.when;

  return {
    enabled: raw.enabled === true,
    days,
    shopTime: isValidTimeString(raw.shopTime)
      ? raw.shopTime
      : DEFAULT_REMINDER_SETTINGS.shopTime,
    when,
    notifyTime: isValidTimeString(raw.notifyTime)
      ? raw.notifyTime
      : DEFAULT_REMINDER_SETTINGS.notifyTime,
  };
}

export function readLocalReminderSettings(): ShoppingReminderSettings {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { ...DEFAULT_REMINDER_SETTINGS };
    return normalizeReminderSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS };
  }
}

export function writeLocalReminderSettings(settings: ShoppingReminderSettings) {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify(normalizeReminderSettings(settings)),
    );
  } catch {
    // Private mode may block storage; runtime state still works for this tab.
  }
}

export function formatTimeLabel(time: string): string {
  if (!isValidTimeString(time)) return time;
  const [hRaw, m] = time.split(":").map(Number);
  const period = hRaw >= 12 ? "PM" : "AM";
  const hour = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatDaysLabel(days: number[]): string {
  if (days.length === 0) return "No days selected";
  if (days.length === 7) return "Every day";
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day]?.short ?? String(day))
    .join(", ");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date as YYYY-MM-DD. */
export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function atLocalTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayName(date: Date): string {
  return WEEKDAY_LABELS[date.getDay()]?.long ?? "that day";
}

/**
 * Build upcoming reminder firings for the next `horizonDays` days.
 * Pure — safe to unit test without the DOM.
 */
export function buildReminderSchedule(
  settings: ShoppingReminderSettings,
  now: Date = new Date(),
  horizonDays = 28,
): ScheduledReminder[] {
  const normalized = normalizeReminderSettings(settings);
  if (!normalized.enabled || normalized.days.length === 0) return [];

  const daySet = new Set(normalized.days);
  const includeDayOf =
    normalized.when === "day_of" || normalized.when === "both";
  const includeDayBefore =
    normalized.when === "day_before" || normalized.when === "both";

  const results: ScheduledReminder[] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const shoppingDay = addDays(start, offset);
    if (!daySet.has(shoppingDay.getDay())) continue;

    const shoppingKey = toLocalDateKey(shoppingDay);
    const shopLabel = formatTimeLabel(normalized.shopTime);
    const dayLabel = dayName(shoppingDay);

    if (includeDayOf) {
      const at = atLocalTime(shoppingDay, normalized.notifyTime);
      if (at.getTime() > now.getTime() - 60_000) {
        results.push({
          key: `${shoppingKey}:day_of`,
          at: at.getTime(),
          kind: "day_of",
          shoppingDate: shoppingKey,
          title: "Shopping day",
          body: `You usually shop on ${dayLabel} around ${shopLabel}. Open CartLink to check your list.`,
        });
      }
    }

    if (includeDayBefore) {
      const remindDay = addDays(shoppingDay, -1);
      const at = atLocalTime(remindDay, normalized.notifyTime);
      if (at.getTime() > now.getTime() - 60_000) {
        results.push({
          key: `${shoppingKey}:day_before`,
          at: at.getTime(),
          kind: "day_before",
          shoppingDate: shoppingKey,
          title: "Shopping tomorrow",
          body: `Tomorrow is ${dayLabel} — your usual shopping day around ${shopLabel}. Take a look at your list.`,
        });
      }
    }
  }

  return results.sort((a, b) => a.at - b.at);
}

/** Due now (within a grace window after scheduled time) and not yet fired. */
export function dueReminders(
  settings: ShoppingReminderSettings,
  now: Date = new Date(),
  firedKeys: Set<string> = readFiredReminderKeys(),
  graceMs = 2 * 60 * 60 * 1000,
): ScheduledReminder[] {
  const schedule = buildReminderSchedule(settings, new Date(now.getTime() - graceMs), 2);
  return schedule.filter((item) => {
    if (firedKeys.has(item.key)) return false;
    return item.at <= now.getTime() && now.getTime() - item.at <= graceMs;
  });
}

/**
 * In-app banner when today (or tomorrow) is a shopping day, regardless of
 * notification permission — so the feature still helps if OS alerts are off.
 */
export function shoppingDayBanner(
  settings: ShoppingReminderSettings,
  now: Date = new Date(),
): { kind: "today" | "tomorrow"; message: string } | null {
  const normalized = normalizeReminderSettings(settings);
  if (!normalized.enabled || normalized.days.length === 0) return null;

  const today = now.getDay();
  const tomorrow = (today + 1) % 7;
  const shopLabel = formatTimeLabel(normalized.shopTime);

  if (normalized.days.includes(today)) {
    return {
      kind: "today",
      message: `Shopping day — you usually go around ${shopLabel}.`,
    };
  }

  if (
    (normalized.when === "day_before" || normalized.when === "both") &&
    normalized.days.includes(tomorrow)
  ) {
    return {
      kind: "tomorrow",
      message: `Shopping tomorrow around ${shopLabel} — check your list.`,
    };
  }

  return null;
}

export function readFiredReminderKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((key): key is string => typeof key === "string"));
  } catch {
    return new Set();
  }
}

export function markReminderFired(key: string) {
  try {
    const keys = readFiredReminderKeys();
    keys.add(key);
    const trimmed = Array.from(keys).slice(-MAX_FIRED_KEYS);
    localStorage.setItem(FIRED_KEY, JSON.stringify(trimmed));
  } catch {
    // Non-fatal.
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * System notifications require a secure context (HTTPS or localhost).
 * Tailscale/LAN http://100.x / http://10.x origins usually report "denied"
 * without ever showing a permission prompt.
 */
export function notificationsAvailableInThisContext(): boolean {
  if (typeof window === "undefined") return false;
  if (!notificationsSupported()) return false;
  // window.isSecureContext is the standards check browsers use.
  if (window.isSecureContext === false) return false;
  return true;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  if (!notificationsAvailableInThisContext()) return "denied";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  // Don't call requestPermission() off secure contexts — it fails silently as denied.
  if (!notificationsAvailableInThisContext()) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Human reason for why OS alerts can't fire right now. */
export function notificationBlockReason():
  | "unsupported"
  | "insecure_context"
  | "denied"
  | "default"
  | "granted" {
  if (!notificationsSupported()) return "unsupported";
  if (!notificationsAvailableInThisContext()) return "insecure_context";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "default";
}

export function settingsAreReady(settings: ShoppingReminderSettings): boolean {
  const normalized = normalizeReminderSettings(settings);
  return (
    normalized.enabled &&
    normalized.days.length > 0 &&
    isValidTimeString(normalized.notifyTime)
  );
}

/** Next upcoming reminder for UI copy, or null. */
export function nextReminderPreview(
  settings: ShoppingReminderSettings,
  now: Date = new Date(),
): ScheduledReminder | null {
  const [first] = buildReminderSchedule(settings, now, 14);
  return first ?? null;
}
