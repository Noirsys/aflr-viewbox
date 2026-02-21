/**
 * scripts/run-legacy-real-show.ts
 *
 * Drives the viewbox using legacy DB + media assets for realistic manual QA.
 * It builds a story rundown from `depr_stale_newsitems.db` and sends protocol
 * messages over WebSocket, preferring explicit/implicit media mappings.
 *
 * Usage:
 *   node --experimental-strip-types scripts/run-legacy-real-show.ts
 *   node --experimental-strip-types scripts/run-legacy-real-show.ts --fast --max-stories 18
 *   node --experimental-strip-types scripts/run-legacy-real-show.ts --strict-visual --dry-run
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CAST_ASSIST_CONFIG } from "./cast-assist/config.ts";
import { computeStoryRuntimeMs, computeTransientRestoreMs } from "./cast-assist/timing.ts";

type WsEnvelope = {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
};

type DbStoryRow = {
  story_id: number;
  index_num: number | null;
  item_name: string | null;
  category: string | null;
  headline_text: string | null;
  subtitle_text: string | null;
  materials: string | null;
};

type MediaType = "image" | "video";

type MaterialRef = {
  filename: string;
  mediaType: MediaType;
  source: "explicit" | "implicit" | "fallback";
};

type StoryPlan = {
  storyId: number;
  indexNum: number;
  itemName: string;
  category: string;
  headline: string;
  subtext: string;
  audioFilename: string | null;
  audioDurationSec: number | null;
  materials: MaterialRef[];
  mappedVisualCount: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const WebSocketCtor = globalThis.WebSocket;

if (!WebSocketCtor) {
  throw new Error("WebSocket is not available in this Node runtime (requires Node 22+).");
}

const argv = process.argv.slice(2);

const hasFlag = (name: string): boolean => argv.includes(name);

const getArg = (name: string): string | undefined => {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
};

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
};

const wsUrl =
  getArg("--ws") ||
  process.env.WS_URL ||
  process.env.VITE_WS_URL ||
  "ws://localhost:8088";

const dbPath = path.resolve(
  repoRoot,
  getArg("--db") || process.env.LEGACY_DB_PATH || "depr_stale_newsitems.db",
);

const maxStories = parsePositiveInt(
  getArg("--max-stories") || process.env.LEGACY_MAX_STORIES,
  15,
);

const storyHoldMs = parsePositiveInt(
  getArg("--story-ms") || process.env.LEGACY_STORY_MS,
  DEFAULT_CAST_ASSIST_CONFIG.narration.defaultStoryHoldMs,
);

const fast = hasFlag("--fast") || process.env.FAST === "1";
const strictVisual = hasFlag("--strict-visual");
const dryRun = hasFlag("--dry-run");
const keepBed = hasFlag("--keep-bed");

const speed = fast ? 0.35 : 1.0;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms * speed));

const nowMs = (): number => Date.now();
const makeMsg = (type: string, data: Record<string, unknown>): WsEnvelope => ({
  type,
  timestamp: nowMs(),
  data,
});

async function listTopLevelFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function querySqliteJson<T>(dbFile: string, sql: string): T[] {
  const raw = execFileSync("sqlite3", ["-json", dbFile, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function probeAudioDurationSec(filePath: string): number | null {
  try {
    const raw = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
    const seconds = Number.parseFloat(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }
    return seconds;
  } catch {
    return null;
  }
}

function parseMaterials(raw: string | null): string[] {
  if (!raw || raw.trim() === "") {
    return [];
  }

  const value = raw.trim();
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0);
      }
    } catch {
      // Fall through to legacy split below.
    }
  }

  return value
    .split(",")
    .map((token) => token.trim().replace(/^['"]|['"]$/g, ""))
    .filter((token) => token.length > 0);
}

function inferMediaType(filename: string): MediaType | null {
  const ext = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
    return "image";
  }
  if ([".mp4", ".webm", ".mov", ".mkv"].includes(ext)) {
    return "video";
  }
  return null;
}

function pickFirstExisting(preferred: string[], available: Set<string>): string | null {
  for (const name of preferred) {
    if (available.has(name)) return name;
  }
  return null;
}

function stablePick<T>(pool: T[], seed: number): T | null {
  if (pool.length === 0) return null;
  const idx = Math.abs(seed) % pool.length;
  return pool[idx] ?? null;
}

function scoreStory(plan: StoryPlan): number {
  const hasAudio = plan.audioFilename !== null;
  const hasMappedVisual = plan.mappedVisualCount > 0;
  if (hasAudio && hasMappedVisual) return 0;
  if (hasAudio) return 1;
  if (hasMappedVisual) return 2;
  return 3;
}

async function buildStoryPlans(): Promise<{
  selectedStories: StoryPlan[];
  availableStories: StoryPlan[];
  openingVideo: string | null;
  breakingVideo: string | null;
  loopVideo: string | null;
  transitionVideo: string | null;
  openingJingle: string | null;
  openingJingleDurationSec: number | null;
  breakingStinger: string | null;
  breakingStingerDurationSec: number | null;
  backgroundBed: string | null;
  marqueeFile: string | null;
}> {
  const mediaRoot = path.join(repoRoot, "public", "media");
  const audioDir = path.join(mediaRoot, "audio");
  const contentDir = path.join(mediaRoot, "content");
  const layer1Dir = path.join(mediaRoot, "layer1");
  const layer2Dir = path.join(mediaRoot, "layer2");
  const layer5Dir = path.join(mediaRoot, "layer5");
  const marqueeDir = path.join(mediaRoot, "marquee");

  const [audioFiles, contentFiles, layer1Files, layer2Files, layer5Files, marqueeFiles] =
    await Promise.all([
      listTopLevelFiles(audioDir),
      listTopLevelFiles(contentDir),
      listTopLevelFiles(layer1Dir),
      listTopLevelFiles(layer2Dir),
      listTopLevelFiles(layer5Dir),
      listTopLevelFiles(marqueeDir),
    ]);

  const audioSet = new Set(audioFiles);
  const contentSet = new Set(contentFiles);
  const layer1Set = new Set(layer1Files);
  const layer2Set = new Set(layer2Files);
  const layer5Set = new Set(layer5Files);
  const marqueeSet = new Set(marqueeFiles.filter((file) => file.toLowerCase().endsWith(".txt")));

  const fallbackMaterials = contentFiles
    .map((filename) => {
      const mediaType = inferMediaType(filename);
      if (!mediaType) return null;
      return { filename, mediaType };
    })
    .filter((item): item is { filename: string; mediaType: MediaType } => item !== null);

  const layer1DurationByFile = new Map<string, number>();
  for (const filename of layer1Files) {
    const durationSec = probeAudioDurationSec(path.join(layer1Dir, filename));
    if (durationSec !== null) {
      layer1DurationByFile.set(filename, durationSec);
    }
  }

  const audioDurationByFile = new Map<string, number>();
  for (const filename of audioFiles) {
    const durationSec = probeAudioDurationSec(path.join(audioDir, filename));
    if (durationSec !== null) {
      audioDurationByFile.set(filename, durationSec);
    }
  }

  const rows = querySqliteJson<DbStoryRow>(
    dbPath,
    `
      SELECT
        n.id AS story_id,
        m.index_num AS index_num,
        m.item_name AS item_name,
        m.category AS category,
        c.headline_text AS headline_text,
        c.subtitle_text AS subtitle_text,
        c.materials AS materials
      FROM news_items n
      JOIN metadata m ON m.id = n.metadata_id
      JOIN content c ON c.id = n.content_id
      ORDER BY m.index_num ASC;
    `,
  );

  const plans: StoryPlan[] = rows.map((row) => {
    const storyId = row.story_id;
    const explicitMaterials = parseMaterials(row.materials)
      .map((filename) => {
        if (!contentSet.has(filename)) return null;
        const mediaType = inferMediaType(filename);
        if (!mediaType) return null;
        return { filename, mediaType, source: "explicit" as const };
      })
      .filter((item): item is MaterialRef => item !== null);

    const implicitMaterials = contentFiles
      .filter((filename) => filename.startsWith(`${storyId}_`))
      .map((filename) => {
        const mediaType = inferMediaType(filename);
        if (!mediaType) return null;
        return { filename, mediaType, source: "implicit" as const };
      })
      .filter((item): item is MaterialRef => item !== null);

    const dedup = new Map<string, MaterialRef>();
    for (const ref of [...explicitMaterials, ...implicitMaterials]) {
      if (!dedup.has(ref.filename)) {
        dedup.set(ref.filename, ref);
      }
    }
    const mappedMaterials = [...dedup.values()];

    const fallback = !strictVisual
      ? stablePick(fallbackMaterials, storyId)
      : null;

    const materialRefs =
      mappedMaterials.length > 0
        ? mappedMaterials
        : fallback
          ? [{ filename: fallback.filename, mediaType: fallback.mediaType, source: "fallback" as const }]
          : [];

    const audioFilename = audioSet.has(`${storyId}.mp3`)
      ? `${storyId}.mp3`
      : audioSet.has(`${storyId}.wav`)
        ? `${storyId}.wav`
        : null;

    return {
      storyId,
      indexNum: row.index_num ?? storyId,
      itemName: (row.item_name ?? "").trim() || `Story ${storyId}`,
      category: (row.category ?? "").trim() || "UNCATEGORIZED",
      headline: (row.headline_text ?? "").trim() || (row.item_name ?? "").trim() || `Story ${storyId}`,
      subtext: (row.subtitle_text ?? "").trim() || "More details available.",
      audioFilename,
      audioDurationSec: audioFilename ? (audioDurationByFile.get(audioFilename) ?? null) : null,
      materials: materialRefs,
      mappedVisualCount: mappedMaterials.length,
    };
  });

  const availableStories = plans
    .filter((plan) => plan.audioFilename !== null || plan.materials.length > 0)
    .sort((a, b) => {
      const scoreDiff = scoreStory(a) - scoreStory(b);
      if (scoreDiff !== 0) return scoreDiff;
      return a.indexNum - b.indexNum;
    });

  const selectedStories = availableStories.slice(0, maxStories);

  const openingVideo = pickFirstExisting(
    [...DEFAULT_CAST_ASSIST_CONFIG.assets.openingVideoCandidates, "aFLR_X_Breaking.mp4"],
    layer5Set,
  );
  const breakingVideo = pickFirstExisting(DEFAULT_CAST_ASSIST_CONFIG.assets.breakingVideoCandidates, layer5Set);
  const loopVideo = pickFirstExisting(
    DEFAULT_CAST_ASSIST_CONFIG.assets.loopVideoCandidates,
    layer2Set,
  );
  const transitionVideo = pickFirstExisting(
    DEFAULT_CAST_ASSIST_CONFIG.assets.transitionVideoCandidates,
    layer2Set,
  );
  const openingJingle = pickFirstExisting(DEFAULT_CAST_ASSIST_CONFIG.assets.openingJingleCandidates, layer1Set);
  const breakingStinger = pickFirstExisting(DEFAULT_CAST_ASSIST_CONFIG.assets.breakingStingerCandidates, layer1Set);
  const backgroundBed = pickFirstExisting(DEFAULT_CAST_ASSIST_CONFIG.assets.backgroundBedCandidates, layer1Set);
  const marqueeFile =
    pickFirstExisting(DEFAULT_CAST_ASSIST_CONFIG.assets.marqueeCandidates, marqueeSet) ??
    [...marqueeSet][0] ??
    null;

  return {
    selectedStories,
    availableStories,
    openingVideo,
    breakingVideo,
    loopVideo,
    transitionVideo,
    openingJingle,
    openingJingleDurationSec: openingJingle ? (layer1DurationByFile.get(openingJingle) ?? null) : null,
    breakingStinger,
    breakingStingerDurationSec: breakingStinger
      ? (layer1DurationByFile.get(breakingStinger) ?? null)
      : null,
    backgroundBed,
    marqueeFile,
  };
}

async function runLegacyShow(): Promise<void> {
  const dbExists = await fs
    .access(dbPath)
    .then(() => true)
    .catch(() => false);
  if (!dbExists) {
    throw new Error(`Legacy DB not found at: ${dbPath}`);
  }

  const rundown = await buildStoryPlans();
  const {
    selectedStories,
    availableStories,
    openingVideo,
    breakingVideo,
    loopVideo,
    transitionVideo,
    openingJingle,
    openingJingleDurationSec,
    breakingStinger,
    breakingStingerDurationSec,
    backgroundBed,
    marqueeFile,
  } = rundown;

  if (selectedStories.length === 0) {
    throw new Error("No usable legacy stories found (audio and visuals unavailable).");
  }

  console.log("🧪 Legacy show plan");
  console.log(`- db: ${dbPath}`);
  console.log(`- ws: ${wsUrl}`);
  console.log(`- available stories: ${availableStories.length}`);
  console.log(`- selected stories: ${selectedStories.length}/${maxStories}`);
  console.log(`- strict visuals: ${strictVisual ? "yes" : "no"}`);
  console.log(`- story hold (base): ${storyHoldMs}ms`);
  console.log(`- speed factor: ${speed}`);
  console.log(
    `- layer media: opening=${openingVideo ?? "<none>"} | jingle=${openingJingle ?? "<none>"} | breaking=${breakingVideo ?? "<none>"} | stinger=${breakingStinger ?? "<none>"} | loop=${loopVideo ?? "<none>"} | trans=${transitionVideo ?? "<none>"} | bed=${backgroundBed ?? "<none>"} | marquee=${marqueeFile ?? "<none>"}`,
  );

  for (const story of selectedStories) {
    const sourceKinds = [...new Set(story.materials.map((item) => item.source))].join(",");
    const mediaNames = story.materials.map((item) => item.filename).join("; ");
    console.log(
      `  • #${story.storyId} [${story.category}] ${story.headline} | audio=${story.audioFilename ?? "<none>"} | media=[${
        mediaNames || "<none>"
      }] | source=${sourceKinds || "<none>"} | dur=${story.audioDurationSec?.toFixed(2) ?? "<unknown>"}s`,
    );
  }

  if (dryRun) {
    console.log("✅ Dry run complete (no WebSocket messages sent).");
    return;
  }

  console.log(`🎛️  Connecting to ${wsUrl}`);
  const ws = new WebSocketCtor(wsUrl);

  const waitForOpen = async (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const timeoutMs = 7000;
      const timer = setTimeout(() => {
        reject(new Error(`Timed out connecting to ${wsUrl} after ${timeoutMs}ms`));
      }, timeoutMs);

      const onOpen = () => {
        clearTimeout(timer);
        ws.removeEventListener("error", onError);
        resolve();
      };

      const onError = (event: Event) => {
        clearTimeout(timer);
        ws.removeEventListener("open", onOpen);
        reject(new Error(`WebSocket connection error: ${event.type}`));
      };

      ws.addEventListener("open", onOpen, { once: true });
      ws.addEventListener("error", onError, { once: true });
    });

  const send = (type: string, data: Record<string, unknown>) => {
    const msg = makeMsg(type, data);
    if (ws.readyState !== WebSocketCtor.OPEN) {
      throw new Error(`WebSocket is not open (readyState=${ws.readyState})`);
    }
    ws.send(JSON.stringify(msg));
    console.log(`→ sent ${type}`, data);
  };

  await waitForOpen();
  ws.addEventListener("message", (event: MessageEvent) => {
    const body = typeof event.data === "string" ? event.data : String(event.data);
    console.log(`← recv ${body.slice(0, 180)}...`);
  });

  const playTransientLayer1Clip = async (filename: string, durationSec: number | null) => {
    send("backgroundaudioUpdate", { audioSrc: filename });
    const holdMs = computeTransientRestoreMs(durationSec, DEFAULT_CAST_ASSIST_CONFIG);
    await sleep(holdMs);
    if (backgroundBed && backgroundBed !== filename) {
      send("backgroundaudioUpdate", { audioSrc: backgroundBed });
    }
  };

  if (openingVideo) {
    send("fullscreenVideo", { videoSrc: openingVideo });
  }

  if (loopVideo) {
    send("backgroundvideoUpdate", { videoSrc: loopVideo });
  }

  if (openingJingle) {
    await playTransientLayer1Clip(openingJingle, openingJingleDurationSec);
  } else if (backgroundBed) {
    send("backgroundaudioUpdate", { audioSrc: backgroundBed });
  } else if (openingVideo) {
    await sleep(1800);
  }

  if (marqueeFile) {
    send("marqueeUpdate", { marqueefile: marqueeFile });
  }

  send("stateSync", {
    layer4: {
      newscastTitle: "ASHTABULA.FRONTLINE.REPORT",
      liveFeed: [
        "00:00 Producer: Legacy DB show test running.",
        "00:08 Operator: Story rundown loaded from SQLite.",
        "00:15 System: Viewbox rendering validated.",
      ].join("\\n"),
    },
  });
  send("weatherUpdate", { temperature: 32 });
  await sleep(900);

  for (let idx = 0; idx < selectedStories.length; idx += 1) {
    const story = selectedStories[idx];
    if (!story) continue;

    if (idx > 0 && idx % 4 === 0 && breakingVideo) {
      send("fullscreenVideo", { videoSrc: breakingVideo });
      if (breakingStinger) {
        await playTransientLayer1Clip(breakingStinger, breakingStingerDurationSec);
      } else {
        await sleep(1400);
      }
    }

    if (idx > 0 && idx % 3 === 0 && transitionVideo && loopVideo) {
      send("backgroundvideoUpdate", { videoSrc: transitionVideo });
      await sleep(700);
      send("backgroundvideoUpdate", { videoSrc: loopVideo });
      await sleep(200);
    }

    const primary = story.materials[0] ?? null;

    if (primary) {
      send("fullStoryUpdate", {
        headline: story.headline,
        subtext: story.subtext,
        mediatype: primary.mediaType === "image" ? 1 : 2,
        materials: primary.filename,
      });
    } else {
      send("headlineUpdate", { headline: story.headline });
      send("subtextUpdate", { subtext: story.subtext });
    }

    if (story.audioFilename) {
      send("mainaudioUpdate", {
        command: "play_clip",
        filename: story.audioFilename,
        seqlength: 1,
      });
    }

    const totalStoryMs = computeStoryRuntimeMs(
      {
        audioDurationSec: story.audioDurationSec,
        baseStoryHoldMs: storyHoldMs,
      },
      DEFAULT_CAST_ASSIST_CONFIG,
    );

    const alternates = story.materials.slice(1);
    if (alternates.length === 0) {
      await sleep(totalStoryMs);
      continue;
    }

    const segmentMs = Math.max(900, Math.floor(totalStoryMs / (alternates.length + 1)));
    await sleep(segmentMs);
    for (const material of alternates) {
      send("mainContentUpdate", {
        mediatype: material.mediaType === "image" ? 1 : 2,
        materials: material.filename,
      });
      await sleep(segmentMs);
    }
  }

  send("headlineUpdate", { headline: "END OF LEGACY REAL SHOW TEST" });
  send("subtextUpdate", { subtext: "Protocol + media orchestration validated against legacy assets." });
  send("mainaudioUpdate", { command: "stop", filename: null, seqlength: 1 });
  if (!keepBed) {
    send("backgroundaudioUpdate", { audioSrc: null });
  }
  send("hideLayer5", { stalltime: 0 });

  console.log("✅ Legacy show complete. Closing WS.");
  ws.close();
}

runLegacyShow().catch((error) => {
  console.error("❌ Legacy show failed:", error);
  process.exitCode = 1;
});
