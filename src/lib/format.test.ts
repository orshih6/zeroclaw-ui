import { describe, expect, it } from "vitest";
import { compact, describeCron, modelLabel, relativeDay, sortModels } from "./format";

describe("describeCron", () => {
  it("reads the schedules ZeroClaw runs today", () => {
    expect(describeCron("0 9 * * *")).toBe("09:00 every day");
    expect(describeCron("30 20 * * *")).toBe("20:30 every day");
    expect(describeCron("0 8,14,20 * * *")).toBe("08:00, 14:00, 20:00 every day");
    expect(describeCron("0 */2 * * *")).toBe("every 2 hours");
    expect(describeCron("15 * * * *")).toBe("every hour at :15");
    expect(describeCron("*/10 * * * *")).toBe("every 10 minutes");
    expect(describeCron("0 9 * * 1,3")).toBe("09:00 Mon, Wed");
  });

  it("falls back to the expression when it cannot say it plainly", () => {
    expect(describeCron("0 3 1 1 *")).toBe("0 3 1 1 *");
    expect(describeCron("nonsense")).toBe("nonsense");
  });
});

describe("relativeDay", () => {
  const now = new Date(2026, 10, 22, 10, 0);
  it("groups by calendar day", () => {
    expect(relativeDay(new Date(2026, 10, 22, 0, 5).toISOString(), now)).toBe("Today");
    expect(relativeDay(new Date(2026, 10, 21, 23, 50).toISOString(), now)).toBe("Yesterday");
    expect(relativeDay(new Date(2026, 10, 17).toISOString(), now)).toBe("Previous 7 days");
    expect(relativeDay(new Date(2026, 9, 30).toISOString(), now)).toBe("Previous 30 days");
    expect(relativeDay(new Date(2026, 5, 1).toISOString(), now)).toBe("Older");
  });
});

describe("models", () => {
  it("names models the way people say them", () => {
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5 (20251001)");
    expect(modelLabel("sonnet")).toBe("Sonnet");
  });

  it("lists the newest first and drops dated snapshots", () => {
    expect(
      sortModels([
        "claude-haiku-4-5",
        "claude-haiku-4-5-20251001",
        "claude-opus-5-5",
        "claude-sonnet-5-5",
        "claude-opus-5",
        "sonnet",
      ]),
    ).toEqual(["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-haiku-4-5", "sonnet"]);
  });
});

describe("compact", () => {
  it("shortens big numbers", () => {
    expect(compact(950)).toBe("950");
    expect(compact(4321526)).toBe("4.3M");
    expect(compact(95807016)).toBe("95.8M");
  });
});
