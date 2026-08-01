import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "firebase/auth";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.shared";
import JoinShare from "./JoinShare";

const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
}));

vi.mock("../firebase", () => ({
  db: { app: "test" },
}));

vi.mock("../lib/allocateShareCode", () => ({
  resolveShareCode: mockResolve,
  allocateShareCode: vi.fn(),
}));

function renderJoin(path = "/join", user: User | null = null) {
  return render(
    <AuthContext.Provider
      value={{
        user,
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/join" element={<JoinShare />} />
          <Route path="/c/:code" element={<JoinShare />} />
          <Route path="/" element={<div>My list home</div>} />
          <Route
            path="/share/:shareId"
            element={<div>Opened shared list</div>}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("JoinShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a typed code to the public shared list", async () => {
    mockResolve.mockResolvedValue("owner-uid");
    renderJoin();

    await userEvent.type(
      screen.getByLabelText("Share code"),
      "ab3d-k7mp",
    );
    await userEvent.click(screen.getByRole("button", { name: "Open list" }));

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith({ app: "test" }, "AB3DK7MP");
    });
    expect(await screen.findByText("Opened shared list")).toBeInTheDocument();
  });

  it("shows a clear error when the code is not active", async () => {
    mockResolve.mockResolvedValue(null);
    renderJoin();

    await userEvent.type(screen.getByLabelText("Share code"), "AB3DK7MP");
    await userEvent.click(screen.getByRole("button", { name: "Open list" }));

    expect(
      await screen.findByText(/that code isn’t active/i),
    ).toBeInTheDocument();
  });

  it("auto-opens a list from /c/:code", async () => {
    mockResolve.mockResolvedValue("owner-uid");
    renderJoin("/c/AB3DK7MP");

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith({ app: "test" }, "AB3DK7MP");
    });
    expect(await screen.findByText("Opened shared list")).toBeInTheDocument();
  });

  it("sends signed-in users back to their list from the join page", () => {
    renderJoin("/join", {
      uid: "u1",
      displayName: "Alex",
      email: "alex@example.com",
      photoURL: null,
    } as User);

    expect(
      screen.getByRole("link", { name: /back to my list/i }),
    ).toHaveAttribute("href", "/");
  });
});
