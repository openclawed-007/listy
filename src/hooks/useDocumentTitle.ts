import { useEffect } from "react";

/** The app-wide default set in index.html. */
const BASE_TITLE = "CartLink — shared shopping lists";

/**
 * Screen-specific tab title so open tabs, history and bookmarks are
 * distinguishable. Pass null to keep the current title (e.g. while loading).
 * Restores the app default when the screen unmounts.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return undefined;
    document.title = `${title} · CartLink`;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
