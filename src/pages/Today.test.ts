import { describe, expect, it } from "vitest";
import type { CronJob } from "../lib/types";
import { ago, todayView, until } from "./Today";

const T = Date.parse("2026-01-10T12:00:00Z");
const at = (hoursBefore: number) => new Date(T - hoursBefore * 3600_000).toISOString();

function job(id: string, over: Partial<CronJob> = {}): CronJob {
  return {
    id,
    name: id,
    agent_alias: "assistant",
    job_type: "agent",
    prompt: "do it",
    command: "",
    expression: "0 9 * * *",
    schedule: { kind: "cron", expr: "0 9 * * *" },
    enabled: true,
    delivery: { mode: "none", channel: null, to: null },
    last_run: at(1),
    last_status: "ok",
    last_output: "Two new things.",
    next_run: new Date(T + 3600_000).toISOString(),
    created_at: at(100),
    ...over,
  };
}

describe("todayView", () => {
  const since = T - 3 * 3600_000; // looked three hours ago

  it("splits what ran since the last visit from what was already seen", () => {
    const v = todayView([job("new"), job("old", { last_run: at(5) })], since);
    expect(v.fresh.map((l) => l.id)).toEqual(["new"]);
    expect(v.earlier.map((l) => l.id)).toEqual(["old"]);
    expect(v.fresh[0].preview).toBe("Two new things.");
  });

  it("counts jobs that had nothing to report instead of listing them", () => {
    const v = todayView(
      [
        job("a", { last_output: "NO_REPLY" }),
        job("b", { last_output: "NO_REPLY" }),
        job("seen", { last_output: "NO_REPLY", last_run: at(9) }),
        job("silent", { last_output: null }),
      ],
      since,
    );
    expect(v.quiet).toBe(3);
    expect(v.fresh).toEqual([]);
    expect(v.earlier).toEqual([]);
  });

  it("keeps a failed job in front until it runs well again, however old", () => {
    const v = todayView([job("bad", { last_status: "error", last_run: at(30) }), job("fine")], since);
    expect(v.needs.map((l) => [l.id, l.concern, l.failed, l.fresh])).toEqual([
      ["bad", "Failed", true, false],
    ]);
    expect(v.fresh.map((l) => l.id)).toEqual(["fine"]);
  });

  it("flags a run that finished but says it could not do its work", () => {
    const v = todayView(
      [job("j", { last_output: "Could not reach the server, so nothing was checked." })],
      since,
    );
    expect(v.needs[0]).toMatchObject({ id: "j", concern: "May need a look", failed: false });
  });

  it("does not ask you to look at a job that is switched off", () => {
    const v = todayView([job("off", { enabled: false, last_status: "error" })], since);
    expect(v.needs).toEqual([]);
    expect(v.earlier.map((l) => l.id)).toEqual(["off"]);
  });

  it("leaves out jobs that never ran, and lists the newest first", () => {
    const v = todayView(
      [
        job("never", { last_run: null }),
        job("older", { last_run: at(2) }),
        job("newer", { last_run: at(1) }),
      ],
      since,
    );
    expect(v.fresh.map((l) => l.id)).toEqual(["newer", "older"]);
  });

  it("shows the next three jobs that are switched on", () => {
    const next = (h: number) => new Date(T + h * 3600_000).toISOString();
    const v = todayView(
      [
        job("d", { next_run: next(4) }),
        job("a", { next_run: next(1) }),
        job("off", { next_run: next(0.5), enabled: false }),
        job("c", { next_run: next(3) }),
        job("b", { next_run: next(2) }),
      ],
      since,
    );
    expect(v.next.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("ago and until", () => {
  it("reads as a person would say it", () => {
    expect(ago(at(0), T)).toBe("just now");
    expect(ago(at(0.5), T)).toBe("30 min ago");
    expect(ago(at(5), T)).toBe("5 h ago");
    expect(until(new Date(T + 20 * 60000).toISOString(), T)).toBe("in 20 min");
    expect(until(new Date(T + 3 * 3600_000).toISOString(), T)).toBe("in 3 h");
    expect(ago("not a date", T)).toBe("");
  });
});
