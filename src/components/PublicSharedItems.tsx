import { Check, PackageOpen, Trash2 } from "lucide-react";
import { DEFAULT_CATEGORY, formatQuantity } from "../lib/itemInput";
import type { PublicItem } from "../lib/publicSharedListModel";

interface Props {
  items: PublicItem[];
  groups: Array<{ category: string; items: PublicItem[] }>;
  doneCount: number;
  progress: number;
  displayError: string;
  emptyTitle: string;
  emptyText: string;
  ownerName: string;
  ticksAreLocal: boolean;
  progressBar: boolean;
  onboardingCopy: boolean;
  importantStars: boolean;
  canRemove: boolean;
  onToggle: (item: PublicItem) => void;
  onRemove: (item: PublicItem) => void;
  onResetTicks: () => void;
}

export default function PublicSharedItems({
  items, groups, doneCount, progress, displayError, emptyTitle, emptyText,
  ownerName, ticksAreLocal, progressBar, onboardingCopy, importantStars,
  canRemove, onToggle, onRemove, onResetTicks,
}: Props) {
  if (items.length === 0) {
    return <div className="empty-state"><PackageOpen size={40} className="empty-icon" strokeWidth={1.25} />{!displayError && <p className="empty-title">{emptyTitle}</p>}<p className="empty-text">{emptyText}</p></div>;
  }

  return <>
    <div className="list-summary">
      <div className="list-meta-row">
        <span className="stats-text"><strong>{items.length - doneCount}</strong> left{doneCount > 0 && ` · ${doneCount} done`}</span>
        <div className="stats-actions">{ticksAreLocal && doneCount > 0 && <button className="clear-done-btn" type="button" onClick={onResetTicks}>Reset ticks</button>}</div>
      </div>
      {progressBar && <div className="progress-track" role="progressbar" aria-label={`${doneCount} of ${items.length} items picked up`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="progress-fill" style={{ width: `${progress}%` }} /></div>}
    </div>
    {ticksAreLocal && onboardingCopy && <p className="local-ticks-note">Ticking items keeps your place on this device. It does not change the list for {ownerName}.</p>}
    <div className="items-list">
      {groups.map((group) => <div className="category-group" key={group.category}>
        {(groups.length > 1 || group.category !== DEFAULT_CATEGORY) && <h3 className="category-heading">{group.category}</h3>}
        {group.items.map((item) => <div key={item.id} className={`item-row public-item-row ${item.completed ? "completed" : ""} ${importantStars && item.important ? "is-important" : ""}`}>
          <button className={`toggle-btn ${item.completed ? "is-checked" : ""}`} onClick={() => onToggle(item)} type="button" aria-pressed={item.completed} aria-label={item.completed ? `Mark "${item.text}" as needed` : `Mark "${item.text}" as completed`}>{item.completed && <Check size={13} strokeWidth={3} />}</button>
          <button className="item-content public-item-content" onClick={() => onToggle(item)} type="button" aria-pressed={item.completed} aria-label={item.important ? `Important: ${item.text}${item.note ? ` — ${item.note}` : ""}` : `${item.text}${item.note ? ` — ${item.note}` : ""}`}>
            <span className="item-main-line"><span className="item-text">{item.text}</span>{item.quantity && <span className="item-qty">{formatQuantity(item.quantity)}</span>}{importantStars && item.important && <span className="item-important-badge" aria-hidden="true" title="Important">★</span>}</span>
            {item.note && <span className="item-note" title={item.note}>{item.note}</span>}
          </button>
          {canRemove && <button className="delete-btn" onClick={() => onRemove(item)} title="Remove item" type="button" aria-label={`Remove "${item.text}"`}><Trash2 size={15} /></button>}
        </div>)}
      </div>)}
    </div>
  </>;
}
