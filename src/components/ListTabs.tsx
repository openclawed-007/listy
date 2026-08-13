import React, { useState } from "react";
import { Plus } from "lucide-react";
import {
  MAX_CUSTOM_LISTS,
  MAX_LIST_NAME_LENGTH,
  type ListTab,
} from "../lib/userLists";

interface ListTabsProps {
  tabs: ListTab[];
  activeId: string;
  onSelect: (id: string) => void;
  canCreate: boolean;
  onCreate: (name: string) => void;
  onCreateBlocked: () => void;
}

const CreateForm: React.FC<{
  name: string;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ name, onNameChange, onSubmit, onCancel }) => (
  <form
    className="list-tab-create"
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    <input
      className="list-tab-create-input"
      value={name}
      onChange={(event) => onNameChange(event.target.value)}
      placeholder="List name"
      aria-label="New list name"
      maxLength={MAX_LIST_NAME_LENGTH}
      autoFocus
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    />
    <button type="submit" className="list-tab-create-save">
      Add
    </button>
  </form>
);

/** Tab strip + create control. Owns the draft create field. */
const ListTabs: React.FC<ListTabsProps> = ({
  tabs,
  activeId,
  onSelect,
  canCreate,
  onCreate,
  onCreateBlocked,
}) => {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const showStrip = tabs.length > 1;

  const cancelCreate = () => {
    setCreating(false);
    setName("");
  };

  const commitCreate = () => {
    onCreate(name);
    cancelCreate();
  };

  const startCreate = () => {
    if (!canCreate) {
      onCreateBlocked();
      return;
    }
    setCreating(true);
    setName("");
  };

  const createForm = creating ? (
    <CreateForm
      name={name}
      onNameChange={setName}
      onSubmit={commitCreate}
      onCancel={cancelCreate}
    />
  ) : null;

  if (!showStrip) {
    return (
      <div className="list-tabs list-tabs-solo" aria-label="Shopping lists">
        <button
          type="button"
          className="list-tab list-tab-add"
          onClick={startCreate}
          aria-label="New list"
          title="New list"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>New list</span>
        </button>
        {createForm}
      </div>
    );
  }

  return (
    <div className="list-tabs" aria-label="Shopping lists">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`list-tab ${activeId === tab.id ? "active" : ""}`}
          onClick={() => {
            onSelect(tab.id);
            cancelCreate();
          }}
          type="button"
          aria-pressed={activeId === tab.id}
        >
          {tab.name}
        </button>
      ))}
      {createForm ?? (
        <button
          type="button"
          className="list-tab list-tab-add"
          onClick={startCreate}
          aria-label={
            canCreate
              ? "New list"
              : `Limit of ${MAX_CUSTOM_LISTS} custom lists reached`
          }
          title={
            canCreate
              ? "New list"
              : `Limit of ${MAX_CUSTOM_LISTS} custom lists`
          }
          disabled={!canCreate}
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};

export default ListTabs;
