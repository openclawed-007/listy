import React from "react";
import { Moon, Sun } from "lucide-react";
import { useDarkMode } from "../hooks/useDarkMode";

interface ThemeToggleProps {
  className?: string;
}

/** Dark/light switch used on login-style pages and the shared-list nav. */
const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  const { dark, toggle } = useDarkMode();
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button type="button" className={className} onClick={toggle} aria-label={label} title={label}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};

export default ThemeToggle;
