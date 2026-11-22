// Conversations live outside the page that draws them. ZeroClaw streams a turn only to the
// socket that sent the message: a socket opened later gets nothing, not even the "done".
// So a chat that is still answering keeps its socket and its state when the reader goes to
// another chat or page, and coming back finds the answer where it would have been.
import { api } from "./api";
import { type ChatAction, type ChatState, chatReducer, emptyChat } from "./chatState";
import { parseHistory } from "./history";
import { ChatSocket, type SocketStatus } from "./socket";
import type { ServerEvent } from "./types";

const UNSENT = "Could not reach ZeroClaw. Your message was not sent.";
const POLL_MS = 2000;

export type ChatView = {
  chat: ChatState;
  status: SocketStatus;
  loading: boolean;
  loadError: string | null;
};

type Handlers = { onFirstMessage?: (content: string) => void; onTurnEnd?: () => void };

function waitUntilOpen(socket: ChatSocket, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const t = setInterval(() => {
      if (socket.open) {
        clearInterval(t);
        resolve(true);
      } else if (Date.now() - started > ms) {
        clearInterval(t);
        resolve(false);
      }
    }, 50);
  });
}

export class Conversation {
  handlers: Handlers = {};
  private view: ChatView;
  private listeners = new Set<() => void>();
  private socket: ChatSocket | null = null;
  private socketAgent = "";
  private attached = false;
  private sentAny: boolean;
  private loaded: boolean;
  /** Bumped when the conversation is put away, so late answers from before are dropped. */
  private run = 0;
  private poll: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly sessionId: string,
    private agent: string,
    /** No messages on the server yet: nothing to load, and no stream until the first send. */
    fresh: boolean,
    private readOnly: boolean,
  ) {
    this.sentAny = !fresh;
    this.loaded = fresh;
    this.view = { chat: emptyChat, status: "open", loading: !fresh, loadError: null };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getView = () => this.view;

  get busy() {
    return this.view.chat.busy;
  }

  private set(patch: Partial<ChatView>) {
    this.view = { ...this.view, ...patch };
    for (const fn of this.listeners) fn();
  }

  private dispatch(action: ChatAction) {
    this.set({ chat: chatReducer(this.view.chat, action) });
  }

  private onEvent = (event: ServerEvent) => {
    const was = this.busy;
    this.dispatch({ type: "server", event, now: Date.now() });
    if (event.type === "done" || event.type === "message") this.handlers.onTurnEnd?.();
    // Nobody is looking and the turn is over: the stream has nothing more to bring.
    if (was && !this.busy) {
      notifyBusy();
      if (!this.attached) this.closeSocket();
    }
  };

  private connect() {
    this.socket?.close();
    const s = new ChatSocket(this.agent, this.sessionId, this.onEvent, (status) => this.set({ status }));
    this.socket = s;
    this.socketAgent = this.agent;
    s.connect();
    return s;
  }

  private closeSocket() {
    this.socket?.close();
    this.socket = null;
  }

  reconnect = () => {
    this.connect();
  };

  /** The page shows this conversation now. */
  attach(agent: string) {
    this.attached = true;
    this.agent = agent;
    if (!this.loaded) this.load();
    if (this.readOnly || !this.sentAny) return;
    // A turn in flight belongs to the socket it was sent on: never replace that one.
    if (!this.socket || (this.socketAgent !== agent && !this.busy)) this.connect();
  }

  /** The page moved on. Returns true when the conversation can be forgotten. */
  detach(): boolean {
    this.attached = false;
    if (this.busy && this.socket) return false;
    this.dispose();
    return true;
  }

  /** Stops everything. What was loaded is read again if the conversation is shown again. */
  dispose() {
    this.run += 1;
    if (this.poll) clearTimeout(this.poll);
    this.poll = null;
    this.closeSocket();
    if (this.view.loading) this.loaded = false;
  }

  private load() {
    const run = this.run;
    this.loaded = true;
    this.set({ loading: true, loadError: null });
    api
      .messages(this.sessionId)
      .then((rows) => {
        if (run !== this.run) return;
        this.dispatch({ type: "history", items: parseHistory(rows) });
        this.set({ loading: false });
        if (!this.readOnly) this.watchIfRunning(run);
      })
      .catch((e) => {
        if (run !== this.run) return;
        this.loaded = false;
        this.set({ loading: false, loadError: e instanceof Error ? e.message : String(e) });
      });
  }

  // Opened while a turn started somewhere else (another tab, before a reload) is still
  // running: its stream cannot be joined, so wait for it to end and read what was saved.
  private watchIfRunning(run: number) {
    api
      .sessionState(this.sessionId)
      .then((state) => {
        // Busy by now means the reader sent a message meanwhile: that turn has its stream.
        if (run !== this.run || this.busy || state !== "running") return;
        this.dispatch({ type: "waiting" });
        notifyBusy();
        this.poll = setTimeout(() => this.waitForEnd(run), POLL_MS);
      })
      .catch(() => {
        // the saved history is still shown
      });
  }

  private waitForEnd(run: number) {
    if (run !== this.run) return;
    api
      .sessionState(this.sessionId)
      .then(async (state) => {
        if (run !== this.run) return;
        if (state === "running") {
          this.poll = setTimeout(() => this.waitForEnd(run), POLL_MS);
          return;
        }
        const rows = await api.messages(this.sessionId);
        if (run !== this.run) return;
        this.dispatch({ type: "caught_up", items: parseHistory(rows) });
        notifyBusy();
        this.handlers.onTurnEnd?.();
        if (!this.attached) this.closeSocket();
      })
      .catch(() => {
        if (run === this.run) this.poll = setTimeout(() => this.waitForEnd(run), POLL_MS * 2);
      });
  }

  send = async (text: string, markers: string[], imagePaths: string[]) => {
    const content = [text, ...markers].filter(Boolean).join("\n");
    const s = this.socket ?? this.connect();
    if (!s.open && !(await waitUntilOpen(s, 10000))) {
      this.dispatch({ type: "problem", text: UNSENT });
      return false;
    }
    try {
      s.send(content);
    } catch {
      this.dispatch({ type: "problem", text: UNSENT });
      return false;
    }
    this.dispatch({ type: "sent", text, images: imagePaths });
    notifyBusy();
    if (!this.sentAny) {
      this.sentAny = true;
      this.handlers.onFirstMessage?.(content);
    }
    return true;
  };

  stop = () => {
    api
      .abortSession(this.sessionId)
      .catch(() => this.dispatch({ type: "problem", text: "Could not stop the answer." }));
  };

  decide = (decision: "approve" | "deny" | "always") => {
    const approval = this.view.chat.approval;
    if (!approval) return;
    this.socket?.approve(approval.requestId, decision);
    this.dispatch({ type: "approval_answered" });
  };
}

