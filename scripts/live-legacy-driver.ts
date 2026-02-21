/**
 * scripts/live-legacy-driver.ts
 *
 * Interactive, real-time operator console for legacy aFLR story assets.
 * This is intentionally non-scripted: the operator chooses what to play next.
 *
 * Usage:
 *   node --experimental-strip-types scripts/live-legacy-driver.ts
 *   node --experimental-strip-types scripts/live-legacy-driver.ts --max-stories 24
 *   node --experimental-strip-types scripts/live-legacy-driver.ts --strict-visual
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { DEFAULT_CAST_ASSIST_CONFIG } from "./cast-assist/config.ts";
import { computeOpeningLockMs, computeTransientRestoreMs } from "./cast-assist/timing.ts";

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

type PendingAction = {
  label: string;
  run: () => void;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const WebSocketCtor = globalThis.WebSocket;

if (!WebSocketCtor) {
  throw new Error("WebSocket is not available in this Node runtime (requires Node 22+).");
}

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(name);
const getArg = (name: string): string | undefined => {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
};
const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const wsUrl = getArg("--ws") || process.env.WS_URL || process.env.VITE_WS_URL || "ws://localhost:8088";
const dbPath = path.resolve(repoRoot, getArg("--db") || process.env.LEGACY_DB_PATH || "depr_stale_newsitems.db");
const maxStories = parsePositiveInt(getArg("--max-stories") || process.env.LEGACY_MAX_STORIES, 20);
const strictVisual = hasFlag("--strict-visual");

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
  if (!raw) return [];
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
  if (!raw || raw.trim() === "") return [];
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
      // Fall through to split fallback.
    }
  }
  return value
    .split(",")
    .map((token) => token.trim().replace(/^['"]|['"]$/g, ""))
    .filter((token) => token.length > 0);
}

function inferMediaType(filename: string): MediaType | null {
  const ext = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) return "image";
  if ([".mp4", ".webm", ".mov", ".mkv"].includes(ext)) return "video";
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
  stories: StoryPlan[];
  openingVideo: string | null;
  breakingVideo: string | null;
  loopVideo: string | null;
  openingJingle: string | null;
  openingJingleDurationSec: number | null;
  breakingStinger: string | null;
  breakingStingerDurationSec: number | null;
  bedAudio: string | null;
  marqueeFiles: string[];
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
  const audioDurationByFile = new Map<string, number>();
  for (const filename of audioFiles) {
    const durationSec = probeAudioDurationSec(path.join(audioDir, filename));
    if (durationSec !== null) {
      audioDurationByFile.set(filename, durationSec);
    }
  }
  const layer1DurationByFile = new Map<string, number>();
  for (const filename of layer1Files) {
    const durationSec = probeAudioDurationSec(path.join(layer1Dir, filename));
    if (durationSec !== null) {
      layer1DurationByFile.set(filename, durationSec);
    }
  }
  const fallbackMaterials = contentFiles
    .map((filename) => {
      const mediaType = inferMediaType(filename);
      return mediaType ? { filename, mediaType } : null;
    })
    .filter((item): item is { filename: string; mediaType: MediaType } => item !== null);

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

  const plans = rows.map<StoryPlan>((row) => {
    const storyId = row.story_id;
    const explicit = parseMaterials(row.materials)
      .map((filename) => {
        if (!contentSet.has(filename)) return null;
        const mediaType = inferMediaType(filename);
        return mediaType ? ({ filename, mediaType, source: "explicit" as const }) : null;
      })
      .filter((item): item is MaterialRef => item !== null);

    const implicit = contentFiles
      .filter((filename) => filename.startsWith(`${storyId}_`))
      .map((filename) => {
        const mediaType = inferMediaType(filename);
        return mediaType ? ({ filename, mediaType, source: "implicit" as const }) : null;
      })
      .filter((item): item is MaterialRef => item !== null);

    const dedup = new Map<string, MaterialRef>();
    for (const ref of [...explicit, ...implicit]) {
      if (!dedup.has(ref.filename)) dedup.set(ref.filename, ref);
    }
    const mapped = [...dedup.values()];
    const fallback = !strictVisual ? stablePick(fallbackMaterials, storyId) : null;
    const materials =
      mapped.length > 0
        ? mapped
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
      materials,
      mappedVisualCount: mapped.length,
    };
  });

  const stories = plans
    .filter((plan) => plan.audioFilename !== null || plan.materials.length > 0)
    .sort((a, b) => {
      const byScore = scoreStory(a) - scoreStory(b);
      if (byScore !== 0) return byScore;
      return a.indexNum - b.indexNum;
    })
    .slice(0, maxStories);

  const layer1Set = new Set(layer1Files);
  const layer2Set = new Set(layer2Files);
  const layer5Set = new Set(layer5Files);
  const marqueeSet = new Set(marqueeFiles.filter((file) => file.toLowerCase().endsWith(".txt")));

  const pickFirst = (preferred: string[], set: Set<string>): string | null => {
    for (const file of preferred) {
      if (set.has(file)) return file;
    }
    return null;
  };

  const openingVideo = pickFirst(DEFAULT_CAST_ASSIST_CONFIG.assets.openingVideoCandidates, layer5Set);
  const breakingVideo = pickFirst(DEFAULT_CAST_ASSIST_CONFIG.assets.breakingVideoCandidates, layer5Set);
  const loopVideo = pickFirst(DEFAULT_CAST_ASSIST_CONFIG.assets.loopVideoCandidates, layer2Set);
  const openingJingle = pickFirst(DEFAULT_CAST_ASSIST_CONFIG.assets.openingJingleCandidates, layer1Set);
  const breakingStinger = pickFirst(DEFAULT_CAST_ASSIST_CONFIG.assets.breakingStingerCandidates, layer1Set);
  const bedAudio = pickFirst(DEFAULT_CAST_ASSIST_CONFIG.assets.backgroundBedCandidates, layer1Set);
  const orderedMarqueeFiles = [...marqueeSet].sort((a, b) => a.localeCompare(b));
  const marqueeFile =
    pickFirst(DEFAULT_CAST_ASSIST_CONFIG.assets.marqueeCandidates, marqueeSet) ??
    [...marqueeSet][0] ??
    null;

  return {
    stories,
    openingVideo,
    breakingVideo,
    loopVideo,
    openingJingle,
    openingJingleDurationSec: openingJingle ? (layer1DurationByFile.get(openingJingle) ?? null) : null,
    breakingStinger,
    breakingStingerDurationSec: breakingStinger ? (layer1DurationByFile.get(breakingStinger) ?? null) : null,
    bedAudio,
    marqueeFiles: orderedMarqueeFiles,
    marqueeFile,
  };
}

function printHelp() {
  console.log("Commands:");
  console.log("  help                    Show commands");
  console.log("  list [n]                List first n stories from rundown");
  console.log("  next                    Send next story (queues if narration is still playing)");
  console.log("  force-next              BREAKING interrupt + next story immediately");
  console.log("  story <id>              Send a specific story id (queues if narration is playing)");
  console.log("  force-story <id>        BREAKING interrupt + specific story immediately");
  console.log("  alt                     Advance main content for last story (if multiple materials)");
  console.log("  status                  Show narration lock / queued action status");
  console.log("  break                   Trigger breaking package (video + stinger)");
  console.log("  alert <text>            Show emergency alert");
  console.log("  clear-alert             Clear and hide alert layer");
  console.log("  weather <temp>          Update weather");
  console.log("  marquee-list            List available marquee files");
  console.log("  marquee-next            Advance to next marquee file");
  console.log("  marquee <file.txt>      Update marquee file");
  console.log("  bg <video.mp4>          Update layer2 background video");
  console.log("  bed <file.mp3|stop>     Start or stop background bed audio");
  console.log("  stop-audio              Stop main audio");
  console.log("  state                   Request state from server");
  console.log("  quit                    Exit driver");
}

async function runLiveDriver(): Promise<void> {
  await fs.access(dbPath);
  const rundown = await buildStoryPlans();
  if (rundown.stories.length === 0) {
    throw new Error("No story plans were produced from DB/media.");
  }

  console.log("🎚️  Live Legacy Driver");
  console.log(`- db: ${dbPath}`);
  console.log(`- ws: ${wsUrl}`);
  console.log(`- stories in rundown: ${rundown.stories.length}`);
  console.log(
    `- default layer media: opening=${rundown.openingVideo ?? "<none>"} | jingle=${rundown.openingJingle ?? "<none>"} | breaking=${rundown.breakingVideo ?? "<none>"} | stinger=${rundown.breakingStinger ?? "<none>"} | loop=${rundown.loopVideo ?? "<none>"} | bed=${rundown.bedAudio ?? "<none>"} | marquee=${rundown.marqueeFile ?? "<none>"}`,
  );

  const ws = new WebSocketCtor(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 7000;
    const timer = setTimeout(() => reject(new Error(`Timed out connecting to ${wsUrl}`)), timeoutMs);
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
    if (ws.readyState !== WebSocketCtor.OPEN) {
      throw new Error(`WebSocket is not open (readyState=${ws.readyState})`);
    }
    ws.send(JSON.stringify(makeMsg(type, data)));
    console.log(`→ ${type}`, data);
  };

  let currentBedAudio: string | null = rundown.bedAudio ?? null;
  const orderedMarquees = rundown.marqueeFiles;
  let currentMarqueeFile: string | null = rundown.marqueeFile ?? null;
  let marqueeCursor = currentMarqueeFile ? Math.max(0, orderedMarquees.indexOf(currentMarqueeFile)) : 0;
  let layer1RestoreTimer: NodeJS.Timeout | null = null;

  const clearLayer1RestoreTimer = () => {
    if (layer1RestoreTimer !== null) {
      clearTimeout(layer1RestoreTimer);
      layer1RestoreTimer = null;
    }
  };

  const setBackgroundAudio = (filename: string | null) => {
    send("backgroundaudioUpdate", { audioSrc: filename });
  };

  const playTransientLayer1Clip = (filename: string, durationSec: number | null) => {
    setBackgroundAudio(filename);
    clearLayer1RestoreTimer();

    if (!currentBedAudio || currentBedAudio === filename) {
      return;
    }

    const restoreDelayMs = computeTransientRestoreMs(durationSec, DEFAULT_CAST_ASSIST_CONFIG);
    layer1RestoreTimer = setTimeout(() => {
      if (ws.readyState !== WebSocketCtor.OPEN) {
        return;
      }
      setBackgroundAudio(currentBedAudio);
    }, restoreDelayMs);
  };

  const triggerBreakingPackage = () => {
    if (rundown.breakingVideo) {
      send("fullscreenVideo", { videoSrc: rundown.breakingVideo });
    }
    if (rundown.breakingStinger) {
      playTransientLayer1Clip(rundown.breakingStinger, rundown.breakingStingerDurationSec);
    }
    if (!rundown.breakingVideo && !rundown.breakingStinger) {
      console.log("No breaking assets configured.");
    }
  };

  if (rundown.openingVideo) send("fullscreenVideo", { videoSrc: rundown.openingVideo });
  if (rundown.loopVideo) send("backgroundvideoUpdate", { videoSrc: rundown.loopVideo });
  if (rundown.openingJingle) {
    playTransientLayer1Clip(rundown.openingJingle, rundown.openingJingleDurationSec);
  } else if (currentBedAudio) {
    setBackgroundAudio(currentBedAudio);
  }
  if (currentMarqueeFile) send("marqueeUpdate", { marqueefile: currentMarqueeFile });
  send("stateSync", {
    layer4: {
      newscastTitle: "ASHTABULA.FRONTLINE.REPORT",
      liveFeed: [
        "LIVE DRIVER ACTIVE",
        "Operator controls story flow in real-time",
      ].join("\\n"),
    },
  });

  const openingDelayMs = computeOpeningLockMs(
    {
      hasOpeningVideo: rundown.openingVideo !== null,
      openingJingleDurationSec: rundown.openingJingleDurationSec,
    },
    DEFAULT_CAST_ASSIST_CONFIG,
  );

  let cursor = 0;
  let lastStoryId: number | null = null;
  let activeAudioStoryId: number | null = null;
  let audioBusyUntilMs = 0;
  let openingBusyUntilMs = nowMs() + openingDelayMs;
  let audioReleaseTimer: NodeJS.Timeout | null = null;
  let openingReleaseTimer: NodeJS.Timeout | null = null;
  let pendingAction: PendingAction | null = null;
  const materialCursor = new Map<number, number>();
  const storyById = new Map<number, StoryPlan>(rundown.stories.map((story) => [story.storyId, story]));

  const clearAudioReleaseTimer = () => {
    if (audioReleaseTimer !== null) {
      clearTimeout(audioReleaseTimer);
      audioReleaseTimer = null;
    }
  };

  const clearOpeningReleaseTimer = () => {
    if (openingReleaseTimer !== null) {
      clearTimeout(openingReleaseTimer);
      openingReleaseTimer = null;
    }
  };

  type LockState = {
    reason: string;
    remainingMs: number;
  };

  const getActiveLock = (): LockState | null => {
    const openingRemainingMs = openingBusyUntilMs - nowMs();
    if (openingRemainingMs > 0) {
      return {
        reason: "opening package",
        remainingMs: openingRemainingMs,
      };
    }

    const narrationRemainingMs = audioBusyUntilMs - nowMs();
    if (narrationRemainingMs > 0) {
      return {
        reason: `narration story #${activeAudioStoryId ?? "?"}`,
        remainingMs: narrationRemainingMs,
      };
    }

    return null;
  };

  const executePendingIfReady = () => {
    if (pendingAction === null) return;
    if (getActiveLock() !== null) return;
    const action = pendingAction;
    pendingAction = null;
    console.log(`▶ running queued action: ${action.label}`);
    action.run();
  };

  const scheduleAudioRelease = () => {
    clearAudioReleaseTimer();
    const remainingMs = audioBusyUntilMs - nowMs();
    if (remainingMs <= 0) return;
    audioReleaseTimer = setTimeout(() => {
      activeAudioStoryId = null;
      audioBusyUntilMs = 0;
      executePendingIfReady();
    }, remainingMs);
  };

  const scheduleOpeningRelease = () => {
    clearOpeningReleaseTimer();
    const remainingMs = openingBusyUntilMs - nowMs();
    if (remainingMs <= 0) {
      openingBusyUntilMs = 0;
      executePendingIfReady();
      return;
    }
    openingReleaseTimer = setTimeout(() => {
      openingBusyUntilMs = 0;
      executePendingIfReady();
    }, remainingMs);
  };

  const queueOrRun = (action: PendingAction, force = false) => {
    const lock = getActiveLock();
    if (!force && lock) {
      if (pendingAction !== null) {
        console.log(
          `Already queued: ${pendingAction.label} (wait ~${(lock.remainingMs / 1000).toFixed(1)}s or use force-next/force-story).`,
        );
        return;
      }
      pendingAction = action;
      console.log(
        `⏳ ${lock.reason} active (~${(lock.remainingMs / 1000).toFixed(1)}s left). Queued: ${action.label}`,
      );
      return;
    }

    if (force) {
      send("mainaudioUpdate", { command: "stop", filename: null, seqlength: 1 });
      activeAudioStoryId = null;
      audioBusyUntilMs = 0;
      openingBusyUntilMs = 0;
      clearAudioReleaseTimer();
      clearOpeningReleaseTimer();
      pendingAction = null;
      triggerBreakingPackage();
      console.log("⏭ BREAKING interrupt applied.");
    }

    action.run();
  };

  console.log(`⏱ opening lock active for ~${(openingDelayMs / 1000).toFixed(1)}s.`);
  scheduleOpeningRelease();

  const sendStory = (story: StoryPlan) => {
    const primary = story.materials[0] ?? null;
    if (primary) {
      send("fullStoryUpdate", {
        headline: story.headline,
        subtext: story.subtext,
        mediatype: primary.mediaType === "image" ? 1 : 2,
        materials: primary.filename,
      });
      materialCursor.set(story.storyId, 0);
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
      activeAudioStoryId = story.storyId;
      if (story.audioDurationSec !== null) {
        audioBusyUntilMs = nowMs() + Math.ceil(story.audioDurationSec * 1000) + 300;
        scheduleAudioRelease();
      } else {
        audioBusyUntilMs = nowMs() + 4500;
        scheduleAudioRelease();
      }
    } else {
      activeAudioStoryId = null;
      audioBusyUntilMs = 0;
      clearAudioReleaseTimer();
      executePendingIfReady();
    }

    lastStoryId = story.storyId;
    console.log(
      `✔ story #${story.storyId} | ${story.headline} | audio=${story.audioFilename ?? "<none>"} (${
        story.audioDurationSec?.toFixed(2) ?? "?"
      }s) | materials=${story.materials.map((m) => m.filename).join("; ") || "<none>"}`,
    );
  };

  const sendAltMaterial = (story: StoryPlan) => {
    if (story.materials.length < 2) {
      console.log(`No alternate materials for story #${story.storyId}.`);
      return;
    }
    const current = materialCursor.get(story.storyId) ?? 0;
    const next = (current + 1) % story.materials.length;
    const material = story.materials[next];
    if (!material) return;
    send("mainContentUpdate", {
      mediatype: material.mediaType === "image" ? 1 : 2,
      materials: material.filename,
    });
    materialCursor.set(story.storyId, next);
    console.log(`↺ material #${next + 1}/${story.materials.length}: ${material.filename}`);
  };

  printHelp();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const raw = (await rl.question("omega> ")).trim();
      if (!raw) continue;
      const [cmdRaw, ...rest] = raw.split(" ");
      const cmd = cmdRaw.toLowerCase();

      if (cmd === "help") {
        printHelp();
        continue;
      }

      if (cmd === "quit" || cmd === "exit") {
        break;
      }

      if (cmd === "list") {
        const count = parsePositiveInt(rest[0], 12);
        for (const story of rundown.stories.slice(0, count)) {
          console.log(
            `#${story.storyId} [${story.category}] ${story.headline} | audio=${story.audioFilename ?? "<none>"} (${
              story.audioDurationSec?.toFixed(2) ?? "?"
            }s) | media=${story.materials.map((m) => m.filename).join("; ") || "<none>"}`,
          );
        }
        continue;
      }

      if (cmd === "next") {
        const storyIndex = cursor;
        const story = rundown.stories[storyIndex];
        if (!story) {
          console.log("No more stories in rundown. Use `story <id>` or restart.");
          continue;
        }
        queueOrRun({
          label: `next #${story.storyId}`,
          run: () => {
            sendStory(story);
            cursor = Math.max(cursor, storyIndex + 1);
          },
        });
        continue;
      }

      if (cmd === "force-next") {
        const storyIndex = cursor;
        const story = rundown.stories[storyIndex];
        if (!story) {
          console.log("No more stories in rundown. Use `story <id>` or restart.");
          continue;
        }
        queueOrRun(
          {
            label: `next #${story.storyId}`,
            run: () => {
              sendStory(story);
              cursor = Math.max(cursor, storyIndex + 1);
            },
          },
          true,
        );
        continue;
      }

      if (cmd === "story") {
        const id = Number.parseInt(rest[0] ?? "", 10);
        if (!Number.isInteger(id)) {
          console.log("Usage: story <id>");
          continue;
        }
        const story = storyById.get(id);
        if (!story) {
          console.log(`Story #${id} not in active rundown. Use \`list\` to view loaded stories.`);
          continue;
        }
        queueOrRun({
          label: `story #${id}`,
          run: () => {
            sendStory(story);
          },
        });
        continue;
      }

      if (cmd === "force-story") {
        const id = Number.parseInt(rest[0] ?? "", 10);
        if (!Number.isInteger(id)) {
          console.log("Usage: force-story <id>");
          continue;
        }
        const story = storyById.get(id);
        if (!story) {
          console.log(`Story #${id} not in active rundown. Use \`list\` to view loaded stories.`);
          continue;
        }
        queueOrRun(
          {
            label: `story #${id}`,
            run: () => {
              sendStory(story);
            },
          },
          true,
        );
        continue;
      }

      if (cmd === "status") {
        const openingRemainingMs = openingBusyUntilMs - nowMs();
        const narrationRemainingMs = audioBusyUntilMs - nowMs();
        if (openingRemainingMs > 0) {
          console.log(`Opening lock: ~${(openingRemainingMs / 1000).toFixed(1)}s remaining.`);
        } else {
          console.log("Opening lock: idle.");
        }
        if (narrationRemainingMs > 0) {
          console.log(
            `Narration lock: active story #${activeAudioStoryId ?? "?"} (~${(narrationRemainingMs / 1000).toFixed(1)}s left).`,
          );
        } else {
          console.log("Narration lock: idle.");
        }
        console.log(`Queued action: ${pendingAction?.label ?? "<none>"}`);
        console.log(`Current marquee: ${currentMarqueeFile ?? "<none>"}`);
        continue;
      }

      if (cmd === "alt") {
        if (lastStoryId === null) {
          console.log("No story has been sent yet.");
          continue;
        }
        const story = storyById.get(lastStoryId);
        if (!story) {
          console.log(`Last story #${lastStoryId} is not available.`);
          continue;
        }
        sendAltMaterial(story);
        continue;
      }

      if (cmd === "break") {
        triggerBreakingPackage();
        continue;
      }

      if (cmd === "alert") {
        const text = rest.join(" ").trim();
        if (!text) {
          console.log("Usage: alert <text>");
          continue;
        }
        send("emergencyAlert", { alertcontent: text });
        continue;
      }

      if (cmd === "clear-alert") {
        send("emergencyAlert", { alertcontent: "" });
        send("hideLayer5", { stalltime: 0 });
        continue;
      }

      if (cmd === "weather") {
        const temperature = Number.parseFloat(rest[0] ?? "");
        if (!Number.isFinite(temperature)) {
          console.log("Usage: weather <temp>");
          continue;
        }
        send("weatherUpdate", { temperature });
        continue;
      }

      if (cmd === "marquee-list") {
        if (orderedMarquees.length === 0) {
          console.log("No marquee files discovered in /media/marquee.");
          continue;
        }
        for (const file of orderedMarquees) {
          const activeMark = file === currentMarqueeFile ? "*" : " ";
          console.log(`${activeMark} ${file}`);
        }
        continue;
      }

      if (cmd === "marquee-next") {
        if (orderedMarquees.length === 0) {
          console.log("No marquee files discovered in /media/marquee.");
          continue;
        }
        marqueeCursor = (marqueeCursor + 1) % orderedMarquees.length;
        const file = orderedMarquees[marqueeCursor];
        if (!file) {
          console.log("Unable to resolve next marquee file.");
          continue;
        }
        currentMarqueeFile = file;
        send("marqueeUpdate", { marqueefile: file });
        continue;
      }

      if (cmd === "marquee") {
        const file = (rest[0] ?? "").trim();
        if (!file) {
          console.log("Usage: marquee <file.txt>");
          continue;
        }
        currentMarqueeFile = file;
        const idx = orderedMarquees.indexOf(file);
        if (idx >= 0) {
          marqueeCursor = idx;
        }
        send("marqueeUpdate", { marqueefile: file });
        continue;
      }

      if (cmd === "bg") {
        const file = (rest[0] ?? "").trim();
        if (!file) {
          console.log("Usage: bg <video.mp4>");
          continue;
        }
        send("backgroundvideoUpdate", { videoSrc: file });
        continue;
      }

      if (cmd === "bed") {
        const file = (rest[0] ?? "").trim();
        if (!file) {
          console.log("Usage: bed <file.mp3|stop>");
          continue;
        }
        clearLayer1RestoreTimer();
        if (file === "stop") {
          currentBedAudio = null;
          setBackgroundAudio(null);
        } else {
          currentBedAudio = file;
          setBackgroundAudio(file);
        }
        continue;
      }

      if (cmd === "stop-audio") {
        send("mainaudioUpdate", { command: "stop", filename: null, seqlength: 1 });
        activeAudioStoryId = null;
        audioBusyUntilMs = 0;
        clearAudioReleaseTimer();
        executePendingIfReady();
        continue;
      }

      if (cmd === "state") {
        send("requestState", {});
        continue;
      }

      console.log(`Unknown command: ${cmd}. Type 'help' for options.`);
    }
  } finally {
    rl.close();
    clearLayer1RestoreTimer();
    clearAudioReleaseTimer();
    clearOpeningReleaseTimer();
    if (ws.readyState === WebSocketCtor.OPEN) {
      ws.close();
    }
    console.log("👋 Live driver closed.");
  }
}

runLiveDriver().catch((error) => {
  console.error("❌ Live driver failed:", error);
  process.exitCode = 1;
});
