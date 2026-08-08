import {
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY_LENGTH,
} from "./itemInput";

const STORAGE_KEY = "cartlink:guest-items:v1";
const MAX_GUEST_ITEMS = 500;

export interface GuestItem {
  id: string;
  text: string;
  completed: boolean;
  quantity?: string;
  category?: string;
  note?: string;
  important?: boolean;
  /** Lower values appear higher when sorted by manual order. */
  sortOrder?: number;
  createdAt: number;
}

export function readGuestItems(): GuestItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_GUEST_ITEMS).flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const text = typeof item.text === "string" ? item.text.trim().slice(0, MAX_ITEM_TEXT_LENGTH) : "";
      if (!text || typeof item.id !== "string") return [];
      const sortOrder =
        typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : undefined;
      return [{
        id: item.id,
        text,
        completed: item.completed === true,
        quantity: typeof item.quantity === "string" ? item.quantity.trim().slice(0, MAX_QUANTITY_LENGTH) || undefined : undefined,
        category: typeof item.category === "string" ? item.category.trim().slice(0, MAX_CATEGORY_LENGTH) || undefined : undefined,
        note: typeof item.note === "string" ? item.note.trim().slice(0, MAX_NOTE_LENGTH) || undefined : undefined,
        ...(item.important === true ? { important: true } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
      }];
    });
  } catch {
    return [];
  }
}

export function writeGuestItems(items: GuestItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_GUEST_ITEMS)));
  } catch {
    // The list remains usable for this tab when browser storage is blocked.
  }
}

/** Wipe the local guest list after a successful migrate-to-account. */
export function clearGuestItems() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Privacy modes may block storage; migration still wrote to the cloud.
  }
}

export function createGuestId() {
  return globalThis.crypto?.randomUUID?.() ?? `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Human-readable notice after bringing guest items into a signed-in account.
 * Pure so the wording can be unit-tested without Firebase.
 */
export function guestMigrationNotice(added: number, merged: number): string {
  if (added > 0 && merged === 0) {
    return `Brought over ${added} item${added === 1 ? "" : "s"} from your guest list.`;
  }
  if (merged > 0 && added === 0) {
    return `Merged ${merged} guest item${merged === 1 ? "" : "s"} into your list.`;
  }
  if (added > 0 && merged > 0) {
    return `Brought over your guest list (${added} new, ${merged} merged).`;
  }
  return "Your guest list was already on this account.";
}
