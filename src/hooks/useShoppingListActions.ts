import type { Dispatch, SetStateAction } from "react";
import type { User } from "firebase/auth";
import { db } from "../firestore";
import {
  formatQuantity,
  getDuplicateKey,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY_LENGTH,
  mergeQuantities,
} from "../lib/itemInput";
import { nextTopSortOrder } from "../lib/listOrder";
import { commitSharedListMutation } from "../lib/sharedListMutations";
import {
  getItemListId,
  PERSONAL_LIST_ID,
  toSharedItemPayload,
  type ShoppingItem,
} from "../lib/shoppingItem";
import { isOwnedCustomListId, sharedOwnerIdFromListId } from "../lib/userLists";
import {
  addShoppingItem,
  deleteShoppingItem,
  deleteShoppingItems,
  restoreShoppingItem,
  updateShoppingItem,
  updateShoppingItems,
} from "../services/shoppingItems";
import type { ReorderCommit } from "./useItemReorder";
import { useUndoDelete } from "./useUndoDelete";
import type { useOwnedLists } from "./useOwnedLists";

export interface AddItemInput {
  text: string;
  quantity?: string;
  category?: string;
  note?: string;
}

type SharedChange =
  | { type: "toggle"; completed: boolean }
  | { type: "add" }
  | { type: "remove" }
  | { type: "edit"; edited: ShoppingItem };

/**
 * Mirror a change made on an imported (shared) row back to the owner's shared
 * list, so collaborating works the same signed in (via a tab) or signed out
 * (via the public page). The owner's current permissions are enforced inside
 * the mutation; a refused change is logged, never surfaced.
 */
async function propagateToSharedOwner(item: ShoppingItem, change: SharedChange) {
  if (!db || !item.sharedFromUserId) return;
  const target = {
    id: item.id,
    sharedSourceItemId: item.sharedSourceItemId,
    text: item.text,
    quantity: item.quantity,
    category: item.category,
  };

  try {
    await commitSharedListMutation(
      db,
      item.sharedFromUserId,
      change.type === "add"
        ? { type: "add", item: toSharedItemPayload(item) }
        : change.type === "remove"
          ? { type: "remove", target }
          : change.type === "edit"
            ? { type: "replace", target, item: toSharedItemPayload(change.edited) }
            : { type: "setCompleted", target, completed: change.completed },
    );
  } catch (error) {
    console.error("Propagate to shared owner error:", error);
  }
}

interface Options {
  user: User | null;
  items: ShoppingItem[];
  setItems: Dispatch<SetStateAction<ShoppingItem[]>>;
  /** Items on the tab being viewed. */
  listItems: ShoppingItem[];
  lists: ReturnType<typeof useOwnedLists>;
  /** Feed the typeahead with things the customer actually buys. */
  remember: (item: { text: string; category?: string; note?: string }) => void;
  notify: (message: string) => void;
  fail: (message: string) => void;
}

/**
 * Every write the signed-in list makes, with its error handling.
 *
 * Firestore applies a write to the local cache — and so to the list on screen
 * — the moment it is made, but its promise only settles once the *server*
 * has it, which never happens while offline. So nothing here waits on a write
 * before updating the UI: in a basement supermarket the input still clears,
 * the editor still closes and Undo still appears. Failures (rare: rules or
 * quota) arrive later as a message.
 */
