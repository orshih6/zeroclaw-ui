export type Session = {
  session_id: string;
  session_key: string;
  agent_alias: string;
  channel_id: string | null;
  created_at: string;
  last_activity: string;
  message_count: number;
  name?: string | null;
};

export type StoredMessage = { role: string; content: string; created_at?: string };

export type Agent = { alias: string; enabled: boolean };

/** One thing shown in the conversation column. */
export type Item =
  | { id: string; kind: "user"; text: string; images: string[]; at?: string }
  | { id: string; kind: "assistant"; text: string; thinking?: string; model?: string; at?: string }
  | {
      id: string;
      kind: "tool";
      callId?: string;
      name: string;
      args: unknown;
      output?: string;
      pending: boolean;
    }
  | { id: string; kind: "notice"; text: string }
  /** Something the reader must not miss about the answer next to it. */
  | { id: string; kind: "caution"; text: string }
  | { id: string; kind: "error"; text: string };

export type Approval = {
  requestId: string;
  tool: string;
  summary: string;
  timeoutSecs: number;
  receivedAt: number;
};

export type CronJob = {
  id: string;
  name: string | null;
  agent_alias: string | null;
  job_type: "agent" | "shell" | string;
  prompt: string | null;
  command: string;
  expression: string;
  schedule: { kind: string; expr?: string; tz?: string | null };
  enabled: boolean;
  delivery: { mode: string; channel: string | null; to: string | null; best_effort?: boolean };
  last_run: string | null;
  last_status: string | null;
  last_output: string | null;
  next_run: string | null;
  created_at: string;
};

export type CronRun = {
  id: number;
  job_id: string;
  execution: string;
  delivery: string | null;
  duration_ms: number | null;
  finished_at: string | null;
  output: string | null;
};

export type MemoryEntry = {
  id: string;
  key: string;
  content: string;
  category: string;
  agent_alias: string | null;
  timestamp: string;
  pinned?: boolean;
};

export type Channel = { name: string; alias: string; enabled: boolean };

/** Messages ZeroClaw sends on /ws/chat (v0.9.0; read from its dashboard, not documented). */
export type ServerEvent = {
  type: string;
  content?: string;
  full_response?: string;
  session_id?: string;
  message_count?: number;
  id?: string;
  name?: string;
  args?: unknown;
  output?: string;
  request_id?: string;
  tool?: string;
  arguments_summary?: string;
  timeout_secs?: number;
  code?: string;
  message?: string;
  model?: string;
  reason?: string;
  dropped_messages?: number;
  dropped_turns?: number;
  kept_turns?: number;
  served_model?: string;
  requested_model?: string;
  tokens_used?: number;
  max_context_tokens?: number;
};

export type Device = {
  id: string;
  name: string;
  device_type: string;
  ip_address: string | null;
  paired_at: string;
  last_seen: string | null;
};

export type Component = {
  status: string;
  updated_at?: string;
  last_ok?: string | null;
  last_error?: string | null;
  restart_count?: number;
};

export type Status = {
  version: string;
  model: string;
  model_provider: string;
  uptime_seconds: number;
  daemon_started_at?: string;
  memory_backend?: string;
  channels: Record<string, boolean>;
  health: { components: Record<string, Component> };
};

export type DoctorResult = { category: string; message: string; severity: string };

export type UsageRow = {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  total_tokens: number;
  request_count: number;
};

export type Usage = {
  by_agent: Record<string, UsageRow>;
  by_model: Record<string, UsageRow>;
  request_count: number;
  total_tokens: number;
};

export type LogEvent = {
  id: string;
  "@timestamp": string;
  message: string;
  severity_text: string;
  severity_number: number;
  attributes?: Record<string, unknown>;
};

export type Tool = { name: string; description: string };

export type InstructionFile = { filename: string; exists: boolean; size: number; mtime_ms: number | null };
export type InstructionContent = {
  filename: string;
  content: string;
  exists: boolean;
  truncated: boolean;
  mtime_ms: number | null;
};
