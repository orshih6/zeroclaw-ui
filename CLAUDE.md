# CLAUDE.md

A Claude-style web UI for a ZeroClaw agent (https://github.com/zeroclaw-labs/zeroclaw).
It is only a face: ZeroClaw keeps the agents, tools, cron jobs, memory and the channels
(Telegram). Nothing here stores data. The repo is open source (MIT): keep hostnames, account
names and text from real chats out of the code, tests and the gallery.

## How it fits together

```
browser ── https://chat.example.com ──> zeroclaw-ui container (nginx)
                                           ├─ /            the built page (Vite + React)
                                           ├─ /api/*  ──>  ZEROCLAW_UPSTREAM (host:42617)
                                           └─ /ws/*   ──>  ZEROCLAW_UPSTREAM
```

- **Login is ZeroClaw's pairing.** A one-time code (`zeroclaw gateway get-paircode --new` where
  ZeroClaw runs) is traded at `POST /api/pair` for a bearer token kept in the browser's
  `localStorage`. nginx adds no token and no check of its own. A paired browser has full
  agent access, including approving tool calls.
- **Chat** is a WebSocket: `/ws/chat?session_id=<uuid>&agent=<alias>`, subprotocols
  `zeroclaw.v1` and `bearer.<token>` (the token is never put in the URL). The browser sends
  `{type:"message",content}` and `{type:"approval_response",request_id,decision}`; ZeroClaw
  sends `session_start`, `thinking`, `chunk`, `chunk_reset`, `tool_call`, `tool_result`,
  `approval_request`, `done`, `error`, `aborted`, `history_trimmed`. See `src/lib/socket.ts`
  and the handler in `src/pages/Chat.tsx`.
- **Saved conversations** come back as plain text rows with tool calls written inline
  (`<tool_call>{json}</tool_call>`, results in a "user" row starting `[Tool results]`).
  `src/lib/history.ts` turns them back into messages and tool cards; it has tests.

## Where things are

- `src/lib/api.ts`, `socket.ts`: the only code that knows ZeroClaw's API.
- `src/lib/chatState.ts`: what a conversation shows, as a pure reducer over the stream's
  events (tested). `conversations.ts` holds each conversation (history, socket, state)
  outside React; `useChat.ts` only subscribes to it; `pages/Chat.tsx` only draws it.
- `src/lib/history.ts`: saved rows back into messages and tool cards (tested).
- `src/lib/markdown.ts`, `highlight.ts`, `components/Markdown.tsx`: how an answer is drawn.
  The assistant writes for Telegram ("•" lines, single line breaks), so bullets are turned
  into real lists first. Code is coloured by a small plugin of ours with a dozen languages
  (rehype-highlight always ships ~35). All the look is `.prose-z` in `styles.css`.
- `src/lib/protocol.ts`: splits model text into prose and the tool markup inside it (tested).
  Used for saved history, a job's output and the live answer alike. `src/lib/toolResult.ts`
  works out what a tool's result is (table, JSON, error, refusal, text; unwraps MCP's
  `{"content":[{"text":…}]}` envelope, also when cut off); `components/ToolCard.tsx` draws it.
- `src/lib/blocks.ts`: a run of tool calls becomes one "Used N tools" line.
- `src/dev/Gallery.tsx`: **http://localhost:5273/dev/gallery** under `pnpm dev`, every kind
  of message with made-up content, no login needed. Look at it (light, dark, phone width)
  after changing how messages are drawn. It is not in the production build.
- **Loading states** are `Loading` (pick the `shape` that matches what is coming: cards,
  rows, chips, text, field), `Skeleton`, `ChatSkeleton` and `useDelayed`. Nothing is drawn
  for the first 180 ms, so a fast answer does not flash a placeholder. Never write a bare
  "Loading…" line, and never show a number (a count, a total) before it is known.
  Arrived content uses the `appear` class; all of it stops under reduced motion.
- `src/components/ui.tsx`: Button, Modal, Page, Note, Confirm, Segmented, `fieldClass`. New
  screens use these instead of their own classes.
- `src/pages/Agents.tsx`, `src/lib/agents.ts`: the Agents list and one page per agent
  (instructions, model, "ask me first", switch off). Deliberately plain: one column, one
  section per question a person has, words not config keys. Do not turn it into ZeroClaw's
  settings grid; what does not fit stays in ZeroClaw's own dashboard.
- `src/lib/telegram.ts`, `useTelegramBack.ts`: what changes when the page is opened as a
  Telegram Mini App (theme, bar colours, Back button, no swipe-to-close, the home
  indicator). Outside Telegram none of it runs.
