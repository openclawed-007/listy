import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Copy,
  KeyRound,
  Link2,
  Plus,
  QrCode,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { db } from "../firebase";
import { resolveShareCode } from "../lib/allocateShareCode";
import {
  SHARE_CODE_LENGTH,
  formatShareCode,
  isValidShareCode,
  normalizeShareCodeInput,
} from "../lib/shareCode";
import {
  hasAnyPermission,
  type SharePermissions,
} from "../lib/sharePermissions";

interface ShareDialogProps {
  isSharing: boolean;
  shareUrl: string;
  shareCode: string;
  shareStatus: string;
  busy: boolean;
  permissions: SharePermissions;
  onClose: () => void;
  onStartSharing: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onSystemShare: () => void;
  onTogglePermission: (key: keyof SharePermissions, next: boolean) => void;
  onRequestStopSharing: () => void;
}

const PERMISSION_OPTIONS: Array<{
  key: keyof SharePermissions;
  label: string;
  title: string;
  icon: React.ReactNode;
}> = [
  {
    key: "toggle",
    label: "Check off",
    title: "Let visitors check items off",
    icon: <Check size={15} strokeWidth={2.5} />,
  },
  {
    key: "add",
    label: "Add",
    title: "Let visitors add items",
    icon: <Plus size={15} strokeWidth={2.5} />,
  },
  {
    key: "remove",
    label: "Remove",
    title: "Let visitors remove items",
    icon: <Trash2 size={14} strokeWidth={2.5} />,
  },
];

