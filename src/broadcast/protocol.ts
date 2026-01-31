import type {
  BackgroundAudioUpdateMessage,
  BackgroundVideoUpdateMessage,
  BroadcastMessage,
  BroadcastMessageType,
  EmergencyAlertMessage,
  FullStoryUpdateMessage,
  FullscreenVideoMessage,
  HeadlineUpdateMessage,
  HideLayer5Message,
  MainAudioCommand,
  MainAudioUpdateMessage,
  MainContentMediaType,
  MainContentUpdateMessage,
  MarqueeUpdateMessage,
  StateSyncMessage,
  StateSyncPayload,
  SubtextUpdateMessage,
  WeatherUpdateMessage,
} from './types'

const knownMessageTypes: BroadcastMessageType[] = [
  'backgroundvideoUpdate',
  'backgroundaudioUpdate',
  'mainaudioUpdate',
  'headlineUpdate',
  'subtextUpdate',
  'mainContentUpdate',
  'fullStoryUpdate',
  'weatherUpdate',
  'marqueeUpdate',
  'fullscreenVideo',
  'hideLayer5',
  'emergencyAlert',
  'stateSync',
]

const mainAudioCommands: MainAudioCommand[] = [
  'play_clip',
  'play_clip_sequence',
  'pause',
  'stop',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isKnownType = (value: string): value is BroadcastMessageType =>
  knownMessageTypes.includes(value as BroadcastMessageType)

const isMainAudioCommand = (value: string): value is MainAudioCommand =>
  mainAudioCommands.includes(value as MainAudioCommand)

const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const readNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  return value.trim() === '' ? null : value
}

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return null
}

const parseMediaType = (value: unknown): MainContentMediaType | null => {
  if (value === 1 || value === '1') {
    return 'image'
  }
  if (value === 2 || value === '2') {
    return 'video'
  }
  return null
}

const parseStateSync = (data: Record<string, unknown>): StateSyncPayload => {
  const payload: StateSyncPayload = {}

  if (isRecord(data.layer1)) {
    const activeAudio = readString(data.layer1.activeAudio)
    if (activeAudio !== null || data.layer1.activeAudio === null) {
      payload.layer1 = { activeAudio: activeAudio ?? null }
    }
  }

  if (isRecord(data.layer2)) {
    const activeVideo = readString(data.layer2.activeVideo)
    if (activeVideo !== null || data.layer2.activeVideo === null) {
      payload.layer2 = { activeVideo: activeVideo ?? null }
    }
  }

  if (isRecord(data.layer4)) {
    const layer4: StateSyncPayload['layer4'] = {}
    const headline = readString(data.layer4.headline)
    const subtext = readString(data.layer4.subtext)
    const marquee = readString(data.layer4.marquee)
    const weather = data.layer4.weather
    const mainContent = readString(data.layer4.mainContent)

    if (headline !== null) layer4.headline = headline
    if (subtext !== null) layer4.subtext = subtext
    if (marquee !== null) layer4.marquee = marquee
    if (typeof weather === 'number' || typeof weather === 'string') {
      layer4.weather = weather
    }
    if (mainContent !== null) layer4.mainContent = mainContent

    if (Object.keys(layer4).length > 0) {
      payload.layer4 = layer4
    }
  }

  if (isRecord(data.layer5)) {
    const activeVideo = readString(data.layer5.activeVideo)
    const visible = typeof data.layer5.visible === 'boolean' ? data.layer5.visible : undefined
    const alertcontent = readString(data.layer5.alertcontent)

    if (activeVideo !== null || data.layer5.activeVideo === null || visible !== undefined || alertcontent !== null) {
      payload.layer5 = {
        activeVideo: activeVideo ?? (data.layer5.activeVideo === null ? null : undefined),
        visible,
        alertcontent: alertcontent ?? undefined,
      }
    }
  }

  return payload
}

