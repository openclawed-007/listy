import React from "react";

const THEME_KEY = "theme";
const THEME_TRANSITION_MS = 400;

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Saved choice wins; otherwise follow the device setting. */
function readStoredTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return systemPrefersDark();
  } catch {
    return systemPrefersDark();
  }
}

function hasStoredTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "dark" || stored === "light";
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
  // Only an explicit toggle pins the theme; until then we track the device.
  const pinnedRef = React.useRef(hasStoredTheme());

  React.useEffect(() => {
    if (isFirstPaint.current) {
      // Initial mount: already painted by applyStoredTheme() — no animation.
      isFirstPaint.current = false;
      applyThemeClass(dark);
    } else {
      applyThemeClassSmooth(dark);
    }

    if (!pinnedRef.current) return;
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // Some browser privacy modes can block localStorage.
    }
  }, [dark]);

  // Follow the OS setting live while the user hasn't chosen for themselves.
  React.useEffect(() => {
    if (pinnedRef.current) return undefined;
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return undefined;
    }
    const onChange = (event: MediaQueryListEvent) => {
      if (!pinnedRef.current) setDark(event.matches);
    };
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  const toggle = () => {
    pinnedRef.current = true;
    setDark((value) => !value);
  };

  return { dark, toggle };
}
