import { paintTelegram, telegramDark } from "./telegram";

// Small per-browser conveniences. Nothing here is needed for the app to work.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked
  }
}

const TITLES = "zcui_titles";
const AGENT = "zcui_agent";
const THEME = "zcui_theme";
const META = "zcui_chat_meta";

/** ZeroClaw's session list carries no name, so titles are remembered here. */
export function getTitles(): Record<string, string> {
  return read<Record<string, string>>(TITLES, {});
}

export function setTitle(sessionId: string, title: string) {
  const all = getTitles();
  all[sessionId] = title;
  write(TITLES, all);
}

export function dropTitle(sessionId: string) {
  const all = getTitles();
  delete all[sessionId];
  write(TITLES, all);
}

/** ZeroClaw tells the model and the context use only in the live stream, not in saved history. */
export type ChatMeta = { model?: string; used?: number; max?: number };

export function getChatMeta(sessionId: string): ChatMeta | null {
  return read<Record<string, ChatMeta>>(META, {})[sessionId] ?? null;
}

export function setChatMeta(sessionId: string, meta: ChatMeta) {
  const all = read<Record<string, ChatMeta>>(META, {});
  // Kept for the chats used most recently; the rest simply show no model after a reload.
  const kept = Object.entries(all)
    .filter(([id]) => id !== sessionId)
    .slice(-199);
  write(META, Object.fromEntries([...kept, [sessionId, meta]]));
}

export function dropChatMeta(sessionId: string) {
  const all = read<Record<string, ChatMeta>>(META, {});
  delete all[sessionId];
  write(META, all);
}

const TODAY_SEEN = "zcui_today_seen";
const PROMPTS = "zcui_prompts";

/** When the Today page was last looked at (ms), or null on a first visit. */
export function getTodaySeen(): number | null {
  const v = read<number | null>(TODAY_SEEN, null);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function setTodaySeen(at: number) {
  write(TODAY_SEEN, at);
}

const DEFAULT_PROMPTS = ["What needs my attention today?", "Summarise what the scheduled jobs did today."];

/** The one-tap requests on the Today page; the person's own list once they have edited it. */
export function getQuickPrompts(): string[] {
  const v = read<unknown>(PROMPTS, null);
  if (!Array.isArray(v)) return DEFAULT_PROMPTS;
  return v.filter((p): p is string => typeof p === "string" && p.trim() !== "").slice(0, 12);
}

export function setQuickPrompts(prompts: string[]) {
  write(PROMPTS, [...new Set(prompts.map((p) => p.trim()).filter(Boolean))].slice(0, 12));
}

export function getLastAgent(): string | null {
  return read<string | null>(AGENT, null);
}

export function setLastAgent(alias: string) {
  write(AGENT, alias);
}

export type ThemeChoice = "system" | "light" | "dark";

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/**
 * Puts the chosen (or the system's) theme on the page. Inside Telegram "system" means
 * Telegram's own theme, which can differ from the phone's.
 */
export function applyTheme() {
  const choice = getThemeChoice();
  const system = telegramDark() ?? matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = choice === "dark" || (choice === "system" && system);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  paintTelegram();
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME);
    else localStorage.setItem(THEME, choice);
  } catch {
    // lasts for this page load only
  }
  applyTheme();
}
