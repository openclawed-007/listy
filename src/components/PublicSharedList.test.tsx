import type { User } from "firebase/auth";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.shared";
import PublicSharedList from "./PublicSharedList";

const { mockDb, mockOnSnapshot, mockUpdateDoc } = vi.hoisted(() => ({
  mockDb: { app: "test" },
  mockOnSnapshot: vi.fn(),
  mockUpdateDoc: vi.fn(),
}));

vi.mock("../firebase", () => ({
  db: mockDb,
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  onSnapshot: mockOnSnapshot,
  updateDoc: mockUpdateDoc,
  serverTimestamp: vi.fn(() => "server-time"),
}));

const visitor = {
  uid: "visitor-uid",
  displayName: "Visitor",
  email: "visitor@example.com",
  photoURL: null,
} as User;

function emitSharedSnapshot(data: Record<string, unknown> | null) {
  mockOnSnapshot.mockImplementation((_doc, next) => {
    next({
      exists: () => Boolean(data),
      data: () => data,
    });
    return vi.fn();
  });
}

function renderPublicSharedList(path = "/share/alex-uid", user: User | null = null) {
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
          <Route path="/share/:shareId" element={<PublicSharedList />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateDoc.mockResolvedValue(undefined);
});

describe("PublicSharedList", () => {
  it("loads a shared list without auth and lets visitors tick items locally", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      items: [
        { text: "Apples", completed: false },
        { text: "Tea", completed: true },
      ],
    });

    renderPublicSharedList();

    expect(
      await screen.findByRole("heading", { name: "Alex" }),
    ).toBeInTheDocument();

    const apples = screen.getByRole("button", { name: "Apples" });
    expect(apples).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(apples);

    expect(apples).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("link", { name: "Sign in to save this list" }),
    ).toHaveAttribute("href", "/import/alex-uid");
  });

  it("shows an unavailable state when the shared snapshot is missing", async () => {
    emitSharedSnapshot(null);

    renderPublicSharedList();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This shared list is no longer available.",
      );
    });
    expect(
      screen.getByText("Ask the owner to refresh their share link."),
    ).toBeInTheDocument();
  });

  it("shows an empty state for a valid shared list with no items", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      items: [],
    });

    renderPublicSharedList();

    expect(
      await screen.findByRole("heading", { name: "Alex" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Bag is empty")).toBeInTheDocument();
    expect(
      screen.getByText("This shared list does not have any items yet."),
    ).toBeInTheDocument();
  });

  it("updates the public list while the share page is open", async () => {
    let listener:
      | ((snapshot: {
          exists: () => boolean;
          data: () => Record<string, unknown>;
        }) => void)
      | null = null;
    mockOnSnapshot.mockImplementation((_doc, next) => {
      listener = next;
      next({
        exists: () => true,
        data: () => ({
          ownerId: "alex-uid",
          ownerName: "Alex",
          items: [{ text: "Apples", completed: false }],
        }),
      });
      return vi.fn();
    });

    renderPublicSharedList();

    expect(
      await screen.findByRole("button", { name: "Apples" }),
    ).toBeInTheDocument();

    listener?.({
      exists: () => true,
      data: () => ({
        ownerId: "alex-uid",
        ownerName: "Alex",
        items: [
          { text: "Apples", completed: true },
          { text: "Bread", completed: false },
        ],
      }),
    });

    expect(
      await screen.findByRole("button", { name: "Bread" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apples" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("prompts anonymous visitors to sign in when editing is allowed", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList();

    expect(
      await screen.findByText(
        "The owner allows editing. Sign in to check items off.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Apples" }));
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Sign in to edit this list" }),
    ).toHaveAttribute("href", "/import/alex-uid");
  });

  it("lets a signed-in collaborator save a completion change when editing is allowed", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      items: [
        { text: "Apples", completed: false, quantity: "2", category: "Fruit" },
        { text: "Tea", completed: false },
      ],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    const apples = await screen.findByRole("button", { name: /Apples/ });
    await userEvent.click(apples);

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.items).toEqual([
      { text: "Apples", completed: true, quantity: "2", category: "Fruit" },
      { text: "Tea", completed: false },
    ]);
  });

  it("does not write back when editing is disabled", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: false,
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    const apples = await screen.findByRole("button", { name: "Apples" });
    await userEvent.click(apples);

    expect(apples).toHaveAttribute("aria-pressed", "true");
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
