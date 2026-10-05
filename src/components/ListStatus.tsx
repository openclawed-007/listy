import React from "react";
import { X } from "lucide-react";

/** Inline status line that the customer can get rid of straight away. */
export const DismissibleMessage: React.FC<{
  kind: "error" | "success";
  message: string;
  onDismiss: () => void;
}> = ({ kind, message, onDismiss }) => (
  <div
    className={`${kind === "error" ? "form-error" : "form-success"} inline-error dismissible-message`}
    role={kind === "error" ? "alert" : "status"}
  >
    <span>{message}</span>
    <button type="button" onClick={onDismiss} aria-label="Dismiss message">
      <X size={14} />
    </button>
  </div>
);

/** Today's shopping-day nudge, with a shortcut to change it. */
export const ReminderBanner: React.FC<{
  message: string;
  onOpenSettings: () => void;
}> = ({ message, onOpenSettings }) => (
  <div className="reminder-banner" role="status">
    <span>{message}</span>
    <button type="button" className="reminder-banner-action" onClick={onOpenSettings}>
      Settings
    </button>
  </div>
);

/** Bottom toast offering to bring back the item that was just removed. */
export const UndoToast: React.FC<{ text: string; onUndo: () => void }> = ({
  text,
  onUndo,
}) => (
  <div className="undo-toast" role="status">
    <span>Removed “{text}”.</span>
    <button type="button" onClick={onUndo}>
      Undo
    </button>
  </div>
);
