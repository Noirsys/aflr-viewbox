# Legacy DB + Media Testing Map

This note captures how `depr_stale_newsitems.db` correlates to `public/media/**` for frontend testing.

## Files Generated
- Schema dump: `docs/depr_stale_newsitems.schema.sql`
- Explicit materials export: `docs/legacy_explicit_materials.csv`
- Implicit numeric media export: `docs/legacy_implicit_story_media.csv`

## Schema Summary
Tables:
- `news_items`
- `metadata`
- `content`

Row counts:
- `news_items`: 363
- `metadata`: 363
- `content`: 363

Important linkage note:
- `metadata.news_item_id` and `content.news_item_id` are null in this legacy DB.
- Use `news_items.metadata_id -> metadata.id` and `news_items.content_id -> content.id`.

## Media Correlation Rules
The legacy dataset uses two conventions:

1. Explicit materials:
- Source field: `content.materials`
- 11 stories have non-empty `materials`
- 16 referenced content files were checked; 16/16 exist under `public/media/content`

2. Implicit story-number naming:
- Audio: `public/media/audio/<story_id>.mp3` (or `.wav`)
- Content variants: `public/media/content/<story_id>_*`
- `docs/legacy_implicit_story_media.csv` lists currently matched stories

## Teleprompter / Rawdialog Interpretation
`content.teleprompter_text` values such as `rawdialog\\script204.json` should be treated as provenance for audio creation, not required runtime assets for the current viewbox.

## High-Value Real Test Stories
Use these first for realistic manual broadcast testing:

- Story `204`:
  - Audio: `204.mp3`
  - Content files: `204_2.jpg`, `204_4.jpg`, `apl_58seconds.mp4`
  - DB materials populated (explicit + implicit both present)

- Story `237`:
  - Audio: `237.mp3`
  - Content files: `237_turn2_bulletpoints.mp4`, `237_turn8_chart.mp4`, `237_turn9_chart.mp4`
  - Good for multi-turn video transitions

- Story `205`:
  - Content files: `205_1.jpg`, `205_2.jpg`, `ashtabulacountyhealthdept.jpg`
  - No numeric audio file currently present

## Practical Manual Test Pattern
For each story:
1. Send `headlineUpdate` + `subtextUpdate` from DB values.
2. Send `fullStoryUpdate` or `mainContentUpdate` with chosen material:
   - `mediatype=1` for image
   - `mediatype=2` for video
3. If available, send `mainaudioUpdate` with `command=play_clip`, `filename=<story_id>.mp3`.
4. Verify visual update, audio playback, and transition quality.

Recommended broadcast bed while testing:
- Layer2 loop: `/media/layer2/aFLR_LOOP_ScCo.mp4`
- Layer1 opening jingle: `/media/layer1/8s_beating_intro.mp3` (or alternate intro)
- Optional persistent bed: `/media/layer1/demo_bed.wav`
- Ticker: any `/media/marquee/*.txt`

## Runtime Tools
- Scripted regression runner: `npm run show:legacy -- --max-stories 15`
- Real-time operator console: `npm run live:legacy`

The live console is intended for agentic/manual control. It lets the operator pick stories dynamically (`next`, `story <id>`, `alt`, `break`, `alert`, etc.) instead of following a fixed timeline.

Timing behavior:
- `show:legacy` probes audio duration with `ffprobe` and holds each story long enough for narration completion.
- `show:legacy` begins with opening jingle playback before story narration.
- `live:legacy` applies an opening lock + narration lock; `next`/`story` are queued until locks clear.
- `force-next` and `force-story` trigger a breaking interrupt package (fullscreen breaking video + stinger audio) before cutover.

Marquee behavior:
- `marquee-list` lists discovered `/media/marquee/*.txt` files.
- `marquee-next` cycles ticker sets.
- `marquee <file.txt>` selects a specific ticker file.
- color encoding in ticker filenames (`_<RRGGBB>.txt`) is respected by the viewbox.

Cast-Assist policy/timing source:
- `scripts/cast-assist/config.ts`
- `scripts/cast-assist/timing.ts`
