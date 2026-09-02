import { useEffect, type RefObject } from "react";

const MENU_ITEMS = '[role="menuitem"]:not([disabled])';

/**
 * Arrow-key navigation for a `role="menu"` popover. Moves focus into the
 * first item when the menu opens and lets Up/Down/Home/End walk the items,
 * which is what assistive tech expects once something is labelled a menu.
 */
export function useMenuKeyboard(
  menuRef: RefObject<HTMLElement | null>,
  open: boolean,
) {
  useEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    if (!menu) return undefined;

    const items = () =>
      Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEMS));

    // Let the pop-in render before grabbing focus.
    const frame = window.requestAnimationFrame(() => items()[0]?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      const list = items();
      if (list.length === 0) return;
      const index = list.indexOf(document.activeElement as HTMLElement);

      let next: number | null = null;
      if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % list.length;
      else if (event.key === "ArrowUp")
        next = index < 0 ? list.length - 1 : (index - 1 + list.length) % list.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = list.length - 1;

      if (next === null) return;
      event.preventDefault();
      list[next]?.focus();
    };

    menu.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      menu.removeEventListener("keydown", onKeyDown);
    };
  }, [menuRef, open]);
}
