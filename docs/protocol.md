# aFLR Viewbox WebSocket Protocol (v1)

**Status:** Stable Contract  
**Purpose:** Define the message protocol used to control the 1280×720 aFLR broadcast viewbox.  
**Compatibility:** Matches the existing backend message types and payload shapes used by the current Python controller and vanilla JS LayerController.【71†broadcast_controller.py】【72†layer-controller.js】

---

## Overview

The Viewbox is a **render engine**. It is controlled entirely via **WebSocket** messages and static media files accessible at `/media/**`.

### Inputs
1. **WebSocket messages** (JSON) sent by backend controllers / agents
2. **Media files** served at stable paths under `/media/**`

### Output
- A deterministic composited broadcast frame of **exactly 1280×720** pixels (internally), suitable for OBS / ffmpeg capture and live streaming.

This protocol is intentionally simple: no acknowledgements, no request/response requirement, and minimal coupling.

---

## Transport

- WebSocket endpoint (default): `ws://localhost:8088`
- Recommended production: `wss://<host>/ws` (TLS) if exposed publicly
- Messages are JSON-encoded UTF-8 strings.

> Note: The reference WS server implementation broadcasts incoming JSON to all connected clients.【70†broadcast-server.js】

---

## Message Envelope

Every message MUST be a JSON object with:

```ts
{
  type: string;        // required
  timestamp: number;   // required (ms since epoch)
  data: object;        // required (may be empty)
}
```

### Timestamp Semantics
- Use **milliseconds since epoch**.
- Consumers SHOULD treat timestamp as a **monotonic ordering hint**:
  - Ignore invalid messages (missing fields)
  - Optionally ignore out-of-order updates (older timestamps) for stability

### Unknown / Invalid Messages
- Unknown `type`: **ignore** (log in debug)
- Missing `type` or `timestamp`: **ignore** (do not crash)【72†layer-controller.js】

---

## Media Resolution Contract

The backend sends **filenames** (not full paths). The viewbox resolves them using stable prefixes.

| Media Type (logical) | Base URL Prefix         | Examples |
|---|---|---|
| background audio (Layer1 bed) | `/media/layer1/` | `bed.wav`, `hit.mp3` |
| background video (Layer2) | `/media/layer2/` | `aFLR_LOOP_ScCo.mp4` |
| overlays/images (Layer3) | `/media/layer3/` | `aFLR_Feed.png` |
| fullscreen videos (Layer5) | `/media/layer5/` | `aFLR_X_Opening.mp4` |
| story materials (main content) | `/media/content/` | `story123.png`, `clip456.mp4` |
| marquee/ticker files | `/media/marquee/` | `TOP_112233.txt` |
| dynamic primary audio (TTS) | `/media/audio/` | `123.mp3`, `story_7_1.wav` |

These mappings are consistent with the existing implementation contract.【72†layer-controller.js】

### Filename Rules
- Filenames should be simple (`foo.mp3`, `bar.svg`) and **must not** contain `../` or absolute paths.
- Allowed extensions: `mp3`, `wav`, `mp4`, `webm`, `png`, `jpg`, `gif`, `svg`, `txt` (others optional if served correctly).

---

## Message Types

### 1) `backgroundvideoUpdate`
Set/replace the looping background video (Layer2).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "videoSrc": "aFLR_LOOP_ScCo.mp4" }
```

**Notes:**
- Viewbox should set `muted=true`, `loop=true`, attempt autoplay.
- Implementations SHOULD avoid reload if `videoSrc` unchanged.

---

### 2) `backgroundaudioUpdate`
Play/pause background audio (Layer1 bed / ambient).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "audioSrc": "bed.wav" }
```

To stop/pause, send `null` or empty string:

```json
{ "audioSrc": null }
```

---

### 3) `mainaudioUpdate`
Control primary narration audio (Layer1 primary).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{
  "command": "play_clip",
  "filename": "123.mp3",
  "seqlength": 1
}
```

**Supported `command` values:**
- `play_clip` — interrupt any current primary audio and play `filename`
- `play_clip_sequence` — play `filename_1 ... filename_N` in order (see below)
- `pause`
- `stop`

**Sequence naming convention:**
If `filename = "story_7.wav"` and `seqlength = 3`,
expected sequence files are:
- `/media/audio/story_7.wav_1`
- `/media/audio/story_7.wav_2`
- `/media/audio/story_7.wav_3`

> The legacy controller builds sequence filenames by appending `_i` to the base name.【72†layer-controller.js】  
> A modern React implementation SHOULD handle sequences properly using `ended` events rather than a synchronous loop.

---

### 4) `headlineUpdate`
Update the headline text (Layer4).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "headline": "Breaking: Structure Fire Reported" }
```

