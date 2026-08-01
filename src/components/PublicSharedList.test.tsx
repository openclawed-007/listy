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

function renderPublicSharedList(
  path = "/share/alex-uid",
  user: User | null = null,
) {
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
  localStorage.clear();
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
      permissions: { toggle: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList();

    expect(await screen.findByText("Sign in to")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Apples" }));
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Sign in to edit this list" }),
    ).toHaveAttribute("href", "/import/alex-uid");
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

    await userEvent.click(
      await screen.findByRole("button", { name: "Apples" }),
    );

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
      // The aisle is filled in automatically so the owner sees it in the right
      // place without the visitor having to think about it.
      { text: "Bread", completed: false, category: "Bakery" },
    ]);
  });

  it("keeps a collaborator from adding a duplicate row and says so", async () => {
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
    await userEvent.type(input, "apples");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      screen.getByText("Apples is already on this list."),
    ).toBeInTheDocument();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
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

  it("keeps ticking usable for signed-in visitors without toggle permission, without writing back", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      permissions: { add: true },
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    const contentControl = await screen.findByRole("button", {
      name: "Apples",
    });

    // Signing in must not take away the ability to keep your place while
    // shopping — it just means the tick stays on this device.
    await userEvent.click(contentControl);

    expect(contentControl).toHaveAttribute("aria-pressed", "true");
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(
      screen.getByText(/keeps your place on this device/i),
    ).toBeInTheDocument();
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

  it("remembers a visitor's own ticks across a reload", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      items: [
        { text: "Apples", completed: false },
        { text: "Tea", completed: false },
      ],
    });

    const first = renderPublicSharedList();
    await userEvent.click(
      await screen.findByRole("button", { name: "Apples" }),
    );
    expect(screen.getByRole("button", { name: "Apples" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    first.unmount();

    renderPublicSharedList();

    expect(
      await screen.findByRole("button", { name: "Apples" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tea" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("keeps a visitor's ticks when the owner changes the list underneath them", async () => {
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

    await userEvent.click(
      await screen.findByRole("button", { name: "Apples" }),
    );
    expect(screen.getByRole("button", { name: "Apples" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The owner adds something while the visitor is mid-shop.
    listener?.({
      exists: () => true,
      data: () => ({
        ownerId: "alex-uid",
        ownerName: "Alex",
        items: [
          { text: "Apples", completed: false },
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
});
