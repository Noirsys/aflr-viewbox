# CONTINUITY

Generated: 2026-02-16
Repo: /home/tt/codex-runs/aflr-viewbox
Branch: main

## Mission Status
The viewbox has been reworked into a manual-operator-ready broadcast system with a dedicated Control Board that sends protocol-valid WebSocket envelopes. The render stage remains fixed at 1280x720 and supports studio/viewbox/controller modes.

## What Was Completed
1. Added outbound WebSocket sending in provider context with robust behavior:
- Immediate send when connected
- Queue while disconnected
- Flush queue on reconnect
- Outbound queue depth surfaced to UI

2. Added dedicated manual controller UI:
- File: `src/controller/ManualController.tsx`
- Covers all major protocol messages (`backgroundvideoUpdate`, `backgroundaudioUpdate`, `mainaudioUpdate`, `headlineUpdate`, `subtextUpdate`, `mainContentUpdate`, `fullStoryUpdate`, `weatherUpdate`, `marqueeUpdate`, `fullscreenVideo`, `hideLayer5`, `emergencyAlert`, `stateSync`, `requestState`)
- Input validation for filenames and numeric fields
- Presets for open/story/emergency flow
- Raw JSON envelope sender for diagnostics
- Send history and status notices

3. Added UI operation modes:
- `?ui=studio` (default): viewbox + controller
- `?ui=viewbox`: viewbox only
- `?ui=controller`: controller only

4. Extended state sync support for Layer4 broadcast fidelity:
- Added `newscastTitle` and `liveFeed` handling in state/protocol/reducer
- Layer4 now renders live feed rows and station title

5. Added reusable skill package for future agent/model migration:
- `skills/aflr-broadcast-controller/SKILL.md`
- `skills/aflr-broadcast-controller/references/operations.md`
- `skills/aflr-broadcast-controller/references/protocol-message-cheatsheet.md`
- `skills/aflr-broadcast-controller/agents/openai.yaml`

## Verification Status
Commands executed and passed:
1. `npm ci`
2. `npm run verify`
3. `npm run smoke:e2e -- --seed`
4. `python3 /home/tt/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/aflr-broadcast-controller`

Note: reducer snapshots were intentionally updated to match new state fields (`newscastTitle`, `liveFeed`).

## Current Runtime State
No dev relay or Vite server is currently running.
No demo script is currently running.

## High-Signal Files
- `src/broadcast/BroadcastProvider.tsx`
- `src/broadcast/types.ts`
- `src/broadcast/protocol.ts`
- `src/broadcast/reducer.ts`
- `src/controller/ManualController.tsx`
- `src/App.tsx`
- `src/App.css`
- `scripts/run-demo-show.ts`
- `README.md`
- `skills/aflr-broadcast-controller/SKILL.md`

## Git Working Tree Snapshot
Modified:
- `IMPLEMENTATION_PLAN.md`
- `JOURNAL.md`
- `README.md`
- `scripts/run-demo-show.ts`
- `src/App.css`
- `src/App.tsx`
- `src/broadcast/BroadcastProvider.tsx`
- `src/broadcast/__snapshots__/reducer.test.ts.snap`
- `src/broadcast/protocol.test.ts`
- `src/broadcast/protocol.ts`
- `src/broadcast/reducer.test.ts`
- `src/broadcast/reducer.ts`
- `src/broadcast/types.ts`

Untracked:
- `src/controller/`
- `skills/`
- `CONTINUITY.md`

## Resume Commands (for Live Demo)
Run in separate terminals:

1. Start relay:
```bash
cd /home/tt/codex-runs/aflr-viewbox
npm run ws:relay
```

2. Start frontend:
```bash
cd /home/tt/codex-runs/aflr-viewbox
npm run dev -- --host 127.0.0.1 --port 5173
```

3. Open headed Chrome in foreground (studio mode):
```bash
google-chrome --new-window "http://127.0.0.1:5173/?ui=studio&debug=1"
```

