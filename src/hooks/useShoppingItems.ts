import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { db } from "../firebase";
import type { ShoppingItem } from "../lib/shoppingItem";
import { subscribeToShoppingItems } from "../services/shoppingItems";

interface ShoppingItemsState {
  items: ShoppingItem[];
  setItems: Dispatch<SetStateAction<ShoppingItem[]>>;
  loaded: boolean;
}

/**
 * Owns the signed-in user's live shopping-item subscription.
 *
 * The setter remains available to callers for optimistic reorder updates while
 * Firestore stays the source of truth through the snapshot listener.
 */
export function useShoppingItems(
  userId: string | undefined,
  setError: Dispatch<SetStateAction<string>>,
): ShoppingItemsState {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId || !db) return undefined;

    return subscribeToShoppingItems(
      db,
      userId,
      (nextItems) => {
        setItems(nextItems);
        setLoaded(true);
        setError("");
      },
      (error) => {
        console.error("Snapshot error:", error);
        setError(
          "We could not sync your list. Check your connection and try again.",
        );
      },
    );
  }, [setError, userId]);

  return { items, setItems, loaded };
}
