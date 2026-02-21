import type { CastAssistConfig } from "./config.ts"

export const computeOpeningLockMs = (
  options: {
    hasOpeningVideo: boolean
    openingJingleDurationSec: number | null
  },
  config: CastAssistConfig,
): number => {
  const fromVideo = options.hasOpeningVideo ? config.opening.fullscreenHoldMs : 0
  const fromJingle =
    options.openingJingleDurationSec !== null
      ? Math.ceil(options.openingJingleDurationSec * 1000) + config.opening.postJingleBufferMs
      : 0
  return Math.max(config.opening.minLockMs, fromVideo, fromJingle)
}

export const computeStoryRuntimeMs = (
  options: {
    audioDurationSec: number | null
    baseStoryHoldMs: number
  },
  config: CastAssistConfig,
): number => {
  if (options.audioDurationSec === null) {
    return Math.max(options.baseStoryHoldMs, config.narration.fallbackUnknownAudioMs)
  }

  const narrationMs =
    Math.ceil(options.audioDurationSec * 1000) + config.narration.postNarrationBufferMs
  return Math.max(options.baseStoryHoldMs, narrationMs)
}

export const computeTransientRestoreMs = (
  durationSec: number | null,
  config: CastAssistConfig,
): number =>
  durationSec !== null
    ? Math.ceil(durationSec * 1000) + config.layer1Transient.restoreBufferMs
    : config.layer1Transient.fallbackDurationMs
