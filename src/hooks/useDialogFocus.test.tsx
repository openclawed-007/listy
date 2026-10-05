import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useDialogFocus } from "./useDialogFocus";

function Dialog({ name, onClose }: { name: string; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={name}>
      <button type="button">{name} action</button>
    </div>
  );
}

describe("useDialogFocus", () => {
  it("closes only the top-most dialog on Escape and locks scrolling until all close", async () => {
    const closeShare = vi.fn();
    const closeConfirm = vi.fn();
    const { rerender } = render(
      <>
        <Dialog name="Share" onClose={closeShare} />
        <Dialog name="Confirm" onClose={closeConfirm} />
      </>,
    );

    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "Confirm action" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(closeShare).not.toHaveBeenCalled();

    rerender(<Dialog name="Share" onClose={closeShare} />);
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.keyboard("{Escape}");
    expect(closeShare).toHaveBeenCalledTimes(1);

    rerender(<></>);
    expect(document.body.style.overflow).toBe("");
  });
});
