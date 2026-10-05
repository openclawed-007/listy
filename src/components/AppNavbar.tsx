import React from "react";
import { usePreferences } from "../context/usePreferences";
import BrandMark from "./BrandMark";

/** Sticky app header: wordmark on the left, the screen's actions on the right. */
const AppNavbar: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { interfacePrefs } = usePreferences();

  return (
    <header className="navbar">
      <div className="navbar-content">
        <div className={`nav-brand ${interfacePrefs.brandLogo ? "" : "is-text-only"}`}>
          {interfacePrefs.brandLogo && (
            <div className="nav-brand-icon">
              <BrandMark className="brand-mark" />
            </div>
          )}
          <span className="nav-brand-name">
            Cart<em>Link</em>
          </span>
        </div>
        <div className="user-actions">{children}</div>
      </div>
    </header>
  );
};

export default AppNavbar;
