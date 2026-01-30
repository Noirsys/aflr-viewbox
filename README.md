# aFLR Viewbox

This repository contains the source code and specifications for the **aFLR React viewbox**, a 1280×720 broadcast renderer used by the Ashtabula FrontLine Report (aFLR) autonomous news system. The viewbox receives **WebSocket** messages from backend agents and updates on‑screen elements accordingly. It renders a continuous news broadcast as a single canvas suitable for streaming or screen capture.

## Repository Structure

```
aflr-viewbox/
├── AGENTS.md              # Instructions and guidelines for autonomous agent development
├── README.md              # This file
├── docs/
│   └── protocol.md        # Canonical WebSocket protocol specification
├── scripts/
│   └── run-demo-show.ts   # Demo script to seed assets and simulate a short newscast
└── (other files…)        # Your React/Vite project files (to be implemented)
```

## Getting Started

1. **Install dependencies** (for the demo script):
   ```bash
   pnpm install
   pnpm add -D ws tsx
   ```

2. **Run the Vite development server** (after you implement the React viewbox):
   ```bash
   pnpm dev
   ```

3. **Seed demo assets and start a mock broadcast**:
   ```bash
   pnpm tsx scripts/run-demo-show.ts --seed
   ```

The demo script will populate `public/media/` with sample audio, images, and ticker files if they do not already exist. It will then connect to the WebSocket server at `ws://localhost:8088` and send a sequence of messages to exercise all of the viewbox’s update types. Adjust the WebSocket URL by passing `--ws ws://yourserver:port` or setting the `WS_URL` environment variable.

## Protocol Specification

See `docs/protocol.md` for a detailed description of the WebSocket message format, media resolution rules, and supported update types. This document is the contract between the backend message sender and the front‑end viewbox renderer. All implementations must adhere to this contract.

## Agent Development

The file `AGENTS.md` provides guidelines for developers (human or AI) working on this codebase. It outlines the mission, constraints, style preferences, and definition of done for tasks related to the viewbox. Use these instructions when orchestrating autonomous agent workflows.

## Running the Demo

To use the included demo script, ensure you have a WebSocket relay server running. The script does not start the WebSocket server itself; it simply connects to the URL you specify. A simple WS relay that accepts messages and broadcasts them to all clients can be found in the aFLR backend repository (see `broadcast-server.js`).

After running the demo script, open the viewbox in a browser (once implemented) and observe the updates: headlines, images, ticker, audio narration, and a simulated emergency alert. The success of this sequence indicates that the protocol and media handling are working correctly.

## Contributions

All contributions to improve the viewbox implementation, documentation, and tooling are welcome. If you intend to contribute via autonomous agents, ensure they respect the guidelines in `AGENTS.md`.

---

This project is maintained by Noirsys AI for the Ashtabula FrontLine Report. For questions or feedback, please contact Michael A. Vega.