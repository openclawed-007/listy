import React, { useEffect, useId, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  Check,
  Download,
  LogOut,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useMenuKeyboard } from "../hooks/useMenuKeyboard";
import UserAvatar from "./UserAvatar";

interface NavAccountMenuProps {
  user: User | null;
  dark: boolean;
  onToggleDark: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  canInstall?: boolean;
  onInstall?: () => void;
  /** Show a quiet marker that reminders are on. */
  settingsActive?: boolean;
}

/**
 * One control for secondary nav actions. Keeps the top bar to brand + Share +
 * this menu — the standard pattern for dense app chrome without a hamburger.
 */
const NavAccountMenu: React.FC<NavAccountMenuProps> = ({
  user,
  dark,
  onToggleDark,
  onOpenSettings,
  onLogout,
  canInstall = false,
  onInstall,
  settingsActive = false,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  useMenuKeyboard(menuRef, open);
  const displayName =
    user?.displayName?.trim() || user?.email?.split("@")[0] || "Account";
  const email = user?.email?.trim() || "";

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
        // Items unmount with the menu; hand focus back to the trigger.
        rootRef.current?.querySelector("button")?.focus();
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
        className={`nav-account-trigger ${open ? "is-open" : ""} ${settingsActive ? "has-dot" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={displayName}
        aria-label={`Account menu for ${displayName}`}
        onClick={() => setOpen((current) => !current)}
      >
        <UserAvatar user={user} />
        <span className="nav-account-name">{displayName.split(" ")[0]}</span>
        {settingsActive && (
          <span className="nav-account-dot" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className="nav-account-menu"
          role="menu"
          aria-label="Account"
        >
          <div className="nav-account-header">
            <UserAvatar user={user} />
            <div className="nav-account-header-text">
              <strong>{displayName}</strong>
              {email && <span>{email}</span>}
            </div>
          </div>

          <div className="nav-account-sep" role="separator" />

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
            <span className="nav-account-item-meta" aria-hidden="true">
              {dark ? <Check size={14} /> : null}
            </span>
          </button>

          {canInstall && onInstall && (
            <button
              type="button"
              role="menuitem"
              className="nav-account-item"
              onClick={() => run(onInstall)}
            >
              <Download size={16} strokeWidth={2.25} />
              <span>Install app</span>
            </button>
          )}

          <div className="nav-account-sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="nav-account-item is-danger"
            onClick={() => run(onLogout)}
          >
            <LogOut size={16} strokeWidth={2.25} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default NavAccountMenu;
