# aFLR Viewbox (React + Vite)

A contract-driven 1280x720 broadcast viewbox that is controlled through WebSocket JSON envelopes defined in `docs/protocol.md`.

This implementation now includes a dedicated manual Control Board so we can run a full-quality broadcast manually while validating protocol behavior before agent automation is introduced.

## What is in this repo

- A deterministic 1280x720 render stage with layered broadcast composition (Layers 1-5)
- WebSocket protocol parser + reducer with safe handling of invalid/unknown messages
- Automatic reconnect with exponential backoff + `requestState` on connect
- Dedicated manual Control Board UI for sending protocol-valid commands to the WS server
- Demo scripts and smoke tooling for end-to-end validation

## Quick start

1. Install dependencies:

```bash
npm ci
```

2. Start a local relay (optional but recommended for local dev):

```bash
npm run ws:relay
```

3. Start the frontend:

```bash
npm run dev
```

Default WS URL is `ws://localhost:8088` and can be changed with `VITE_WS_URL`.

## UI modes

Use query param `ui`:

- `?ui=studio` (default): Viewbox + Manual Control Board on one page
- `?ui=viewbox`: Viewbox only (capture-safe rendering surface)
- `?ui=controller`: Control Board only (operate from a separate tab/display)

Additional dev flags:

- `?debug=1` shows telemetry/debug overlays
- `?guides=1` draws layer-4 layout guides from `docs/viewbox_spec.md`

## Manual controller behavior

The Control Board sends envelopes directly through the provider WS connection:

- Sends immediately when connected
- Queues messages when disconnected
- Flushes queued messages on reconnect
- Shows connection status, queue depth, send history, and validation errors

Control sections cover all protocol message families:

- Layer1/Layer2 media
- Layer4 text/story/main-content/weather/marquee
- Layer5 fullscreen + emergency alert
- `stateSync` helper for title/live-feed layout sync
- Raw JSON envelope sender for diagnostics

## Media asset locations

Place test assets under `public/media/**` so they resolve to `/media/**`:

- `public/media/layer1/` -> `/media/layer1/`
- `public/media/layer2/` -> `/media/layer2/`
- `public/media/layer3/` -> `/media/layer3/`
- `public/media/layer5/` -> `/media/layer5/`
- `public/media/content/` -> `/media/content/`
- `public/media/audio/` -> `/media/audio/`
- `public/media/marquee/` -> `/media/marquee/`

## Demo and validation scripts

Run a scripted demo show:

```bash
node --experimental-strip-types scripts/run-demo-show.ts --seed
```

Run a legacy asset regression show (DB + real media correlations):

```bash
npm run show:legacy -- --max-stories 15
```

`show:legacy` reads narration durations with `ffprobe` and paces each story so clips are not cut off.
It also starts with an opening jingle before story narration begins.

Run live operator mode (non-scripted, real-time command console):

```bash
npm run live:legacy
```

Example live commands:

- `list 20`
- `next`
- `force-next`
- `story 204`
- `force-story 237`
- `alt`
- `status`
- `break`
- `alert <text>`
- `clear-alert`

Live timing behavior:
- Startup applies a short opening lock so intro jingle + fullscreen opening can play before first story narration.
- `next` / `story <id>` queue while narration is active.
- `force-next` / `force-story <id>` now trigger a breaking package (fullscreen breaking video + stinger audio) before cutting over.

Cast-Assist standard and tuning guide:
- `docs/cast_assist_system_standard.md`
- `scripts/cast-assist/config.ts`
- `scripts/cast-assist/timing.ts`

Run smoke e2e:

```bash
npm run smoke:e2e -- --seed
```

Run full verification:

```bash
npm run verify
```

## Contract references

- Protocol contract: `docs/protocol.md`
- Pixel/layout spec: `docs/viewbox_spec.md`
- Source paper reference: `docs/nFLR.pdf`

## Agent Skill

Reusable skill package for future agent/controller migrations:

- `skills/aflr-broadcast-controller/SKILL.md`
- `skills/aflr-broadcast-controller/references/operations.md`
- `skills/aflr-broadcast-controller/references/protocol-message-cheatsheet.md`
