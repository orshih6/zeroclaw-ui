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