- `src/pages/Today.tsx` (`/today`): the page to open first. `todayView` (tested) sorts each
  job's latest run into "needs a look", "new since the last visit", a count of runs with
  nothing to report, and "seen before". It reuses `runPreview` / `runConcern` from Jobs, so
  the two pages always agree on what a run said. The last visit and the quick requests are
  kept in this browser (`zcui_today_seen`, `zcui_prompts`); the visit is recorded when the
  page is left, not when it opens, or a reload would hide what was new. A quick request
  starts a new chat and sends it at once (`ask` on `Chat`): a real turn. Approvals are not
  listed: ZeroClaw has no list of them, a request only reaches the socket that sent the
  message.
- Pages: `Chat`, `Jobs`, `Memory`, `Tools`, `Status` (health, self-check, usage, log
  warnings), `Settings` (paired devices, pairing codes, theme). All but Chat load on demand.

## Things that are easy to get wrong

- **ZeroClaw's chat, session, cron and memory API is not documented.** It was read from the
  v0.9.0 dashboard's code and checked against the live instance on 2026-11-22. After a
  ZeroClaw upgrade, test this UI before trusting it; `src/lib/api.ts` and `socket.ts` are the
  only places that know the API.
- **A turn is streamed only to the socket that sent the message.** A socket opened later
  for the same session gets `session_start` and then nothing, not even `done`; the turn
  still runs to the end and is saved. The user's message is saved only when the turn ends,
  so mid-turn the history is empty. That is why a conversation that is answering keeps its
  socket and state in `conversations.ts` when the page shows something else (closing it on
  unmount made the chat look dead after switching away and back). Opened with no live
  stream (reload, another device), the chat asks `GET /api/sessions/<id>/state`, and while
  it says `running` waits and then reads the saved rows. `state` stays `idle` for up to
  ~10 s after a send, before the turn starts: a reload in that window shows nothing running.
- **ZeroClaw can take 10 to 30 s before the first event of a turn.** The dots carry a line
  that says what the wait is for ("Starting", "Using cron list", "Working") and, after 4 s,
  for how long (`Working` in `Messages.tsx`, `startedAt` in `chatState.ts`). Keep it: a
  silent wait reads as a stuck page.
- **The model and the context use arrive only in the live `done` event**, not in saved
  history. They are remembered per chat in this browser (`zcui_chat_meta`) so a reload
  still shows them. A new chat starts near 55 to 65% context (ZeroClaw's instructions and
  ~150 tools); the footer turns into a warning from 85%.
- **Each agent has its own tool bundle** (`/api/tools?agent=`): Upwork's tools belong to the
  `upwork` agent alone. A tool server is down only when no agent has its tools
  (`lib/toolServers.ts`, used by Tools and by the Status headline). Asking only `assistant`
  once made the Tools page report Upwork as not answering when it was fine.
- `last_seen` on a paired device is never updated by ZeroClaw (it equals `paired_at`), so
  the device list cannot say when a device was last used.
- A new chat opens its WebSocket on the **first message**, not when the page opens, so
  looking at the empty page creates nothing on the server.
- `POST /api/cron` ignores `enabled: false` (a new job starts enabled) and needs the field
  `agent`, not `agent_alias`. `PATCH /api/cron/<id>` does take `enabled`.
- **A scheduled job's run is not a chat.** Runs are isolated and appear in no session list;
  each leaves one text (`runs[].output`, and `last_output` on the job), cut at 16 KB. It is
  usually just the answer, sometimes the whole turn with tool calls inline. `parseTranscript`
  reads both, so the Jobs page can draw a run like a chat answer. `NO_REPLY` is what a job
  answers when it was told to stay silent: shown as "Nothing new".
- **ZeroClaw calls a run "ok" when the turn ended, not when the work was done.** The Jobs
  list adds its own mark (`runConcern`): "Nothing was run" (only made-up tool calls), "No
  summary", or "May need a look" when the run's first line says it could not do the job.
  The last is a guess from words, so it is amber, never red; red is for `last_status`.
- `POST /api/memory` with an existing key replaces that entry: that is how editing works.
- A chat's title is ZeroClaw's `name` (set with `PUT /api/sessions/<id>`, returned by the
  session list); this browser also keeps one (`zcui_titles`) for chats that have none yet.
  A chat that opened with a greeting ("hello") is renamed after its first real question
  once it has one (`titleFromItems`, `pickTitle`).
- Saved user rows carry what ZeroClaw added for the model: `[CURRENT DATE & TIME: …]`, and for
  Telegram a `[Memory context]…[/Memory context]` block, a `[turn-context] …` line and an
  arrival time. `cleanUserText` strips them; rows like `[Tool call parse error]` were never
  typed by a person and are hidden. New wrappers will show up as junk in user bubbles: add
  them there, with a test.
