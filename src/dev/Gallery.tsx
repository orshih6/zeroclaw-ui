// Development only (/dev/gallery under `pnpm dev`): every kind of row a conversation can
// hold, with made-up content shaped like what ZeroClaw's assistant really writes. Look
// here after changing how messages are drawn. Not part of the production build.
import { ApprovalCard } from "../components/ApprovalCard";
import { Dots, Message, StreamingAnswer, Thinking } from "../components/Messages";
import { ToolGroup } from "../components/ToolCard";
import { toBlocks } from "../lib/blocks";
import { parseHistory } from "../lib/history";
import type { Item } from "../lib/types";

const tick = "`";
const fence = "```";

const ROWS = [
  {
    role: "user",
    content: "[CURRENT DATE & TIME: 2026-11-22 01:00:00 +00:00]\n\ntell me what things you can do ?",
  },
  {
    role: "assistant",
    content: `I'm **assistant** 🦀, and I can act across your machine, your accounts and your bots.

• **Files & code:** read, write and search the workspace, run shell commands (${tick}git${tick}, ${tick}cargo${tick}, ${tick}npm${tick}…), and do structured git work
• **Web:** search, fetch pages, call APIs, check the weather
• **Scheduling:** reminders and recurring jobs that report back here, like a daily digest or a check every hour
• **Memory:** remember your preferences and decisions between sessions
• **Kubernetes:** pods, logs, events and resource usage; I can change resources with your approval

**Safety:** nothing gets posted, sent or deleted without you seeing the exact text first and saying yes.

Want to try one? For example, "check my unread messages" or "what's running in the cluster?"`,
  },
  { role: "user", content: "what is connected right now, and is anything broken?\nkeep it short" },
  {
    role: "assistant",
    content: `<tool_call>\n{"name": "example__status", "arguments": {}}\n</tool_call>\n<tool_call>\n{"name": "kube__pods_list", "arguments": {"namespace": "apps"}}\n</tool_call>\n<tool_call>\n{"name": "memory_recall", "arguments": {"query": "connected services"}}\n</tool_call>`,
  },
  {
    role: "user",
    content: `[Tool results]\n<tool_result name="example__status">\n{"state":"running","rules":1,"matched":1}\n</tool_result>\n<tool_result name="kube__pods_list">\nNAME        READY   STATUS\napi-7c9d    1/1     Running\nworker-5f   0/1     CrashLoopBackOff\n</tool_result>\n<tool_result name="memory_recall">\nNo matching memories.\n</tool_result>`,
  },
  {
    role: "assistant",
    content: `Here's what's hooked up and how each one is doing:

## Connected services

| Service | Status | Notes |
|---|---|---|
| **Marketplace watcher** | ✅ Working | 1 active rule, **${tick}plus${tick}**: phone listings under a price, battery ≥90%. It has matched 1 ad so far. |
| **Social bot** | ✅ Working | Posting as **@example**. The last published post was four days ago, so nothing has gone out since. |
| **Messenger** | ⚠️ Not signed in | Fix it by running ${tick}examplectl auth login${tick}. Until then, reading and sending messages won't work. |
| **Cluster** | ❌ One pod failing | ${tick}worker-5f${tick} is in CrashLoopBackOff |

Two of these may have been tested earlier in our chat, but those results aren't in my current context.

## Built-in tools
- **System:** shell, file read/write/edit, glob and content search, git
- **Memory:** store, recall, forget, export
  - nested: scoped per agent
  - nested: searchable
- **Web:** search, page fetch, HTTP requests

### What I'd do next
1. Sign the messenger back in.
2. Look at the failing pod's logs:
   ${fence}bash
   kubectl -n apps logs deploy/worker --tail=50
   ${fence}
3. Tell me if you want a daily check.

> Anything that publishes, sends or deletes goes through you first.

More in the [project notes](https://example.com/notes).`,
  },
  { role: "user", content: "show me a small script that checks it every hour" },
  {
    role: "assistant",
    content: `<tool_call>\n{"name": "file_read", "arguments": {"path": "scripts/check.py"}}\n</tool_call>`,
  },
  {
    role: "user",
    content: `[Tool results]\n<tool_result name="file_read">\n(file not found)\n</tool_result>`,
  },
  {
    role: "assistant",
    content: `There is no script yet, so here is one. It prints one line per service and exits non-zero when something is down.

${fence}python
import sys
import requests  # third-party

SERVICES = {"api": "http://api.apps:8080/healthz", "worker": "http://worker.apps:8080/healthz"}

def check(name: str, url: str) -> bool:
    """Return True when the service answers 200."""
    try:
        return requests.get(url, timeout=5).status_code == 200
    except requests.RequestException:
        return False

if __name__ == "__main__":
    down = [n for n, u in SERVICES.items() if not check(n, u)]
    print("all good" if not down else f"down: {', '.join(down)}")
    sys.exit(1 if down else 0)
${fence}

And the schedule, as a cron job definition:

${fence}yaml
schedule: "0 * * * *"   # every hour
agent: assistant
deliver: { channel: telegram.home }
${fence}

Run it once with ${tick}python scripts/check.py${tick} before scheduling it. A long command wraps inside its own line: ${tick}kubectl -n apps get pods -l app.kubernetes.io/name=worker -o jsonpath='{.items[*].status.phase}'${tick}.

${fence}
plain text block without a language
  keeps its spacing
${fence}

- [x] script written
- [ ] scheduled`,
  },
  {
    role: "user",
    content:
      "[Memory context]\n- [from 2026-11-12] telegram_x_398: Pls approve all of them\n[/Memory context]\n\n[turn-context] time=03:00:19 date=2026-11-12 channel=telegram sender=someone. Notes for the model.\n\n\n[2026-11-12 03:00:18 +00:00] Сайн уу, монгол хэлээр хариулаарай. Энэ бол Telegram-аас ирсэн мессеж.",
  },
  {
    role: "assistant",
    content:
      "Сайн байна уу! Би танд монгол хэлээр хариулна.\n• Файл, код: унших, бичих, хайх\n• Вэб: хайлт хийх, хуудас татах\nӨөр асуух зүйл байна уу?",
  },
];

