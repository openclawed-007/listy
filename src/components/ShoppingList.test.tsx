import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "firebase/auth";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.shared";
import ShoppingList from "./ShoppingList";

interface MockDoc {
  id: string;
  data: () => Record<string, unknown>;
}

let autoDocId = 0;
let snapshotDocs: MockDoc[] = [];
let queryDocs: MockDoc[] = [];
let sharedSnapshots = new Map<string, Record<string, unknown>>();

const {
  mockDb,
  mockAddDoc,
  mockDeleteDoc,
  mockGetDoc,
  mockGetDocs,
  mockOnSnapshot,
  mockSetDoc,
  mockUpdateDoc,
  mockBatchDelete,
  mockBatchSet,
  mockBatchCommit,
} = vi.hoisted(() => ({
  mockDb: { app: "test" },
  mockAddDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockBatchDelete: vi.fn(),
  mockBatchSet: vi.fn(),
  mockBatchCommit: vi.fn(),
}));

vi.mock("../firebase", () => ({
  db: mockDb,
}));

vi.mock("../lib/allocateShareCode", () => ({
  allocateShareCode: vi.fn().mockResolvedValue("AB3DK7MP"),
  resolveShareCode: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: mockAddDoc,
  collection: vi.fn((_db: unknown, path: string) => ({
    path,
    type: "collection",
  })),
  deleteDoc: mockDeleteDoc,
  deleteField: vi.fn(() => "delete-field"),
  doc: vi.fn(
    (
      first: { path?: string; type?: string } | unknown,
      ...segments: string[]
    ) => {
      if (
        typeof first === "object" &&
        first &&
        "type" in first &&
        first.type === "collection"
      ) {
        autoDocId += 1;
        return { path: `${first.path}/auto-${autoDocId}` };
      }

      return { path: segments.join("/") };
    },
  ),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  onSnapshot: mockOnSnapshot,
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  serverTimestamp: vi.fn(() => "server-time"),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  where: vi.fn((field: string, operator: string, value: unknown) => ({
    field,
    operator,
    value,
  })),
  writeBatch: vi.fn(() => ({
    delete: mockBatchDelete,
    set: mockBatchSet,
    commit: mockBatchCommit,
  })),
}));

const user = {
  uid: "owner-uid",
  displayName: "Brad Owner",
  email: "brad@example.com",
  photoURL: null,
} as User;

function makeDoc(id: string, data: Record<string, unknown>): MockDoc {
  return {
    id,
    data: () => data,
  };
}