export function useShoppingListActions({
  user,
  items,
  setItems,
  listItems,
  lists,
  remember,
  notify,
  fail,
}: Options) {
  const undo = useUndoDelete<ShoppingItem>();
  const { activeListId, activeTabName } = lists;

  /** Start a write without waiting for the server; report it if it fails. */
  const inBackground = (label: string, message: string, write: () => Promise<unknown>) => {
    fail("");
    Promise.resolve()
      .then(write)
      .catch((error) => {
        console.error(`${label}:`, error);
        fail(message);
      });
  };

  /**
   * Add what the customer typed or picked. Adding something already on the
   * list bumps that row instead of creating a near-identical duplicate.
   * Returns whether the input was accepted (so the field can clear).
   */
  const add = (input: AddItemInput) => {
    const text = input.text.trim();
    if (!user || !db || !text) return false;
    const firestore = db;
    const key = getDuplicateKey(text);
    const existing = listItems.find((item) => getDuplicateKey(item.text) === key);

    if (existing) {
      const quantity = mergeQuantities(existing.quantity, input.quantity);
      inBackground("Add item error", `Couldn't update “${existing.text}”. Please try again.`, () =>
        updateShoppingItem(firestore, existing.id, {
          completed: false,
          quantity,
          ...(input.category && !existing.category ? { category: input.category } : {}),
          ...(input.note && !existing.note ? { note: input.note } : {}),
        }),
      );
      if (existing.completed) void propagateToSharedOwner(existing, { type: "toggle", completed: false });
      remember({
        text: existing.text,
        category: existing.category ?? input.category,
        note: existing.note ?? input.note,
      });
      notify(
        quantity
          ? `${existing.text} was already on your list — now ${formatQuantity(quantity)}.`
          : `${existing.text} is already on your list.`,
      );
      return true;
    }

    const sharedFromUserId = sharedOwnerIdFromListId(activeListId);
    const fields = {
      text,
      quantity: input.quantity,
      category: input.category,
      note: input.note,
      listId: activeListId,
      listName: activeTabName,
      sharedFromUserId,
      sortOrder: nextTopSortOrder(listItems.filter((item) => !item.completed)),
    };
    inBackground("Add item error", `Couldn't add “${text}”. Please try again.`, () =>
      addShoppingItem(firestore, user.uid, fields),
    );
    if (sharedFromUserId) {
      void propagateToSharedOwner(
        { ...fields, id: "", completed: false, userId: user.uid },
        { type: "add" },
      );
    }
    remember({ text, category: input.category, note: input.note });
    return true;
  };

  const toggle = (item: ShoppingItem) => {
    if (!db) return;
    const firestore = db;
    const completed = !item.completed;
    inBackground("Update item error", "Unable to update this item right now. Please try again.", () =>
      updateShoppingItem(firestore, item.id, { completed }),
    );
    // Checking off reinforces staples for typeahead.
    if (completed) remember({ text: item.text, category: item.category, note: item.note });
    void propagateToSharedOwner(item, { type: "toggle", completed });
  };

  const toggleImportant = (item: ShoppingItem) => {
    if (!db) return;
    const firestore = db;
    inBackground("Toggle important error", "Unable to update this item right now. Please try again.", () =>
      updateShoppingItem(firestore, item.id, { important: item.important ? undefined : true }),
    );
  };

  const remove = (item: ShoppingItem) => {
    if (!db) return;
    const firestore = db;
    inBackground("Delete item error", "Unable to remove this item right now. Please try again.", () =>
      deleteShoppingItem(firestore, item.id),
    );
    void propagateToSharedOwner(item, { type: "remove" });
    undo.hold(item);
  };

  const undoRemove = async () => {
    const item = undo.take();
    if (!db || !user || !item) return;
    const firestore = db;
    const restore = await restoreShoppingItem(firestore, user.uid, item);
    if (restore.status === "already-present") {
      notify("That item is already back on your list.");
      return;
    }
    inBackground("Undo delete item error", "Unable to restore that item right now. Please try again.", () =>
      restore.written,
    );
    // The delete was pushed to the list owner, so the undo has to be too —
    // otherwise the item comes back here and stays gone for everyone else.
    void propagateToSharedOwner(item, { type: "add" });
  };

  const saveDetails = async (
    id: string,
    text: string,
    quantity: string,
    category: string,
    note: string,
  ) => {
    const trimmed = text.trim();
    if (!trimmed) {
      fail("Item text cannot be empty.");
      return false;
    }
    if (trimmed.length > MAX_ITEM_TEXT_LENGTH) {
      fail(`Keep items to ${MAX_ITEM_TEXT_LENGTH} characters or fewer.`);
      return false;
    }
    if (!db) return false;
    const firestore = db;
    const changes = {
      text: trimmed,
      quantity: quantity.trim().slice(0, MAX_QUANTITY_LENGTH) || undefined,
      category: category.trim().slice(0, MAX_CATEGORY_LENGTH) || undefined,
      note: note.trim().slice(0, MAX_NOTE_LENGTH) || undefined,
    };

    inBackground("Update item details error", "Unable to save your edit right now. Please try again.", () =>
      updateShoppingItem(firestore, id, changes),
    );
    const original = items.find((item) => item.id === id);
    if (original) {
      void propagateToSharedOwner(original, {
        type: "edit",
        edited: { ...original, ...changes },
      });
    }
    return true;
  };

  const clearCompleted = () => {
    const done = listItems.filter((item) => item.completed);
    if (!db || done.length === 0) return;
    const firestore = db;
    inBackground("Clear completed error", "Unable to clear completed items right now. Please try again.", () =>
      deleteShoppingItems(firestore, done.map((item) => item.id)),
    );
    // Clearing an imported list must mean the same thing to everyone using
    // it, not just remove this device's copies.
    done.forEach((item) => void propagateToSharedOwner(item, { type: "remove" }));
  };

  const createList = (name: string) => {
    const result = lists.createList(name);
    if ("error" in result) fail(result.error);
    else notify(`Created “${result.list.name}”.`);
  };

  const renameList = (name: string) => {
    const result = lists.renameActive(name);
    if ("error" in result) {
      fail(result.error);
      return;
    }
    if (!db) return;
    const firestore = db;
    const renamed = items.filter((item) => getItemListId(item) === result.listId);
    inBackground("Rename list items error", "Couldn't rename every item. Please try again.", () =>
      updateShoppingItems(
        firestore,
        renamed.map((item) => ({ id: item.id, update: { listName: result.name } })),
      ),
    );
  };

  const deleteList = () => {
    if (!isOwnedCustomListId(activeListId)) return;
    const firestore = db;
    if (firestore && listItems.length > 0) {
      inBackground("Delete custom list error", "Unable to delete that list right now. Please try again.", () =>
        deleteShoppingItems(firestore, listItems.map((item) => item.id)),
      );
    }
    lists.removeActive();
    notify("List deleted.");
  };

  /** Drop an imported shared list (this account's copy only). */
  const removeSharedList = () => {
    if (!db || activeListId === PERSONAL_LIST_ID) return;
    const firestore = db;
    inBackground("Remove shared list error", "Unable to remove that shared list right now. Please try again.", () =>
      deleteShoppingItems(firestore, listItems.map((item) => item.id)),
    );
    lists.setActiveListId(PERSONAL_LIST_ID);
  };

  /**
   * Apply a reorder locally at once, then persist the rows in its write scope
   * (the whole list for drags, one aisle for keyboard moves within it).
   */
  const saveOrder = ({ orders, scopeItems, changed }: ReorderCommit<ShoppingItem>) => {
    const orderById = new Map(orders.map((entry) => [entry.id, entry.sortOrder]));
    setItems((current) =>
      current.map((item) => {
        const sortOrder = orderById.get(item.id);
        return sortOrder === undefined ? item : { ...item, sortOrder };
      }),
    );
    if (!changed || !db) return;
    const firestore = db;
    const updates = scopeItems.flatMap((item) => {
      const sortOrder = orderById.get(item.id);
      return sortOrder === undefined ? [] : [{ id: item.id, update: { sortOrder } }];
    });
    inBackground("Reorder items error", "Couldn't save the new order. Try again.", () =>
      updateShoppingItems(firestore, updates),
    );
  };

  return {
    add,
    toggle,
    toggleImportant,
    remove,
    undoRemove,
    pendingRemoval: undo.pending,
    saveDetails,
    clearCompleted,
    createList,
    renameList,
    deleteList,
    removeSharedList,
    saveOrder,
  };
}
