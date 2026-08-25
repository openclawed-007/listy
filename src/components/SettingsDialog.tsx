import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { usePreferences } from "../context/usePreferences";
import {
  enableRemindersWithPermission,
  sendTestNotification,
  syncReminderSchedule,
} from "../lib/reminderNotifications";
import {
  formatDaysLabel,
  formatTimeLabel,
  nextReminderPreview,
  normalizeReminderSettings,
  notificationBlockReason,
  notificationPermission,
  requestNotificationPermission,
  WEEKDAY_LABELS,
  type RemindWhen,
  type ShoppingReminderSettings,
} from "../lib/shoppingReminders";
import {
  normalizeInterfacePreferences,
  type InterfacePreferences,
} from "../lib/userPreferences";
import { PrefSwitch } from "./SettingsPrefGroup";
import SettingsLookPanel from "./SettingsLookPanel";

interface SettingsDialogProps {
  userId: string | null;
  onClose: () => void;
}

type SettingsTab = "look" | "reminders";

const WHEN_OPTIONS: Array<{ id: RemindWhen; label: string }> = [
  { id: "day_of", label: "Same day" },
  { id: "day_before", label: "Day before" },
  { id: "both", label: "Both" },
];

const SAVE_DEBOUNCE_MS = 400;

const SettingsDialog: React.FC<SettingsDialogProps> = ({ onClose }) => {
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const {
    interfacePrefs,
    reminderSettings: storedReminders,
    persistUserSettings,
    refreshFromCloud,
  } = usePreferences();

  const [tab, setTab] = useState<SettingsTab>("look");
  const [reminders, setReminders] =
    useState<ShoppingReminderSettings>(storedReminders);
  const [iface, setIface] = useState<InterfacePreferences>(interfacePrefs);
  const [permission, setPermission] = useState(notificationPermission);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [notifStatus, setNotifStatus] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const persistSeq = useRef(0);
  const pendingRef = useRef({ iface, reminders });
  pendingRef.current = { iface, reminders };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshFromCloud();
      if (cancelled || dirtyRef.current) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshFromCloud]);

  useEffect(() => {
    if (dirtyRef.current) return;
    setReminders(storedReminders);
    setIface(interfacePrefs);
  }, [interfacePrefs, storedReminders]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ui-scale",
      String(iface.displayScale / 100),
    );
  }, [iface.displayScale]);

  const preview = useMemo(() => nextReminderPreview(reminders), [reminders]);
  const block = notificationBlockReason();

  const commit = async (
    nextIface: InterfacePreferences,
    nextReminders: ShoppingReminderSettings,
    options: { requestReminderPermission?: boolean; requestSharePermission?: boolean } = {},
  ) => {
    const seq = ++persistSeq.current;
    setSaveState("saving");
    try {
      let remindersToSave = normalizeReminderSettings(nextReminders);
      const ifaceToSave = normalizeInterfacePreferences(nextIface);

      if (remindersToSave.enabled && remindersToSave.days.length === 0) {
        remindersToSave = {
          ...remindersToSave,
          days: [new Date().getDay()],
        };
        setReminders(remindersToSave);
      }

      if (options.requestReminderPermission && remindersToSave.enabled) {
        const result = await enableRemindersWithPermission(remindersToSave);
        if (seq !== persistSeq.current) return;
        remindersToSave = result.settings;
        setPermission(result.permission);
        setReminders(remindersToSave);
      }

      await persistUserSettings({
        interface: ifaceToSave,
        shoppingReminders: remindersToSave,
      });
      await syncReminderSchedule(remindersToSave);

      if (options.requestSharePermission && ifaceToSave.shareChangeNotices) {
        const { ensureShareNotifyPermission } = await import(
          "../lib/shareChangeNotifications"
        );
        await ensureShareNotifyPermission();
        setPermission(notificationPermission());
      }

      if (seq !== persistSeq.current) return;
      setSaveState("saved");
    } catch (error) {
      console.error("Save settings error:", error);
      if (seq !== persistSeq.current) return;
      setSaveState("error");
    }
  };

  const queueSave = (
    nextIface: InterfacePreferences,
    nextReminders: ShoppingReminderSettings,
    mode: "now" | "debounce" = "now",
    options?: Parameters<typeof commit>[2],
  ) => {
    dirtyRef.current = true;
    pendingRef.current = { iface: nextIface, reminders: nextReminders };
    window.clearTimeout(saveTimerRef.current);
    if (mode === "now") {
      void commit(nextIface, nextReminders, options);
      return;
    }
    saveTimerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current;
      void commit(pending.iface, pending.reminders, options);
    }, SAVE_DEBOUNCE_MS);
  };

  useEffect(
    () => () => {
      window.clearTimeout(saveTimerRef.current);
      if (!dirtyRef.current) return;
      const pending = pendingRef.current;
      void persistUserSettings({
        interface: normalizeInterfacePreferences(pending.iface),
        shoppingReminders: normalizeReminderSettings(pending.reminders),
      });
    },
    [persistUserSettings],
  );

  const updateReminders = (
    next: ShoppingReminderSettings,
    mode: "now" | "debounce" = "now",
    options?: Parameters<typeof commit>[2],
  ) => {
    setReminders(next);
    queueSave(iface, next, mode, options);
  };

  const updateIface = (
    next: InterfacePreferences,
    options?: Parameters<typeof commit>[2],
  ) => {
    setIface(next);
    queueSave(next, reminders, "now", options);
  };

  const toggleDay = (day: number) => {
    const has = reminders.days.includes(day);
    if (has && reminders.days.length === 1) return;
    const days = has
      ? reminders.days.filter((entry) => entry !== day)
      : [...reminders.days, day].sort((a, b) => a - b);
    updateReminders({ ...reminders, days });
  };

  const toggleReminders = () => {
    const enabled = !reminders.enabled;
    const days =
      enabled && reminders.days.length === 0
        ? [new Date().getDay()]
        : reminders.days;
    updateReminders(
      { ...reminders, enabled, days },
      "now",
      enabled ? { requestReminderPermission: true } : undefined,
    );
  };

  const permissionCopy = (() => {
    if (block === "granted" || permission === "granted") {
      return {
        ok: true,
        text: "Browser notifications allowed on this device.",
      };
    }
    if (block === "insecure_context") {
      return {
        ok: false,
        text: "This page is HTTP on a network address. System alerts need HTTPS or localhost.",
      };
    }
    if (block === "denied" || permission === "denied") {
      return {
        ok: false,
        text: "Notifications blocked for this site. Allow them in browser settings.",
      };
    }
    if (block === "unsupported" || permission === "unsupported") {
      return {
        ok: false,
        text: "This browser doesn’t support system notifications.",
      };
    }
    return {
      ok: false,
      text: "Allow notifications if you want shopping nudges or shared-list alerts.",
    };
  })();

  const handleAllowNotifications = async () => {
    setNotifBusy(true);
    setNotifStatus("");
    try {
      const result = await requestNotificationPermission();
      setPermission(result);
      const reason = notificationBlockReason();
      if (result === "granted") {
        setNotifStatus("Notifications allowed for this site.");
      } else if (reason === "insecure_context") {
        setNotifStatus(
          "This page needs HTTPS or localhost before the browser will allow notifications.",
        );
      } else if (result === "denied") {
        setNotifStatus(
          "Blocked. Open the browser’s site settings (lock icon) and allow notifications for this site.",
        );
      } else if (result === "unsupported") {
        setNotifStatus("This browser doesn’t support notifications.");
      } else {
        setNotifStatus("Permission was not granted yet.");
      }
    } finally {
      setNotifBusy(false);
    }
  };

  const handleTestNotification = async () => {
    setNotifBusy(true);
    setNotifStatus("");
    try {
      const result = await sendTestNotification();
      setPermission(notificationPermission());
      if (result.ok) {
        setNotifStatus("Test notification sent — check your device.");
        return;
      }
      if (result.reason === "insecure_context") {
        setNotifStatus(
          "Can’t send a test on this HTTP network URL. Use HTTPS or localhost.",
        );
      } else if (result.reason === "denied") {
        setNotifStatus(
          "Notifications are blocked. Tap “Allow notifications” or change site settings.",
        );
      } else if (result.reason === "unsupported") {
        setNotifStatus("This browser doesn’t support notifications.");
      } else if (result.reason === "default") {
        setNotifStatus("Allow notifications first, then try the test again.");
      } else {
        setNotifStatus("Couldn’t send a test notification.");
      }
    } finally {
      setNotifBusy(false);
    }
  };

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "error"
        ? "Couldn’t save. Try again."
        : saveState === "saved"
          ? "Saved on this device. Syncs when signed in."
          : "Changes save as you go, and sync when signed in.";

  return (
    <div
      className="modal-backdrop settings-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="settings-modal reminder-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-sheet-header">
          <div className="settings-sheet-heading">
            <h2 id="settings-title">Settings</h2>
            <p>How the list looks, and when to nudge you</p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
        </header>

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "look"}
            className={`settings-tab ${tab === "look" ? "active" : ""}`}
            onClick={() => setTab("look")}
          >
            Look
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "reminders"}
            className={`settings-tab ${tab === "reminders" ? "active" : ""}`}
            onClick={() => setTab("reminders")}
          >
            Reminders
          </button>
        </div>

        <div className="settings-sheet-body">
          {tab === "look" ? (
            <SettingsLookPanel prefs={iface} onChange={updateIface} />
          ) : (
            <>
              <section className="settings-card">
                <div className="settings-toggle-row">
                  <span className="settings-toggle-copy">
                    <strong>Shopping reminders</strong>
                    <span>
                      A nudge before or on the days you usually shop.
                    </span>
                  </span>
                  <button
                    type="button"
                    className={`settings-switch ${reminders.enabled ? "is-on" : ""}`}
                    role="switch"
                    aria-checked={reminders.enabled}
                    aria-label="Shopping reminders"
                    onClick={toggleReminders}
                  >
                    <span className="settings-switch-knob" />
                  </button>
                </div>
              </section>

              <section
                className={`settings-card ${reminders.enabled ? "" : "is-disabled"}`}
                aria-disabled={!reminders.enabled}
              >
                <h3 className="settings-card-title">When</h3>

                <div className="settings-block">
                  <p className="settings-label">Shopping days</p>
                  <div
                    className="settings-day-grid"
                    role="group"
                    aria-label="Shopping days"
                  >
                    {WEEKDAY_LABELS.map((entry) => {
                      const active = reminders.days.includes(entry.day);
                      return (
                        <button
                          key={entry.day}
                          type="button"
                          className={`settings-day-chip ${active ? "active" : ""}`}
                          aria-pressed={active}
                          disabled={!reminders.enabled}
                          onClick={() => toggleDay(entry.day)}
                        >
                          {entry.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="settings-field-row">
                  <label className="settings-field">
                    <span>You shop around</span>
                    <input
                      type="time"
                      value={reminders.shopTime}
                      disabled={!reminders.enabled}
                      onChange={(event) =>
                        updateReminders(
                          {
                            ...reminders,
                            shopTime: event.target.value || reminders.shopTime,
                          },
                          "debounce",
                        )
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Nudge at</span>
                    <input
                      type="time"
                      value={reminders.notifyTime}
                      disabled={!reminders.enabled}
                      onChange={(event) =>
                        updateReminders(
                          {
                            ...reminders,
                            notifyTime:
                              event.target.value || reminders.notifyTime,
                          },
                          "debounce",
                        )
                      }
                    />
                  </label>
                </div>

                <p className="settings-label">Relative to shopping day</p>
                <div
                  className="settings-segment"
                  role="group"
                  aria-label="When to notify"
                >
                  {WHEN_OPTIONS.map((option) => {
                    const active = reminders.when === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`settings-segment-btn ${active ? "active" : ""}`}
                        aria-pressed={active}
                        disabled={!reminders.enabled}
                        onClick={() =>
                          updateReminders({ ...reminders, when: option.id })
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {reminders.enabled && reminders.days.length > 0 && preview && (
                  <p className="settings-preview">
                    <strong>Next</strong>
                    <span>
                      {preview.title} ·{" "}
                      {new Date(preview.at).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="settings-preview-sub">
                      {formatDaysLabel(reminders.days)} · shop around{" "}
                      {formatTimeLabel(reminders.shopTime)}
                    </span>
                  </p>
                )}
              </section>

              <section className="settings-card settings-card-list">
                <h3 className="settings-card-title">Also notify</h3>
                <ul className="settings-pref-list">
                  <li>
                    <PrefSwitch
                      label="Shopping-day banner"
                      description="In-app strip on days you usually shop."
                      on={iface.shoppingBanners}
                      onToggle={() =>
                        updateIface({
                          ...iface,
                          shoppingBanners: !iface.shoppingBanners,
                        })
                      }
                    />
                  </li>
                  <li>
                    <PrefSwitch
                      label="Shared list alerts"
                      description="Notify when someone updates a list you share."
                      on={iface.shareChangeNotices}
                      onToggle={() =>
                        updateIface(
                          {
                            ...iface,
                            shareChangeNotices: !iface.shareChangeNotices,
                          },
                          !iface.shareChangeNotices
                            ? { requestSharePermission: true }
                            : undefined,
                        )
                      }
                    />
                  </li>
                </ul>
              </section>

              <section className="settings-card">
                <h3 className="settings-card-title">Notifications</h3>
                <div
                  className={`settings-permission ${permissionCopy.ok ? "is-ok" : ""}`}
                  role="status"
                >
                  {permissionCopy.ok ? (
                    <Bell size={15} />
                  ) : (
                    <BellOff size={15} />
                  )}
                  <span>{permissionCopy.text}</span>
                </div>
                <div className="settings-notif-actions">
                  <button
                    type="button"
                    className="settings-notif-btn"
                    disabled={notifBusy}
                    onClick={() => void handleAllowNotifications()}
                  >
                    <Bell size={14} strokeWidth={2.25} />
                    Allow notifications
                  </button>
                  <button
                    type="button"
                    className="settings-notif-btn is-secondary"
                    disabled={notifBusy}
                    onClick={() => void handleTestNotification()}
                  >
                    Send test
                  </button>
                </div>
                {notifStatus && (
                  <p className="settings-notif-status" role="status">
                    {notifStatus}
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="settings-sheet-footer">
          <p
            className={`settings-footnote ${saveState === "error" ? "is-error" : ""}`}
            role="status"
          >
            {saveLabel}
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="settings-primary-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SettingsDialog;