- **Only ZeroClaw's own `<tool_call>{json}</tool_call>` in an answer was really run.** A model
  also writes calls ZeroClaw never acts on: the `<invoke>` dialect, a tool's name as a tag
  (`<cron_list></cron_list>`), a `<tool_result>` or `<function_results>` block it made up, tags echoed from its prompt
  (`<reasoning_effort>`). Seen in a real chat: the assistant invented a `cron_list` call and
  an empty result, then said there were no cron jobs (there were 7). Such markup is removed
  and replaced by one **caution** row saying the call was never run. Never draw it as a tool
  card: that would present a made-up result as a real one. Results are trusted only in text
  ZeroClaw wrote (`splitModelText(text, "zeroclaw")`: tool-result rows, a job's output).
- Telegram conversations are shown read-only on purpose: writing into them from here would
  mix two channels in one session.
- Images only: ZeroClaw's `/api/upload` returns an `[IMAGE:<path>]` marker that goes into
  the message text. The `chat` agent's model (claude-chat) takes no images, so the attach button is hidden for it. It is not tool-less: both agents share the `tools` bundle and the `assistant` risk profile; `chat` calls tools as text, which ZeroClaw sometimes fails to parse.
- **Instructions are ZeroClaw's workspace files** (`USER.md`, `AGENTS.md`, `SOUL.md`, …) through
  `/api/personality`. A save sends the file's time when it was opened; ZeroClaw answers 409
  if it changed since (the agent edits these files itself), shown as "changed somewhere
  else". Never retry a 409 by dropping the time: that would overwrite the agent's edit.
- **"Ask me first" is `risk_profiles.<name>.always_ask`**, and both agents use the same
  profile, so the list is shared; the page says which agents share it.
- Creating or deleting an agent makes ZeroClaw restart its gateway and channels for a few
  seconds (503s, Telegram "starting"). `request()` waits out 503s. There is no create-agent
  screen yet, and whether a per-agent tool bundle is enforced was not confirmed (the tools
  list ignores it).
- **The model menu changes ZeroClaw's config**, not something local: it writes
  `providers.models.<provider>.model` for the provider the agent uses, which takes effect at
  once and also applies to Telegram and scheduled jobs. The menu says so; keep that sentence.
- `POST /api/pairing/initiate` makes a pairing code for an already paired browser (Settings).
  ZeroClaw's device list does not say which device is "this browser"; `pairedAs()` remembers
  the name and time of pairing to find it.
- Usage is shown in tokens and requests: on the subscription ZeroClaw's cost fields are 0.
- Base styles in `styles.css` live in `@layer base`. Unlayered CSS beats every Tailwind
  utility, which is how a global focus outline once overrode `outline-none` on the message box.
- The look follows the layout people know from Claude's web app (sidebar of chats, centred
  column, rounded message box) but must not copy Anthropic's name, logo or colours.

- **Inside Telegram (`src/lib/telegram.ts`) the page talks to the Telegram app itself and
  never loads telegram.org's script.** A paired browser holds a token with full control of
  the agent, so the CSP allows no third-party script; keep it that way. Telegram's launch
  parameters arrive in the URL fragment (kept in `sessionStorage` for reloads, then removed
  from the address because they carry Telegram's signed data about the person, which
  nothing here uses). Sign-in stays ZeroClaw's pairing code: do not turn Telegram's signed
  data into a login without a server-side check that holds the bot token. nginx refuses
  framing, so Telegram Web (an iframe) cannot open it; the phone and desktop apps can.
  The menu button that opens it is set on the bot through Telegram's API, not by this repo.

## Commands

```bash
pnpm dev      # http://localhost:5273, /api and /ws go to ZEROCLAW_URL (.env.local; default 127.0.0.1:42617)
pnpm test     # vitest
pnpm lint     # biome check
pnpm build    # tsc + vite build -> dist/
```

`pnpm dev` talks to the **real** ZeroClaw: a message you send there is a real turn on the
subscription, and jobs or memories you change are the real ones.

## Deploy

Push to `main`: CI lints, tests and builds `ghcr.io/<owner>/zeroclaw-ui:sha-<commit>`. When
the repository variable `MANIFEST_REPO` is set, it also bumps `apps/zeroclaw-ui` in that
manifest repo so Argo CD rolls it out. `VITE_DASHBOARD_URL` (repository variable
`DASHBOARD_URL` in CI) is the only build-time setting; `ZEROCLAW_UPSTREAM` is set on the
container. `k8s/` holds examples only: a real installation's routes and certificates do not
belong in this repo.