Optional split view (separate operator/display tabs):
```bash
google-chrome --new-window \
  "http://127.0.0.1:5173/?ui=viewbox" \
  "http://127.0.0.1:5173/?ui=controller&debug=1"
```

## Live Demonstration Script
In the Control Board:
1. Click `Run Open Preset`
2. Confirm background loop + ticker + bed audio + title/headline/subtext
3. Click `Run Story Preset`
4. Confirm full story update and narration audio playback
5. Click `Run Emergency Preset`
6. Confirm Layer5 alert overlay appears
7. Click `Hide Layer5` or `Clear Alert / Hide Now`
8. Click `Request State` and confirm request message is sent

Optional scripted demo from terminal:
```bash
cd /home/tt/codex-runs/aflr-viewbox
node --experimental-strip-types scripts/run-demo-show.ts --seed --fast
```

## Protocol Safety Notes
- Send filenames only (no absolute paths, no `..`)
- Keep envelope shape exact:
  - `type: string`
  - `timestamp: number`
  - `data: object`
- Unknown/invalid messages are ignored by parser as designed

## Immediate Next Step Requested By User
Open the app in a headed Chrome foreground session and perform a live, visible demonstration of manual control in concert with the running viewbox.

## Latest Live Run Evidence (2026-02-16)
At `2026-02-16T06:45:13-05:00`, the following was executed successfully:

1. Relay launched:
```bash
npm run ws:relay
```
Observed: `ws-relay listening at ws://127.0.0.1:8088`

2. Frontend launched:
```bash
npm run dev -- --host 127.0.0.1 --port 5173
```
Observed: Vite ready at `http://127.0.0.1:5173/`

3. Headed Chrome opened:
```bash
google-chrome --new-window "http://127.0.0.1:5173/?ui=studio&debug=1"
```
Observed: browser accepted URL in existing session.

4. Scripted live show executed:
```bash
node --experimental-strip-types scripts/run-demo-show.ts --seed --fast
```
Observed: full sequence completed, including:
- `backgroundvideoUpdate`
- `weatherUpdate`
- `marqueeUpdate`
- `stateSync` (title/live feed)
- `backgroundaudioUpdate`
- `headlineUpdate` + `subtextUpdate`
- multi-story `fullStoryUpdate` + `mainaudioUpdate`
- `emergencyAlert` + `hideLayer5`
- final cleanup + stop commands
- terminal end state: `✅ Demo show complete. Closing WS.`

## Current On-Machine Runtime (post-demo)
- Relay process: running
- Vite process: running
- Chrome studio window/tab: opened
- Demo script: completed successfully

Additional observed run:
- At `2026-02-16T06:46:44-05:00`, a second full paced run (`node --experimental-strip-types scripts/run-demo-show.ts --seed`) completed successfully with all expected transitions and cleanup.

## Legacy Media + DB Intake (2026-02-16)
- Copied from `/home/tt/aflr-viewbox` into this workspace:
  - `depr_stale_newsitems.db`
  - full `public/media/**` tree
- Post-copy snapshot:
  - `public/media`: ~122M
  - media files: 144

Schema and mapping artifacts generated:
- `docs/depr_stale_newsitems.schema.sql`
- `docs/legacy_explicit_materials.csv`
- `docs/legacy_explicit_material_tokens.csv`
- `docs/legacy_implicit_story_media.csv`
- `docs/legacy_real_testing_map.md`

Key findings:
- DB has 363 stories across `news_items`, `metadata`, `content`.
- Join path uses `news_items.metadata_id -> metadata.id` and `news_items.content_id -> content.id`.
- `content.materials` explicitly references files for 11 stories (16/16 refs present in `public/media/content`).
- Additional implicit story mapping exists via numeric filenames (`audio/<story_id>.mp3` and `content/<story_id>_*`).
- `teleprompter_text` values like `rawdialog\\scriptNNN.json` are provenance used to generate audio, not required runtime files.

## Real-Time Driver Additions (2026-02-16)
Added new runtime tools:
- `scripts/run-legacy-real-show.ts`
  - Scripted regression broadcast using real legacy DB/media mappings
  - Supports `--dry-run`, `--fast`, `--max-stories`, `--strict-visual`
