// A visitor's own ticks on a shared list they cannot write to.
//
// Someone handed a share link is usually the person doing the shopping, so
// ticking items off is the whole point of the page. Without permission (or an
// account) those ticks only lived in React state: the next snapshot from the
// owner — or a screen lock and reload — wiped the lot halfway round the shop.
//
// These are stored as *overrides* rather than a set of ticked items, so the
// owner's own progress still shows through on anything the visitor has not
// touched, and un-ticking something the owner ticked still works.

import { getDuplicateKey } from "./itemInput";

const STORAGE_PREFIX = "cartlink:ticks:";

/** Item key -> the completion state this device chose for it. */
export type LocalTicks = Record<string, boolean>;

/** Ticks are matched on item text so they survive the owner editing quantities. */
export function toTickKey(text: string) {
  return getDuplicateKey(text);
}

export function resolveCompleted(
  ticks: LocalTicks,
  item: { text: string; completed: boolean },
) {
  const key = toTickKey(item.text);
  return key in ticks ? ticks[key] : item.completed;
}

export function toggleTick(
  ticks: LocalTicks,
  item: { text: string; completed: boolean },
): LocalTicks {
  return { ...ticks, [toTickKey(item.text)]: !resolveCompleted(ticks, item) };
}

/**
 * Drop overrides for items the owner removed, and for items where the owner
 * has since caught up with the visitor — so storage stays small and the list
 * heals back towards the shared truth on its own.
 */
export function pruneTicks(
  ticks: LocalTicks,
  items: Array<{ text: string; completed: boolean }>,
): LocalTicks {
  const ownerState = new Map(
    items.map((item) => [toTickKey(item.text), item.completed]),
  );

  const next: LocalTicks = {};
  Object.entries(ticks).forEach(([key, completed]) => {
    if (!ownerState.has(key)) return;
    if (ownerState.get(key) === completed) return;
    next[key] = completed;
  });
  return next;
}

export function sameTicks(a: LocalTicks, b: LocalTicks) {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => key in b && a[key] === b[key]);
}

export function readLocalTicks(shareId: string): LocalTicks {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${shareId}`);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const ticks: LocalTicks = {};
    Object.entries(parsed as Record<string, unknown>).forEach(
      ([key, value]) => {
        if (typeof value === "boolean") ticks[key] = value;
      },
    );
    return ticks;
  } catch {
    return {};
  }
}

export function writeLocalTicks(shareId: string, ticks: LocalTicks) {
  try {
    if (Object.keys(ticks).length === 0) {
      localStorage.removeItem(`${STORAGE_PREFIX}${shareId}`);
      return;
    }
    localStorage.setItem(`${STORAGE_PREFIX}${shareId}`, JSON.stringify(ticks));
  } catch {
    // Private browsing can block storage; ticks then last for the session.
  }
}

export function clearLocalTicks(shareId: string) {
  writeLocalTicks(shareId, {});
}
