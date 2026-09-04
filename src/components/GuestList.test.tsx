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
    await userEvent.click(screen.getByRole("button", { name: "Clear done" }));
    expect(screen.queryByText("Bread")).not.toBeInTheDocument();
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

