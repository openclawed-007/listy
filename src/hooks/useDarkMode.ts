import React from "react";

const THEME_KEY = "theme";

function readStoredTheme(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
}

/**
 * Tokens live under `html.dark` so the head script in index.html can paint
 * the right palette before <body> exists. Mirror onto body too for any
 * leftover `body.dark` selectors.
 */
function applyThemeClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.body?.classList.toggle("dark", dark);
}

/**
 * Apply the remembered theme immediately, before React renders, so dark-mode
 * users never flash white — including on share / sign-in / legal / 404.
 */
export function applyStoredTheme() {
  applyThemeClass(readStoredTheme());
}

/** Dark mode preference, mirrored onto the document and remembered. */
export function useDarkMode() {
  const [dark, setDark] = React.useState<boolean>(readStoredTheme);

  React.useEffect(() => {
    applyThemeClass(dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // Some browser privacy modes can block localStorage.
    }
  }, [dark]);

  return { dark, toggle: () => setDark((value) => !value) };
}
