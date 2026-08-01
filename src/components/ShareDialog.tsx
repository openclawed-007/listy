import React from "react";
import { Check, Copy, Plus, Share2, Trash2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  hasAnyPermission,
  type SharePermissions,
} from "../lib/sharePermissions";

interface ShareDialogProps {
  isSharing: boolean;
  shareUrl: string;
  shareStatus: string;
  busy: boolean;
  permissions: SharePermissions;
  onClose: () => void;
  onStartSharing: () => void;
  onCopyLink: () => void;
  onSystemShare: () => void;
  onTogglePermission: (key: keyof SharePermissions, next: boolean) => void;
  onRequestStopSharing: () => void;
}

/** Drop the scheme so the link reads as a place, not a URL. */
function toDisplayLink(url: string) {
  return url.replace(/^https?:\/\//, "");
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

/** Link + QR code sharing, and what visitors are allowed to do. */
const ShareDialog: React.FC<ShareDialogProps> = ({
  isSharing,
  shareUrl,
  shareStatus,
  busy,
  permissions,
  onClose,
  onStartSharing,
  onCopyLink,
  onSystemShare,
  onTogglePermission,
  onRequestStopSharing,
}) => {
  const canSystemShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="share-title">Share list</h2>
            <p>
              {isSharing
                ? "Anyone with the link or QR code can view your list."
                : "Publish your list to a public link or QR code."}
            </p>
          </div>
          <button
            className="modal-close"
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close share dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="share-panel">
          {isSharing ? (
            <>
              <div className="qr-frame">
                {shareUrl ? (
                  <QRCodeSVG value={shareUrl} size={184} marginSize={2} />
                ) : (
                  <div className="qr-placeholder" />
                )}
              </div>
              <p className="share-status" role="status">
                {shareStatus || "Live — changes publish automatically"}
              </p>
              {/* The link itself, not just a Copy button: scanning a QR code is
                no help when you are already on the phone, and a blocked
                clipboard used to leave no way to get the address at all. */}
              {shareUrl && (
                <a
                  className="share-link"
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={shareUrl}
                >
                  {toDisplayLink(shareUrl)}
                </a>
              )}
              <div className="share-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={onCopyLink}
                  disabled={!shareUrl}
                >
                  <Copy size={15} />
                  Copy link
                </button>
                {canSystemShare && (
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={onSystemShare}
                    disabled={!shareUrl}
                  >
                    <Share2 size={15} />
                    Share
                  </button>
                )}
              </div>
              <div className="share-perms">
                <div className="share-perms-head">
                  <span className="share-perms-title">Visitor permissions</span>
                  <span className="share-perms-state">
                    {hasAnyPermission(permissions) ? "Can edit" : "View only"}
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
                <p className="share-perms-note">
                  {hasAnyPermission(permissions)
                    ? "Visitors sign in with Google before they can change anything."
                    : "Turn one on to let visitors help with the list."}
                </p>
              </div>
              <button
                className="text-action-btn danger"
                type="button"
                onClick={onRequestStopSharing}
                disabled={busy}
              >
                {busy ? "Stopping..." : "Stop sharing"}
              </button>
            </>
          ) : (
            <>
              <div className="share-empty">
                <Share2 size={36} strokeWidth={1.5} />
                <p>Sharing is off.</p>
                <p className="share-empty-text">
                  Anyone with the link can view (not edit) your list.
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
                {busy ? "Starting..." : "Start sharing"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default ShareDialog;