// What real tools return, and what a model sometimes writes in place of running one.
const TOOL_ROWS = [
  { role: "user", content: "what routes exist, scale the worker, and list my rules" },
  {
    role: "assistant",
    content:
      '<tool_call>{"name":"kube__resources_list","arguments":{"kind":"HTTPRoute","apiVersion":"gateway.networking.k8s.io/v1"}}</tool_call>\n<tool_call>{"name":"kube__resources_scale","arguments":{"name":"worker","scale":1}}</tool_call>\n<tool_call>{"name":"example__list_rules","arguments":{}}</tool_call>\n<tool_call>{"name":"securitybot__findings","arguments":{"state":"awaiting_approval"}}</tool_call>\n<tool_call>{"name":"memory_recall","arguments":{"query":"routes"}}</tool_call>',
  },
  {
    role: "user",
    content: `[Tool results]\n<tool_result name="kube__resources_list">\n${JSON.stringify({ content: [{ type: "text", text: 'NAMESPACE    APIVERSION                     KIND        NAME         HOSTNAMES              AGE\napps         gateway.networking.k8s.io/v1   HTTPRoute   api          ["api.example.com"]    27d\napps         gateway.networking.k8s.io/v1   HTTPRoute   worker       ["jobs.example.com"]   3d\n' }], structuredContent: { items: [] } })}\n</tool_result>\n<tool_result name="kube__resources_scale">\nTool call not executed: 'kube__resources_scale' requires approval and no operator decision was available, so the runtime denied it by policy. This was not a user's decision.\n</tool_result>\n<tool_result name="example__list_rules">\n${JSON.stringify({ rules: [{ name: "plus", paused: false, matched_so_far: 1, max: 1.8 }], total: 1, next: null })}\n</tool_result>\n<tool_result name="securitybot__findings">\nError: MCP server \`securitybot\` failed during tool call \`findings\`; outcome unknown and request was not replayed\n</tool_result>\n<tool_result name="memory_recall">\nFound 2 memories:\n- [core] routes: api and worker are public\n- [daily] 2026-11-21: asked about routes\n</tool_result>`,
  },
  {
    role: "assistant",
    content: "Two routes exist. I could not scale the worker, and the security bot did not answer.",
  },
  { role: "user", content: "summary of the cron jobs?" },
  {
    role: "assistant",
    content:
      "<cron_list>\n</cron_list>\n\n<tool_result>\n[]\n</tool_result>\n\n<reasoning_effort>10</reasoning_effort>\n\n<thinking_mode>interactive</thinking_mode>\n\nThere are no cron jobs set up right now; the list came back empty.",
  },
];

const extra: Item[] = [
  { id: "n1", kind: "notice", text: "Earlier messages were trimmed to fit the model's context." },
  {
    id: "e1",
    kind: "error",
    text: "anthropic.claude: 400 Third-party apps now draw from your extra usage, not your plan limits.",
  },
];

export function Gallery() {
  const blocks = toBlocks([...parseHistory(ROWS), ...parseHistory(TOOL_ROWS), ...extra]);
  const previews = new Map<string, string>();
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 pt-6 pb-16">
        {blocks.map((b) => (
          <div
            key={b.id}
            className={
              b.kind === "tools" || b.item.kind === "tool"
                ? "mt-3"
                : b.item.kind === "user"
                  ? "mt-8 first:mt-0"
                  : "mt-4"
            }
          >
            {b.kind === "tools" ? (
              <ToolGroup tools={b.tools} />
            ) : (
              <Message item={b.item} previews={previews} />
            )}
          </div>
        ))}
        <div className="mt-8">
          <Message
            item={{
              id: "u9",
              kind: "user",
              text: "and one that is still being answered",
              images: ["/x/shot.png"],
            }}
            previews={previews}
          />
        </div>
        <div className="mt-3">
          <ToolGroup
            tools={[
              { id: "t1", kind: "tool", name: "web_search", args: { q: "x" }, output: "…", pending: false },
              {
                id: "t2",
                kind: "tool",
                name: "web_fetch",
                args: { url: "https://example.com" },
                pending: true,
              },
            ]}
          />
        </div>
        <div className="mt-3">
          <Thinking text="Working out which service to check first." live />
        </div>
        <div className="mt-4">
          <StreamingAnswer text={"Checking the first service now. So far:\n• api is **up**\n• worker is"} />
        </div>
        <div className="mt-3">
          <Dots />
        </div>
        <div className="mt-4">
          <ApprovalCard
            approval={{
              requestId: "r",
              tool: "kube__pods_delete",
              summary: '{"namespace":"apps","name":"worker-5f"}',
              timeoutSecs: 120,
              receivedAt: Date.now(),
            }}
            onDecide={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
