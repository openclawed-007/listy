import React from "react";

/** Dark mode preference, mirrored onto <body> and remembered between visits. */
export function useDarkMode() {
  const [dark, setDark] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    document.body.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Some browser privacy modes can block localStorage.
    }
  }, [dark]);

  return { dark, toggle: () => setDark((value) => !value) };
}
