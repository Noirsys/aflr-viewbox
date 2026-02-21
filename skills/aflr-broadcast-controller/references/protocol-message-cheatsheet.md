# Protocol Message Cheatsheet

All messages use this envelope:

```json
{
  "type": "<messageType>",
  "timestamp": 1735689600000,
  "data": {}
}
```

## Core updates

- `backgroundvideoUpdate`: `{ "videoSrc": "aFLR_LOOP_ScCo.mp4" }`
- `backgroundaudioUpdate`: `{ "audioSrc": "demo_bed.wav" }` or `{ "audioSrc": null }`
- `headlineUpdate`: `{ "headline": "..." }`
- `subtextUpdate`: `{ "subtext": "..." }`
- `weatherUpdate`: `{ "temperature": 34 }`
- `marqueeUpdate`: `{ "marqueefile": "DEMO_TOP_3366FF.txt" }`

## Story/media updates

- `mainContentUpdate`: `{ "mediatype": 1, "materials": "demo_story1.svg" }`
  - `mediatype`: `1=image`, `2=video`
- `fullStoryUpdate`: `{ "headline": "...", "subtext": "...", "mediatype": 1, "materials": "demo_story1.svg" }`

## Primary audio control

- `mainaudioUpdate` play clip:
```json
{ "command": "play_clip", "filename": "demo_story1.wav", "seqlength": 1 }
```
- `mainaudioUpdate` sequence:
```json
{ "command": "play_clip_sequence", "filename": "story_7.wav", "seqlength": 3 }
```
- `mainaudioUpdate` pause/stop:
```json
{ "command": "pause", "filename": null, "seqlength": null }
```

## Layer5 overlays

- `fullscreenVideo`: `{ "videoSrc": "aFLR_X_Opening.mp4" }`
- `hideLayer5`: `{ "stalltime": 1200 }`
- `emergencyAlert`: `{ "alertcontent": "..." }`

## State helpers

- `stateSync`: full or partial snapshot object
- `requestState`: `{}` (client -> server)

## Filename/path rules

- Send filenames only (no absolute paths)
- Never include `..`
- Resolve to `/media/**` on client
