import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
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
  const [customLists, setCustomLists] = useState<UserList[]>(readLocalUserLists);
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
      writeLocalUserLists(normalized);
      if (!userId || !db) return;
      writeInFlight.current = true;
      try {
        await setDoc(
          doc(db, "userSettings", userId),
          { lists: normalized, updatedAt: serverTimestamp() },
          { merge: true },
        );
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
      setCustomLists(readLocalUserLists());
      return undefined;
    }

    const firestore = db;
    return onSnapshot(
      doc(firestore, "userSettings", userId),
      (snap) => {
        if (writeInFlight.current) return;
        const resolved = resolveRemoteLists({
          exists: snap.exists(),
          data: snap.exists() ? snap.data() : undefined,
        });
        setCustomLists(resolved.lists);
        writeLocalUserLists(resolved.lists);
        if (resolved.uploadLocal) {
          writeInFlight.current = true;
          void setDoc(
            doc(firestore, "userSettings", userId),
            { lists: resolved.lists, updatedAt: serverTimestamp() },
            { merge: true },
          ).finally(() => {
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

  const createList = useCallback(
    async (name: string) => {
      const result = addCustomList(customLists, name);
      if ("error" in result) return result;
      await persist(result.lists);
      setActiveListId(result.list.id);
      return result;
    },
    [customLists, persist],
  );

  const renameActive = useCallback(
    async (name: string) => {
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
      const nextName = result.lists.find(
        (list) => list.id === activeListId,
      )?.name;
      await persist(result.lists);
      return { name: nextName, listId: activeListId };
    },
    [activeListId, activeTabName, customLists, persist],
  );

  const removeActive = useCallback(async () => {
    if (!isOwnedCustomListId(activeListId)) return undefined;
    const listId = activeListId;
    await persist(removeCustomList(customLists, listId));
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
