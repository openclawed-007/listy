// Local item history for add-field typeahead.
//
// Pure helpers + localStorage so staples surface as you type without a cloud
// catalog. Rank is recency + frequency; cap keeps the store small.

import {
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
} from "./itemInput";

export interface HistoryEntry {
  text: string;
  category?: string;
  note?: string;
  count: number;
  lastUsedAt: number;
}

const STORAGE_KEY = "cartlink:item-history:v1";
export const MAX_HISTORY_ENTRIES = 200;
const MAX_SUGGESTIONS = 6;

/** Days of recency boost for ranking. */
const RECENCY_DAYS = 7;
const RECENCY_MS = RECENCY_DAYS * 24 * 60 * 60 * 1000;

function normalizeText(value: string) {
  return value.trim().slice(0, MAX_ITEM_TEXT_LENGTH);
}

function normalizeOptional(value: string | undefined, max: number) {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

export function normalizeHistoryEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? normalizeText(record.text) : "";
  if (!text) return null;
  const count =
    typeof record.count === "number" && Number.isFinite(record.count)
      ? Math.max(1, Math.floor(record.count))
      : 1;
  const lastUsedAt =
    typeof record.lastUsedAt === "number" && Number.isFinite(record.lastUsedAt)
      ? record.lastUsedAt
      : 0;
  return {
    text,
    category: normalizeOptional(
      typeof record.category === "string" ? record.category : undefined,
      MAX_CATEGORY_LENGTH,
    ),
    note: normalizeOptional(
      typeof record.note === "string" ? record.note : undefined,
      MAX_NOTE_LENGTH,
    ),
    count,
    lastUsedAt,
  };
}

export function readItemHistory(): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeHistoryEntry)
      .filter((entry): entry is HistoryEntry => Boolean(entry))
      .slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function writeItemHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)),
    );
  } catch {
    // Private mode / full storage — typeahead simply stays empty.
  }
}

/** Case-insensitive key used to merge "Milk" / "milk". */
export function historyKey(text: string) {
  return text.trim().toLowerCase();
}

/**
 * Record an item the user added or checked off. Merges by text key and keeps
 * the newest category/note when provided.
 */
export function recordHistoryUse(
  entries: HistoryEntry[],
  input: {
    text: string;
    category?: string;
    note?: string;
    at?: number;
  },
): HistoryEntry[] {
  const text = normalizeText(input.text);
  if (!text) return entries;

  const at = input.at ?? Date.now();
  const key = historyKey(text);
  const category = normalizeOptional(input.category, MAX_CATEGORY_LENGTH);
  const note = normalizeOptional(input.note, MAX_NOTE_LENGTH);

  const existingIndex = entries.findIndex(
    (entry) => historyKey(entry.text) === key,
  );

  let next: HistoryEntry[];
  if (existingIndex === -1) {
    next = [
      {
        text,
        ...(category ? { category } : {}),
        ...(note ? { note } : {}),
        count: 1,
        lastUsedAt: at,
      },
      ...entries,
    ];
  } else {
    const existing = entries[existingIndex];
    const updated: HistoryEntry = {
      text: existing.text,
      category: category ?? existing.category,
      note: note ?? existing.note,
      count: existing.count + 1,
      lastUsedAt: at,
    };
    next = [
      updated,
      ...entries.slice(0, existingIndex),
      ...entries.slice(existingIndex + 1),
    ];
  }

  if (next.length <= MAX_HISTORY_ENTRIES) return next;

  // Drop the lowest-scored entry (not necessarily the new one).
  const scored = next.map((entry, index) => ({
    entry,
    index,
    score: historyScore(entry, at),
  }));
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  const dropKey = historyKey(scored[0].entry.text);
  return next
    .filter((entry) => historyKey(entry.text) !== dropKey)
    .slice(0, MAX_HISTORY_ENTRIES);
}

export function historyScore(entry: HistoryEntry, now = Date.now()) {
  const recency =
    entry.lastUsedAt > 0 && now - entry.lastUsedAt < RECENCY_MS ? 5 : 0;
  return entry.count * 2 + recency;
}

/**
 * Rank history matches for a typed query. Empty/whitespace query → no results
 * (avoids a permanent dropdown when the field is focused empty).
 */
export function rankHistory(
  query: string,
  entries: HistoryEntry[],
  options: { limit?: number; now?: number } = {},
): HistoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const limit = options.limit ?? MAX_SUGGESTIONS;
  const now = options.now ?? Date.now();

  return entries
    .filter((entry) => {
      const t = entry.text.toLowerCase();
      return t.startsWith(q) || t.includes(q);
    })
    .map((entry) => {
      const t = entry.text.toLowerCase();
      const prefixBoost = t.startsWith(q) ? 10 : 0;
      return {
        entry,
        score: historyScore(entry, now) + prefixBoost,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.entry.lastUsedAt - a.entry.lastUsedAt ||
        a.entry.text.localeCompare(b.entry.text),
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/** Convenience: read, record, write. */
export function touchItemHistory(input: {
  text: string;
  category?: string;
  note?: string;
}) {
  const next = recordHistoryUse(readItemHistory(), input);
  writeItemHistory(next);
  return next;
}
