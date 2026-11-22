// Everything here is ZeroClaw's own HTTP API, reached same-origin (nginx or Vite passes
// /api and /ws through). The only login is ZeroClaw's pairing: a one-time code becomes a
// bearer token that lives in this browser.
import type {
  Agent,
  Channel,
  CronJob,
  CronRun,
  Device,
  DoctorResult,
  InstructionContent,
  InstructionFile,
  LogEvent,
  MemoryEntry,
  Session,
  Status,
  StoredMessage,
  Tool,
  Usage,
} from "./types";

const TOKEN_KEY = "zcui_token";
const PAIRED_KEY = "zcui_paired_as";
export const UNAUTHORIZED_EVENT = "zcui-unauthorized";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private window: the token then lasts only for this page load
  }
}

/** The instruction file was changed by someone else (the agent, another tab) since it was opened. */
export class ChangedElsewhere extends Error {}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res = await fetch(path, { ...init, headers, cache: "no-store" });
  // ZeroClaw answers 503 for a few seconds while it reloads after some config changes.
  for (let attempt = 0; res.status === 503 && attempt < 5; attempt += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(path, { ...init, headers, cache: "no-store" });
  }
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(401, "Not paired");
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text || res.statusText;
    try {
      const j = JSON.parse(text);
      message = j.message ?? j.error ?? message;
    } catch {
      // plain-text error body
    }
    throw new ApiError(res.status, message);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
      ? "Chrome"
      : /Firefox/.test(ua)
        ? "Firefox"
        : /Safari/.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad|iOS/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return `Chat UI · ${browser}${os ? ` on ${os}` : ""}`;
}

export async function pair(code: string): Promise<void> {
  const res = await fetch("/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim(), device_name: deviceName(), device_type: "browser" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || `Pairing failed (${res.status})`);
  }
  const j = (await res.json()) as { token?: string };
  if (!j.token) throw new ApiError(500, "ZeroClaw returned no token");
  setToken(j.token);
  try {
    localStorage.setItem(PAIRED_KEY, JSON.stringify({ name: deviceName(), at: Date.now() }));
  } catch {
    // Settings then cannot tell which device is this browser
  }
}

