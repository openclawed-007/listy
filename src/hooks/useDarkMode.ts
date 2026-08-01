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
 * Apply the remembered theme to <body> immediately, before React renders.
 * Without this the app always paints light first, so dark-mode users get a
 * white flash on every load — and every page that isn't the list screen
 * (share links, sign-in, legal, 404) stayed light forever.
 */
export function applyStoredTheme() {
  document.body.classList.toggle("dark", readStoredTheme());
}

/** Dark mode preference, mirrored onto <body> and remembered between visits. */
export function useDarkMode() {
  const [dark, setDark] = React.useState<boolean>(readStoredTheme);

  React.useEffect(() => {
    document.body.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // Some browser privacy modes can block localStorage.
    }
  }, [dark]);

  return { dark, toggle: () => setDark((value) => !value) };
}