function renderShoppingList(initialPath = "/") {
  return render(
    <AuthContext.Provider
      value={{
        user,
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<ShoppingList />} />
          <Route path="/import/:shareId" element={<ShoppingList />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  autoDocId = 0;
  snapshotDocs = [];
  queryDocs = [];
  sharedSnapshots = new Map();
  vi.clearAllMocks();
  localStorage.clear();

  mockOnSnapshot.mockImplementation((target, next) => {
    if (target?.path?.startsWith("sharedLists/")) {
      const ownerId = target.path.replace("sharedLists/", "");
      const data = sharedSnapshots.get(ownerId);
      next({
        exists: () => Boolean(data),
        data: () => data,
      });
      return vi.fn();
    }

    next({
      docs: snapshotDocs,
    });
    return vi.fn();
  });

  mockGetDocs.mockImplementation(() =>
    Promise.resolve({
      forEach: (callback: (doc: MockDoc) => void) =>
        queryDocs.forEach(callback),
    }),
  );

  mockBatchCommit.mockResolvedValue(undefined);
  mockAddDoc.mockResolvedValue({ id: "new-doc" });
  mockDeleteDoc.mockResolvedValue(undefined);
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
});

describe("ShoppingList sharing", () => {
  it("migrates a local guest list into the signed-in personal list once", async () => {
    snapshotDocs = [];
    localStorage.setItem(
      "cartlink:guest-items:v1",
      JSON.stringify([
        {
          id: "g1",
          text: "Eggs",
          completed: false,
          quantity: "6",
          category: "Dairy & Eggs",
          createdAt: 1,
        },
        {
          id: "g2",
          text: "Bread",
          completed: true,
          createdAt: 2,
        },
      ]),
    );

    renderShoppingList();

    await waitFor(() => {
      expect(mockAddDoc).toHaveBeenCalledTimes(2);
    });

    expect(mockAddDoc).toHaveBeenCalledWith(
      { path: "shoppingItems", type: "collection" },
      expect.objectContaining({
        text: "Eggs",
        quantity: "6",
        category: "Dairy & Eggs",
        userId: user.uid,
        listId: "personal",
      }),
    );
    expect(mockAddDoc).toHaveBeenCalledWith(
      { path: "shoppingItems", type: "collection" },
      expect.objectContaining({
        text: "Bread",
        completed: true,
        userId: user.uid,
      }),
    );
    expect(localStorage.getItem("cartlink:guest-items:v1")).toBeNull();
    expect(
      await screen.findByText("Brought over 2 items from your guest list."),
    ).toBeInTheDocument();
  });

  it("publishes a public share snapshot only after the user opts in, and copies the share link", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: false,
        userId: user.uid,
        listId: "personal",
      }),
      makeDoc("shared-1", {
        text: "Shared bread",
        completed: false,
        userId: user.uid,
        listId: "shared:other-user",
        listName: "Alex",
      }),
    ];
    mockGetDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });

    renderShoppingList();

    await userEvent.click(screen.getByRole("button", { name: "Share list" }));

    expect(mockSetDoc).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Start sharing" }),
    );

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        { path: "sharedLists/owner-uid" },
        expect.objectContaining({
          ownerId: "owner-uid",
          ownerName: "Brad Owner",
          items: [{ text: "Milk", completed: false }],
          shareCode: "AB3DK7MP",
        }),
      );
    });

    expect(
      screen.getByRole("button", { name: "Copy share code AB3D-K7MP" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Copy share code AB3D-K7MP" }),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("AB3D-K7MP");

    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "http://localhost:3000/c/AB3DK7MP",
    );
  });

  it("stops sharing by deleting the public share doc when the user clicks stop", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: false,
        userId: user.uid,
        listId: "personal",
      }),
    ];
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        ownerId: user.uid,
        ownerName: "Brad Owner",
        shareCode: "AB3DK7MP",
        items: [{ text: "Milk", completed: false }],
      }),
    });

    renderShoppingList();

    await userEvent.click(
      await screen.findByRole("button", {
        name: /share list \(sharing is on\)/i,
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Stop sharing" }));

    // Confirm sits above the share modal; target that dialog explicitly.
    const confirm = await screen.findByRole("dialog", {
      name: /stop sharing\?/i,
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Stop sharing" }),
    );

    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalledWith({
        path: "sharedLists/owner-uid",
      });
    });
    expect(mockDeleteDoc).toHaveBeenCalledWith({
      path: "shareCodes/AB3DK7MP",
    });
  });

  it("keeps an empty item edit open and explains the validation error", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: false,
        userId: user.uid,
        listId: "personal",
      }),
    ];

    renderShoppingList();

    await userEvent.click(
      await screen.findByRole("button", { name: 'Edit "Milk"' }),
    );
    const input = screen.getByLabelText("Edit item text");
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Item text cannot be empty.",
    );
    expect(screen.getByLabelText("Edit item text")).toBeInTheDocument();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("closes the share dialog with Escape and restores page scrolling", async () => {
    renderShoppingList();

    await userEvent.click(screen.getByRole("button", { name: "Share list" }));
    expect(
      screen.getByRole("dialog", { name: "Share list" }),
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Share list" }),
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("shows an offline indicator in the navbar when offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    renderShoppingList();

    const pill = await screen.findByRole("status", {
      name: /offline.*changes will sync when online/i,
    });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass("offline-pill");
  });

  it("imports a shared list into the signed-in account under the sharer's tab", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: false,
        userId: user.uid,
        listId: "personal",
      }),
    ];
    queryDocs = [
      makeDoc("old-shared-1", {
        text: "Old item",
        completed: false,
        userId: user.uid,
        listId: "shared:alex-uid",
      }),
    ];
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        ownerId: "alex-uid",
        ownerName: "Alex",
        items: [
          { text: "Apples", completed: false },
          { text: "Tea", completed: true },
        ],
      }),
    });

    renderShoppingList("/import/alex-uid");

    await waitFor(() => expect(mockBatchCommit).toHaveBeenCalled());

    expect(mockBatchDelete).toHaveBeenCalledWith({
      path: "shoppingItems/old-shared-1",
    });
    expect(mockBatchSet).toHaveBeenCalledWith(
      { path: "shoppingItems/auto-1" },
      expect.objectContaining({
        text: "Apples",
        completed: false,
        userId: "owner-uid",
        listId: "shared:alex-uid",
        listName: "Alex",
        sharedFromUserId: "alex-uid",
      }),
    );
    expect(mockBatchSet).toHaveBeenCalledWith(
      { path: "shoppingItems/auto-2" },
      expect.objectContaining({
        text: "Tea",
        completed: true,
        listId: "shared:alex-uid",
        listName: "Alex",
      }),
    );
  });

  it("removes an imported shared list from the user's account", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: false,
        userId: user.uid,
        listId: "personal",
      }),
      makeDoc("shared-1", {
        text: "Apples",
        completed: false,
        userId: user.uid,
        listId: "shared:alex-uid",
        listName: "Alex",
      }),
      makeDoc("shared-2", {
        text: "Tea",
        completed: true,
        userId: user.uid,
        listId: "shared:alex-uid",
        listName: "Alex",
      }),
    ];

    renderShoppingList();

    await userEvent.click(screen.getByRole("button", { name: "Alex" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove list" }));
    await userEvent.click(
      screen.getAllByRole("button", { name: "Remove list" })[1],
    );

    await waitFor(() => {
      expect(mockBatchDelete).toHaveBeenCalledWith({
        path: "shoppingItems/shared-1",
      });
      expect(mockBatchDelete).toHaveBeenCalledWith({
        path: "shoppingItems/shared-2",
      });
      expect(mockBatchCommit).toHaveBeenCalled();
    });
  });

  it("does not live-resync an imported list when the owner updates their snapshot (one-shot import only)", async () => {
    snapshotDocs = [
      makeDoc("shared-1", {
        text: "Old apples",
        completed: false,
        userId: user.uid,
        listId: "shared:alex-uid",
        listName: "Alex",
        sharedFromUserId: "alex-uid",
      }),
    ];
    sharedSnapshots.set("alex-uid", {
      ownerId: "alex-uid",
      ownerName: "Alex",
      items: [
        { text: "New apples", completed: false },
        { text: "Bread", completed: false },
      ],
    });

    renderShoppingList();

    // Allow effects to settle.
    await screen.findByRole("button", { name: "Alex" });

    expect(mockBatchCommit).not.toHaveBeenCalled();
    expect(mockBatchDelete).not.toHaveBeenCalled();
    expect(mockBatchSet).not.toHaveBeenCalled();
  });
});

