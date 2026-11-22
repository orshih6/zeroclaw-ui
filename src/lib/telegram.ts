// Opened as a Telegram Mini App (a bot's menu button pointing at this site), the page
// should feel like part of Telegram: its colours around the page, its Back button, and no
// swipe that closes the app while a chat is being scrolled.
//
// This talks to the Telegram app directly instead of loading telegram.org's script. A
// paired browser holds a token with full control of the agent, so no third-party script
// runs on this page (the CSP allows none). The protocol is small: Telegram puts its launch
// parameters in the URL fragment, takes events through a function it injects, and calls a
// function we define with its own events. Telegram Web is the exception: it shows the page
// in a frame and both directions are window messages, accepted from and sent to
// web.telegram.org only.
//
// Sign-in is unchanged: ZeroClaw's pairing code, once, inside Telegram. Telegram's signed
// launch data is not used for anything and is removed from the address.

export type Launch = {
  platform: string;
  version: string;
  /** Telegram's colours, e.g. bg_color: "#17212b". */
  theme: Record<string, string>;
};

const KEPT = "zcui_tg";

/** Telegram's launch parameters from a URL fragment, or null when there are none. */
export function parseLaunch(hash: string): Launch | null {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const version = q.get("tgWebAppVersion");
  if (!version) return null;
  return {
    platform: q.get("tgWebAppPlatform") ?? "",
    version,
    theme: parseTheme(q.get("tgWebAppThemeParams")),
  };
}

function parseTheme(raw: unknown): Record<string, string> {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return {};
    return Object.fromEntries(
      Object.entries(obj).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
}

/** Whether a "#rrggbb" colour is a dark one; null when it is not a colour. */
export function isDark(hex: string | undefined): boolean | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => Number.parseInt(h, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/** "rgb(28, 27, 25)" or "#1c1b19" as "#1c1b19", which is all Telegram takes. */
export function toHex(color: string): string | null {
  const c = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c);
  if (!m) return null;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

type Bridge = {
  TelegramWebviewProxy?: { postEvent(type: string, data: string): void };
  external?: { notify?(message: string): void };
  Telegram?: unknown;
  TelegramGameProxy?: unknown;
  TelegramGameProxy_receiveEvent?: unknown;
};

let launch: Launch | null = null;
let onThemeChange: (() => void) | null = null;
const backHandlers = new Set<() => void>();

/** Telegram Web shows a Mini App in a frame and talks to it with messages. */
const TELEGRAM_WEB = "https://web.telegram.org";
const framed = () => window.parent !== window;

function post(type: string, data: Record<string, unknown> = {}) {
  const w = window as unknown as Bridge;
  try {
    if (w.TelegramWebviewProxy) w.TelegramWebviewProxy.postEvent(type, JSON.stringify(data));
    else if (w.external?.notify) w.external.notify(JSON.stringify({ eventType: type, eventData: data }));
    // Only ever to Telegram Web: another site that framed the page learns nothing.
    else if (framed())
      window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data }), TELEGRAM_WEB);
  } catch {
    // an older Telegram that does not know this event
  }
}

/** A message from Telegram Web, as the event it carries; null for anything else. */
export function webEvent(origin: string, data: unknown): { type: string; data: unknown } | null {
  if (origin !== TELEGRAM_WEB || typeof data !== "string") return null;
  try {
    const m = JSON.parse(data);
    return m && typeof m.eventType === "string" ? { type: m.eventType, data: m.eventData } : null;
  } catch {
    return null;
  }
}

function receive(type: string, data: unknown) {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (type === "back_button_pressed") {
    for (const h of backHandlers) h();
  } else if (type === "theme_changed" && launch) {
    launch = { ...launch, theme: parseTheme(d.theme_params) };
    keep(launch);
    onThemeChange?.();
  } else if (type === "safe_area_changed") {
    // The strip at the bottom of the phone (the home indicator) that the page must stay above.
    const bottom = typeof d.bottom === "number" && d.bottom > 0 ? d.bottom : 0;
    document.documentElement.style.setProperty("--tg-safe-bottom", `${bottom}px`);
  }
}

function keep(l: Launch) {
  try {
    sessionStorage.setItem(KEPT, JSON.stringify(l));
  } catch {
    // only costs the Telegram look after a reload
  }
}

function kept(): Launch | null {
  try {
    const l = JSON.parse(sessionStorage.getItem(KEPT) ?? "null");
    return l && typeof l.version === "string"
      ? { platform: String(l.platform ?? ""), version: l.version, theme: parseTheme(l.theme) }
      : null;
  } catch {
    return null;
  }
}

/**
 * Call once, before the page is drawn. Does nothing outside Telegram. `themeChanged` runs
 * when the person switches Telegram's theme while the page is open.
 */
export function initTelegram(themeChanged: () => void) {
  const fromUrl = parseLaunch(window.location.hash);
  if (fromUrl) {
    keep(fromUrl);
    // The fragment also carries Telegram's signed data about the person. Nothing here
    // uses it, so it does not stay in the address.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
  // A reload inside Telegram can come back without the fragment.
  launch = fromUrl ?? (hasBridge() ? kept() : null);
  if (!launch) return;

  onThemeChange = themeChanged;
  const w = window as unknown as Bridge;
  w.Telegram = { WebView: { receiveEvent: receive } }; // iOS, Android, macOS
  w.TelegramGameProxy = { receiveEvent: receive }; // Telegram Desktop
  w.TelegramGameProxy_receiveEvent = receive; // Windows Phone, kept for old clients
  if (framed()) {
    // Telegram Web
    window.addEventListener("message", (e) => {
      const ev = webEvent(e.origin, e.data);
      if (ev?.type === "reload_iframe") window.location.reload();
      else if (ev) receive(ev.type, ev.data);
    });
    post("iframe_ready", { reload_supported: true });
  }
  document.documentElement.dataset.telegram = launch.platform || "yes";

  post("web_app_ready");
  post("web_app_expand");
  // Scrolling a chat down from its top must not drag the whole app closed.
  post("web_app_setup_swipe_behavior", { allow_vertical_swipe: false });
  post("web_app_request_safe_area");
}

function hasBridge(): boolean {
  const w = window as unknown as Bridge;
  return Boolean(w.TelegramWebviewProxy || w.external?.notify || framed());
}

export function inTelegram(): boolean {
  return launch !== null;
}

/** Telegram's own light or dark, for the "system" theme; null outside Telegram. */
export function telegramDark(): boolean | null {
  return launch ? isDark(launch.theme.bg_color) : null;
}

/** Paints Telegram's bars around the page in the page's own background. */
export function paintTelegram() {
  if (!launch) return;
  const color = toHex(getComputedStyle(document.documentElement).getPropertyValue("--bg"));
  if (!color) return;
  post("web_app_set_header_color", { color });
  post("web_app_set_background_color", { color });
  post("web_app_set_bottom_bar_color", { color });
}

/** Shows or hides Telegram's Back button (top left, where its Close button is). */
export function showTelegramBack(visible: boolean) {
  if (launch) post("web_app_setup_back_button", { is_visible: visible });
}

/** Runs `handler` when Telegram's Back button is pressed; returns how to stop. */
export function onTelegramBack(handler: () => void): () => void {
  backHandlers.add(handler);
  return () => backHandlers.delete(handler);
}
