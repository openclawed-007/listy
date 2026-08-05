// Lightweight FLIP animation for list reorders.
// First → Last → Invert → Play. Short, quiet motion; skips if reduced-motion.

const DEFAULT_MS = 200;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export function captureItemRects(
  root: ParentNode = document,
): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  if (typeof document === "undefined") return map;

  root.querySelectorAll<HTMLElement>("[data-item-id]").forEach((node) => {
    const id = node.dataset.itemId;
    if (!id) return;
    map.set(id, node.getBoundingClientRect());
  });
  return map;
}

/**
 * After the DOM has reordered, invert each row back to its old position and
 * ease it into place. Call right after React commits (useLayoutEffect).
 */
export function playItemFlip(
  first: Map<string, DOMRect> | null | undefined,
  options?: { durationMs?: number; root?: ParentNode },
) {
  if (!first || first.size === 0) return;
  if (typeof document === "undefined") return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const root = options?.root ?? document;
  const duration = options?.durationMs ?? DEFAULT_MS;
  const nodes = root.querySelectorAll<HTMLElement>("[data-item-id]");

  nodes.forEach((node) => {
    const id = node.dataset.itemId;
    if (!id) return;
    const prev = first.get(id);
    if (!prev) return;

    const next = node.getBoundingClientRect();
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    node.style.transition = "none";
    node.style.transform = `translate(${dx}px, ${dy}px)`;
    // Force layout so the invert sticks before we play.
    void node.offsetWidth;
    node.style.transition = `transform ${duration}ms ${EASING}`;
    node.style.transform = "";

    const cleanup = () => {
      node.style.transition = "";
      node.style.transform = "";
      node.removeEventListener("transitionend", cleanup);
    };
    node.addEventListener("transitionend", cleanup);
    window.setTimeout(cleanup, duration + 80);
  });
}
