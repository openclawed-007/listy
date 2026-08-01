import {
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
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
      return [{
        id: item.id,
        text,
        completed: item.completed === true,
        quantity: typeof item.quantity === "string" ? item.quantity.trim().slice(0, MAX_QUANTITY_LENGTH) || undefined : undefined,
        category: typeof item.category === "string" ? item.category.trim().slice(0, MAX_CATEGORY_LENGTH) || undefined : undefined,
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

export function createGuestId() {
  return globalThis.crypto?.randomUUID?.() ?? `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