describe("ShoppingList imported-list editing", () => {
  it("propagates an edited shared item back to its owner in one update", async () => {
    snapshotDocs = [
      makeDoc("shared-1", {
        text: "Apples",
        completed: false,
        userId: user.uid,
        listId: "shared:alex-uid",
        listName: "Alex",
        sharedFromUserId: "alex-uid",
      }),
    ];
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        ownerId: "alex-uid",
        ownerName: "Alex",
        allowEdits: true,
        permissions: { toggle: true, add: true, remove: true },
        items: [{ text: "Apples", completed: false }],
      }),
    });

    renderShoppingList();
    await userEvent.click(await screen.findByRole("button", { name: "Alex" }));
    await userEvent.click(screen.getByRole("button", { name: 'Edit "Apples"' }));
    const input = screen.getByLabelText("Edit item text");
    await userEvent.clear(input);
    await userEvent.type(input, "Green apples");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { path: "sharedLists/alex-uid" },
        expect.objectContaining({
          items: [{ text: "Green apples", completed: false }],
        }),
      ),
    );
  });
});

describe("ShoppingList collaborator sync-back", () => {
  // Regression: the owner publishes on a debounce while listening to the same
  // document, so the server is briefly behind the owner's own edits. Reading
  // that lag as collaborator activity used to re-create items the owner had
  // just deleted, and delete items they had just renamed.
  it("does not resurrect an item the owner just deleted", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: false,
        userId: user.uid,
        listId: "personal",
      }),
    ];
    // The share doc still holds the item the owner has already removed.
    sharedSnapshots.set("owner-uid", {
      ownerId: "owner-uid",
      ownerName: "Brad Owner",
      allowEdits: true,
      permissions: { toggle: true, add: true, remove: true },
      items: [
        { text: "Milk", completed: false },
        { text: "Bread", completed: false },
      ],
    });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => sharedSnapshots.get("owner-uid"),
    });
    // What we last published matches the server, so nothing here is theirs.
    localStorage.setItem(
      "cartlink:published:owner-uid",
      JSON.stringify({
        "Milk\u0000\u0000": false,
        "Bread\u0000\u0000": false,
      }),
    );

    renderShoppingList();

    await screen.findByText("Milk");
    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled());

    // Bread is gone locally and absent from the diff, so it must stay gone.
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it("applies a change that really did come from a collaborator", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: false,
        userId: user.uid,
        listId: "personal",
      }),
    ];
    sharedSnapshots.set("owner-uid", {
      ownerId: "owner-uid",
      ownerName: "Brad Owner",
      allowEdits: true,
      permissions: { toggle: true, add: true, remove: true },
      items: [{ text: "Milk", completed: true }],
    });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => sharedSnapshots.get("owner-uid"),
    });
    localStorage.setItem(
      "cartlink:published:owner-uid",
      JSON.stringify({ "Milk\u0000\u0000": false }),
    );

    renderShoppingList();

    await waitFor(() =>
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { path: "shoppingItems/personal-1" },
        { completed: true },
      ),
    );
  });
});

