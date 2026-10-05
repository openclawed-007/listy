import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firestore";
import { saveUserSettings, subscribeToUserSettings } from "../services/userSettings";
import {
  addCustomList,
  buildListTabs,
  canAddCustomList,
  ensureListInRegistry,
  isOwnedCustomListId,
  normalizeUserLists,
  PERSONAL_TAB_ID,
  PERSONAL_TAB_NAME,
  readLocalUserLists,
  removeCustomList,
  renameCustomList,
  resolveRemoteLists,
  writeLocalUserLists,
  type UserList,
} from "../lib/userLists";

export function useOwnedLists(
  userId: string | undefined,
  items: Array<{ listId?: string; listName?: string }>,
) {
  const [customLists, setCustomLists] = useState<UserList[]>(() =>
    readLocalUserLists(userId),
  );
  const [activeListId, setActiveListId] = useState(PERSONAL_TAB_ID);
  const writeInFlight = useRef(false);

  const tabs = useMemo(
    () => buildListTabs(customLists, items),
    [customLists, items],
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeListId)) {
      setActiveListId(PERSONAL_TAB_ID);
    }
  }, [activeListId, tabs]);

  const persist = useCallback(
    async (next: UserList[]) => {
      const normalized = normalizeUserLists(next);
      setCustomLists(normalized);
      writeLocalUserLists(normalized, userId);
      if (!userId || !db) return;
      writeInFlight.current = true;
      try {
        await saveUserSettings(db, userId, { lists: normalized });
      } catch (error) {
        console.error("Save custom lists error:", error);
      } finally {
        writeInFlight.current = false;
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!userId || !db) {
      setCustomLists(readLocalUserLists(userId));
      return undefined;
    }

    const firestore = db;
    return subscribeToUserSettings(
      firestore,
      userId,
      (data) => {
        if (writeInFlight.current) return;
        const resolved = resolveRemoteLists(
          {
            exists: data !== null,
            data: data ?? undefined,
          },
          userId,
        );
        setCustomLists(resolved.lists);
        writeLocalUserLists(resolved.lists, userId);
        if (resolved.uploadLocal) {
          writeInFlight.current = true;
          void saveUserSettings(firestore, userId, {
            lists: resolved.lists,
          }).finally(() => {
            writeInFlight.current = false;
          });
        }
      },
      (error) => {
        console.error("Load custom lists error:", error);
      },
    );
  }, [userId]);

  const activeTabName =
    tabs.find((tab) => tab.id === activeListId)?.name ?? PERSONAL_TAB_NAME;

  // These update local state at once and save in the background: the save
  // only resolves once the server has it, which never happens offline.
  const createList = useCallback(
    (name: string) => {
      const result = addCustomList(customLists, name);
      if ("error" in result) return result;
      void persist(result.lists);
      setActiveListId(result.list.id);
      return result;
    },
    [customLists, persist],
  );

  const renameActive = useCallback(
    (name: string): { error: string } | { name: string; listId: string } => {
      if (!isOwnedCustomListId(activeListId)) {
        return { error: "That list was not found." };
      }
      const base = ensureListInRegistry(
        customLists,
        activeListId,
        activeTabName,
      );
      const result = renameCustomList(base, activeListId, name);
      if ("error" in result) return result;
      const nextName =
        result.lists.find((list) => list.id === activeListId)?.name ?? name;
      void persist(result.lists);
      return { name: nextName, listId: activeListId };
    },
    [activeListId, activeTabName, customLists, persist],
  );

  const removeActive = useCallback(() => {
    if (!isOwnedCustomListId(activeListId)) return undefined;
    const listId = activeListId;
    void persist(removeCustomList(customLists, listId));
    setActiveListId(PERSONAL_TAB_ID);
    return listId;
  }, [activeListId, customLists, persist]);

  return {
    customLists,
    tabs,
    activeListId,
    setActiveListId,
    activeTabName,
    canCreate: canAddCustomList(customLists),
    createList,
    renameActive,
    removeActive,
  };
}
