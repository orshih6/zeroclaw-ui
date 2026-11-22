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

/** Puts the chosen (or the system's) theme on the page. */
export function applyTheme() {
  const choice = getThemeChoice();
  const dark =
    choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
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
