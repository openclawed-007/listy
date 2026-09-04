import type { User } from "firebase/auth";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.shared";
import PublicSharedList from "./PublicSharedList";

const {
  mockDb,
  mockOnSnapshot,
  mockUpdateDoc,
  mockRunTransaction,
  mockResolveValidatedShareCode,
} = vi.hoisted(() => ({
  mockDb: { app: "test" },
  mockOnSnapshot: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockRunTransaction: vi.fn(),
  mockResolveValidatedShareCode: vi.fn(),
}));

vi.mock("../firebase", () => ({
  db: mockDb,
}));

vi.mock("../lib/allocateShareCode", async () => {
  const { normalizeShareCodeInput } = await import("../lib/shareCode");
  return {
    resolveShareCode: vi.fn(),
    allocateShareCode: vi.fn(),
    resolveValidatedShareCode: vi.fn(async (_db: unknown, input: string) => {
      const configured = await mockResolveValidatedShareCode(_db, input);
      return (
        configured ?? {
          status: "inactive" as const,
          code: normalizeShareCodeInput(input),
        }
      );
    }),
  };
});

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  onSnapshot: mockOnSnapshot,
  updateDoc: mockUpdateDoc,
  runTransaction: mockRunTransaction,
  serverTimestamp: vi.fn(() => "server-time"),
}));

let liveSharedDoc: Record<string, unknown> | null = null;
let transactionQueue = Promise.resolve();

const visitor = {
  uid: "visitor-uid",
  displayName: "Visitor",
  email: "visitor@example.com",
  photoURL: null,
} as User;

// A Firebase Anonymous Auth session, as created silently on the share page.
const anonymousVisitor = {
  uid: "anon-uid",
  displayName: null,
  email: null,
  photoURL: null,
  isAnonymous: true,
} as User;