export const parseIncomingMessage = (raw: string, debugEnabled: boolean): BroadcastMessage | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    if (debugEnabled) {
      console.debug('[ws] Failed to parse JSON', error)
    }
    return null
  }

  if (!isRecord(parsed)) {
    if (debugEnabled) {
      console.debug('[ws] Message is not an object')
    }
    return null
  }

  const type = readString(parsed.type)
  const timestamp = readNumber(parsed.timestamp)
  const data = parsed.data

  if (type === null || timestamp === null || !isRecord(data)) {
    if (debugEnabled) {
      console.debug('[ws] Message missing required fields', parsed)
    }
    return null
  }

  if (!isKnownType(type)) {
    if (debugEnabled) {
      console.debug('[ws] Unknown message type', type)
    }
    return null
  }

  switch (type) {
    case 'backgroundvideoUpdate': {
      const videoSrc = readNonEmptyString(data.videoSrc)
      if (!videoSrc) return null
      const message: BackgroundVideoUpdateMessage = {
        type,
        timestamp,
        data: { videoSrc },
      }
      return message
    }
    case 'backgroundaudioUpdate': {
      const audioSrc = readNonEmptyString(data.audioSrc)
      const message: BackgroundAudioUpdateMessage = {
        type,
        timestamp,
        data: { audioSrc: audioSrc ?? null },
      }
      return message
    }
    case 'mainaudioUpdate': {
      const command = readString(data.command)
      if (!command || !isMainAudioCommand(command)) return null

      const filename = readString(data.filename)
      const seqlength = readNumber(data.seqlength)

      const message: MainAudioUpdateMessage = {
        type,
        timestamp,
        data: {
          command,
          filename: filename ?? null,
          seqlength: seqlength ?? null,
        },
      }
      return message
    }
    case 'headlineUpdate': {
      const headline = readString(data.headline)
      if (headline === null) return null
      const message: HeadlineUpdateMessage = {
        type,
        timestamp,
        data: { headline },
      }
      return message
    }
    case 'subtextUpdate': {
      const subtext = readString(data.subtext)
      if (subtext === null) return null
      const message: SubtextUpdateMessage = {
        type,
        timestamp,
        data: { subtext },
      }
      return message
    }
    case 'mainContentUpdate': {
      const mediatype = parseMediaType(data.mediatype)
      const materials = readString(data.materials)
      if (!mediatype || materials === null) return null
      const message: MainContentUpdateMessage = {
        type,
        timestamp,
        data: { mediatype, materials },
      }
      return message
    }
    case 'fullStoryUpdate': {
      const headline = readString(data.headline)
      const subtext = readString(data.subtext)
      const mediatype = parseMediaType(data.mediatype)
      const materials = readString(data.materials)
      if (headline === null || subtext === null || !mediatype || materials === null) return null
      const message: FullStoryUpdateMessage = {
        type,
        timestamp,
        data: { headline, subtext, mediatype, materials },
      }
      return message
    }
    case 'weatherUpdate': {
      const temperature = readNumber(data.temperature)
      if (temperature === null) return null
      const message: WeatherUpdateMessage = {
        type,
        timestamp,
        data: { temperature },
      }
      return message
    }
    case 'marqueeUpdate': {
      const marqueefile = readString(data.marqueefile)
      if (marqueefile === null) return null
      const message: MarqueeUpdateMessage = {
        type,
        timestamp,
        data: { marqueefile },
      }
      return message
    }
    case 'fullscreenVideo': {
      const videoSrc = readNonEmptyString(data.videoSrc)
      if (!videoSrc) return null
      const message: FullscreenVideoMessage = {
        type,
        timestamp,
        data: { videoSrc },
      }
      return message
    }
    case 'hideLayer5': {
      const stalltime = readNumber(data.stalltime)
      if (stalltime === null) return null
      const message: HideLayer5Message = {
        type,
        timestamp,
        data: { stalltime },
      }
      return message
    }
    case 'emergencyAlert': {
      const alertcontent = readString(data.alertcontent)
      if (alertcontent === null) return null
      const message: EmergencyAlertMessage = {
        type,
        timestamp,
        data: { alertcontent },
      }
      return message
    }
    case 'stateSync': {
      const payload = parseStateSync(data)
      const message: StateSyncMessage = {
        type,
        timestamp,
        data: payload,
      }
      return message
    }
    default:
      return null
  }
}
