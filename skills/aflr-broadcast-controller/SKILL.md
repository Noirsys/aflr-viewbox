---
name: aflr-broadcast-controller
description: Operate and validate the aFLR 1280x720 broadcast viewbox using the manual WebSocket Control Board. Use when building/testing show flows, verifying `docs/protocol.md` message shapes, running studio/viewbox/controller UI modes, or preparing reproducible manual broadcast sequences before agent automation.
---

# aFLR Broadcast Controller

## Runbook

1. Read `references/operations.md` for startup, mode selection, and verification flow.
2. Read `references/protocol-message-cheatsheet.md` before sending custom envelopes.
3. Use `?ui=studio` for combined monitor + control, `?ui=viewbox` for clean capture, and `?ui=controller` for a dedicated operator panel.
4. Prefer Control Board actions and presets over ad-hoc raw JSON.
5. Use raw JSON only for contract edge cases and always keep envelope shape:
   - `type: string`
   - `timestamp: number` (ms since epoch)
   - `data: object`
6. Keep file paths protocol-safe by sending filenames only (no `/`, no `..`).

## Required Checks

1. Start relay and app per `references/operations.md`.
2. Confirm connection state is `connected` on the Control Board.
3. Run one complete sequence:
   - Open preset
   - Full story update + audio
   - Marquee update
   - Emergency alert + hide
4. Verify visual constraints:
   - Stage remains exactly 1280x720
   - Layer4 containers stay in spec coordinates
   - Layer5 overlay appears/disappears predictably
5. Run `npm run verify` before considering the workflow complete.

## Failure Handling

1. If disconnected, continue issuing commands only if queueing is intended; monitor outbound queue depth.
2. If queue grows unexpectedly, request state after reconnect and re-issue only the latest intended scene.
3. If media is missing, place assets under `public/media/**` using the documented layer mapping.
4. If protocol behavior is unclear, check `docs/protocol.md` and mirror exact payload names/casing.
