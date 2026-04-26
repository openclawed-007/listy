import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicSharedList from "./PublicSharedList";

const { mockDb, mockGetDoc } = vi.hoisted(() => ({
  mockDb: { app: "test" },
  mockGetDoc: vi.fn(),
}));

vi.mock("../firebase", () => ({
  db: mockDb,
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: mockGetDoc,
}));

function renderPublicSharedList(path = "/share/alex-uid") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/share/:shareId" element={<PublicSharedList />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicSharedList", () => {
  it("loads a shared list without auth and lets visitors tick items locally", async () => {
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

    renderPublicSharedList();

    expect(await screen.findByRole("heading", { name: "Alex" })).toBeInTheDocument();

    const apples = screen.getByRole("button", { name: "Apples" });
    expect(apples).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(apples);

    expect(apples).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Sign in to save this list" })).toHaveAttribute(
      "href",
      "/import/alex-uid",
    );
  });

  it("shows an unavailable state when the shared snapshot is missing", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => false,
    });

    renderPublicSharedList();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This shared list is no longer available.",
      );
    });
    expect(screen.getByText("Ask the owner to refresh their share link.")).toBeInTheDocument();
  });

  it("shows an empty state for a valid shared list with no items", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        ownerId: "alex-uid",
        ownerName: "Alex",
        items: [],
      }),
    });

    renderPublicSharedList();

    expect(await screen.findByRole("heading", { name: "Alex" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Bag is empty")).toBeInTheDocument();
    expect(
      screen.getByText("This shared list does not have any items yet."),
    ).toBeInTheDocument();
  });
});
