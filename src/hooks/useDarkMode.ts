import React from "react";

const THEME_KEY = "theme";
const THEME_TRANSITION_MS = 400;

function readStoredTheme(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Tokens live under `html.dark` so the head script in index.html can paint
 * the right palette before <body> exists. Mirror onto body too for any
 * leftover `body.dark` selectors.
 */
function applyThemeColor(dark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#141b1e" : "#6b8f71");
}

function applyThemeClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.body?.classList.toggle("dark", dark);
  applyThemeColor(dark);
}

/** Instant paint — used on first load / FOUC prevention. */
export function applyStoredTheme() {
  applyThemeClass(readStoredTheme());
}

/**
 * Cross-fade the palette instead of snapping. Prefer the View Transitions
 * API; fall back to a short global color transition.
 */
function applyThemeClassSmooth(dark: boolean) {
  const root = document.documentElement;
  const run = () => applyThemeClass(dark);

  if (prefersReducedMotion()) {
    run();
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (update: () => void) => { finished: Promise<void> };
  };

  if (typeof doc.startViewTransition === "function") {
    try {
      void doc.startViewTransition(run).finished.catch(() => {
        /* transition aborted (e.g. rapid toggles) — class already applied */
      });
      return;
    } catch {
      // Fall through to CSS fallback.
    }
  }

  root.classList.add("theme-animating");
  run();
  window.setTimeout(() => {
    root.classList.remove("theme-animating");
  }, THEME_TRANSITION_MS);
}

/** Dark mode preference, mirrored onto the document and remembered. */
export function useDarkMode() {
  const [dark, setDark] = React.useState<boolean>(readStoredTheme);
  const isFirstPaint = React.useRef(true);

  React.useEffect(() => {
    if (isFirstPaint.current) {
      // Initial mount: already painted by applyStoredTheme() — no animation.
      isFirstPaint.current = false;
      applyThemeClass(dark);
    } else {
      applyThemeClassSmooth(dark);
    }

    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // Some browser privacy modes can block localStorage.
    }
  }, [dark]);

  return { dark, toggle: () => setDark((value) => !value) };
}
