# aFLR Cast-Assist System Standard

This document standardizes how the broadcast cast is controlled in real-time and how the Cast-Assist layer reduces decision burden for human and agent operators.

## 1. System Layers

1. Viewbox Render Engine (`src/App.tsx`)
- Contract-driven 1280x720 compositor.
- Renders Layers 1-5 from WebSocket envelope state.
- Layer1 now has two independent audio players:
  - `Layer1BackgroundAudio` for `/media/layer1/*` (jingles, stingers, beds).
  - `Layer1MainAudio` for `/media/audio/*` narration.

2. Control Surfaces
- Browser control board: `src/controller/ManualController.tsx`
- CLI control board:
  - `scripts/live-legacy-driver.ts` (interactive, real-time)
  - `scripts/run-legacy-real-show.ts` (scripted regression run)

3. Cast-Assist Policy Layer (between controller and viewbox)
- `scripts/cast-assist/config.ts`
- `scripts/cast-assist/timing.ts`
- Provides tunable orchestration rules:
  - opening lock timing
  - narration pacing
  - transient layer1 restore timing
  - asset preference lists (jingles/stingers/loops/marquees)

4. Transport Layer
- WebSocket relay/server receives and broadcasts envelope messages:
  - default: `ws://localhost:8088`

## 2. Envelope Contract

Each command must follow:

```json
{
  "type": "messageType",
  "timestamp": 1730000000000,
  "data": {}
}
```

Message schemas are defined in `docs/protocol.md`.

## 3. Real-Time Cast Control (Operator/Agent)

### Startup

1. Start relay:
```bash
npm run ws:relay
```

2. Start frontend:
```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

3. Open display/operator tabs:
```bash
google-chrome --new-window \
  "http://127.0.0.1:5173/?ui=viewbox" \
  "http://127.0.0.1:5173/?ui=controller&debug=1"
```

4. Start live CLI operator:
```bash
npm run live:legacy
```

### Live CLI Command Set (`npm run live:legacy`)

- `list [n]` show active rundown rows
- `next` queue-safe next story
- `force-next` BREAKING interrupt + immediate next story
- `story <id>` queue-safe specific story
- `force-story <id>` BREAKING interrupt + immediate story
- `alt` rotate to next material for last story
- `status` show opening lock, narration lock, queue status
- `break` trigger breaking package (video + stinger)
- `alert <text>` show emergency alert
- `clear-alert` clear alert + hide layer5
- `weather <temp>` weather update
- `marquee-list` list discovered ticker files
- `marquee-next` cycle ticker file
- `marquee <file.txt>` set specific ticker file
- `bg <video.mp4>` set layer2 background loop
- `bed <file.mp3|stop>` start/stop layer1 background audio
- `stop-audio` stop main narration audio
- `state` send `requestState`
- `quit` exit

### Browser Control Board (`?ui=controller`)

Manual sections cover:
- Layer1/Layer2 audio-video
- Headline/subtext/main-content/full-story
- Weather + marquee updates
- Layer5 fullscreen and alert controls
- `requestState`
- Raw envelope sender for diagnostics

## 4. Marquee/Ticker Operations

Ticker files are loaded from `/media/marquee/*.txt`.

Color encoding convention:
- filename ending in `_<RRGGBB>.txt` sets background color
- example: `LOCAL_XYZ_772222.txt` -> `#772222`

Recommended runtime practices:
- rotate ticker sets at segment boundaries with `marquee-next`
- use direct file targeting for editorial control:
  - `marquee POLITICS_XYZ_444455.txt`
  - `marquee FINANCE_XYZ_22AA22.txt`

## 5. Cast-Assist Behaviors (Default)

### Opening Sequence Safety
- Intro applies an opening lock derived from:
  - opening fullscreen minimum hold
  - opening jingle duration + buffer
  - minimum lock floor
- During opening lock:
  - `next` / `story` are queued
  - no narration starts over the intro package

### Narration Safety
- Story narration durations are probed via `ffprobe`.
- Runtime uses duration-aware pacing by default.
- Live mode uses narration lock:
  - queue-safe commands wait for narration completion.

### Breaking Interrupt Combo
- `force-next` and `force-story` perform an automatic interrupt combo:
  1. stop current narration
  2. play breaking fullscreen video
  3. play breaking stinger audio
  4. cut to requested story

### Layer1 Transient Restore
- Jingles/stingers are treated as transient layer1 clips.
- Cast-Assist restores background bed automatically after transient clip duration.

## 6. Cast-Assist Tuning Surface

Tune these in `scripts/cast-assist/config.ts`:
- `opening.minLockMs`
- `opening.fullscreenHoldMs`
- `opening.postJingleBufferMs`
- `narration.defaultStoryHoldMs`
- `narration.fallbackUnknownAudioMs`
- `narration.postNarrationBufferMs`
- `layer1Transient.restoreBufferMs`
- `layer1Transient.fallbackDurationMs`
- Asset candidate priority lists for opening/breaking/loop/marquee selections

Timing functions live in `scripts/cast-assist/timing.ts`.

## 7. Regression and Validation

Scripted regression:
```bash
npm run show:legacy -- --max-stories 15
```

Dry run (plan only):
```bash
npm run show:legacy -- --dry-run --max-stories 8
```

Repo validation:
```bash
npm run verify
```

## 8. Agentic Operations Guidance

For AI agent teams operating live:

1. Prefer queue-safe commands (`next`, `story`) unless interruption is editorially justified.
2. Use `force-*` only for true break-ins; it already triggers the breaking combo.
3. Use `status` before issuing high-impact commands to avoid unnecessary collisions.
4. Rotate marquee context intentionally (category/time updates) rather than leaving stale ticker text.
5. Keep layer2 loop active continuously; use layer5 only for explicit transitions/break-ins.
6. Let Cast-Assist timing defaults handle pacing unless editorial override is required.

