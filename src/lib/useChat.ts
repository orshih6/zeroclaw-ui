// One conversation as the page sees it. The conversation itself (history, stream, state)
// lives in conversations.ts so that it survives the page looking at something else.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { attach, busyChats, conversation, detach } from "./conversations";

type Options = {
  sessionId: string;
  agent: string;
  /** No messages on the server yet: nothing to load, and no stream until the first send. */
  fresh: boolean;
  readOnly: boolean;
  onFirstMessage: (content: string) => void;
  onTurnEnd: () => void;
};

export function useChat({ sessionId, agent, fresh, readOnly, onFirstMessage, onTurnEnd }: Options) {
  // `fresh` turns false after the first message of a new chat and the agent of a draft can
  // still change; neither makes it a different conversation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one conversation per chat
  const conv = useMemo(() => conversation(sessionId, agent, fresh, readOnly), [sessionId, readOnly]);
  // The callbacks change identity on every render of the parent; the stream must not care.
  conv.handlers = { onFirstMessage, onTurnEnd };

  useEffect(() => {
    attach(conv, agent);
    return () => detach(conv);
  }, [conv, agent]);

  const view = useSyncExternalStore(conv.subscribe, conv.getView);
  return {
    state: view.chat,
    loading: view.loading,
    loadError: view.loadError,
    status: view.status,
    send: conv.send,
    stop: conv.stop,
    decide: conv.decide,
    reconnect: conv.reconnect,
  };
}

/** Ids of the chats that are answering right now. */
export function useBusyChats(): readonly string[] {
  return useSyncExternalStore(busyChats.subscribe, busyChats.get);
}
