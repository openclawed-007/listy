import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Open dialogs, innermost last. Only the top one answers Escape. */
const openDialogs: object[] = [];
let lockedOverflow: string | null = null;

/**
 * Modal behaviour in one place: focus moves in and is trapped, Escape closes
 * only the top-most dialog (a confirm stacked on Share closes on its own),
 * the page behind stops scrolling, and focus returns to the opener on close.
 */
export function useDialogFocus<T extends HTMLElement>(onClose?: () => void) {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const token = {};
    openDialogs.push(token);
    if (lockedOverflow === null) {
      lockedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute("disabled"),
      );

    focusable()[0]?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || openDialogs.at(-1) !== token) return;
      if (!onCloseRef.current) return;
      event.preventDefault();
      onCloseRef.current();
    };

    dialog.addEventListener("keydown", trapFocus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      dialog.removeEventListener("keydown", trapFocus);
      document.removeEventListener("keydown", closeOnEscape);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (openDialogs.length === 0 && lockedOverflow !== null) {
        document.body.style.overflow = lockedOverflow;
        lockedOverflow = null;
      }
      opener?.focus();
    };
  }, []);

  return dialogRef;
}