/** Share your list, or open someone else's with a code — works while signed in. */
const ShareDialog: React.FC<ShareDialogProps> = ({
  isSharing,
  shareUrl,
  shareCode,
  shareStatus,
  busy,
  permissions,
  onClose,
  onStartSharing,
  onCopyLink,
  onCopyCode,
  onSystemShare,
  onTogglePermission,
  onRequestStopSharing,
}) => {
  const dialogRef = useDialogFocus<HTMLElement>();
  const navigate = useNavigate();
  const [showQr, setShowQr] = React.useState(false);
  const [joinValue, setJoinValue] = React.useState("");
  const [joinError, setJoinError] = React.useState("");
  const [joinBusy, setJoinBusy] = React.useState(false);

  const canSystemShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const displayCode = shareCode ? formatShareCode(shareCode) : "";
  const canEdit = hasAnyPermission(permissions);
  const joinRaw = normalizeShareCodeInput(joinValue);
  const canJoin = isValidShareCode(joinRaw) && !joinBusy;

  const openWithCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!db) {
      setJoinError("CartLink is not configured on this device.");
      return;
    }
    if (!isValidShareCode(joinRaw)) {
      setJoinError(`Enter the full ${SHARE_CODE_LENGTH}-character code.`);
      return;
    }

    setJoinBusy(true);
    setJoinError("");
    try {
      const ownerId = await resolveShareCode(db, joinRaw);
      if (!ownerId) {
        setJoinError("That code isn’t active. Ask them to check Share.");
        setJoinBusy(false);
        return;
      }
      onClose();
      navigate(`/share/${ownerId}`);
    } catch (error) {
      console.error("Join share code error:", error);
      setJoinError("Couldn’t look up that code right now. Try again.");
      setJoinBusy(false);
    }
  };

  const joinSection = (
    <section
      className="share-section share-join-section"
      aria-labelledby="share-join-heading"
    >
      <h3 id="share-join-heading" className="share-section-title">
        Open a list
      </h3>
      <form className="share-join-form" onSubmit={(e) => void openWithCode(e)}>
        <div className="share-join-row">
          <span className="share-join-icon" aria-hidden="true">
            <KeyRound size={17} strokeWidth={2.25} />
          </span>
          <input
            className="share-join-input"
            value={joinValue}
            onChange={(event) => {
              const next = normalizeShareCodeInput(event.target.value).slice(
                0,
                SHARE_CODE_LENGTH,
              );
              setJoinValue(formatShareCode(next));
              setJoinError("");
            }}
            placeholder="AB3D-K7MP"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            aria-label="Enter share code"
            aria-invalid={Boolean(joinError)}
            disabled={joinBusy}
          />
          <button
            type="submit"
            className="share-join-submit"
            disabled={!canJoin}
            aria-busy={joinBusy}
          >
            {joinBusy ? "…" : "Open"}
          </button>
        </div>
      </form>
      {joinError ? (
        <p className="share-join-error" role="alert">
          {joinError}
        </p>
      ) : (
        <p className="share-section-hint">
          Paste a code someone sent you — works while signed in.
        </p>
      )}
    </section>
  );

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="settings-modal share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header share-modal-header">
          <div>
            <h2 id="share-title">Share & join</h2>
            {isSharing ? (
              <p className="share-live-line" role="status">
                <span className="share-live-dot" aria-hidden="true" />
                {shareStatus || "Live — updates automatically"}
              </p>
            ) : (
              <p>Share your list, or open one with a code.</p>
            )}
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="share-panel">
          {/* Always available when signed in */}
          {joinSection}

          {isSharing ? (
            <>
              <section
                className="share-section"
                aria-labelledby="share-code-heading"
              >
                <h3 id="share-code-heading" className="share-section-title">
                  Your share code
                </h3>
                <button
                  type="button"
                  className="share-code-hero"
                  onClick={onCopyCode}
                  disabled={!shareCode}
                  aria-label={
                    displayCode
                      ? `Copy share code ${displayCode}`
                      : "Copy share code"
                  }
                >
                  <span className="share-code-hero-value">
                    {displayCode || "········"}
                  </span>
                  <span className="share-code-hero-action">
                    <Copy size={16} strokeWidth={2.25} />
                    Copy
                  </span>
                </button>
                <p className="share-section-hint">
                  They type this in CartLink → Enter code
                </p>
              </section>

              <section className="share-section" aria-label="Other ways to join">
                <div className="share-send-row">
                  {canSystemShare && (
                    <button
                      className="primary-btn share-send-primary"
                      type="button"
                      onClick={onSystemShare}
                      disabled={!shareUrl && !shareCode}
                    >
                      <Share2 size={18} strokeWidth={2.25} aria-hidden="true" />
                      <span>Send</span>
                    </button>
                  )}
                  <button
                    className="secondary-btn share-send-secondary"
                    type="button"
                    onClick={onCopyLink}
                    disabled={!shareUrl}
                  >
                    <Link2 size={17} strokeWidth={2.25} aria-hidden="true" />
                    <span>Link</span>
                  </button>
                  <button
                    className={`secondary-btn share-send-secondary ${showQr ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setShowQr((open) => !open)}
                    aria-expanded={showQr}
                    aria-controls="share-qr-panel"
                    aria-label={showQr ? "Hide QR code" : "Show QR code"}
                  >
                    <QrCode size={17} strokeWidth={2.25} aria-hidden="true" />
                    <span>QR</span>
                  </button>
                </div>

                {showQr && (
                  <div id="share-qr-panel" className="share-qr-panel">
                    <div className="qr-frame">
                      {shareUrl ? (
                        <QRCodeSVG value={shareUrl} size={148} marginSize={1} />
                      ) : (
                        <div className="qr-placeholder" />
                      )}
                    </div>
                    <p className="share-section-hint">Scan to open the list</p>
                  </div>
                )}
              </section>

              <section
                className="share-section share-section-perms"
                aria-labelledby="share-perms-heading"
              >
                <div className="share-section-head">
                  <h3 id="share-perms-heading" className="share-section-title">
                    Who can edit
                  </h3>
                  <span
                    className={`share-perms-state ${canEdit ? "is-edit" : ""}`}
                  >
                    {canEdit ? "Can edit" : "View only"}
                  </span>
                </div>
                <div
                  className="perm-chips"
                  role="group"
                  aria-label="Visitor permissions"
                >
                  {PERMISSION_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`perm-chip ${permissions[option.key] ? "is-on" : ""}`}
                      aria-pressed={permissions[option.key]}
                      title={option.title}
                      onClick={() =>
                        onTogglePermission(option.key, !permissions[option.key])
                      }
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="share-section-hint">
                  {canEdit
                    ? "Edits need Google sign-in. Anyone can still tick privately."
                    : "Anyone can tick items privately on their device."}
                </p>
              </section>

              <button
                className="text-action-btn danger share-stop"
                type="button"
                onClick={onRequestStopSharing}
                disabled={busy}
              >
                {busy ? "Stopping…" : "Stop sharing"}
              </button>
            </>
          ) : (
            <>
              <section
                className="share-section share-section-mine"
                aria-labelledby="share-mine-heading"
              >
                <h3 id="share-mine-heading" className="share-section-title">
                  Share your list
                </h3>
                <div className="share-empty share-empty-compact">
                  <Share2 size={28} strokeWidth={1.5} />
                  <p className="share-empty-text">
                    Create a code, link, and QR. Starts view-only.
                  </p>
                </div>
                {shareStatus && (
                  <p className="share-status" role="status">
                    {shareStatus}
                  </p>
                )}
                <button
                  className="primary-btn"
                  type="button"
                  onClick={onStartSharing}
                  disabled={busy}
                >
                  {busy ? "Starting…" : "Start sharing"}
                </button>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default ShareDialog;
