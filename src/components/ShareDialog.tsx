import React from "react";
import {
  Check,
  Copy,
  Link2,
  Plus,
  QrCode,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import {
  hasAnyPermission,
  type SharePermissions,
} from "../lib/sharePermissions";
import { formatShareCode } from "../lib/shareCode";

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

/** Organised share sheet: code first, QR secondary, permissions last. */
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
  const [showQr, setShowQr] = React.useState(false);
  const canSystemShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const displayCode = shareCode ? formatShareCode(shareCode) : "";
  const canEdit = hasAnyPermission(permissions);

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
            <h2 id="share-title">Share list</h2>
            {isSharing ? (
              <p className="share-live-line" role="status">
                <span className="share-live-dot" aria-hidden="true" />
                {shareStatus || "Live — updates automatically"}
              </p>
            ) : (
              <p>Get a code and QR so others can open this list.</p>
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
          {isSharing ? (
            <>
              {/* 1. Code — primary way to share without standing next to them */}
              <section className="share-section" aria-labelledby="share-code-heading">
                <h3 id="share-code-heading" className="share-section-title">
                  Share code
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

              {/* 2. Send / link / QR — secondary join methods */}
              <section className="share-section" aria-label="Other ways to join">
                <div className="share-send-row">
                  {canSystemShare && (
                    <button
                      className="primary-btn share-send-primary"
                      type="button"
                      onClick={onSystemShare}
                      disabled={!shareUrl && !shareCode}
                    >
                      <Share2 size={16} strokeWidth={2.25} />
                      Send
                    </button>
                  )}
                  <button
                    className="secondary-btn share-send-secondary"
                    type="button"
                    onClick={onCopyLink}
                    disabled={!shareUrl}
                  >
                    <Link2 size={15} strokeWidth={2.25} />
                    Copy link
                  </button>
                  <button
                    className={`secondary-btn share-send-secondary ${showQr ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setShowQr((open) => !open)}
                    aria-expanded={showQr}
                    aria-controls="share-qr-panel"
                  >
                    <QrCode size={15} strokeWidth={2.25} />
                    QR
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

              {/* 3. Permissions — compact, no long essay */}
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
              <div className="share-empty">
                <Share2 size={32} strokeWidth={1.5} />
                <p>Sharing is off</p>
                <p className="share-empty-text">
                  You’ll get a short code plus optional QR and link. Starts
                  view-only.
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
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default ShareDialog;