---

### 5) `subtextUpdate`
Update the sub-headline / lower text (Layer4).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "subtext": "Units responding near downtown • Updates pending" }
```

**Notes:**
- May contain newline breaks if desired (`\n` or `<br>` depending on implementation).
- Should fade smoothly (broadcast-grade).

---

### 6) `mainContentUpdate`
Update the main content window (Layer4 main media panel).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{
  "mediatype": 1,
  "materials": "story1.svg"
}
```

**`mediatype` values:**
- `1` = image
- `2` = video

**Notes:**
- `mediatype` may arrive as number or string (legacy JS uses loose equality).【72†layer-controller.js】
- Images and videos are resolved under `/media/content/`.

---

### 7) `fullStoryUpdate`
Atomic update of headline + subtext + main content.

**Direction:** Backend → Viewbox  
**data schema:**

```json
{
  "headline": "Breaking: Scanner Activity",
  "subtext": "Multiple units dispatched • Stand by",
  "mediatype": 1,
  "materials": "story1.svg"
}
```

**Notes:**
- Implementations SHOULD treat this as a single coherent state change (avoid partial updates).

---

### 8) `weatherUpdate`
Update the weather temperature display (Layer4 widget).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "temperature": 34 }
```

**Notes:**
- Unit: Fahrenheit
- Implementations may format as `"34°F"`.

---

### 9) `marqueeUpdate`
Replace ticker content by loading a marquee text file.

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "marqueefile": "TOP_3366FF.txt" }
```

#### Marquee File Format
- Plain text file.
- Each line is one ticker item.
- Empty lines ignored.

Example file:
```txt
BREAKING: Scanner reports possible structure fire
TRAFFIC: Route 11 slowed near downtown
COURTS: Arraignments scheduled 9:00 AM Monday
```

#### Marquee Background Color Encoding
Filename SHOULD end with `_<RRGGBB>.txt`

Example: `TOP_3366FF.txt` → background color `#3366FF`

> Legacy extraction logic uses the last 6 hex characters immediately before `.txt`.【72†layer-controller.js】

---

### 10) `fullscreenVideo`
Play a fullscreen overlay video (Layer5).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "videoSrc": "aFLR_X_Opening.mp4" }
```

**Notes:**
- Resolved under `/media/layer5/`
- Should show overlay, play once, then hide overlay when ended.

---

### 11) `hideLayer5`
Hide Layer5 overlay after a delay (ms).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "stalltime": 1500 }
```

---

### 12) `emergencyAlert`
Show a fullscreen emergency alert overlay (Layer5).

**Direction:** Backend → Viewbox  
**data schema:**

```json
{ "alertcontent": "SEVERE WEATHER WARNING: Seek shelter immediately." }
```

**Notes:**
- Overlay should be visually dominant (red, pulsing).

---

### 13) `stateSync` (optional)
Push a complete state snapshot to the client.

**Direction:** Server/Backend → Viewbox  
**data schema (legacy-compatible shape):**

```json
{
  "layer1": { "activeAudio": null, "volume": 1 },
  "layer2": { "activeVideo": null, "transition": "fade", "opacity": 1 },
  "layer3": { "activeImage": null, "visible": true },
  "layer4": {
    "headline": "",
    "subtext": "",
    "marquee": "",
    "time": "",
    "weather": "",
    "newscastTitle": "",
    "mainContent": "",
    "liveFeed": ""
  },
  "layer5": { "activeVideo": null, "visible": false, "transition": "fade" }
}
```

**Notes:**
- This message is useful for late-joining clients (immediate correct state).

---

## Client → Server Message (Optional)

### `requestState` (optional)
A client may request a snapshot.

**Direction:** Viewbox → Server  
**data schema:**

```json
{}
```

**Expected server behavior:**
- Respond with a `stateSync` if supported.
- If unsupported, safe to ignore.

---

## Versioning

- Changes that add new message types: **minor version bump**
- Changes that modify payload shapes or semantics: **major version bump**
- Implementations SHOULD be backward compatible where possible.

---

## Security Notes (Prototype Guidance)

If WS is exposed publicly:
- Restrict who can send messages (viewers should not inject updates).
- Consider a shared secret token in message data or WS upgrade headers.

---