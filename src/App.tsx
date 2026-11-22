import { Menu, SquarePen } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSkeleton } from "./components/Messages";
import { Sidebar } from "./components/Sidebar";
import { Button, IconButton, Loading, Skeleton, useDelayed } from "./components/ui";
import { UNAUTHORIZED_EVENT, api, checkSession, setToken } from "./lib/api";
import { forget } from "./lib/conversations";
import { isGreeting, parseHistory, pickTitle, titleFrom, titleFromItems } from "./lib/history";
import { dropChatMeta, dropTitle, getLastAgent, getTitles, setLastAgent, setTitle } from "./lib/store";
import type { Agent, Session } from "./lib/types";
import { useTelegramBack } from "./lib/useTelegramBack";
import { Chat } from "./pages/Chat";
import { Pair } from "./pages/Pair";

// The chat is what people open this for; the other pages load when first visited.
const Jobs = lazy(() => import("./pages/Jobs").then((m) => ({ default: m.Jobs })));
const Memory = lazy(() => import("./pages/Memory").then((m) => ({ default: m.Memory })));
const Tools = lazy(() => import("./pages/Tools").then((m) => ({ default: m.Tools })));
const Status = lazy(() => import("./pages/Status").then((m) => ({ default: m.Status })));
const Agents = lazy(() => import("./pages/Agents").then((m) => ({ default: m.Agents })));
const AgentPage = lazy(() => import("./pages/Agents").then((m) => ({ default: m.AgentPage })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));

// A page of sample messages for checking how they are drawn. Development only: the
// condition is a build-time constant, so the production bundle does not contain it.
const Gallery = import.meta.env.DEV
  ? lazy(() => import("./dev/Gallery").then((m) => ({ default: m.Gallery })))
  : null;

const PAGES = {
  "/agents": "Agents",
  "/jobs": "Scheduled jobs",
  "/memory": "Memory",
  "/tools": "Tools",
  "/status": "Status",
  "/settings": "Settings",
} as const;
type PagePath = keyof typeof PAGES;

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-ink-3">
    {children}
  </div>
);

/** The moment before the app knows whether this browser is paired: just the mark, breathing. */
function Boot() {
  const late = useDelayed(250);
  return (
    <div role="status" className="flex h-full items-center justify-center">
      <span className="sr-only">Loading</span>
      {late && (
        <span className="breathe flex h-11 w-11 items-center justify-center rounded-xl bg-accent font-serif text-2xl font-semibold text-accent-ink">
          Z
        </span>
      )}
    </div>
  );
}

/** While a page's code is fetched: its outline, so the layout is already in place. */
function PageSkeleton() {
  const late = useDelayed();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
      {late && (
        <div className="appear">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-3 h-3.5 w-72 max-w-full" />
        </div>
      )}
      <Loading what="page" />
    </div>
  );
}

type Auth = "checking" | "paired" | "unpaired" | "unreachable";

export function App() {
  const [auth, setAuth] = useState<Auth>("checking");

  const check = useCallback(() => {
    setAuth("checking");
    checkSession()
      .then((ok) => setAuth(ok ? "paired" : "unpaired"))
      .catch(() => setAuth("unreachable"));
  }, []);

  useEffect(() => {
    check();
    const lost = () => setAuth("unpaired");
    window.addEventListener(UNAUTHORIZED_EVENT, lost);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, lost);
  }, [check]);

  if (Gallery && window.location.pathname === "/dev/gallery") {
    return (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    );
  }
  if (auth === "checking") return <Boot />;
  if (auth === "unreachable") {
    return (
      <Centered>
        <p className="font-serif text-xl text-ink">ZeroClaw is not answering</p>
        <p className="max-w-sm text-ink-2">
          It may be restarting. Your chats are safe; try again in a moment.
        </p>
        <Button variant="primary" onClick={check}>
          Try again
        </Button>
      </Centered>
    );
  }
  if (auth === "unpaired") return <Pair onPaired={() => setAuth("paired")} />;
  return (
    <Shell
      onSignOut={() => {
        setToken(null);
        setAuth("unpaired");
      }}
    />
  );
}

/**
 * Chats ZeroClaw has no name for get one from what was asked in them, a few at a time. A
 * chat that opened with "hello" is named after the first real question, so it is asked
 * again when it has grown.
 */
