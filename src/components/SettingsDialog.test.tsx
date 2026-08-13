import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreferencesContext } from "../context/PreferencesContext.shared";
import { DEFAULT_REMINDER_SETTINGS } from "../lib/shoppingReminders";
import { DEFAULT_INTERFACE_PREFERENCES } from "../lib/userPreferences";
import SettingsDialog from "./SettingsDialog";

function renderSettings() {
  const persistUserSettings = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <PreferencesContext.Provider
      value={{
        interfacePrefs: DEFAULT_INTERFACE_PREFERENCES,
        reminderSettings: DEFAULT_REMINDER_SETTINGS,
        setInterfacePrefs: vi.fn(),
        setReminderSettingsLocal: vi.fn(),
        refreshFromCloud: vi.fn().mockResolvedValue(undefined),
        persistUserSettings,
      }}
    >
      <SettingsDialog userId="owner" onClose={onClose} />
    </PreferencesContext.Provider>,
  );
  return { persistUserSettings, onClose };
}

describe("SettingsDialog", () => {
  it("opens on Look and keeps share alerts with reminders", async () => {
    renderSettings();

    expect(screen.getByRole("tab", { name: "Look" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("On the list")).toBeInTheDocument();
    expect(screen.getByText("Tips")).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "Shared list alerts" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Reminders" }));
    expect(
      screen.getByRole("switch", { name: "Shared list alerts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Shopping-day banner" }),
    ).toBeInTheDocument();
  });

  it("saves a look toggle immediately", async () => {
    const { persistUserSettings } = renderSettings();

    await userEvent.click(screen.getByRole("switch", { name: "Progress bar" }));

    await waitFor(() => {
      expect(persistUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          interface: expect.objectContaining({ progressBar: false }),
        }),
      );
    });
  });

  it("hide-all turns off tips only", async () => {
    const { persistUserSettings } = renderSettings();

    await userEvent.click(screen.getByRole("button", { name: "Hide all" }));

    await waitFor(() => {
      expect(persistUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          interface: expect.objectContaining({
            emptyTips: false,
            addHints: false,
            onboardingCopy: false,
            sortHints: false,
            progressBar: true,
            importantStars: true,
            shareChangeNotices: false,
          }),
        }),
      );
    });
  });

  it("closes with Done", async () => {
    const { onClose } = renderSettings();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
