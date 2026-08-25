import {
  collection,
  onSnapshot,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { compareManualOrder } from "../lib/listOrder";
import {
  normalizeShoppingItem,
  type ShoppingItem,
} from "../lib/shoppingItem";

export type ShoppingItemsSubscriber = (items: ShoppingItem[]) => void;

/** Subscribe to one user's normalized shopping items in stable manual order. */
export function subscribeToShoppingItems(
  firestore: Firestore,
  userId: string,
  onItems: ShoppingItemsSubscriber,
  onError: (error: Error) => void,
) {
  const itemsQuery = query(
    collection(firestore, "shoppingItems"),
    where("userId", "==", userId),
  );

  return onSnapshot(
    itemsQuery,
    (snapshot) => {
      const items = snapshot.docs.flatMap((snapshotDoc) => {
        const item = normalizeShoppingItem(snapshotDoc.id, snapshotDoc.data());
        return item ? [item] : [];
      });
      items.sort(compareManualOrder);
      onItems(items);
    },
    onError,
  );
}