function useChatTitles(sessions: Session[]) {
  const [titles, setTitles] = useState(getTitles);
  const asked = useRef(new Set<string>());
  const sync = useCallback(() => setTitles(getTitles()), []);

  useEffect(() => {
    const once = (s: Session) => `${s.session_id}:${s.message_count}`;
    const todo = sessions
      .filter((s) => {
        if (s.channel_id || asked.current.has(once(s))) return false;
        const has = pickTitle(s.name, titles[s.session_id]);
        return !has || (isGreeting(has) && s.message_count > 2);
      })
      .slice(0, 6);
    for (const s of todo) {
      asked.current.add(once(s));
      api
        .messages(s.session_id)
        .then((rows) => {
          const title = titleFromItems(parseHistory(rows));
          if (title && title !== pickTitle(s.name, titles[s.session_id])) {
            setTitle(s.session_id, title);
            sync();
            // so the other browsers see the better name too
            if (s.name) api.renameSession(s.session_id, title).catch(() => {});
          }
        })
        .catch(() => {
          // it keeps its date title
        });
    }
  }, [sessions, titles, sync]);

  return { titles, sync };
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [draftAgent, setDraftAgent] = useState<string>(() => getLastAgent() ?? "assistant");
  const [drawer, setDrawer] = useState(false);
  /** Agent of chats started here, until the server's list shows them. */
  const started = useRef(new Map<string, string>());
  const { titles, sync: syncTitles } = useChatTitles(sessions);
  useTelegramBack();

  const refresh = useCallback(() => {
    api
      .sessions()
      .then((s) => {
        setSessions(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    api
      .agents()
      .then((a) => {
        setAgents(a);
        setDraftAgent((cur) => (a.some((x) => x.alias === cur) ? cur : (a[0]?.alias ?? cur)));
      })
      .catch(() => setAgents([]));
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const agentAlias = pathname.match(/^\/agents\/([^/]+)/)?.[1] ?? null;
  const page: PagePath | null = agentAlias ? "/agents" : pathname in PAGES ? (pathname as PagePath) : null;
  const routeId = pathname.match(/^\/c\/([^/]+)/)?.[1] ?? null;
  const sessionId = routeId ?? draftId;
  const known = useMemo(() => sessions.find((s) => s.session_id === sessionId), [sessions, sessionId]);
  const isDraft = !routeId;
  const startedHere = started.current.has(sessionId);
  const agent = known?.agent_alias ?? started.current.get(sessionId) ?? draftAgent;
  // A /c/<id> link opened before the list has loaded: wait, so history is not skipped.
  const waiting = !page && !isDraft && !known && !startedHere && loading;
  const fresh = isDraft || (!known && startedHere);

  const newChat = useCallback(() => {
    setDraftId(crypto.randomUUID());
    navigate("/");
    setDrawer(false);
  }, [navigate]);

  /** A fresh chat with the given agent. */
  function chatWith(alias: string) {
    setDraftAgent(alias);
    setLastAgent(alias);
    newChat();
  }

  function rename(id: string, title: string) {
    setTitle(id, title);
    syncTitles();
    api.renameSession(id, title).catch(() => {
      // the title is still kept in this browser
    });
  }

  function remove(id: string) {
    api
      .deleteSession(id)
      .then(() => {
        forget(id);
        dropTitle(id);
        dropChatMeta(id);
        syncTitles();
        setSessions((all) => all.filter((s) => s.session_id !== id));
        if (id === sessionId) newChat();
      })
      .catch((e) => setError(`Could not delete the chat: ${e instanceof Error ? e.message : e}`));
  }

  function onFirstMessage(content: string) {
    started.current.set(sessionId, agent);
    const title = titleFrom(content);
    setTitle(sessionId, title);
    syncTitles();
    navigate(`/c/${sessionId}`, { replace: true });
    // The row exists once the first turn is stored; naming it then is best effort.
    setTimeout(() => {
      api.renameSession(sessionId, title).catch(() => {});
      refresh();
    }, 1500);
  }

  const heading = page
    ? PAGES[page]
    : isDraft
      ? "New chat"
      : (pickTitle(known?.name, titles[sessionId]) ?? "Chat");

  return (
    <div className="flex h-full">
      {drawer && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform md:static md:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          sessions={sessions}
          titles={titles}
          activeId={!page && !isDraft ? sessionId : null}
          loading={loading}
          error={error}
          onNew={newChat}
          onOpen={(id) => {
            navigate(`/c/${id}`);
            setDrawer(false);
          }}
          onRename={rename}
          onDelete={remove}
          onNavigate={() => setDrawer(false)}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1 px-2 md:hidden">
          <IconButton label="Open menu" onClick={() => setDrawer(true)} className="h-10 w-10">
            <Menu size={20} />
          </IconButton>
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium">{heading}</span>
          <IconButton label="New chat" onClick={newChat} className="h-10 w-10">
            <SquarePen size={19} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1">
          <Suspense fallback={<PageSkeleton />}>
            {page === "/agents" && !agentAlias && <Agents agents={agents} onChat={chatWith} />}
            {agentAlias && (
              <AgentPage key={agentAlias} alias={agentAlias} agents={agents} onChat={chatWith} />
            )}
            {page === "/jobs" && <Jobs agents={agents} />}
            {page === "/memory" && <Memory agents={agents} />}
            {page === "/tools" && <Tools agents={agents} />}
            {page === "/status" && <Status />}
            {page === "/settings" && <Settings onSignOut={onSignOut} />}
          </Suspense>
          {!page && waiting && (
            <div className="mx-auto w-full max-w-3xl px-5 pt-6">
              <ChatSkeleton />
            </div>
          )}
          {!page && !waiting && (
            <Chat
              key={sessionId}
              sessionId={sessionId}
              agent={agent}
              agents={agents}
              fresh={fresh}
              readOnly={Boolean(known?.channel_id)}
              onPickAgent={(alias) => {
                setDraftAgent(alias);
                setLastAgent(alias);
              }}
              onFirstMessage={onFirstMessage}
              onActivity={refresh}
            />
          )}
        </div>
      </main>
    </div>
  );
}
