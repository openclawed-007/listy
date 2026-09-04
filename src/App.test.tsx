import { render, screen } from "@testing-library/react";
import type { User } from "firebase/auth";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "./context/AuthContext.shared";
import { Home } from "./App";

vi.mock("./components/ShoppingList", () => ({
  default: () => <div>shopping-list-screen</div>,
}));

vi.mock("./components/Landing", () => ({
  default: () => <div>landing-screen</div>,
}));

function renderHome(user: Partial<User> | null, loading = false) {
  render(
    <AuthContext.Provider
      value={{
        user: user as User | null,
        loading,
        login: vi.fn(),
        loginAnonymously: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("Home route", () => {
  it("shows the landing page to signed-out visitors", async () => {
    renderHome(null);
    expect(await screen.findByText("landing-screen")).toBeInTheDocument();
  });

  it("treats anonymous guest sessions as signed out", async () => {
    renderHome({ uid: "guest", isAnonymous: true });
    expect(await screen.findByText("landing-screen")).toBeInTheDocument();
  });

  it("shows the shopping list to signed-in account holders", async () => {
    renderHome({ uid: "owner", isAnonymous: false });
    expect(await screen.findByText("shopping-list-screen")).toBeInTheDocument();
  });

  it("shows a loader while auth state is resolving", () => {
    renderHome(null, true);
    expect(screen.queryByText("landing-screen")).toBeNull();
    expect(screen.queryByText("shopping-list-screen")).toBeNull();
  });
});
