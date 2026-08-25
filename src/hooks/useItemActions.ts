import { useMemo, useState } from "react";
import type { ItemEditState } from "../components/ItemRow";

export type SaveItemDetails = (
  id: string,
  text: string,
  quantity: string,
  category: string,
  note: string,
) => Promise<boolean>;

/** Owns item-edit interaction state independently from list rendering/storage. */
export function useItemActions(saveItemDetails: SaveItemDetails) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");

  const edit = useMemo<ItemEditState>(() => ({
    editingId,
    text,
    quantity,
    category,
    note,
    onStart: (item) => {
      setEditingId(item.id);
      setText(item.text);
      setQuantity(item.quantity ?? "");
      setCategory(item.category ?? "");
      setNote(item.note ?? "");
    },
    onTextChange: setText,
    onQuantityChange: setQuantity,
    onCategoryChange: setCategory,
    onNoteChange: setNote,
    onCommit: async () => {
      if (!editingId) return;
      if (await saveItemDetails(editingId, text, quantity, category, note)) {
        setEditingId(null);
      }
    },
    onCancel: () => setEditingId(null),
  }), [category, editingId, note, quantity, saveItemDetails, text]);

  return { edit, editingId };
}
