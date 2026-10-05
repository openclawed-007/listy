import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { db } from "../firestore";
import { normalizeSharedListSnapshot } from "../lib/shoppingItem";
import { loadRawSharedList } from "../services/sharedLists";
import { replaceImportedList } from "../services/shoppingItems";

interface Options {
  /** Owner id from an /import/:shareId link, if this visit came from one. */
  shareId: string | undefined;
  user: User | null;
  onImported: (listId: string, ownerName: string) => void;
  onError: (message: string) => void;
}

/**
 * /import/:shareId copies someone else's shared list into a tab of the
 * signed-in user's own account, then returns to the list. Returns true while
 * the copy is in flight.
 */
export function useSharedListImport({
  shareId,
  user,
  onImported,
  onError,
}: Options) {
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const handledRef = useRef<string | null>(null);
  // Callbacks change every render; the import must run once per link.
  const callbacksRef = useRef({ onImported, onError });
  useEffect(() => {
    callbacksRef.current = { onImported, onError };
  });

  useEffect(() => {
    if (!shareId || !user || !db || handledRef.current === shareId) return;
    handledRef.current = shareId;
    const firestore = db;
    const fail = (message: string) => {
      callbacksRef.current.onError(message);
      navigate("/", { replace: true });
    };

    setImporting(true);
    void (async () => {
      try {
        const raw = await loadRawSharedList(firestore, shareId);
        if (!raw) return fail("That shared list is no longer available.");

        const shared = normalizeSharedListSnapshot(raw);
        if (!shared) return fail("That shared list is not valid anymore.");
        if (shared.ownerId === user.uid) return fail("This is your own share code.");

        const listId = await replaceImportedList(firestore, user.uid, shared);
        callbacksRef.current.onImported(listId, shared.ownerName);
        navigate("/", { replace: true });
      } catch (error) {
        console.error("Import shared list error:", error);
        fail("Unable to import that shared list right now. Please try again.");
      } finally {
        setImporting(false);
      }
    })();
  }, [navigate, shareId, user]);

  return importing;
}
