// ZeroClaw's chat stream: wss://<host>/ws/chat?session_id=…&agent=…, subprotocols
// "zeroclaw.v1" and "bearer.<token>". The token rides in the subprotocol only, so it never
// lands in a URL or an access log.
import { UNAUTHORIZED_EVENT, getToken, setToken } from "./api";
import type { ServerEvent } from "./types";

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_OPEN_ELSEWHERE = 4409;

export type SocketStatus = "connecting" | "open" | "closed" | "elsewhere";

export class ChatSocket {
  private ws: WebSocket | null = null;
  private closedByUs = false;
  private delay = 1000;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private agent: string,
    private sessionId: string,
    private onEvent: (e: ServerEvent) => void,
    private onStatus: (s: SocketStatus) => void,
  ) {}

  connect() {
    this.closedByUs = false;
    if (this.timer) clearTimeout(this.timer);
    const token = getToken();
    const q = new URLSearchParams({ session_id: this.sessionId, agent: this.agent });
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const protocols = ["zeroclaw.v1"];
    if (token) protocols.push(`bearer.${token}`);
    this.onStatus("connecting");
    const ws = new WebSocket(`${proto}//${location.host}/ws/chat?${q}`, protocols);
    this.ws = ws;
    ws.onopen = () => {
      this.delay = 1000;
      this.onStatus("open");
    };
    ws.onmessage = (ev) => {
      try {
        this.onEvent(JSON.parse(ev.data as string));
      } catch {
        // not JSON: nothing we can show
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      if (this.closedByUs) return;
      if (ev.code === CLOSE_UNAUTHORIZED) {
        setToken(null);
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        return;
      }
      if (ev.code === CLOSE_OPEN_ELSEWHERE) {
        this.onStatus("elsewhere");
        return;
      }
      this.onStatus("closed");
      this.timer = setTimeout(() => {
        this.delay = Math.min(this.delay * 2, 30000);
        this.connect();
      }, this.delay);
    };
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(content: string) {
    if (!this.open) throw new Error("Not connected");
    this.ws?.send(JSON.stringify({ type: "message", content }));
  }

  approve(requestId: string, decision: "approve" | "deny" | "always") {
    if (!this.open) return;
    this.ws?.send(JSON.stringify({ type: "approval_response", request_id: requestId, decision }));
  }

  close() {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}
