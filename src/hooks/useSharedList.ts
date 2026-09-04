import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { allocateShareCode } from "../lib/allocateShareCode";
import { buildShareCodeUrl, isValidShareCode } from "../lib/shareCode";
import {
  hasAnyPermission,
  NO_PERMISSIONS,
  normalizeSharePermissions,
  type SharePermissions,
} from "../lib/sharePermissions";
import type { SharedItemData } from "../lib/publicSharedListModel";
import {
  loadRawSharedList,
  publishSharedList,
  revokeSharedList,
  updateSharedListAnonymousEdits,
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
  const [allowAnonymousEdits, setAllowAnonymousEdits] = useState(false);
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
        setAllowAnonymousEdits(shared.allowAnonymousEdits === true);
        const storedCode =
          typeof shared.shareCode === "string" ? shared.shareCode : "";
        let code = storedCode && isValidShareCode(storedCode) ? storedCode : "";
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
        allowAnonymousEdits,
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
  }, [
    allowAnonymousEdits,
    firestore,
    items,
    onError,
    ownerName,
    permissions,
    shareBusy,
    shareCode,
    user,
  ]);

  const togglePermission = useCallback(async (
    key: keyof SharePermissions,
    nextValue: boolean,
  ) => {
    const previous = permissions;
    const next = { ...permissions, [key]: nextValue };
    setPermissions(next);

    // If no permission is granted at all, anonymous editing is meaningless, so
    // turn it off too and keep the stored flags consistent.
    const previousAnon = allowAnonymousEdits;
    const nextAnon = hasAnyPermission(next) ? allowAnonymousEdits : false;
    setAllowAnonymousEdits(nextAnon);

    if (!firestore || !user || !isSharing) return;
    try {
      onError("");
      await updateSharedListPermissions(firestore, user.uid, next, nextAnon);
    } catch (error) {
      console.error("Toggle permission error:", error);
      setPermissions(previous);
      setAllowAnonymousEdits(previousAnon);
      onError("Unable to update sharing permissions right now. Please try again.");
    }
  }, [allowAnonymousEdits, firestore, isSharing, onError, permissions, user]);

  const toggleAnonymousEdits = useCallback(async (nextValue: boolean) => {
    // Never enable without a granted permission (the UI disables the control,
    // this guards programmatic callers and stale state).
    const next = nextValue && hasAnyPermission(permissions);
    const previous = allowAnonymousEdits;
    setAllowAnonymousEdits(next);
    if (!firestore || !user || !isSharing) return;
    try {
      onError("");
      await updateSharedListAnonymousEdits(firestore, user.uid, next);
    } catch (error) {
      console.error("Toggle anonymous edits error:", error);
      setAllowAnonymousEdits(previous);
      onError("Unable to update sharing permissions right now. Please try again.");
    }
  }, [allowAnonymousEdits, firestore, isSharing, onError, permissions, user]);

  const stopSharing = useCallback(async () => {
    if (!firestore || !user || shareBusy) return;
    setShareBusy(true);
    setShareStatus("");
    onError("");
    try {
      await revokeSharedList(firestore, user.uid, shareCode || undefined);
      setIsSharing(false);
      setPermissions(NO_PERMISSIONS);
      setAllowAnonymousEdits(false);
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
    allowAnonymousEdits,
    shareCode,
    shareUrl,
    shareStatus,
    shareBusy,
    setShareStatus,
    setShareCode,
    startSharing,
    togglePermission,
    toggleAnonymousEdits,
    stopSharing,
  };
}
