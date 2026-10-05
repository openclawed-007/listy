import React, { useEffect, useState } from "react";
import { ChevronDown, PackageOpen } from "lucide-react";
import { DEFAULT_CATEGORY } from "../lib/itemInput";
import type { ListSortMode } from "../lib/listOrder";
import type { ShoppingItem } from "../lib/shoppingItem";
import { ItemRow, type ItemRowHandlers } from "./ItemRow";

type ItemGroup = { category: string; items: ShoppingItem[] };

interface Props extends Omit<ItemRowHandlers, "actionsOpenId" | "onActionsOpenChange"> {
  activeItems: ShoppingItem[];
  doneItems: ShoppingItem[];
  activeGroups: ItemGroup[];
  doneGroups: ItemGroup[];
  sortMode: ListSortMode;
  doneCollapsed: boolean;
  onToggleDoneCollapsed: () => void;
  isSearching: boolean;
  activeListName: string;
  /** Extra guidance under the empty state (custom/shared list actions). */
  emptyExtra?: React.ReactNode;
}

/** The open row-actions tray closes on any tap outside its row. */
function useActionsTray() {
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!openId) return undefined;
    const close = (event: PointerEvent) => {
      const row = (event.target as Element | null)?.closest?.("[data-item-id]");
      if (!row || (row as HTMLElement).dataset.itemId !== openId) setOpenId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openId]);

  return [openId, setOpenId] as const;
}

const ShoppingListItems: React.FC<Props> = ({
  activeItems,
  doneItems,
  activeGroups,
  doneGroups,
  sortMode,
  doneCollapsed,
  onToggleDoneCollapsed,
  isSearching,
  activeListName,
  emptyExtra,
  reorder,
  ...handlers
}) => {
  const [actionsOpenId, setActionsOpenId] = useActionsTray();
  const rowHandlers = { ...handlers, actionsOpenId, onActionsOpenChange: setActionsOpenId };

  const renderRows = (items: ShoppingItem[], groups: ItemGroup[], canReorder: boolean) => {
    const rowReorder = canReorder ? reorder : undefined;
    if (sortMode !== "aisle") {
      return items.map((item) => (
        <ItemRow key={item.id} item={item} reorder={rowReorder} {...rowHandlers} />
      ));
    }
    const showHeadings = groups.length > 1 || groups[0]?.category !== DEFAULT_CATEGORY;
    return groups.map((group) => (
      <div className="category-group" key={group.category}>
        {showHeadings && (
          <h3 className="category-heading">
            {group.category}{" "}
            <span className="category-count">{group.items.length}</span>
          </h3>
        )}
        {group.items.map((item) => (
          <ItemRow key={item.id} item={item} reorder={rowReorder} {...rowHandlers} />
        ))}
      </div>
    ));
  };

  if (activeItems.length + doneItems.length === 0) {
    return (
      <div className="empty-state">
        <PackageOpen size={40} className="empty-icon" strokeWidth={1.25} />
        <p className="empty-title">{isSearching ? "No matches" : "Ready when you are"}</p>
        <p className="empty-text">
          {isSearching
            ? `Press + to add it to ${activeListName}.`
            : "Add your first item above."}
        </p>
        {!isSearching && emptyExtra}
      </div>
    );
  }

  return (
    <div className="items-list">
      {activeItems.length > 0 && (
        <>
          {doneItems.length > 0 && (
            <div className="items-divider">
              <span className="items-divider-label">To get</span>
              <div className="items-divider-line" />
            </div>
          )}
          {renderRows(activeItems, activeGroups, true)}
        </>
      )}

      {doneItems.length > 0 && (
        <div className={`done-section ${doneCollapsed ? "is-collapsed" : ""}`}>
          <button
            type="button"
            className="items-divider items-divider-btn"
            onClick={onToggleDoneCollapsed}
            aria-expanded={!doneCollapsed}
          >
            <ChevronDown className="items-divider-chevron" size={14} strokeWidth={2.5} />
            <span className="items-divider-label">Done · {doneItems.length}</span>
            <div className="items-divider-line" />
          </button>
          {!doneCollapsed && renderRows(doneItems, doneGroups, false)}
        </div>
      )}
    </div>
  );
};

export default ShoppingListItems;