function emitSharedSnapshot(data: Record<string, unknown> | null) {
  liveSharedDoc = data;
  mockOnSnapshot.mockImplementation((_doc, next) => {
    next({
      exists: () => Boolean(liveSharedDoc),
      data: () => liveSharedDoc ?? undefined,
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
          <Route path="/c/:code" element={<PublicSharedList />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  liveSharedDoc = null;
  transactionQueue = Promise.resolve();
  mockUpdateDoc.mockResolvedValue(undefined);
  mockRunTransaction.mockImplementation((_db, updateFn) => {
    const run = async () => {
      const tx = {
        get: async () => ({
          exists: () => liveSharedDoc != null,
          data: () => liveSharedDoc ?? undefined,
        }),
        update: (
          ref: { path: string },
          payload: Record<string, unknown>,
        ) => {
          if (liveSharedDoc) {
            liveSharedDoc = { ...liveSharedDoc, ...payload };
          }
          return mockUpdateDoc(ref, payload);
        },
      };
      return updateFn(tx);
    };
    const queued = transactionQueue.then(run, run);
    transactionQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  });
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
    ).toHaveAttribute(
      "href",
      "/login?redirect=%2Fimport%2Falex-uid",
    );
  });

  it("offers signed-in visitors a clear save-to-tabs action", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    expect(
      await screen.findByRole("link", { name: "Add this list to my tabs" }),
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
    expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Bag is empty")).not.toBeInTheDocument();
    expect(screen.queryByText("List unavailable")).not.toBeInTheDocument();
  });

  it("keeps a dead share-code error instead of a generic unavailable banner", async () => {
    renderPublicSharedList("/c/NOTACODE");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That share code is not valid.",
      );
    });
    expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Bag is empty")).not.toBeInTheDocument();
  });

  it("resolves a valid /c/:code route and loads its shared list", async () => {
    mockResolveValidatedShareCode.mockResolvedValue({
      status: "ok",
      code: "AB3DK7MP",
      ownerId: "alex-uid",
    });
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      items: [{ text: "Apples", completed: false }],
    });

    renderPublicSharedList("/c/AB3D-K7MP");

    expect(
      await screen.findByRole("heading", { name: "Alex" }),
    ).toBeInTheDocument();
    expect(mockResolveValidatedShareCode).toHaveBeenCalledWith(
      mockDb,
      "AB3DK7MP",
    );
    expect(screen.getByRole("button", { name: "Apples" })).toBeInTheDocument();
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
      | undefined;
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

  describe("editing without signing in (allowAnonymousEdits)", () => {
    const anonEnabledDoc = {
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      allowAnonymousEdits: true,
      permissions: { toggle: true, add: true, remove: true },
      items: [
        { id: "a1", text: "Apples", completed: false },
        { id: "t1", text: "Tea", completed: false },
      ],
    };

    it("silently signs a signed-out visitor in anonymously when the owner opted in", async () => {
      emitSharedSnapshot(anonEnabledDoc);
      const loginAnonymously = vi.fn().mockResolvedValue(undefined);

      renderPublicSharedList("/share/alex-uid", null, loginAnonymously);

      await screen.findByRole("heading", { name: "Alex" });
      await waitFor(() => expect(loginAnonymously).toHaveBeenCalledTimes(1));
      // Not nagged to sign in to edit: the anonymous session handles that.
      expect(
        screen.getByRole("link", { name: "Sign in to save this list" }),
      ).toBeInTheDocument();
    });

    it("does not sign in anonymously when the owner has not opted in", async () => {
      emitSharedSnapshot({ ...anonEnabledDoc, allowAnonymousEdits: false });
      const loginAnonymously = vi.fn();

      renderPublicSharedList("/share/alex-uid", null, loginAnonymously);

      await screen.findByRole("heading", { name: "Alex" });
      expect(loginAnonymously).not.toHaveBeenCalled();
      expect(
        screen.getByRole("link", { name: "Sign in to edit this list" }),
      ).toBeInTheDocument();
    });

    it("lets an anonymous session toggle and add, but never remove", async () => {
      emitSharedSnapshot(anonEnabledDoc);

      renderPublicSharedList("/share/alex-uid", anonymousVisitor);

      await userEvent.click(
        await screen.findByRole("button", { name: "Apples" }),
      );
      await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
      expect(mockUpdateDoc.mock.calls[0][1].items).toEqual([
        { id: "a1", text: "Apples", completed: true },
        { id: "t1", text: "Tea", completed: false },
      ]);

      await userEvent.type(
        screen.getByLabelText("Add an item to the shared list"),
        "Bread",
      );
      await userEvent.click(screen.getByRole("button", { name: "Add item" }));
      await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(2));
      expect(mockUpdateDoc.mock.calls[1][1].items).toHaveLength(3);

      // Remove is granted to signed-in collaborators but narrowed away here.
      expect(
        screen.queryByRole("button", { name: 'Remove "Apples"' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("You can")).toBeInTheDocument();
      expect(screen.queryByText("Remove")).not.toBeInTheDocument();
    });

    it("treats an anonymous session as signed out for navigation", async () => {
      emitSharedSnapshot(anonEnabledDoc);

      renderPublicSharedList("/share/alex-uid", anonymousVisitor);

      await screen.findByRole("heading", { name: "Alex" });
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
        "href",
        "/login",
      );
      expect(
        screen.getByRole("link", { name: "Sign in to save this list" }),
      ).toHaveAttribute("href", "/login?redirect=%2Fimport%2Falex-uid");
      expect(
        screen.queryByRole("link", { name: "My list" }),
      ).not.toBeInTheDocument();
    });

    it("keeps ticks local for an anonymous session once the owner withdraws the opt-in", async () => {
      emitSharedSnapshot({ ...anonEnabledDoc, allowAnonymousEdits: false });

      renderPublicSharedList("/share/alex-uid", anonymousVisitor);

      const apples = await screen.findByRole("button", { name: "Apples" });
      await userEvent.click(apples);

      expect(apples).toHaveAttribute("aria-pressed", "true");
      expect(mockUpdateDoc).not.toHaveBeenCalled();
      expect(
        screen.queryByLabelText("Add an item to the shared list"),
      ).not.toBeInTheDocument();
    });
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

  it("chains rapid collaborator toggles without losing the first change", async () => {
    emitSharedSnapshot({
      ownerId: "alex-uid",
      ownerName: "Alex",
      allowEdits: true,
      permissions: { toggle: true },
      items: [
        { id: "a1", text: "Apples", completed: false },
        { id: "t1", text: "Tea", completed: false },
      ],
    });

    renderPublicSharedList("/share/alex-uid", visitor);

    await userEvent.click(
      await screen.findByRole("button", { name: "Apples" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Tea" }));

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(2));
    const [, secondPayload] = mockUpdateDoc.mock.calls[1];
    expect(secondPayload.items).toEqual([
      { id: "a1", text: "Apples", completed: true },
      { id: "t1", text: "Tea", completed: true },
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
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toEqual({ text: "Apples", completed: false });
    // Collaborator-added rows get a stable id; aisle is filled in automatically.
    expect(payload.items[1]).toEqual(
      expect.objectContaining({
        text: "Bread",
        completed: false,
        category: "Bakery",
        id: expect.any(String),
      }),
    );
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
      | undefined;
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
