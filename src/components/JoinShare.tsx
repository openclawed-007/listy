import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, KeyRound, Moon, Sun } from "lucide-react";
import { db } from "../firebase";
import { resolveShareCode } from "../lib/allocateShareCode";
import {
  SHARE_CODE_LENGTH,
  formatShareCode,
  isValidShareCode,
  normalizeShareCodeInput,
} from "../lib/shareCode";
import { useAuth } from "../context/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import BrandMark from "./BrandMark";

/**
 * Enter a share code (or land on /c/:code) and open the same public list
 * the QR code points at.
 */
const JoinShare: React.FC = () => {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [value, setValue] = useState(() =>
    routeCode ? formatShareCode(normalizeShareCodeInput(routeCode)) : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(Boolean(routeCode));
  useDocumentTitle("Join a list");

  const openList = async (rawInput: string) => {
    if (!db) {
      setError("CartLink is not configured on this device.");
      setBusy(false);
      return;
    }

    const raw = normalizeShareCodeInput(rawInput);
    if (!isValidShareCode(raw)) {
      setError(
        `Enter the full ${SHARE_CODE_LENGTH}-character code (for example AB3D-K7MP).`,
      );
      setBusy(false);
      return;
    }

    setBusy(true);
    setError("");

    try {
      const ownerId = await resolveShareCode(db, raw);
      if (!ownerId) {
        setError(
          "That code isn’t active. Ask them to open Share and check the code.",
        );
        setBusy(false);
        return;
      }
      navigate(`/c/${raw}`, { replace: true });
    } catch (resolveError) {
      console.error("Resolve share code error:", resolveError);
      setError("Couldn’t look up that code right now. Try again.");
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!routeCode) return;
    void openList(routeCode);
    // Resolve once for the path segment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCode]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void openList(value);
  };

  const rawPreview = normalizeShareCodeInput(value);
  const canSubmit = isValidShareCode(rawPreview) && !busy;

  return (
    <div className="login-container">
      <div className="login-card join-card">
        <button
          type="button"
          className="login-theme-toggle"
          onClick={toggle}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="login-logo" aria-hidden="true">
          <BrandMark className="brand-mark login-brand-mark" />
        </div>

        <p className="login-kicker">Join a list</p>
        <h1 className="login-title join-title">Enter code</h1>
        <p className="login-subtitle">
          Same as scanning their QR — type the code they shared with you.
        </p>

        {routeCode && busy && !error ? (
          <div className="join-resolving" role="status">
            <div className="loading-spinner" />
            <p>Opening list…</p>
          </div>
        ) : (
          <form className="join-form" onSubmit={handleSubmit}>
            <label className="join-label" htmlFor="share-code-input">
              Share code
            </label>
            <div className="join-input-row">
              <span className="join-input-icon" aria-hidden="true">
                <KeyRound size={18} strokeWidth={2.25} />
              </span>
              <input
                id="share-code-input"
                className="join-input"
                value={value}
                onChange={(event) => {
                  const next = normalizeShareCodeInput(event.target.value).slice(
                    0,
                    SHARE_CODE_LENGTH,
                  );
                  setValue(formatShareCode(next));
                  setError("");
                }}
                placeholder="AB3D-K7MP"
                name="cartlink-share-code"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "join-error" : "join-hint"}
                disabled={busy}
                autoFocus={!routeCode}
              />
            </div>
            <p id="join-hint" className="join-hint">
              Letters and numbers, 8 characters. Dashes are optional.
            </p>

            {error && (
              <p id="join-error" className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="login-button join-submit"
              disabled={!canSubmit}
              aria-busy={busy}
            >
              {busy ? "Opening…" : "Open list"}
              {!busy && <ArrowRight size={18} strokeWidth={2.25} />}
            </button>
          </form>
        )}

        <p className="login-legal join-footer">
          {user ? (
            <Link to="/">← Back to my list</Link>
          ) : (
            <>
              <Link to="/login">Back to sign in</Link>
              <span className="login-legal-sep" aria-hidden="true">
                ·
              </span>
              <Link to="/guest">Continue as guest</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default JoinShare;
