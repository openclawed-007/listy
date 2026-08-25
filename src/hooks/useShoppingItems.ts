import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { compareManualOrder } from "../lib/listOrder";
import {
  normalizeShoppingItem,
  type ShoppingItem,
} from "../lib/shoppingItem";

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

    const itemsQuery = query(
      collection(db, "shoppingItems"),
      where("userId", "==", userId),
    );

    return onSnapshot(
      itemsQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.flatMap((snapshotDoc) => {
          const item = normalizeShoppingItem(
            snapshotDoc.id,
            snapshotDoc.data(),
          );
          return item ? [item] : [];
        });

        nextItems.sort(compareManualOrder);
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
