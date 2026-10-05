import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ShoppingItem } from "../lib/shoppingItem";
import type { ItemEditState } from "./ItemRow";
import ShoppingListItems from "./ShoppingListItems";

const milk: ShoppingItem = { id: "m", text: "Milk", completed: false, userId: "u", category: "Dairy & Eggs" };
const bread: ShoppingItem = { id: "b", text: "Bread", completed: false, userId: "u", category: "Bakery" };

const edit: ItemEditState = {
  editingId: null,
  text: "",
  quantity: "",
  category: "",
  note: "",
  onStart: vi.fn(),
  onTextChange: vi.fn(),
  onQuantityChange: vi.fn(),
  onCategoryChange: vi.fn(),
  onNoteChange: vi.fn(),
  onCommit: vi.fn(),
  onCancel: vi.fn(),
};

function renderList() {
  const handlers = { onToggle: vi.fn(), onDelete: vi.fn(), onToggleImportant: vi.fn() };
  render(
    <ShoppingListItems
      activeItems={[bread, milk]}
      doneItems={[]}
      activeGroups={[
        { category: "Bakery", items: [bread] },
        { category: "Dairy & Eggs", items: [milk] },
      ]}
      doneGroups={[]}
      sortMode="aisle"
      edit={edit}
      doneCollapsed={false}
      onToggleDoneCollapsed={vi.fn()}
      isSearching={false}
      activeListName="My List"
      {...handlers}
    />,
  );
  return handlers;
}

const rowOf = (text: string) => screen.getByText(text).closest(".item-row") as HTMLElement;

describe("ShoppingListItems row actions", () => {
  it("shows aisle headings with a count", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "Bakery 1" })).toBeInTheDocument();
  });

  it("opens one row's tray at a time and runs the chosen action", async () => {
    const { onDelete, onToggle } = renderList();

    await userEvent.click(screen.getByRole("button", { name: 'Actions for "Milk"' }));
    expect(rowOf("Milk")).toHaveClass("is-actions-open");

    await userEvent.click(screen.getByRole("button", { name: 'Actions for "Bread"' }));
    expect(rowOf("Bread")).toHaveClass("is-actions-open");
    expect(rowOf("Milk")).not.toHaveClass("is-actions-open");

    await userEvent.click(screen.getByRole("button", { name: 'Remove "Bread"' }));
    expect(onDelete).toHaveBeenCalledWith(bread);
    expect(rowOf("Bread")).not.toHaveClass("is-actions-open");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("closes an open tray instead of ticking when the row is tapped", async () => {
    const { onToggle } = renderList();
    await userEvent.click(screen.getByRole("button", { name: 'Actions for "Milk"' }));
    await userEvent.click(screen.getByRole("button", { name: /Mark as completed: Milk/ }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(rowOf("Milk")).not.toHaveClass("is-actions-open");

    await userEvent.click(screen.getByRole("button", { name: /Mark as completed: Milk/ }));
    expect(onToggle).toHaveBeenCalledWith(milk);
  });
});
