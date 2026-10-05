import React, { useEffect, useState, type RefObject } from "react";
import { Plus } from "lucide-react";

interface AddFabProps {
  /** The add field; the button shows only while it is scrolled out of view. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Lift the button above the undo toast while one is showing. */
  raised?: boolean;
}

/**
 * Floating "+" for long lists: once the add field scrolls away, one tap
 * brings it back and opens the keyboard — no thumb-scrolling to the top.
 */
const AddFab: React.FC<AddFabProps> = ({ inputRef, raised = false }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      // The sticky navbar covers the top of the viewport.
      { rootMargin: "-72px 0px 0px 0px" },
    );
    observer.observe(input);
    return () => observer.disconnect();
  }, [inputRef]);

  return (
    <button
      type="button"
      className={`add-fab ${visible ? "is-visible" : ""} ${raised ? "is-raised" : ""}`}
      aria-label="Add an item"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => {
        const input = inputRef.current;
        if (!input) return;
        // Focus first so mobile browsers open the keyboard within the tap.
        input.focus({ preventScroll: true });
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        input.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      }}
    >
      <Plus size={24} strokeWidth={2.5} />
    </button>
  );
};

export default AddFab;
