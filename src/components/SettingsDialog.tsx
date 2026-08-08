import React, { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { usePreferences } from "../context/usePreferences";
import {
  enableRemindersWithPermission,
  promptAllowNotifications,
  sendTestNotification,
  syncReminderSchedule,
} from "../lib/reminderNotifications";
import {
  DEFAULT_REMINDER_SETTINGS,
  formatDaysLabel,
  formatTimeLabel,
  nextReminderPreview,
  normalizeReminderSettings,
  notificationBlockReason,
  notificationPermission,
  WEEKDAY_LABELS,
  type RemindWhen,
  type ShoppingReminderSettings,
} from "../lib/shoppingReminders";
import {
  allInterfaceOff,
  allInterfaceOn,
  countEnabledInterfacePrefs,
  DISPLAY_SCALE_OPTIONS,
  INTERFACE_PREF_OPTIONS,
  normalizeInterfacePreferences,
  type InterfacePreferences,
  type InterfaceToggleKey,
} from "../lib/userPreferences";

interface SettingsDialogProps {
  userId: string | null;
  onClose: () => void;
}

type SettingsTab = "reminders" | "interface";

const WHEN_OPTIONS: Array<{ id: RemindWhen; label: string }> = [
  { id: "day_of", label: "Day of" },
  { id: "day_before", label: "Day before" },
  { id: "both", label: "Both" },
];

const SettingsDialog: React.FC<SettingsDialogProps> = ({ onClose }) => {
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const {
    interfacePrefs,
    reminderSettings: storedReminders,
    persistUserSettings,
    refreshFromCloud,
  } = usePreferences();

  const [tab, setTab] = useState<SettingsTab>("reminders");
  const [reminders, setReminders] =
    useState<ShoppingReminderSettings>(storedReminders);
  const [iface, setIface] = useState<InterfacePreferences>(interfacePrefs);
  const [permission, setPermission] = useState(notificationPermission);
  const [status, setStatus] = useState("");
  const [notifStatus, setNotifStatus] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshFromCloud();
      if (cancelled) return;
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshFromCloud]);

  // Keep form in sync after cloud refresh settles.
  useEffect(() => {
    if (!loaded) return;
    setReminders(storedReminders);
    setIface(interfacePrefs);
  }, [loaded, storedReminders, interfacePrefs]);

  const preview = useMemo(() => nextReminderPreview(reminders), [reminders]);
  const block = notificationBlockReason();
  const enabledCount = countEnabledInterfacePrefs(iface);

  const toggleDay = (day: number) => {
    setReminders((current) => {
      const has = current.days.includes(day);
      const days = has
        ? current.days.filter((entry) => entry !== day)
        : [...current.days, day].sort((a, b) => a - b);
      return { ...current, days };
    });
  };

  const toggleIface = (id: InterfaceToggleKey) => {
    setIface((current) => ({ ...current, [id]: !current[id] }));
  };

  // Live preview: apply the picked scale immediately so the effect is visible
  // behind the dialog. Reverts to the saved value if the dialog closes
  // without saving.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ui-scale",
      String(iface.displayScale / 100),
    );
  }, [iface.displayScale]);

  const savedScale = interfacePrefs.displayScale;
  useEffect(
    () => () => {
      document.documentElement.style.setProperty(
        "--ui-scale",
        String(savedScale / 100),
      );
    },
    [savedScale],
  );

  const handleSave = async () => {
    setSaving(true);
    setStatus("");
    try {
      let nextReminders = normalizeReminderSettings(reminders);
      const nextIface = normalizeInterfacePreferences(iface);

      if (nextReminders.enabled) {
        if (nextReminders.days.length === 0) {
          setTab("reminders");
          setStatus("Pick at least one shopping day.");
          setSaving(false);
          return;
        }

        const result = await enableRemindersWithPermission(nextReminders);
        nextReminders = result.settings;
        setPermission(result.permission);
        setReminders(nextReminders);

        await persistUserSettings({
          interface: nextIface,
          shoppingReminders: nextReminders,
        });
        await syncReminderSchedule(nextReminders);

        const reason = notificationBlockReason();
        if (reason === "insecure_context") {
          setStatus(
            "Saved. OS alerts need HTTPS or localhost — the in-app banner still works if enabled.",
          );
        } else if (result.permission === "denied") {
          setStatus(
            "Saved. Notifications are blocked for this site — the in-app banner still works if enabled.",
          );
        } else if (result.permission === "unsupported") {
          setStatus("Saved. System alerts unavailable; preferences kept.");
        } else if (result.mode === "triggers") {
          setStatus(
            `Saved. ${result.scheduled} reminder${result.scheduled === 1 ? "" : "s"} scheduled.`,
          );
        } else {
          setStatus("Saved.");
        }
        if (nextIface.shareChangeNotices) {
          const { ensureShareNotifyPermission } = await import(
            "../lib/shareChangeNotifications"
          );
          await ensureShareNotifyPermission();
        }
      } else {
        await persistUserSettings({
          interface: nextIface,
          shoppingReminders: nextReminders,
        });
        await syncReminderSchedule(nextReminders);
        if (nextIface.shareChangeNotices) {
          const { ensureShareNotifyPermission } = await import(
            "../lib/shareChangeNotifications"
          );
          const ok = await ensureShareNotifyPermission();
          setStatus(
            ok
              ? "Saved."
              : "Saved. Allow notifications for this site to get shared-list alerts.",
          );
        } else {
          setStatus("Saved.");
        }
      }
    } catch (error) {
      console.error("Save settings error:", error);
      setStatus("Couldn't save settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const ready = !reminders.enabled || reminders.days.length > 0;

  const refreshPermission = () => {
    setPermission(notificationPermission());
  };

  const handleAllowNotifications = async () => {
    setNotifBusy(true);
    setNotifStatus("");
    try {
      const result = await promptAllowNotifications();
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
      refreshPermission();
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
      text: "We’ll ask for notification permission when you save with reminders on.",
    };
  })();

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
            <p>Reminders & how the app looks</p>
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
            aria-selected={tab === "reminders"}
            className={`settings-tab ${tab === "reminders" ? "active" : ""}`}
            onClick={() => setTab("reminders")}
          >
            Reminders
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "interface"}
            className={`settings-tab ${tab === "interface" ? "active" : ""}`}
            onClick={() => setTab("interface")}
          >
            Interface
          </button>
        </div>

        {!loaded ? (
          <div className="settings-loading" aria-busy="true">
            <div className="loading-spinner" />
          </div>
        ) : (
          <>
            <div className="settings-sheet-body">
              {tab === "reminders" ? (
                <>
                  <section className="settings-card">
                    <div className="settings-toggle-row">
                      <span className="settings-toggle-copy">
                        <strong>Shopping reminders</strong>
                        <span>
                          Nudge you before or on the days you usually shop.
                        </span>
                      </span>
                      <button
                        type="button"
                        className={`settings-switch ${reminders.enabled ? "is-on" : ""}`}
                        role="switch"
                        aria-checked={reminders.enabled}
                        onClick={() =>
                          setReminders((current) => ({
                            ...current,
                            enabled: !current.enabled,
                          }))
                        }
                      >
                        <span className="settings-switch-knob" />
                      </button>
                    </div>
                  </section>

                  <section
                    className={`settings-card ${reminders.enabled ? "" : "is-disabled"}`}
                    aria-disabled={!reminders.enabled}
                  >
                    <h3 className="settings-card-title">Schedule</h3>

                    <div className="settings-block">
                      <p className="settings-label">Days you shop</p>
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
                        <span>Usual shop time</span>
                        <input
                          type="time"
                          value={reminders.shopTime}
                          disabled={!reminders.enabled}
                          onChange={(event) =>
                            setReminders((current) => ({
                              ...current,
                              shopTime: event.target.value || current.shopTime,
                            }))
                          }
                        />
                      </label>
                      <label className="settings-field">
                        <span>Remind me at</span>
                        <input
                          type="time"
                          value={reminders.notifyTime}
                          disabled={!reminders.enabled}
                          onChange={(event) =>
                            setReminders((current) => ({
                              ...current,
                              notifyTime:
                                event.target.value || current.notifyTime,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </section>

                  <section
                    className={`settings-card ${reminders.enabled ? "" : "is-disabled"}`}
                    aria-disabled={!reminders.enabled}
                  >
                    <h3 className="settings-card-title">Notify</h3>
                    <p className="settings-label">
                      When relative to shopping day
                    </p>
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
                              setReminders((current) => ({
                                ...current,
                                when: option.id,
                              }))
                            }
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

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

                    {reminders.enabled &&
                      reminders.days.length > 0 &&
                      preview && (
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
                </>
              ) : (
                <>
                  <section className="settings-card">
                    <div className="settings-toggle-row">
                      <span className="settings-toggle-copy">
                        <strong>Display scale</strong>
                        <span>
                          How large the list appears on big screens. Phones
                          and tablets keep the compact layout.
                        </span>
                      </span>
                    </div>
                    <div
                      className="settings-segment is-four"
                      role="group"
                      aria-label="Display scale"
                    >
                      {DISPLAY_SCALE_OPTIONS.map((option) => {
                        const active = iface.displayScale === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`settings-segment-btn ${active ? "active" : ""}`}
                            aria-pressed={active}
                            onClick={() =>
                              setIface((current) => ({
                                ...current,
                                displayScale: option.value,
                              }))
                            }
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="settings-card">
                    <div className="settings-toggle-row">
                      <span className="settings-toggle-copy">
                        <strong>Coaching & chrome</strong>
                        <span>
                          Turn off tips and helper text once you know the app.
                          Core actions stay available.
                        </span>
                      </span>
                    </div>
                    <div className="settings-preset-row">
                      <button
                        type="button"
                        className="settings-preset-btn"
                        onClick={() =>
                          setIface((current) => ({
                            ...allInterfaceOn(),
                            displayScale: current.displayScale,
                          }))
                        }
                      >
                        Show all
                      </button>
                      <button
                        type="button"
                        className="settings-preset-btn"
                        onClick={() =>
                          setIface((current) => ({
                            ...allInterfaceOff(),
                            displayScale: current.displayScale,
                          }))
                        }
                      >
                        Hide all
                      </button>
                      <span className="settings-preset-count">
                        {enabledCount} of {INTERFACE_PREF_OPTIONS.length} on
                      </span>
                    </div>
                  </section>

                  <section className="settings-card settings-card-list">
                    <h3 className="settings-card-title">Options</h3>
                    <ul className="settings-pref-list">
                      {INTERFACE_PREF_OPTIONS.map((option) => {
                        const on = iface[option.id];
                        return (
                          <li key={option.id}>
                            <label className="settings-pref-row">
                              <span className="settings-toggle-copy">
                                <strong>{option.label}</strong>
                                <span>{option.description}</span>
                              </span>
                              <button
                                type="button"
                                className={`settings-switch ${on ? "is-on" : ""}`}
                                role="switch"
                                aria-checked={on}
                                aria-label={option.label}
                                onClick={() => toggleIface(option.id)}
                              >
                                <span className="settings-switch-knob" />
                              </button>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <p className="settings-inline-note">
                    Errors, confirmations, and essential labels are never hidden.
                  </p>
                </>
              )}

              {status && (
                <p className="settings-status" role="status">
                  {status}
                </p>
              )}
            </div>

            <footer className="settings-sheet-footer">
              <p className="settings-footnote">
                Preferences save on this device
                {tab === "reminders"
                  ? " and sync when signed in. Install the app for the most reliable reminders."
                  : " and sync when signed in."}
              </p>
              <div className="settings-actions">
                <button
                  type="button"
                  className="settings-secondary-btn"
                  onClick={onClose}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="settings-primary-btn"
                  disabled={saving || (tab === "reminders" && !ready)}
                  onClick={() => void handleSave()}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsDialog;

export { DEFAULT_REMINDER_SETTINGS };
