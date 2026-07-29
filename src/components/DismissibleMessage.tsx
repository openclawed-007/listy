import React from "react";
import { X } from "lucide-react";

interface DismissibleMessageProps {
  kind: "error" | "success";
  message: string;
  onDismiss: () => void;
}

/** Inline status line that the customer can get rid of straight away. */
const DismissibleMessage: React.FC<DismissibleMessageProps> = ({
  kind,
  message,
  onDismiss,
}) => (
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

export default DismissibleMessage;
