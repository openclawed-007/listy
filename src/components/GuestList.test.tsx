import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import GuestList from "./GuestList";

describe("GuestList", () => {
  beforeEach(() => localStorage.clear());

  it("adds, groups and persists smart items without Firebase", async () => {
    const first = render(<MemoryRouter><GuestList /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText("New shopping item"), "2 milk");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.getByText("x2")).toBeInTheDocument();
    expect(screen.getByText("Dairy & Eggs")).toBeInTheDocument();
    first.unmount();

    render(<MemoryRouter><GuestList /></MemoryRouter>);
    expect(screen.getByText("Milk")).toBeInTheDocument();
  });

  it("ticks and clears completed items", async () => {
    render(<MemoryRouter><GuestList /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText("New shopping item"), "Bread");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    await userEvent.click(screen.getByRole("button", { name: "Mark as completed: Bread" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    await userEvent.click(screen.getByRole("button", { name: "Clear 1 done" }));
    expect(screen.queryByText("Bread")).not.toBeInTheDocument();
  });
});
