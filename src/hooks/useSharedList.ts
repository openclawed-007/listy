import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { allocateShareCode } from "../lib/allocateShareCode";
import { buildShareCodeUrl, isValidShareCode } from "../lib/shareCode";
import {
  NO_PERMISSIONS,
  normalizeSharePermissions,
  type SharePermissions,
} from "../lib/sharePermissions";
import type { SharedItemData } from "../lib/publicSharedListModel";
import {
  loadRawSharedList,
  publishSharedList,
  revokeSharedList,
  updateSharedListPermissions,
} from "../services/sharedLists";

interface Options {
  firestore: Firestore | null;
  user: User | null;
  ownerName: string;
  items: SharedItemData[];
  onError: (message: string) => void;
  onStopped?: () => void;
}

export function useSharedList({
  firestore,
  user,
  ownerName,
  items,
  onError,
  onStopped,
}: Options) {
  const [isSharing, setIsSharing] = useState(false);
  const [permissions, setPermissions] = useState<SharePermissions>(NO_PERMISSIONS);
  const [shareCode, setShareCode] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    if (!firestore || !user) return undefined;
    let cancelled = false;
    void loadRawSharedList(firestore, user.uid)
      .then(async (shared) => {
        if (!shared || cancelled) return;
        setIsSharing(true);
        setPermissions(normalizeSharePermissions(shared.permissions));
        let code = shared.shareCode && isValidShareCode(shared.shareCode)
          ? shared.shareCode
          : "";
        if (!code) code = await allocateShareCode(firestore, user.uid);
        if (cancelled) return;
        setShareCode(code);
        setShareUrl(buildShareCodeUrl(window.location.origin, code));
      })
      .catch((error) => {
        if (!cancelled) console.error("Load share state error:", error);
      });
    return () => { cancelled = true; };
  }, [firestore, user]);

  const startSharing = useCallback(async () => {
    if (!firestore || !user || shareBusy) return;
    setShareBusy(true);
    setShareStatus("Creating share code…");
    onError("");
    try {
      const code = shareCode || await allocateShareCode(firestore, user.uid);
      await publishSharedList(firestore, {
        ownerId: user.uid,
        ownerName,
        permissions,
        items,
        shareCode: code,
      });
      setShareCode(code);
      setShareUrl(buildShareCodeUrl(window.location.origin, code));
      setIsSharing(true);
      setShareStatus("");
    } catch (error) {
      console.error("Share snapshot error:", error);
      setShareStatus("");
      onError("Unable to start sharing right now. Please try again.");
    } finally {
      setShareBusy(false);
    }
  }, [firestore, items, onError, ownerName, permissions, shareBusy, shareCode, user]);

  const togglePermission = useCallback(async (
    key: keyof SharePermissions,
    nextValue: boolean,
  ) => {
    const previous = permissions;
    const next = { ...permissions, [key]: nextValue };
    setPermissions(next);
    if (!firestore || !user || !isSharing) return;
    try {
      onError("");
      await updateSharedListPermissions(firestore, user.uid, next);
    } catch (error) {
      console.error("Toggle permission error:", error);
      setPermissions(previous);
      onError("Unable to update sharing permissions right now. Please try again.");
    }
  }, [firestore, isSharing, onError, permissions, user]);

  const stopSharing = useCallback(async () => {
    if (!firestore || !user || shareBusy) return;
    setShareBusy(true);
    setShareStatus("");
    onError("");
    try {
      await revokeSharedList(firestore, user.uid, shareCode || undefined);
      setIsSharing(false);
      setPermissions(NO_PERMISSIONS);
      setShareUrl("");
      setShareCode("");
      onStopped?.();
    } catch (error) {
      console.error("Stop sharing error:", error);
      onError("Unable to stop sharing right now. Please try again.");
    } finally {
      setShareBusy(false);
    }
  }, [firestore, onError, onStopped, shareBusy, shareCode, user]);

  return {
    isSharing,
    permissions,
    shareCode,
    shareUrl,
    shareStatus,
    shareBusy,
    setShareStatus,
    setShareCode,
    startSharing,
    togglePermission,
    stopSharing,
  };
}
