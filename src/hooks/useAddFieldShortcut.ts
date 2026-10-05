import { useEffect, type RefObject } from "react";

/** "/" or "n" jumps to the add/search field from anywhere on the list. */
export function useAddFieldShortcut(inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "/" && event.key !== "n") return;
      // Dialogs own the keyboard while open.
      if (document.querySelector('[aria-modal="true"]')) return;

      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      event.preventDefault();
      inputRef.current?.focus();
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [inputRef]);
}
