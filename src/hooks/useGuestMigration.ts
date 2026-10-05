import { useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import { db } from "../firestore";
import {
  clearGuestItems,
  guestMigrationNotice,
  readGuestItems,
} from "../lib/guestItems";
import { getDuplicateKey, mergeQuantities } from "../lib/itemInput";
import {
  PERSONAL_LIST_ID,
  PERSONAL_LIST_NAME,
  type ShoppingItem,
} from "../lib/shoppingItem";
import {
  addShoppingItem,
  updateShoppingItem,
  type ItemUpdate,
} from "../services/shoppingItems";

interface Options {
  user: User | null;
  itemsLoaded: boolean;
  personalItems: ShoppingItem[];
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

/**
 * Guest mode lives only on this device. When the same person signs in, fold
 * those rows into their cloud list once so they never lose a half-built shop:
 * duplicates merge quantities, everything else is added.
 */
export function useGuestMigration({
  user,
  itemsLoaded,
  personalItems,
  onNotice,
  onError,
}: Options) {
  const migratedRef = useRef(false);

  useEffect(() => {
    if (!user || !db || !itemsLoaded || migratedRef.current) return;
    migratedRef.current = true;
    const firestore = db;

    const guestItems = readGuestItems();
    if (guestItems.length === 0) return;

    const personalByKey = new Map(
      personalItems.map((item) => [getDuplicateKey(item.text), item]),
    );

    void (async () => {
      let added = 0;
      let merged = 0;

      try {
        for (const guest of guestItems) {
          const key = getDuplicateKey(guest.text);
          const existing = personalByKey.get(key);

          if (!existing) {
            await addShoppingItem(firestore, user.uid, {
              ...guest,
              listId: PERSONAL_LIST_ID,
              listName: PERSONAL_LIST_NAME,
            });
            // A later guest row with the same name merges into this one.
            personalByKey.set(key, {
              id: `pending-${key}`,
              text: guest.text,
              completed: guest.completed,
              userId: user.uid,
              quantity: guest.quantity,
              category: guest.category,
              note: guest.note,
            });
            added += 1;
            continue;
          }

          const update: ItemUpdate = {};
          const quantity = mergeQuantities(existing.quantity, guest.quantity);
          if (quantity !== existing.quantity) update.quantity = quantity;
          // Prefer "still needed" if the guest copy was unchecked.
          if (existing.completed && !guest.completed) update.completed = false;
          if (!existing.category && guest.category) update.category = guest.category;
          if (!existing.note && guest.note) update.note = guest.note;

          if (Object.keys(update).length > 0) {
            await updateShoppingItem(firestore, existing.id, update);
            merged += 1;
          }
        }

        clearGuestItems();
        onNotice(guestMigrationNotice(added, merged));
      } catch (error) {
        console.error("Guest list migration error:", error);
        migratedRef.current = false;
        onError(
          "Couldn't import your guest list. It is still saved on this device.",
        );
      }
    })();
    // Only when the first cloud snapshot lands — not on every item change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot
  }, [user, itemsLoaded]);
}
