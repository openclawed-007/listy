import React, { useState } from "react";
import { MAX_LIST_NAME_LENGTH } from "../lib/userLists";

interface ListAdminControlsProps {
  listId: string;
  listName: string;
  isOwnedCustom: boolean;
  isSharedImport: boolean;
  showClearDone: boolean;
  onClearDone: () => void;
  onRename: (name: string) => void;
  onRequestDelete: () => void;
  onRequestRemoveShared: () => void;
}

/** Clear-done + rename/delete for the active list. */
const ListAdminControls: React.FC<ListAdminControlsProps> = ({
  listId,
  listName,
  isOwnedCustom,
  isSharedImport,
  showClearDone,
  onClearDone,
  onRename,
  onRequestDelete,
  onRequestRemoveShared,
}) => {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(listName);

  return (
    <div className="stats-actions">
      {showClearDone && (
        <button className="clear-done-btn" onClick={onClearDone} type="button">
          Clear done
        </button>
      )}
      {isSharedImport && (
        <button
          className="clear-done-btn"
          onClick={onRequestRemoveShared}
          type="button"
        >
          Remove list
        </button>
      )}
      {isOwnedCustom &&
        (renaming ? (
          <form
            key={listId}
            className="list-rename-form"
            onSubmit={(event) => {
              event.preventDefault();
              onRename(value);
              setRenaming(false);
            }}
          >
            <input
              className="list-rename-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={MAX_LIST_NAME_LENGTH}
              aria-label="Rename list"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRenaming(false);
                }
              }}
            />
            <button type="submit" className="list-admin-btn">
              Save
            </button>
          </form>
        ) : (
          <>
            <button
              className="list-admin-btn"
              type="button"
              onClick={() => {
                setValue(listName);
                setRenaming(true);
              }}
            >
              Rename
            </button>
            <button
              className="clear-done-btn"
              type="button"
              onClick={onRequestDelete}
            >
              Delete list
            </button>
          </>
        ))}
    </div>
  );
};

export default ListAdminControls;
