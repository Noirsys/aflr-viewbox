**# aFLR Viewbox — Implementation Plan (Codex Cloud)**



**## Definition of Done**

**- `npm ci`**

**- `npm run build`**

**- `npm run verify` (if present)**

**- GitHub Actions CI passes on PR**



**## Branching**

**- One PR per checklist item.**

**- Branch naming: `feat/<NNN>-<slug>` (example: `feat/010-ws-protocol-engine`)**



**## Checklist**



**### Foundation**

**- \[ ] 010 WS protocol engine: typed BroadcastState + reducer + safe parsing + connection status**

**- \[ ] 020 WebSocket reconnect/backoff + requestState/stateSync plumbing**

**- \[ ] 030 Debug overlay UI (`?debug=1`) + state dump**

**- \[ ] 040 Add `verify` script to package.json (if missing) and keep CI aligned**



**### Rendering Layers (React)**

**- \[ ] 100 Viewbox shell: fixed 1280x720 stage with absolute layer stacking**

**- \[ ] 110 Layer2 background video: supports src + show/hide + fit/crop rules**

**- \[ ] 120 Layer1/main audio playback: supports src + volume + play/stop**

**- \[ ] 130 Layer4 lower third: headline/subtext + styling baseline**

**- \[ ] 140 Marquee/ticker: scrolling items + bg/fg colors + speed**

**- \[ ] 150 Weather widget: temp/condition + icon placeholder**

**- \[ ] 160 Layer5: fullscreen video + emergency alert + hideLayer5 behavior**

**- \[ ] 170 Materials rendering: image/video/audio selection + preloading**



**### Demo + Tooling**

**- \[ ] 200 Ensure `scripts/run-demo-show.ts` works end-to-end against dev WS server**

**- \[ ] 210 Add a lightweight local WS relay (optional) for dev (`npm run ws:relay`)**

**- \[ ] 220 Add snapshot tests for reducer (message → state)**

**- \[ ] 230 Add basic e2e “smoke” script: start dev server, send WS messages, ensure no crash**



**### Hardening**

**- \[ ] 300 Graceful handling for missing media files (fallback UI, warnings)**

**- \[ ] 310 Rate-limit / debounce rapid WS updates to prevent render thrash**

**- \[ ] 320 Add telemetry hooks (console / optional endpoint) for agent debugging**



