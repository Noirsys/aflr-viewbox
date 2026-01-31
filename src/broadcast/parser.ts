import type {
  BroadcastMessage,
  MainAudioCommand,
  StateSyncPayload,
} from './types'

const MAIN_AUDIO_COMMANDS: MainAudioCommand[] = [
  'play_clip',
  'play_clip_sequence',
  'pause',
  'stop',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const parseMediaType = (value: unknown): number | null => {
  const numeric = toNumber(value)
  if (numeric === 1 || numeric === 2) {
    return numeric
  }
  return null
}

const parseMainAudioCommand = (value: unknown): MainAudioCommand | null => {
  if (typeof value !== 'string') {
    return null
  }
  return MAIN_AUDIO_COMMANDS.includes(value as MainAudioCommand)
    ? (value as MainAudioCommand)
    : null
}

const parseStateSyncPayload = (value: unknown): StateSyncPayload | null => {
  if (!isRecord(value)) {
    return null
  }
  return value as StateSyncPayload
}

export const parseIncomingMessage = (
  raw: string,
  debug: boolean,
): BroadcastMessage | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    if (debug) {
      console.debug('[ws] Failed to parse JSON message', error)
    }
    return null
  }

  if (!isRecord(parsed)) {
    if (debug) {
      console.debug('[ws] Message is not an object', parsed)
    }
    return null
  }

  const { type, timestamp, data } = parsed
  if (typeof type !== 'string' || typeof timestamp !== 'number' || !isRecord(data)) {
    if (debug) {
      console.debug('[ws] Invalid envelope', parsed)
    }
    return null
  }

  switch (type) {
    case 'backgroundvideoUpdate': {
      if (typeof data.videoSrc === 'string') {
        return { type, timestamp, data: { videoSrc: data.videoSrc } }
      }
      return null
    }
    case 'backgroundaudioUpdate': {
      const audioSrc =
        typeof data.audioSrc === 'string'
          ? data.audioSrc
          : data.audioSrc === null
            ? null
            : null
      if (audioSrc === null || typeof audioSrc === 'string') {
        return { type, timestamp, data: { audioSrc } }
      }
      return null
    }
    case 'mainaudioUpdate': {
      const command = parseMainAudioCommand(data.command)
      if (!command) {
        return null
      }
      const filename = typeof data.filename === 'string' ? data.filename : null
      const seqlength = toNumber(data.seqlength)
      return {
        type,
        timestamp,
        data: {
          command,
          filename,
          seqlength: seqlength ?? null,
        },
      }
    }
    case 'headlineUpdate': {
      if (typeof data.headline === 'string') {
        return { type, timestamp, data: { headline: data.headline } }
      }
      return null
    }
    case 'subtextUpdate': {
      if (typeof data.subtext === 'string') {
        return { type, timestamp, data: { subtext: data.subtext } }
      }
      return null
    }
    case 'mainContentUpdate': {
      const mediatype = parseMediaType(data.mediatype)
      if (mediatype && typeof data.materials === 'string') {
        return {
          type,
          timestamp,
          data: { mediatype, materials: data.materials },
        }
      }
      return null
    }
    case 'fullStoryUpdate': {
      const mediatype = parseMediaType(data.mediatype)
      if (
        mediatype &&
        typeof data.headline === 'string' &&
        typeof data.subtext === 'string' &&
        typeof data.materials === 'string'
      ) {
        return {
          type,
          timestamp,
          data: {
            headline: data.headline,
            subtext: data.subtext,
            mediatype,
            materials: data.materials,
          },
        }
      }
      return null
    }
    case 'weatherUpdate': {
      const temperature = toNumber(data.temperature)
      if (temperature !== null) {
        return { type, timestamp, data: { temperature } }
      }
      return null
    }
    case 'marqueeUpdate': {
      if (typeof data.marqueefile === 'string') {
        return { type, timestamp, data: { marqueefile: data.marqueefile } }
      }
      return null
    }
    case 'fullscreenVideo': {
      if (typeof data.videoSrc === 'string') {
        return { type, timestamp, data: { videoSrc: data.videoSrc } }
      }
      return null
    }
    case 'hideLayer5': {
      const stalltime = toNumber(data.stalltime)
      if (stalltime !== null) {
        return { type, timestamp, data: { stalltime } }
      }
      return null
    }
    case 'emergencyAlert': {
      if (typeof data.alertcontent === 'string') {
        return { type, timestamp, data: { alertcontent: data.alertcontent } }
      }
      return null
    }
    case 'stateSync': {
      const payload = parseStateSyncPayload(data)
      if (payload) {
        return { type, timestamp, data: payload }
      }
      return null
    }
    default: {
      if (debug) {
        console.debug('[ws] Unknown message type', type)
      }
      return null
    }
  }
}
