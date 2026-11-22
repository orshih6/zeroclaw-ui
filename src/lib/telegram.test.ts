import { describe, expect, it } from "vitest";
import { isDark, parseLaunch, toHex, webEvent } from "./telegram";

describe("parseLaunch", () => {
  it("reads what Telegram puts in the fragment", () => {
    const theme = encodeURIComponent(JSON.stringify({ bg_color: "#17212b", text_color: "#f5f5f5" }));
    const hash = `#tgWebAppData=query_id%3DAAE%26user%3D%257B%2522id%2522%253A1%257D&tgWebAppVersion=9.1&tgWebAppPlatform=ios&tgWebAppThemeParams=${theme}`;
    expect(parseLaunch(hash)).toEqual({
      platform: "ios",
      version: "9.1",
      theme: { bg_color: "#17212b", text_color: "#f5f5f5" },
    });
  });

  it("is null in an ordinary browser", () => {
    expect(parseLaunch("")).toBeNull();
    expect(parseLaunch("#section")).toBeNull();
    expect(parseLaunch("#tgWebAppPlatform=ios")).toBeNull();
  });

  it("survives a theme that is not JSON, or not colours", () => {
    expect(parseLaunch("#tgWebAppVersion=8.0&tgWebAppThemeParams=%7Bnope")?.theme).toEqual({});
    expect(parseLaunch("#tgWebAppVersion=8.0&tgWebAppThemeParams=%7B%22a%22%3A1%7D")?.theme).toEqual({});
    expect(parseLaunch("#tgWebAppVersion=8.0")).toEqual({ platform: "", version: "8.0", theme: {} });
  });
});

describe("isDark", () => {
  it("tells Telegram's dark themes from its light ones", () => {
    expect(isDark("#17212b")).toBe(true);
    expect(isDark("#000000")).toBe(true);
    expect(isDark("#ffffff")).toBe(false);
    expect(isDark("#EFEFF4")).toBe(false);
  });

  it("is null for anything that is not #rrggbb", () => {
    expect(isDark(undefined)).toBeNull();
    expect(isDark("red")).toBeNull();
    expect(isDark("#fff")).toBeNull();
  });
});

describe("toHex", () => {
  it("gives Telegram the #rrggbb it wants", () => {
    expect(toHex(" #F6F5F1 ")).toBe("#f6f5f1");
    expect(toHex("rgb(28, 27, 25)")).toBe("#1c1b19");
    expect(toHex("rgb(28 27 25)")).toBe("#1c1b19");
    expect(toHex("rgba(0, 0, 0, 0.5)")).toBe("#000000");
    expect(toHex("var(--bg)")).toBeNull();
  });
});

describe("webEvent", () => {
  const msg = JSON.stringify({ eventType: "back_button_pressed", eventData: { a: 1 } });

  it("reads an event sent by Telegram Web", () => {
    expect(webEvent("https://web.telegram.org", msg)).toEqual({
      type: "back_button_pressed",
      data: { a: 1 },
    });
  });

  it("ignores every other site, and anything that is not an event", () => {
    expect(webEvent("https://evil.example", msg)).toBeNull();
    expect(webEvent("https://web.telegram.org.evil.example", msg)).toBeNull();
    expect(webEvent("https://web.telegram.org", { eventType: "x" })).toBeNull();
    expect(webEvent("https://web.telegram.org", "not json")).toBeNull();
    expect(webEvent("https://web.telegram.org", JSON.stringify({ nope: 1 }))).toBeNull();
  });
});