const live = new Map<string, Conversation>();
const busyListeners = new Set<() => void>();
let busyIds: readonly string[] = [];

function notifyBusy() {
  const next = [...live.values()].filter((c) => c.busy).map((c) => c.sessionId);
  if (next.length === busyIds.length && next.every((id, i) => id === busyIds[i])) return;
  busyIds = next;
  for (const fn of busyListeners) fn();
}

/** The conversation for a chat: the one still running in the background, or a new one. */
export function conversation(sessionId: string, agent: string, fresh: boolean, readOnly: boolean) {
  return live.get(sessionId) ?? new Conversation(sessionId, agent, fresh, readOnly);
}

export function attach(c: Conversation, agent: string) {
  live.set(c.sessionId, c);
  c.attach(agent);
}

export function detach(c: Conversation) {
  if (c.detach() && live.get(c.sessionId) === c) live.delete(c.sessionId);
  notifyBusy();
}

/** The chat was deleted: drop what is kept of it. */
export function forget(sessionId: string) {
  const c = live.get(sessionId);
  if (!c) return;
  live.delete(sessionId);
  c.dispose();
  notifyBusy();
}

/** Ids of the chats that are answering right now, for the sidebar. */
export const busyChats = {
  subscribe: (fn: () => void) => {
    busyListeners.add(fn);
    return () => {
      busyListeners.delete(fn);
    };
  },
  get: () => busyIds,
};