/** What this browser called itself when it paired, and when. */
export function pairedAs(): { name: string; at: number } | null {
  try {
    const raw = localStorage.getItem(PAIRED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** True when the stored token is still accepted. */
export async function checkSession(): Promise<boolean> {
  if (!getToken()) return false;
  try {
    await request("/api/auth/session");
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return false;
    throw e;
  }
}

export const api = {
  /** Every agent, including ones that are switched off (their `enabled` is false). */
  agents: () => request<{ agents: Agent[] }>("/api/agents/available").then((r) => r.agents ?? []),
  sessions: () => request<{ sessions: Session[] }>("/api/sessions").then((r) => r.sessions ?? []),
  messages: (id: string) =>
    request<{ messages: StoredMessage[] }>(`/api/sessions/${encodeURIComponent(id)}/messages`).then(
      (r) => r.messages ?? [],
    ),
  renameSession: (id: string, name: string) =>
    request(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  deleteSession: (id: string) => request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** "running" while a turn is in flight. Stays "idle" for the first seconds after a send. */
  sessionState: (id: string) =>
    request<{ state?: string }>(`/api/sessions/${encodeURIComponent(id)}/state`).then(
      (r) => r.state ?? "idle",
    ),
  abortSession: (id: string) => request(`/api/sessions/${encodeURIComponent(id)}/abort`, { method: "POST" }),
  upload: (agent: string, file: File) =>
    request<{ path: string; marker: string }>(`/api/upload?agent=${encodeURIComponent(agent)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    }),

  channels: () => request<{ channels: Channel[] }>("/api/channels").then((r) => r.channels ?? []),

  cron: () => request<{ jobs: CronJob[] }>("/api/cron").then((r) => r.jobs ?? []),
  cronCreate: (body: Record<string, unknown>) =>
    request<{ job: CronJob }>("/api/cron", { method: "POST", body: JSON.stringify(body) }).then((r) => r.job),
  cronUpdate: (id: string, body: Record<string, unknown>) =>
    request<{ job: CronJob }>(`/api/cron/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.job),
  cronDelete: (id: string) => request(`/api/cron/${encodeURIComponent(id)}`, { method: "DELETE" }),
  cronRun: (id: string) => request(`/api/cron/${encodeURIComponent(id)}/run`, { method: "POST" }),
  cronRuns: (id: string, limit = 10) =>
    request<{ runs: CronRun[] }>(`/api/cron/${encodeURIComponent(id)}/runs?limit=${limit}`).then(
      (r) => r.runs ?? [],
    ),

  memory: (opts: { query?: string; category?: string; agent?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.query) q.set("query", opts.query);
    if (opts.category) q.set("category", opts.category);
    if (opts.agent) q.set("agent", opts.agent);
    const s = q.toString();
    return request<{ entries: MemoryEntry[] }>(`/api/memory${s ? `?${s}` : ""}`).then((r) => r.entries ?? []);
  },
  /** Saving under an existing key replaces that entry. */
  memorySave: (key: string, content: string, category: string, agent: string) =>
    request("/api/memory", { method: "POST", body: JSON.stringify({ key, content, category, agent }) }),
  memoryDelete: (key: string, agent?: string | null) =>
    request(`/api/memory/${encodeURIComponent(key)}${agent ? `?agent=${encodeURIComponent(agent)}` : ""}`, {
      method: "DELETE",
    }),
  devices: () => request<{ devices: Device[] }>("/api/devices").then((r) => r.devices ?? []),
  revokeDevice: (id: string) => request(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** A fresh one-time pairing code. Making one replaces the previous unused code. */
  pairingCode: () =>
    request<{ pairing_code: string }>("/api/pairing/initiate", { method: "POST", body: "{}" }).then(
      (r) => r.pairing_code,
    ),

  status: () => request<Status>("/api/status"),
  doctor: () =>
    request<{ results: DoctorResult[] }>("/api/doctor", { method: "POST", body: "{}" }).then(
      (r) => r.results ?? [],
    ),
  usage: (from?: Date) =>
    request<{ cost: Usage }>(
      `/api/cost${from ? `?from=${encodeURIComponent(from.toISOString())}` : ""}`,
    ).then((r) => r.cost),
  /** Warnings and errors only (OpenTelemetry severity 13 = WARN). */
  problems: (limit = 30) =>
    request<{ events: LogEvent[] }>(`/api/logs?limit=${limit}&severity_min=13&hide_internal=true`).then(
      (r) => r.events ?? [],
    ),

  tools: (agent: string) =>
    request<{ tools: Tool[] }>(`/api/tools?agent=${encodeURIComponent(agent)}`).then((r) => r.tools ?? []),
  toolServers: () =>
    request<{ keys: string[] }>("/api/config/map-keys?path=mcp.servers").then((r) => r.keys ?? []),

  configGet: (path: string) =>
    request<{ value: unknown }>(`/api/config/prop?path=${encodeURIComponent(path)}`).then((r) => r.value),
  configSet: (path: string, value: unknown) =>
    request("/api/config/prop", { method: "PUT", body: JSON.stringify({ path, value }) }),
  models: (provider: string) =>
    request<{ models: string[] }>(
      `/api/config/catalog/models?model_provider=${encodeURIComponent(provider)}`,
    ).then((r) => r.models ?? []),
  /** Every setting under a prefix, as path → raw value (lists come as JSON text). */
  configList: (prefix: string) =>
    request<{ entries: { path: string; value?: string; populated?: boolean }[] }>(
      `/api/config/list?prefix=${encodeURIComponent(prefix)}`,
    ).then(
      (r) => new Map((r.entries ?? []).map((e) => [e.path, e.populated === false ? "" : (e.value ?? "")])),
    ),

  instructionFiles: (agent: string) =>
    request<{ files: InstructionFile[]; max_chars: number }>(
      `/api/personality?agent=${encodeURIComponent(agent)}`,
    ),
  instructionFile: (agent: string, filename: string) =>
    request<InstructionContent>(
      `/api/personality/${encodeURIComponent(filename)}?agent=${encodeURIComponent(agent)}`,
    ),
  /** Refuses (ChangedElsewhere) when the file is no longer the version that was opened. */
  saveInstructionFile: async (agent: string, filename: string, content: string, openedAt: number | null) => {
    try {
      return await request<{ mtime_ms: number }>(
        `/api/personality/${encodeURIComponent(filename)}?agent=${encodeURIComponent(agent)}`,
        { method: "PUT", body: JSON.stringify({ content, expected_mtime_ms: openedAt }) },
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) throw new ChangedElsewhere();
      throw e;
    }
  },
};
