# zeroclaw-ui

A chat interface for [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw) in the style of
the Claude web app: your conversations on the left, the chat in the middle, tool calls folded
away until you want them. It also has pages for ZeroClaw's agents, scheduled jobs, memory,
tools and status.

It connects to a ZeroClaw you already run and stores nothing itself. Sign-in is ZeroClaw's
own pairing code.

> **Unofficial.** This project is not part of ZeroClaw and not affiliated with Anthropic.
> It is built on ZeroClaw's chat, session, cron and memory API, which is not documented. It
> was written against **ZeroClaw v0.9.0**; another version may break parts of it.

## What it does

- Today: what the scheduled jobs did since you last looked, what needs you (a failed job,
  a tool server that is down), what runs next, and one-tap buttons for your usual requests
- Chat with any agent, with streaming answers, tool calls, approvals and image upload
- Rename, delete and reopen conversations; Telegram conversations are readable
- Scheduled jobs: see, add, edit, switch on or off, run now, and read past runs
- Memory: search, add, edit and delete what the agent remembers
- Agents: edit what each one has been told, its model, and what it must ask before doing
- Model switcher per agent
- Tools: every tool the agent has, grouped by where it comes from, and which servers are down
- Status: health of each part, self-check, usage in tokens, recent warnings and errors
- Settings: paired devices, pairing codes for a new browser, theme
- Light and dark theme, works on a phone
- Opens inside Telegram as a Mini App of your ZeroClaw bot (optional)

## Before you put it online

**A paired browser is the owner.** It can read every conversation and memory, change agents
and scheduled jobs, and approve tool calls. There are no user accounts and no separation
between people: this is a personal interface for one ZeroClaw, not a multi-user chat service.

- Give pairing codes only to yourself or people you trust with the whole agent.
- Serve it over HTTPS only. The pairing token is kept in the browser and sent on every request.
- The page adds no access check of its own; ZeroClaw's pairing is the only one.

## Try it

You need Node 24, pnpm and a running ZeroClaw gateway.

```bash
pnpm install
cp .env.example .env.local     # set ZEROCLAW_URL to your ZeroClaw gateway
pnpm dev                       # http://localhost:5273
```

Get a pairing code where ZeroClaw runs and enter it on the page:

```bash
zeroclaw gateway get-paircode --new
```

`pnpm dev` talks to your real ZeroClaw: a message you send is a real turn, and jobs or
memories you change are the real ones. To look at every kind of message without a ZeroClaw,
open http://localhost:5273/dev/gallery.

## Run it

The image is nginx serving the built page and passing `/api` and `/ws` to ZeroClaw.

```bash
docker build -t zeroclaw-ui .
docker run -p 8080:8080 -e ZEROCLAW_UPSTREAM=<zeroclaw-host>:42617 zeroclaw-ui
```

| Setting | When | What it is |
|---|---|---|
| `ZEROCLAW_UPSTREAM` | container start | `host:port` of the ZeroClaw gateway. Default `zeroclaw.zeroclaw.svc.cluster.local:42617` |
| `ZEROCLAW_FRAME_ANCESTORS` | container start | Sites allowed to show the page in a frame. Default `'none'`; `https://web.telegram.org` for Telegram Web |
| `VITE_DASHBOARD_URL` | build (`--build-arg`) | Optional. Address of ZeroClaw's own dashboard; Settings links to it |

Whatever sits in front (a reverse proxy, an ingress) must allow WebSockets and requests that
run for minutes. Kubernetes examples are in [`k8s/`](k8s/README.md).

## Open it from Telegram

If ZeroClaw has a Telegram bot, that bot can carry a button that opens this page inside
Telegram (a Mini App). Set it once, with the bot's token and your own chat id:

```bash
curl -s "https://api.telegram.org/bot<token>/setChatMenuButton" \
  -H 'Content-Type: application/json' \
  -d '{"chat_id": <your chat id>, "menu_button": {"type": "web_app", "text": "Open", "web_app": {"url": "https://chat.example.com/today"}}}'
```

The button appears beside the message box and opens the Today page (leave `/today` off to
open on a new chat). Inside Telegram the page takes Telegram's light
or dark theme (when the theme setting is "system"), uses Telegram's Back button, and cannot
be swiped closed while you scroll a chat. Sign-in is the same pairing code, entered once
inside Telegram; Telegram's own sign-in data is not used.

Telegram Web shows Mini Apps in a frame, and by default this page refuses to be framed by
anyone. To use it there, start the container with
`ZEROCLAW_FRAME_ANCESTORS=https://web.telegram.org`: only Telegram Web may then frame it.
A browser keeps a framed page's sign-in apart from the site opened directly, so you pair
once more inside Telegram Web; a browser set to block third-party storage forgets it when
the frame closes.

## Develop

```bash
pnpm test     # vitest
pnpm lint     # biome check
pnpm build    # tsc + vite build -> dist/
```

[`CLAUDE.md`](CLAUDE.md) explains how the code is laid out and what is easy to get wrong
about ZeroClaw's API. `src/lib/api.ts` and `src/lib/socket.ts` are the only files that know
that API, so a fix for a newer ZeroClaw usually starts there.

## License

[MIT](LICENSE)
