import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("firebase/firestore", () => ({
  addDoc: mockAddDoc,
  collection: vi.fn((_db: unknown, path: string) => ({ path, type: "collection" })),
  deleteDoc: mockDeleteDoc,
  doc: vi.fn((first: { path?: string; type?: string } | unknown, ...segments: string[]) => {
    if (typeof first === "object" && first && "type" in first && first.type === "collection") {
      autoDocId += 1;
      return { path: `${first.path}/auto-${autoDocId}` };
    }

    return { path: segments.join("/") };
  }),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  onSnapshot: mockOnSnapshot,
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  serverTimestamp: vi.fn(() => "server-time"),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  where: vi.fn((field: string, operator: string, value: unknown) => ({ field, operator, value })),
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
      forEach: (callback: (doc: MockDoc) => void) => queryDocs.forEach(callback),
    }),
  );

  mockBatchCommit.mockResolvedValue(undefined);
});

describe("ShoppingList sharing", () => {
  it("publishes a public share snapshot and copies the public share link", async () => {
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

    renderShoppingList();

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        { path: "sharedLists/owner-uid" },
        expect.objectContaining({
          ownerId: "owner-uid",
          ownerName: "Brad Owner",
          items: [{ text: "Milk", completed: false }],
        }),
      );
    });

    expect(await screen.findByText("Ready to scan")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "http://localhost:3000/share/owner-uid",
    );
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

    expect(mockBatchDelete).toHaveBeenCalledWith({ path: "shoppingItems/old-shared-1" });
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

    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalledWith({ path: "shoppingItems/shared-1" });
      expect(mockDeleteDoc).toHaveBeenCalledWith({ path: "shoppingItems/shared-2" });
    });
  });

  it("syncs an already imported list when the owner updates their shared snapshot", async () => {
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

    await waitFor(() => expect(mockBatchCommit).toHaveBeenCalled());

    expect(mockBatchDelete).toHaveBeenCalledWith({ path: "shoppingItems/shared-1" });
    expect(mockBatchSet).toHaveBeenCalledWith(
      { path: "shoppingItems/auto-1" },
      expect.objectContaining({
        text: "New apples",
        listId: "shared:alex-uid",
        sharedFromUserId: "alex-uid",
      }),
    );
    expect(mockBatchSet).toHaveBeenCalledWith(
      { path: "shoppingItems/auto-2" },
      expect.objectContaining({
        text: "Bread",
        listId: "shared:alex-uid",
      }),
    );
  });
});
