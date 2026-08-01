import React from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";

export type ConfirmAction =
  | "clearCompleted"
  | "removeSharedList"
  | "stopSharing";

interface ConfirmDialogProps {
  action: ConfirmAction;
  itemCount: number;
  listName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function getConfirmCopy(
  action: ConfirmAction,
  itemCount: number,
  listName: string,
) {
  if (action === "clearCompleted") {
    return {
      title: "Clear completed items?",
      body: `This will permanently remove ${itemCount} completed ${
        itemCount === 1 ? "item" : "items"
      } from ${listName}.`,
      confirmLabel: "Clear items",
    };
  }

  if (action === "removeSharedList") {
    return {
      title: "Remove this list?",
      body: `${listName} and its saved items will be removed from your account.`,
      confirmLabel: "Remove list",
    };
  }

  return {
    title: "Stop sharing?",
    body: "Anyone with your current share link or QR code will no longer be able to view this list.",
    confirmLabel: "Stop sharing",
  };
}

/** Single confirmation dialog used for every destructive action. */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  action,
  itemCount,
  listName,
  busy,
  onCancel,
  onConfirm,
}) => {
  const copy = getConfirmCopy(action, itemCount, listName);
  const dialogRef = useDialogFocus<HTMLElement>();

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        ref={dialogRef}
        className="settings-modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="confirm-title">{copy.title}</h2>
            <p>{copy.body}</p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <X size={18} />
          </button>
        </div>
        <div className="confirm-actions">
          <button className="secondary-btn" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="danger-btn"
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working..." : copy.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};

export default ConfirmDialog;
