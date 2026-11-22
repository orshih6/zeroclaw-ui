import {
  Activity,
  Bot,
  Brain,
  CalendarClock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  Sun,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { agentLabel, relativeDay } from "../lib/format";
import { pickTitle } from "../lib/history";
import type { Session } from "../lib/types";
import { useBusyChats } from "../lib/useChat";
import { Confirm, Skeleton, useDelayed } from "./ui";

const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

type Props = {
  sessions: Session[];
  titles: Record<string, string>;
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onNavigate: () => void;
};

function Row({
  session,
  title,
  active,
  answering,
  onOpen,
  onRename,
  onDelete,
}: {
  session: Session;
  title: string;
  active: boolean;
  /** A turn is running in this chat, also while another chat is on screen. */
  answering: boolean;
  onOpen: () => void;
  onRename: (t: string) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<"closed" | "open" | "confirm">("closed");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const wrap = useRef<HTMLDivElement>(null);
  const editable = !session.channel_id;

  useEffect(() => {
    if (menu === "closed") return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setMenu("closed");
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu("closed");
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = value.trim();
          if (t) onRename(t);
          setEditing(false);
        }}
        className="px-1 py-0.5"
      >
        <input
          // biome-ignore lint/a11y/noAutofocus: the user just chose Rename on this row
          autoFocus
          value={value}
          aria-label="Conversation name"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          className="w-full rounded-lg border border-accent bg-surface px-2 py-1.5 text-sm outline-none"
        />
      </form>
    );
  }

  return (
    <div ref={wrap} className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        title={
          session.agent_alias === "assistant" ? title : `${title} · ${agentLabel(session.agent_alias)} agent`
        }
        className={`flex w-full items-center rounded-lg py-1.5 pl-3 text-left text-sm ${editable ? "pr-9" : "pr-3"} ${
          active ? "bg-line text-ink" : "text-ink-2 hover:bg-line/60 hover:text-ink"
        }`}
      >
        {answering && (
          <span role="status" className="breathe mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent">
            <span className="sr-only">Answering</span>
          </span>
        )}
        <span className="truncate">{title}</span>
      </button>
      {editable && (
        <button
          type="button"
          aria-label={`Options for ${title}`}
          aria-expanded={menu !== "closed"}
          onClick={() => setMenu(menu === "closed" ? "open" : "closed")}
          className={`absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-line-strong/50 hover:text-ink ${
            menu !== "closed" || active
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-60"
          }`}
        >
          <MoreHorizontal size={16} />
        </button>
      )}
      {menu !== "closed" && (
        <div className="absolute right-1 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line-strong bg-surface py-1 shadow-lg">
          {menu === "confirm" ? (
            <div className="px-3 py-2">
              <Confirm
                question="Delete this chat?"
                yes="Delete"
                onYes={() => {
                  setMenu("closed");
                  onDelete();
                }}
                onNo={() => setMenu("closed")}
              />
            </div>
          ) : (
            <div role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setValue(title);
                  setMenu("closed");
                  setEditing(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-panel"
              >
                <Pencil size={14} /> Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenu("confirm")}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChatListSkeleton() {
  const late = useDelayed();
  return (
    <div role="status" aria-busy="true" className={`mt-4 space-y-3.5 px-3 ${late ? "appear" : "invisible"}`}>
      <span className="sr-only">Loading chats</span>
      {["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-1/2", "w-3/4"].map((w) => (
        <Skeleton key={w} className={`h-3.5 ${w}`} />
      ))}
    </div>
  );
}

function fallbackTitle(s: Session): string {
  if (s.channel_id) return s.channel_id.replace(/^telegram\./, "Telegram · ");
  const d = new Date(s.created_at);
  const day = Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Chat from ${day}`;
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${
    isActive ? "bg-line text-ink" : "text-ink-2 hover:bg-line/60 hover:text-ink"
  }`;

export function Sidebar(p: Props) {
  const busy = useBusyChats();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const titleOf = (s: Session) => pickTitle(s.name, p.titles[s.session_id]) || fallbackTitle(s);
  // biome-ignore lint/correctness/useExhaustiveDependencies: titleOf reads p.titles, listed here
  const { groups, channels, found } = useMemo(() => {
    const sorted = [...p.sessions]
      .filter((s) => !q || titleOf(s).toLowerCase().includes(q))
      .sort((a, b) => b.last_activity.localeCompare(a.last_activity));
    const g = new Map<string, Session[]>();
    const ch: Session[] = [];
    for (const s of sorted) {
      if (s.channel_id) {
        ch.push(s);
        continue;
      }
      const key = relativeDay(s.last_activity);
      g.set(key, [...(g.get(key) ?? []), s]);
    }
    return { groups: g, channels: ch, found: sorted.length };
  }, [p.sessions, p.titles, q]);

  const row = (s: Session) => (
    <Row
      key={s.session_id}
      session={s}
      title={titleOf(s)}
      active={s.session_id === p.activeId}
      answering={busy.includes(s.session_id)}
      onOpen={() => p.onOpen(s.session_id)}
      onRename={(t) => p.onRename(s.session_id, t)}
      onDelete={() => p.onDelete(s.session_id)}
    />
  );

  return (
    <aside className="flex h-full w-[17.5rem] flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent font-serif text-base font-semibold text-accent-ink">
          Z
        </span>
        <span className="font-serif text-lg">ZeroClaw</span>
      </div>

      <nav className="space-y-0.5 px-2" aria-label="Main">
        <button
          type="button"
          onClick={p.onNew}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink hover:bg-line/60"
        >
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-accent-ink">
            <Plus size={13} strokeWidth={2.75} />
          </span>
          New chat
        </button>
        <NavLink to="/today" className={navClass} onClick={p.onNavigate}>
          <Sun size={16} /> Today
        </NavLink>
        <NavLink to="/agents" className={navClass} onClick={p.onNavigate}>
          <Bot size={16} /> Agents
        </NavLink>
        <NavLink to="/jobs" className={navClass} onClick={p.onNavigate}>
          <CalendarClock size={16} /> Scheduled jobs
        </NavLink>
        <NavLink to="/memory" className={navClass} onClick={p.onNavigate}>
          <Brain size={16} /> Memory
        </NavLink>
        <NavLink to="/tools" className={navClass} onClick={p.onNavigate}>
          <Wrench size={16} /> Tools
        </NavLink>
      </nav>

      <div className="scroll-thin mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {p.loading && p.sessions.length === 0 && <ChatListSkeleton />}
        {p.error && (
          <p className="mx-1 mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
            Could not load chats: {p.error}
          </p>
        )}
        {!p.loading && !p.error && p.sessions.length === 0 && (
          <p className="px-3 py-4 text-sm text-ink-3">No chats yet. Start one above.</p>
        )}
        {/* A short list is quicker to read than to search. */}
        {p.sessions.length > 8 && (
          <div className="relative mx-1 mt-2">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search chats"
              aria-label="Search chats"
              className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-2 text-sm outline-none placeholder:text-ink-3 focus:border-accent"
            />
          </div>
        )}
        {q && found === 0 && <p className="px-3 py-4 text-sm text-ink-3">No chat is called that.</p>}
        {GROUPS.filter((g) => groups.has(g)).map((g) => (
          <section key={g} className="mt-4 first:mt-2">
            <h2 className="px-3 pb-1 text-xs text-ink-3">{g}</h2>
            {groups.get(g)?.map(row)}
          </section>
        ))}
        {channels.length > 0 && (
          <section className="mt-4">
            <h2 className="flex items-center gap-1.5 px-3 pb-1 text-xs text-ink-3">
              <Send size={11} /> From Telegram
            </h2>
            {channels.map(row)}
          </section>
        )}
      </div>

      <nav className="flex gap-1 border-t border-line p-2" aria-label="System">
        <NavLink to="/status" className={(s) => `${navClass(s)} flex-1`} onClick={p.onNavigate}>
          <Activity size={16} /> Status
        </NavLink>
        <NavLink to="/settings" className={(s) => `${navClass(s)} flex-1`} onClick={p.onNavigate}>
          <Settings size={16} /> Settings
        </NavLink>
      </nav>
    </aside>
  );
}
