// Client-side heads-up when a shared list changes while the tab is in the
// background. No server push — only works when the app/SW can still run.

import { registerServiceWorker } from "../offline";
import {
  notificationPermission,
  requestNotificationPermission,
} from "./shoppingReminders";

const SW_TAG_PREFIX = "cartlink-share-";
const NOTIFICATION_ICON = "/notification-icon.png";
const NOTIFICATION_BADGE = "/notification-badge.png";
const DEBOUNCE_MS = 4000;

const lastShown = new Map<string, number>();

function documentLooksBackgrounded() {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden" || !document.hasFocus();
}

export function shouldNotifyShareChange(options: {
  enabled: boolean;
  ownerId: string;
  changeCount: number;
  now?: number;
}): boolean {
  if (!options.enabled) return false;
  if (options.changeCount <= 0) return false;
  if (!documentLooksBackgrounded()) return false;
  if (notificationPermission() !== "granted") return false;

  const now = options.now ?? Date.now();
  const last = lastShown.get(options.ownerId) ?? 0;
  if (now - last < DEBOUNCE_MS) return false;
  return true;
}

/** Test helper — clears debounce map. */
export function resetShareNotifyDebounce() {
  lastShown.clear();
}

export async function ensureShareNotifyPermission(): Promise<boolean> {
  const current = notificationPermission();
  if (current === "granted") return true;
  if (current === "denied") return false;
  const next = await requestNotificationPermission();
  return next === "granted";
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    registerServiceWorker({ force: true });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Fire a coalesced notification for remote shared-list activity.
 * Safe to call often — internal debounce + background checks.
 */
export async function notifyShareListChange(input: {
  enabled: boolean;
  ownerId: string;
  ownerName?: string;
  changeCount: number;
}): Promise<boolean> {
  if (
    !shouldNotifyShareChange({
      enabled: input.enabled,
      ownerId: input.ownerId,
      changeCount: input.changeCount,
    })
  ) {
    return false;
  }

  const now = Date.now();
  lastShown.set(input.ownerId, now);

  const who = input.ownerName?.trim() || "Someone";
  const title = "Shared list updated";
  const body =
    input.changeCount === 1
      ? `${who} updated the list`
      : `${who} made ${input.changeCount} updates`;
  const tag = `${SW_TAG_PREFIX}${input.ownerId}`;

  const registration = await getRegistration();
  if (registration) {
    try {
      await registration.showNotification(title, {
        tag,
        body,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        data: { url: "/", shareOwnerId: input.ownerId },
      });
      return true;
    } catch {
      // Fall through.
    }
  }

  if (notificationPermission() === "granted") {
    try {
      new Notification(title, {
        tag,
        body,
        icon: NOTIFICATION_ICON,
        data: { url: "/", shareOwnerId: input.ownerId },
      });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