describe("ShoppingList smart add field", () => {
  it("reads the quantity and aisle out of what the customer typed", async () => {
    renderShoppingList();

    await userEvent.type(screen.getByLabelText("New shopping item"), "2 milk");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => {
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "shoppingItems" }),
        expect.objectContaining({
          text: "Milk",
          quantity: "2",
          category: "Dairy & Eggs",
          completed: false,
          listId: "personal",
        }),
      );
    });
  });

  it("bumps the existing row instead of adding a duplicate", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: true,
        userId: user.uid,
        listId: "personal",
      }),
    ];

    renderShoppingList();

    await userEvent.type(
      await screen.findByLabelText("New shopping item"),
      "milk",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { path: "shoppingItems/personal-1" },
        expect.objectContaining({ completed: false, quantity: "2" }),
      );
    });
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(
      screen.getByText(/already on your list — now x2/i),
    ).toBeInTheDocument();
  });

  it("shows progress towards finishing the list", async () => {
    snapshotDocs = [
      makeDoc("personal-1", {
        text: "Milk",
        completed: true,
        userId: user.uid,
        listId: "personal",
      }),
      makeDoc("personal-2", {
        text: "Bread",
        completed: false,
        userId: user.uid,
        listId: "personal",
      }),
    ];

    renderShoppingList();

    const progress = await screen.findByRole("progressbar", {
      name: "1 of 2 items picked up",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "50");
  });
});
