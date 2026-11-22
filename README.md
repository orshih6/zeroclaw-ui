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
| `VITE_DASHBOARD_URL` | build (`--build-arg`) | Optional. Address of ZeroClaw's own dashboard; Settings links to it |

Whatever sits in front (a reverse proxy, an ingress) must allow WebSockets and requests that
run for minutes. Kubernetes examples are in [`k8s/`](k8s/README.md).

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
