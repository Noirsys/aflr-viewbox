**# aFLR Viewbox — Implementation Plan (Codex Cloud)**



**## Visual Ground Truth (Do not invent layout)**

**- Pixel spec: `docs/viewbox_spec.md`**

**- References:**
  - `docs/reference/figure-2.4_layer4_layout.png`
  - `docs/reference/figure-2.5_full_mockup.png`
  - `docs/nFLR.pdf` (reference doc)

** Codex tasks must match these references. If any ambiguity exists, prefer the pixel spec. **



**## Definition of Done**

**- `npm ci`**

**- `npm run build`**

**- `npm run verify` (if present)**

**- GitHub Actions CI passes on PR**



**## Rules for Codex**

**- Work on exactly ONE checklist item per PR.**

**- Do not restyle layout unless the item explicitly says to.**

**- Must run and pass `npm run build` (and `npm run verify` if present).**

**- Update this checklist: check off completed item and add notes if needed.**

**- New tasks may be added only if required to complete the current item or to fix CI failures.**



**## Branching**

**- One PR per checklist item.**

**- Branch naming: `feat/<NNN>-<slug>` (example: `feat/010-ws-protocol-engine`)**



**## Checklist**



**### Foundation**

**- \[x] 005 Add viewbox spec + reference screenshots to repo (docs/viewbox_spec.md + docs/reference/*)**

**- \[x] 010 WS protocol engine: typed BroadcastState + reducer + safe parsing + connection status**

**- \[x] 020 WebSocket reconnect/backoff + requestState/stateSync plumbing**

**- \[x] 030 Debug overlay UI (`?debug=1`) + state dump**

**- \[x] 040 Add `verify` script to package.json (if missing) and keep CI aligned**



**### Rendering Layers (React)**

**- \[x] 100 Viewbox shell: fixed 1280×720 stage with absolute layer stacking**

**- \[x] 110 Layer4: implement pixel-perfect layout boxes from docs/viewbox_spec.md (+ ?guides=1)**

**- \[x] 120 Layer2 background video: full-frame video under Layer4**

**- \[x] 130 Layer1 main audio: playback + volume + autoplay-safe behavior**

**- \[x] 140 Layer5 overlay: fullscreen video + emergency alert + hideLayer5**

**- \[ ] 150 Marquee/ticker: scroll system + item parsing + speed**

**- \[ ] 160 Weather + clock widgets: render within exact bounds**

**- \[ ] 170 Main content renderer: image/video/audio selection + preload + fallback**



**### Demo + Tooling**

**- \[ ] 200 Ensure `scripts/run-demo-show.ts` works end-to-end against dev WS server**

**- \[ ] 210 Add a lightweight local WS relay (optional) for dev (`npm run ws:relay`)**

**- \[ ] 220 Add snapshot tests for reducer (message → state)**

**- \[ ] 230 Add basic e2e “smoke” script: start dev server, send WS messages, ensure no crash**



**### Hardening**

**- \[ ] 300 Graceful handling for missing media files (fallback UI, warnings)**

**- \[ ] 310 Rate-limit / debounce rapid WS updates to prevent render thrash**

**- \[ ] 320 Add telemetry hooks (console / optional endpoint) for agent debugging**
