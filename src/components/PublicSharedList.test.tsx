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
  isAnonymous: false,
} as User;

const anonVisitor = {
  uid: "anon-uid",
  displayName: null,
  email: null,
  photoURL: null,
  isAnonymous: true,
} as unknown as User;

function emitSharedSnapshot(data: Record<string, unknown> | null) {
  mockOnSnapshot.mockImplementation((_doc, next) => {
    next({
      exists: () => Boolean(data),
      data: () => data,
    });
    return vi.fn();
  });
}

function renderPublicSharedList(
  path = "/share/alex-uid",
  user: User | null = null,
  loginAnonymously = vi.fn().mockResolvedValue(undefined),
) {
  return render(
    <AuthContext.Provider
      value={{
        user,
        loading: false,
        login: vi.fn(),
        loginAnonymously,
        logout: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/share/:shareId" element={<PublicSharedList />} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/import/:shareId" element={<div>Import page</div>} />
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
    const signInLink = screen.getByRole("link", {
      name: "Sign in to save this list",
    });
    expect(signInLink).toHaveAttribute(
      "href",
      "/login?redirect=%2Fimport%2Falex-uid",
    );

    await userEvent.click(signInLink);
    expect(await screen.findByText("Login page")).toBeInTheDocument();
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
      permissions: { toggle: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList();

    expect(await screen.findByText("Sign in to")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Apples" }));
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Sign in to edit this list" }),
    ).toHaveAttribute("href", "/login?redirect=%2Fimport%2Falex-uid");
  });

  it("lets a collaborator with toggle permission save a completion change", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      permissions: { toggle: true },
      items: [
        { text: "Apples", completed: false, quantity: "2", category: "Fruit" },
        { text: "Tea", completed: false },
      ],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    await userEvent.click(await screen.findByRole("button", { name: "Apples" }));

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.items).toEqual([
      { text: "Apples", completed: true, quantity: "2", category: "Fruit" },
      { text: "Tea", completed: false },
    ]);
  });

  it("lets a collaborator with add permission append an item", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      permissions: { add: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    const input = await screen.findByLabelText(
      "Add an item to the shared list",
    );
    await userEvent.type(input, "Bread");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.items).toEqual([
      { text: "Apples", completed: false },
      { text: "Bread", completed: false },
    ]);
  });

  it("lets a collaborator with remove permission delete an item", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      permissions: { remove: true },
      items: [
        { text: "Apples", completed: false },
        { text: "Tea", completed: false },
      ],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    await userEvent.click(
      await screen.findByRole("button", { name: 'Remove "Apples"' }),
    );

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.items).toEqual([{ text: "Tea", completed: false }]);
  });

  it("hides add/remove controls a collaborator lacks permission for", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      permissions: { toggle: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    await screen.findByRole("button", { name: "Apples" });
    expect(
      screen.queryByLabelText("Add an item to the shared list"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: 'Remove "Apples"' }),
    ).not.toBeInTheDocument();
  });

  it("does not write back when no permissions are granted", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: false,
      permissions: {},
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    const apples = await screen.findByRole("button", { name: "Apples" });
    await userEvent.click(apples);

    expect(apples).toHaveAttribute("aria-pressed", "true");
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("signs the visitor in anonymously when the owner allows anonymous edits", async () => {
    const loginAnonymously = vi.fn().mockResolvedValue(undefined);
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      allowAnonymousEdits: true,
      permissions: { toggle: true, add: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", null, loginAnonymously);

    await screen.findByRole("button", { name: "Apples" });
    await waitFor(() => expect(loginAnonymously).toHaveBeenCalledTimes(1));
  });

  it("does NOT sign in anonymously when anonymous edits are not allowed", async () => {
    const loginAnonymously = vi.fn().mockResolvedValue(undefined);
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      allowAnonymousEdits: false,
      permissions: { toggle: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", null, loginAnonymously);

    await screen.findByText("Sign in to");
    expect(loginAnonymously).not.toHaveBeenCalled();
  });

  it("lets an anonymous visitor toggle and sends login directly to the login page", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      allowAnonymousEdits: true,
      permissions: { toggle: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", anonVisitor);

    await userEvent.click(await screen.findByRole("button", { name: "Apples" }));

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.items).toEqual([{ text: "Apples", completed: true }]);

    const signInLink = screen.getByRole("link", {
      name: "Sign in to save this list",
    });
    expect(signInLink).toHaveAttribute(
      "href",
      "/login?redirect=%2Fimport%2Falex-uid",
    );
    await userEvent.click(signInLink);
    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  it("lets an anonymous visitor add but never offers remove", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      allowAnonymousEdits: true,
      permissions: { toggle: true, add: true, remove: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", anonVisitor);

    // Remove is never available to anonymous visitors, even when the owner
    // granted the remove permission.
    await screen.findByRole("button", { name: "Apples" });
    expect(
      screen.queryByRole("button", { name: 'Remove "Apples"' }),
    ).not.toBeInTheDocument();

    // Add is available and writes back.
    const input = screen.getByLabelText("Add an item to the shared list");
    await userEvent.type(input, "Bread");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.items).toEqual([
      { text: "Apples", completed: false },
      { text: "Bread", completed: false },
    ]);
  });

  it("does not let an anonymous visitor edit when only remove is granted", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      allowAnonymousEdits: true,
      permissions: { remove: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", anonVisitor);

    const apples = await screen.findByRole("button", { name: "Apples" });
    await userEvent.click(apples);

    // Local optimistic flip only; nothing persists because anonymous remove is
    // never allowed and no toggle/add permission was granted.
    expect(apples).toHaveAttribute("aria-pressed", "true");
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: 'Remove "Apples"' }),
    ).not.toBeInTheDocument();
  });
});
