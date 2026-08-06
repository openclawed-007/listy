import React, { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LogIn,
  MoreHorizontal,
  Moon,
  Settings,
  Sun,
} from "lucide-react";

interface NavOverflowMenuProps {
  dark: boolean;
  onToggleDark: () => void;
  showSettings?: boolean;
  settingsActive?: boolean;
  onOpenSettings?: () => void;
  signInTo?: string;
}

/**
 * Compact overflow for guest / signed-out chrome. Same idea as the account
 * menu: one control instead of a row of icon buttons.
 */
const NavOverflowMenu: React.FC<NavOverflowMenuProps> = ({
  dark,
  onToggleDark,
  showSettings = false,
  settingsActive = false,
  onOpenSettings,
  signInTo = "/login",
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const node = rootRef.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="nav-account" ref={rootRef}>
      <button
        type="button"
        className={`nav-overflow-trigger ${open ? "is-open" : ""} ${settingsActive ? "has-dot" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="More"
        aria-label="More options"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} strokeWidth={2.25} />
        {settingsActive && (
          <span className="nav-account-dot" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          id={menuId}
          className="nav-account-menu"
          role="menu"
          aria-label="More options"
        >
          {showSettings && onOpenSettings && (
            <button
              type="button"
              role="menuitem"
              className="nav-account-item"
              onClick={() => run(onOpenSettings)}
            >
              <Settings size={16} strokeWidth={2.25} />
              <span>Settings</span>
              {settingsActive && (
                <span className="nav-account-item-meta">Reminders on</span>
              )}
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className="nav-account-item"
            onClick={() => run(onToggleDark)}
          >
            {dark ? (
              <Sun size={16} strokeWidth={2.25} />
            ) : (
              <Moon size={16} strokeWidth={2.25} />
            )}
            <span>{dark ? "Light mode" : "Dark mode"}</span>
          </button>

          <div className="nav-account-sep" role="separator" />

          <Link
            role="menuitem"
            className="nav-account-item"
            to={signInTo}
            onClick={() => setOpen(false)}
          >
            <LogIn size={16} strokeWidth={2.25} />
            <span>Sign in</span>
          </Link>
        </div>
      )}
    </div>
  );
};

export default NavOverflowMenu;