- `scripts/live-legacy-driver.ts`
  - Interactive non-scripted operator console for real-time control
  - Commands include: `list`, `next`, `story <id>`, `alt`, `break`, `alert`, `clear-alert`, `bg`, `bed`, `weather`, `state`, `quit`

Package scripts:
- `npm run show:legacy`
- `npm run live:legacy`

Documentation updates:
- `README.md` (new legacy/livedriver command section)
- `docs/legacy_real_testing_map.md` (runtime tools section)

Validation executed:
1. `npm run show:legacy -- --dry-run --max-stories 6` (pass; rundown generated from real assets)
2. `npm run live:legacy` against running relay:
   - baseline setup sent
   - tested `list`, `next`, `story 204`, `alt`, `break`, `alert`, `clear-alert`, `quit`
3. `npm run lint` (pass)
4. `npm run verify` (pass)

Timestamp: `2026-02-16T07:25:19-05:00`

## Timing Fix Follow-up (2026-02-16)
Issue observed:
- Rapid operator story switches could cut narration clips mid-playback.

Fixes implemented:
1. Duration-aware legacy show pacing
- `scripts/run-legacy-real-show.ts` now probes clip duration with `ffprobe`.
- Story dwell time now respects narration length (with safety buffer), not only fixed hold time.
- Show now starts with opening jingle before narration.

2. Live driver narration lock + queue
- `scripts/live-legacy-driver.ts` now tracks active narration duration.
- `next` and `story <id>` queue while narration is active instead of interrupting.
- Added opening lock so intro jingle + opening fullscreen package can complete before first story narration.
- Added override commands:
  - `force-next`
  - `force-story <id>`
- Added `status` command to inspect lock/queue state.
- `force-next` / `force-story` now perform BREAKING interrupt package:
  - stop active narration
  - trigger fullscreen breaking video
  - trigger breaking stinger audio
  - then cut to requested story

3. Docs updated
- `README.md`
- `docs/legacy_real_testing_map.md`

4. Layer1 background audio renderer added
- `src/App.tsx` now includes a dedicated `Layer1BackgroundAudio` player handling `backgroundaudioUpdate` (`/media/layer1/**`), including one-shot stingers and looping beds.

Validation run:
- `npm run show:legacy -- --dry-run --max-stories 4` (durations displayed and mapped)
- `npm run live:legacy`:
  - confirmed queue behavior (`next` queued during active narration)
  - confirmed interrupt path (`force-next` sends stop then advances)
- `npm run lint` (pass)
- `npm run verify` (pass)

Additional live validation:
- Startup:
  - immediate `next` during intro resulted in queued action until opening lock cleared
  - bed audio restored after jingle
- Force cut:
  - `force-next` triggered stop + breaking video + breaking stinger before story cutover

Timestamp: `2026-02-16T07:43:51-05:00`

## Cast-Assist Standardization (2026-02-16)
New Cast-Assist module layer:
- `scripts/cast-assist/config.ts`
- `scripts/cast-assist/timing.ts`

Purpose:
- centralize orchestration/timing policy between controller and viewbox runtime
- expose tunables for future AI/agent teams (opening locks, narration pacing, transient restore, asset preference lists)

Documentation added:
- `docs/cast_assist_system_standard.md`
  - layered architecture
  - full cast-control instructions
  - marquee workflow guidance
  - queue-safe vs forced interrupt behavior
  - Cast-Assist tuning surface

Live driver updates:
- opening lock enforced from Cast-Assist timing policy
- force commands execute BREAKING combo package automatically
- marquee commands added:
  - `marquee-list`
  - `marquee-next`
  - `marquee <file.txt>`
- `status` now reports current marquee

Validation:
1. `npm run lint` (pass)
2. `npm run verify` (pass)
3. `npm run live:legacy` smoke:
   - `marquee-list` showed available ticker files
   - `marquee-next` rotated ticker and sent `marqueeUpdate`
   - `status` reflected active marquee

Timestamp: `2026-02-16T08:08:44-05:00`
