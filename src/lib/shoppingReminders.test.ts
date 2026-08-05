import { describe, expect, it } from "vitest";
import {
  buildReminderSchedule,
  dueReminders,
  formatDaysLabel,
  formatTimeLabel,
  normalizeReminderSettings,
  shoppingDayBanner,
  toLocalDateKey,
  type ShoppingReminderSettings,
} from "./shoppingReminders";

const base: ShoppingReminderSettings = {
  enabled: true,
  days: [6], // Saturday
  shopTime: "17:00",
  when: "both",
  notifyTime: "09:00",
};

describe("shoppingReminders", () => {
  it("normalizes bad input to safe defaults", () => {
    expect(normalizeReminderSettings(null).enabled).toBe(false);
    expect(
      normalizeReminderSettings({
        enabled: true,
        days: [1, 1, 9, "x", 3],
        shopTime: "25:99",
        when: "nope",
        notifyTime: "08:30",
      }).days,
    ).toEqual([1, 3]);
  });

  it("formats times and days for humans", () => {
    expect(formatTimeLabel("09:05")).toBe("9:05 AM");
    expect(formatTimeLabel("17:00")).toBe("5:00 PM");
    expect(formatDaysLabel([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(formatDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });

  it("schedules day-of and day-before for selected weekdays", () => {
    // Friday 2026-08-07 10:00 local — next Saturday is the 8th.
    const now = new Date(2026, 7, 7, 10, 0, 0);
    const schedule = buildReminderSchedule(base, now, 10);

    expect(schedule.some((item) => item.kind === "day_before")).toBe(true);
    expect(schedule.some((item) => item.kind === "day_of")).toBe(true);

    const nextSat = schedule.find(
      (item) => item.shoppingDate === "2026-08-08" && item.kind === "day_of",
    );
    expect(nextSat).toBeTruthy();
    expect(new Date(nextSat!.at).getHours()).toBe(9);
  });

  it("returns empty schedule when disabled or no days", () => {
    expect(
      buildReminderSchedule({ ...base, enabled: false }, new Date()),
    ).toEqual([]);
    expect(buildReminderSchedule({ ...base, days: [] }, new Date())).toEqual(
      [],
    );
  });

  it("detects due reminders inside the grace window", () => {
    const now = new Date(2026, 7, 8, 9, 15, 0); // Saturday after 9:00
    const due = dueReminders(base, now, new Set(), 2 * 60 * 60 * 1000);
    expect(due.some((item) => item.key === "2026-08-08:day_of")).toBe(true);
  });

  it("builds a shopping-day banner for today and tomorrow", () => {
    const saturday = new Date(2026, 7, 8, 12, 0, 0);
    expect(shoppingDayBanner(base, saturday)?.kind).toBe("today");

    const friday = new Date(2026, 7, 7, 12, 0, 0);
    expect(shoppingDayBanner(base, friday)?.kind).toBe("tomorrow");

    const monday = new Date(2026, 7, 10, 12, 0, 0);
    expect(shoppingDayBanner(base, monday)).toBeNull();
  });

  it("local date keys use local calendar, not UTC", () => {
    const date = new Date(2026, 0, 5, 23, 30, 0);
    expect(toLocalDateKey(date)).toBe("2026-01-05");
  });
});
