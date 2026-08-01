import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  LogIn,
  Moon,
  PackageOpen,
  Pencil,
  Plus,
  Sun,
  Trash2,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import BrandMark from "./BrandMark";
import { useAuth } from "../context/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import {
  DEFAULT_CATEGORY,
  formatQuantity,
  getDuplicateKey,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_QUANTITY_LENGTH,
  mergeQuantities,
  parseItemInput,
} from "../lib/itemInput";
import {
  createGuestId,
  readGuestItems,
  writeGuestItems,
  type GuestItem,
} from "../lib/guestItems";
import { groupItemsByCategory } from "../lib/shoppingItem";

const GuestList: React.FC = () => {
  const { user, loading } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [items, setItems] = useState<GuestItem[]>(readGuestItems);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const preview = useMemo(() => parseItemInput(value), [value]);

  useEffect(() => writeGuestItems(items), [items]);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  // Signed-in users belong on the synced list; guest items migrate there once.
  if (user) return <Navigate to="/" replace />;

  const addItem = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseItemInput(value);
    if (!parsed.text) return;

    const key = getDuplicateKey(parsed.text);
    const duplicate = items.find((item) => getDuplicateKey(item.text) === key);

    if (duplicate) {
      const quantity = mergeQuantities(duplicate.quantity, parsed.quantity);
      setItems((current) =>
        current.map((item) =>
          item.id === duplicate.id
            ? { ...item, completed: false, quantity }
            : item,
        ),
      );
      setMessage(
        `${duplicate.text} was already here${quantity ? ` — now ${formatQuantity(quantity)}` : ""}.`,
      );
    } else {
      setItems((current) => [
        {
          id: createGuestId(),
          text: parsed.text,
          completed: false,
          quantity: parsed.quantity,
          category: parsed.category,
          createdAt: Date.now(),
        },
        ...current,
      ]);
    }
    setValue("");
  };

  const startEdit = (item: GuestItem) => {
    setEditingId(item.id);
    setEditText(item.text);
    setEditQuantity(item.quantity ?? "");
    setEditCategory(item.category ?? "");
  };

  const commitEdit = () => {
    if (!editingId) return;
    const text = editText.trim().slice(0, MAX_ITEM_TEXT_LENGTH);
    if (!text) {
      setMessage("Item text cannot be empty.");
      return;
    }

    const quantity = editQuantity.trim().slice(0, MAX_QUANTITY_LENGTH);
    const category = editCategory.trim().slice(0, MAX_CATEGORY_LENGTH);

    setItems((current) =>
      current.map((item) =>
        item.id === editingId
          ? {
              ...item,
              text,
              quantity: quantity || undefined,
              category: category || undefined,
            }
          : item,
      ),
    );
    setEditingId(null);
  };

  const handleEditKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setEditingId(null);
    }
  };

  const active = items.filter((item) => !item.completed);
  const done = items.filter((item) => item.completed);
  const activeGroups = groupItemsByCategory(active);
  const doneGroups = groupItemsByCategory(done);
  const progress = items.length
    ? Math.round((done.length / items.length) * 100)
    : 0;

  const renderGroups = (
    groups: ReturnType<typeof groupItemsByCategory<GuestItem>>,
  ) =>
    groups.map((group) => (
      <div className="category-group" key={group.category}>
        {(groups.length > 1 || group.category !== DEFAULT_CATEGORY) && (
          <div className="category-heading">{group.category}</div>
        )}
        {group.items.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <div
              className={`item-row ${item.completed ? "completed" : ""} ${isEditing ? "is-editing" : ""}`}
              key={item.id}
            >
              <button
                className={`toggle-btn ${item.completed ? "is-checked" : ""}`}
                type="button"
                aria-pressed={item.completed}
                aria-label={`${item.completed ? "Mark as needed" : "Mark as completed"}: ${item.text}`}
                onClick={() => {
                  if (isEditing) return;
                  setItems((current) =>
                    current.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, completed: !entry.completed }
                        : entry,
                    ),
                  );
                }}
              >
                {item.completed && <Check size={13} strokeWidth={3} />}
              </button>

              {isEditing ? (
                <div
                  className="item-edit-fields"
                  onBlur={(event) => {
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node | null,
                      )
                    ) {
                      commitEdit();
                    }
                  }}
                >
                  <input
                    className="item-edit-input"
                    value={editText}
                    autoFocus
                    onChange={(event) => setEditText(event.target.value)}
                    maxLength={MAX_ITEM_TEXT_LENGTH}
                    onKeyDown={handleEditKeys}
                    aria-label="Edit item text"
                  />
                  <input
                    className="item-edit-input item-edit-meta"
                    value={editQuantity}
                    onChange={(event) => setEditQuantity(event.target.value)}
                    maxLength={MAX_QUANTITY_LENGTH}
                    onKeyDown={handleEditKeys}
                    placeholder="Qty"
                    aria-label="Edit item quantity"
                  />
                  <input
                    className="item-edit-input item-edit-meta"
                    value={editCategory}
                    onChange={(event) => setEditCategory(event.target.value)}
                    maxLength={MAX_CATEGORY_LENGTH}
                    onKeyDown={handleEditKeys}
                    placeholder="Aisle"
                    aria-label="Edit item category"
                  />
                </div>
              ) : (
                <button
                  className="item-content"
                  type="button"
                  onClick={() =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, completed: !entry.completed }
                          : entry,
                      ),
                    )
                  }
                >
                  <span className="item-text">{item.text}</span>
                  {item.quantity && (
                    <span className="item-qty">
                      {formatQuantity(item.quantity)}
                    </span>
                  )}
                </button>
              )}

              {!isEditing && (
                <button
                  className="edit-btn"
                  type="button"
                  aria-label={`Edit "${item.text}"`}
                  title="Edit item"
                  onClick={() => startEdit(item)}
                >
                  <Pencil size={14} />
                </button>
              )}

              <button
                className="delete-btn"
                type="button"
                aria-label={`Remove "${item.text}"`}
                onClick={() =>
                  setItems((current) =>
                    current.filter((entry) => entry.id !== item.id),
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    ));

  return (
    <div className="app-wrapper">
      <header className="navbar">
        <div className="navbar-content">
          <div className="nav-brand">
            <div className="nav-brand-icon">
              <BrandMark className="brand-mark" />
            </div>
            <span className="nav-brand-name">
              Cart<em>Link</em>
            </span>
          </div>
          <div className="user-actions">
            <span className="guest-badge">Guest</span>
            <button
              className="theme-toggle"
              type="button"
              onClick={toggle}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link
              className="theme-toggle"
              to="/login?redirect=/"
              aria-label="Sign in"
              title="Sign in"
            >
              <LogIn size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">My List</h1>
          <p className="guest-note">
            Saved only on this device.{" "}
            <Link to="/login?redirect=/">Sign in</Link> to share and sync —
            your items come with you.{" "}
            <Link to="/join">Have a share code?</Link>
          </p>
          {message && (
            <p className="form-success inline-error" role="status">
              {message}
            </p>
          )}
        </div>

        <form className="add-form" onSubmit={addItem}>
          <div className="add-primary-row">
            <input
              className="add-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Add an item…"
              aria-label="New shopping item"
              autoFocus
              maxLength={MAX_ITEM_TEXT_LENGTH}
              autoComplete="off"
            />
            <button
              className="add-btn"
              type="submit"
              disabled={!preview.text}
              aria-label="Add item"
            >
              <Plus size={22} />
            </button>
          </div>
          <p className="add-hint" aria-live="polite">
            {(preview.quantity || preview.category) && (
              <>
                <strong>{preview.text}</strong>
                {preview.quantity && (
                  <span className="add-hint-chip">
                    {formatQuantity(preview.quantity)}
                  </span>
                )}
                {preview.category && (
                  <span className="add-hint-chip">{preview.category}</span>
                )}
              </>
            )}
          </p>
        </form>

        {items.length > 0 && (
          <div className="list-summary">
            <div className="stats-bar">
              <span className="stats-text">
                <strong>{active.length}</strong> left
                {done.length > 0 && ` · ${done.length} done`}
              </span>
              {done.length > 0 && (
                <button
                  className="clear-done-btn"
                  type="button"
                  onClick={() =>
                    setItems((current) =>
                      current.filter((item) => !item.completed),
                    )
                  }
                >
                  Clear {done.length} done
                </button>
              )}
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={`${done.length} of ${items.length} items picked up`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty-state">
            <PackageOpen size={56} className="empty-icon" />
            <p className="empty-title">Ready when you are</p>
            <p className="empty-text">Add your first item above.</p>
            <p className="empty-tip">
              Try <code>2 milk</code> to add a quantity and aisle automatically.
            </p>
          </div>
        ) : (
          <div className="items-list">
            {active.length > 0 && renderGroups(activeGroups)}
            {done.length > 0 && (
              <>
                <div className="items-divider">
                  <span className="items-divider-label">Done</span>
                  <div className="items-divider-line" />
                </div>
                {renderGroups(doneGroups)}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default GuestList;
