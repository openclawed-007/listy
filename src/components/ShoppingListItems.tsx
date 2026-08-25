import { ChevronDown, ChevronRight, PackageOpen } from "lucide-react";
import { DEFAULT_CATEGORY } from "../lib/itemInput";
import type { ListSortMode } from "../lib/listOrder";
import type { ShoppingItem } from "../lib/shoppingItem";
import { CategoryGroup, ItemRow, type ItemEditState, type ItemReorderState } from "./ItemRow";

type ShoppingItemGroup = { category: string; items: ShoppingItem[] };

interface Props {
  activeItems: ShoppingItem[];
  doneItems: ShoppingItem[];
  activeGroups: ShoppingItemGroup[];
  doneGroups: ShoppingItemGroup[];
  sortMode: ListSortMode;
  edit: ItemEditState;
  reorder: ItemReorderState;
  doneCollapsed: boolean;
  isSearching: boolean;
  totalCount: number;
  activeListName: string;
  emptyTips: boolean;
  importantStars: boolean;
  customList: boolean;
  sharedList: boolean;
  onToggleDone: () => void;
  onToggle: (id: string, completed: boolean, item?: ShoppingItem) => void;
  onImportant: (id: string, important: boolean) => void;
  onDelete: (id: string) => void;
  onDeleteList: () => void;
  onRemoveList: () => void;
}

export default function ShoppingListItems(props: Props) {
  const {
    activeItems, doneItems, activeGroups, doneGroups, sortMode, edit, reorder,
    doneCollapsed, isSearching, totalCount, activeListName, emptyTips,
    importantStars, customList, sharedList, onToggleDone, onToggle,
    onImportant, onDelete, onDeleteList, onRemoveList,
  } = props;
  const count = activeItems.length + doneItems.length;
  const renderRows = (items: ShoppingItem[], groups: ShoppingItemGroup[], canReorder: boolean) =>
    sortMode === "aisle"
      ? groups.map((group) => <CategoryGroup key={group.category} group={group} showHeading={groups.length > 1 || group.category !== DEFAULT_CATEGORY} edit={edit} reorder={canReorder ? reorder : undefined} onToggle={onToggle} onToggleImportant={importantStars ? onImportant : undefined} onDelete={onDelete} />)
      : items.map((item, index) => <ItemRow key={item.id} item={item} index={index} edit={edit} reorder={canReorder ? reorder : undefined} onToggle={onToggle} onToggleImportant={importantStars ? onImportant : undefined} onDelete={onDelete} />);

  if (count === 0) {
    return <div className="empty-state"><PackageOpen size={40} className="empty-icon" strokeWidth={1.25} /><p className="empty-title">{isSearching ? "No matches" : totalCount === 0 ? "Ready when you are" : "Nothing here"}</p><p className="empty-text">{isSearching ? "No matches. Press + to add this to the list." : totalCount === 0 ? "Add your first item above." : `Nothing left on ${activeListName}.`}</p>{!isSearching && totalCount === 0 && emptyTips && !customList && <p className="empty-tip">Try <code>2 milk</code> to add a quantity and aisle automatically.</p>}{!isSearching && totalCount === 0 && customList && <p className="empty-tip">Don&apos;t need this list? <button type="button" className="empty-tip-link" onClick={onDeleteList}>Delete list</button></p>}{!isSearching && totalCount === 0 && sharedList && <p className="empty-tip">Done with this shared list? <button type="button" className="empty-tip-link" onClick={onRemoveList}>Remove list</button></p>}</div>;
  }

  return <div className="items-list">{activeItems.length > 0 && <>{doneItems.length > 0 && <div className="items-divider"><span className="items-divider-label">To get</span><div className="items-divider-line" /></div>}{renderRows(activeItems, activeGroups, true)}</>}{doneItems.length > 0 && <div className="done-section"><button type="button" className="items-divider items-divider-btn" onClick={onToggleDone} aria-expanded={!doneCollapsed}>{doneCollapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}<span className="items-divider-label">Done · {doneItems.length}</span><div className="items-divider-line" /></button>{!doneCollapsed && renderRows(doneItems, doneGroups, false)}</div>}</div>;
}
