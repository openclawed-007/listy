import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "firebase/auth";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.shared";
import GuestList from "./GuestList";

function renderGuest(user: User | null = null) {
  return render(
    <AuthContext.Provider
      value={{
        user,
        loading: false,
        login: vi.fn(),
        loginAnonymously: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={["/guest"]}>
        <Routes>
          <Route path="/guest" element={<GuestList />} />
          <Route path="/" element={<div>Signed-in home</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("GuestList", () => {
  beforeEach(() => localStorage.clear());

  it("adds, groups and persists smart items without Firebase", async () => {
    const first = renderGuest();
    await userEvent.type(screen.getByLabelText("Add or search items"), "2 milk");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.getByText("x2")).toBeInTheDocument();
    expect(screen.getByText("Dairy & Eggs")).toBeInTheDocument();
    first.unmount();

    renderGuest();
    expect(screen.getByText("Milk")).toBeInTheDocument();
  });

  it("ticks and clears completed items", async () => {
    renderGuest();
    await userEvent.type(screen.getByLabelText("Add or search items"), "Bread");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Mark as completed: Bread" }),
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText("Done · 1")).toBeInTheDocument();

    // Bulk removal asks first, exactly like the signed-in list.
    await userEvent.click(screen.getByRole("button", { name: "Clear done" }));
    expect(
      screen.getByRole("dialog", { name: "Clear completed items?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear items" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Done · 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("offers Undo after removing an item", async () => {
    renderGuest();
    await userEvent.type(screen.getByLabelText("Add or search items"), "Eggs");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    await userEvent.click(screen.getByRole("button", { name: 'Remove "Eggs"' }));

    expect(screen.queryByText("Eggs")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Removed “Eggs”.");

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Eggs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("opens Settings for guests so text size and reminders are reachable", async () => {
    renderGuest();
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Text size" })).toBeInTheDocument();
  });

  it("lets guests edit a typo without signing in", async () => {
    renderGuest();
    await userEvent.type(screen.getByLabelText("Add or search items"), "Milkk");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    await userEvent.click(screen.getByRole("button", { name: 'Edit "Milkk"' }));
    const input = screen.getByLabelText("Edit item text");
    await userEvent.clear(input);
    await userEvent.type(input, "Milk");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.queryByText("Milkk")).not.toBeInTheDocument();
  });

  it("survives auth resolving after the loading screen (hook order)", () => {
    // Regression: early returns above later hooks crashed React with
    // "Rendered more hooks than during the previous render" when
    // Firebase auth flipped loading -> loaded on real devices.
    const value = {
      user: null,
      loading: true,
      login: vi.fn(),
      loginAnonymously: vi.fn(),
      logout: vi.fn(),
    };
    const ui = (auth: typeof value) => (
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/guest"]}>
          <Routes>
            <Route path="/guest" element={<GuestList />} />
            <Route path="/" element={<div>Signed-in home</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    const view = render(ui(value));
    expect(screen.queryByLabelText("Add or search items")).toBeNull();

    view.rerender(ui({ ...value, loading: false }));
    expect(screen.getByLabelText("Add or search items")).toBeInTheDocument();
  });

  it("sends signed-in users to the synced list", () => {
    renderGuest({
      uid: "u1",
      displayName: "Alex",
      email: "alex@example.com",
      photoURL: null,
    } as User);
    expect(screen.getByText("Signed-in home")).toBeInTheDocument();
  });
});

