export function agentLabel(alias: string): string {
  if (alias === "assistant") return "Assistant";
  if (alias === "chat") return "Chat";
  return alias.charAt(0).toUpperCase() + alias.slice(1);
}

export function agentHint(alias: string): string {
  // Both agents have the same tools and approval rules; only the model behind them differs.
  if (alias === "assistant") return "Claude with all tools";
  if (alias === "chat") return "Same tools through claude-chat, no images";
  return "";
}

export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Older";
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  if (days <= 30) return "Previous 30 days";
  return "Older";
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function duration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${(s / 60).toFixed(1)} min`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Plain words for the common cron shapes; the raw expression otherwise. */
export function describeCron(expr: string): string {
  const p = expr.trim().split(/\s+/);
  if (p.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = p;
  const pad = (n: string) => n.padStart(2, "0");
  const fixedMin = /^\d+$/.test(min);
  if (dom === "*" && mon === "*" && fixedMin) {
    const days =
      dow === "*"
        ? "every day"
        : /^[0-6](,[0-6])*$/.test(dow)
          ? dow
              .split(",")
              .map((d) => DAYS[Number(d)])
              .join(", ")
          : null;
    if (days) {
      if (/^\d+(,\d+)*$/.test(hour)) {
        const times = hour
          .split(",")
          .map((h) => `${pad(h)}:${pad(min)}`)
          .join(", ");
        return `${times} ${days}`;
      }
      const step = hour.match(/^\*\/(\d+)$/);
      if (step && dow === "*") {
        return min === "0" ? `every ${step[1]} hours` : `every ${step[1]} hours at :${pad(min)}`;
      }
      if (hour === "*" && dow === "*") return `every hour at :${pad(min)}`;
    }
  }
  const everyMin = min.match(/^\*\/(\d+)$/);
  if (everyMin && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `every ${everyMin[1]} minutes`;
  }
  return expr;
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

const FAMILY = ["fable", "mythos", "opus", "sonnet", "haiku"];

/** "claude-opus-5-5" → "Opus 5.5"; names it does not recognise are shown as they are. */
export function modelLabel(id: string): string {
  const m = id.match(/^(?:claude-)?([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-(\d{8}))?$/);
  if (!m) return id.charAt(0).toUpperCase() + id.slice(1);
  const [, family, major, minor, date] = m;
  const name = family.charAt(0).toUpperCase() + family.slice(1);
  return `${name} ${major}${minor ? `.${minor}` : ""}${date ? ` (${date})` : ""}`;
}

/** Newest and largest first; dated snapshots of a model are left out. */
export function sortModels(ids: string[]): string[] {
  const key = (id: string) => {
    const m = id.match(/^(?:claude-)?([a-z]+)-(\d+)(?:-(\d{1,2}))?$/);
    if (!m) return null;
    const f = FAMILY.indexOf(m[1]);
    return { family: f === -1 ? FAMILY.length : f, version: Number(m[2]) * 100 + Number(m[3] ?? 0) };
  };
  const known = ids.filter((id) => key(id));
  const other = ids.filter((id) => !key(id) && !/-\d{8}$/.test(id));
  known.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!ka || !kb) return 0;
    return kb.version - ka.version || ka.family - kb.family;
  });
  return [...known, ...other];
}

export function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
