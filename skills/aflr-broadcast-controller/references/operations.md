# Operations

## Startup

1. Install deps:
```bash
npm ci
```
2. Start local relay:
```bash
npm run ws:relay
```
3. Start frontend:
```bash
npm run dev
```

Default endpoint is `ws://localhost:8088`.

## UI Modes

- Studio (default): `http://localhost:5173/?ui=studio`
- Viewbox only: `http://localhost:5173/?ui=viewbox`
- Controller only: `http://localhost:5173/?ui=controller`
- Optional debug: append `&debug=1`
- Optional guides: append `&guides=1`

## Manual Validation Sequence

1. In Control Board, run `Run Open Preset`.
2. Confirm background loop, ticker, and bed audio are active.
3. Run `Run Story Preset` and confirm full-story + narration update.
4. Run `Run Emergency Preset` and confirm alert overlay appears.
5. Click `Hide Layer5` (or use clear action) and verify overlay clears.
6. Use `Request State` to validate snapshot behavior.

## Demo Script Validation

Run scripted show:
```bash
node --experimental-strip-types scripts/run-demo-show.ts --seed --fast
```

## Final Verification

```bash
npm run verify
```
