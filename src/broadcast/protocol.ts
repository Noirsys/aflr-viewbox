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

export type MessageIgnoredReason =
  | 'invalid_json'
  | 'non_object'
  | 'missing_fields'
  | 'unknown_type'
  | 'invalid_payload'

export type MessageParseTelemetryEvent =
  | {
      outcome: 'parsed'
      messageType: BroadcastMessageType
      timestamp: number
    }
  | {
      outcome: 'ignored'
      reason: MessageIgnoredReason
      messageType: string | null
      timestamp: number | null
    }

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
    const volume = readNumber(data.layer1.volume)
    if (activeAudio !== null || data.layer1.activeAudio === null) {
      payload.layer1 = { activeAudio: activeAudio ?? null }
    }
    if (volume !== null) {
      payload.layer1 = { ...(payload.layer1 ?? {}), volume }
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
    const newscastTitle = readString(data.layer4.newscastTitle)
    const headline = readString(data.layer4.headline)
    const subtext = readString(data.layer4.subtext)
    const marquee = readString(data.layer4.marquee)
    const weather = data.layer4.weather
    const time = readString(data.layer4.time)
    const mainContent = readString(data.layer4.mainContent)
    const liveFeed = readString(data.layer4.liveFeed)

    if (newscastTitle !== null) layer4.newscastTitle = newscastTitle
    if (headline !== null) layer4.headline = headline
    if (subtext !== null) layer4.subtext = subtext
    if (marquee !== null) layer4.marquee = marquee
    if (typeof weather === 'number' || typeof weather === 'string') {
      layer4.weather = weather
    }
    if (time !== null) layer4.time = time
    if (mainContent !== null) layer4.mainContent = mainContent
    if (liveFeed !== null) layer4.liveFeed = liveFeed

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

export const parseIncomingMessage = (
  raw: string,
  debugEnabled: boolean,
  telemetryHook?: (event: MessageParseTelemetryEvent) => void,
): BroadcastMessage | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    if (debugEnabled) {
      console.debug('[ws] Failed to parse JSON', error)
    }
    telemetryHook?.({
      outcome: 'ignored',
      reason: 'invalid_json',
      messageType: null,
      timestamp: null,
    })
    return null
  }

  if (!isRecord(parsed)) {
    if (debugEnabled) {
      console.debug('[ws] Message is not an object')
    }
    telemetryHook?.({
      outcome: 'ignored',
      reason: 'non_object',
      messageType: null,
      timestamp: null,
    })
    return null
  }

  const type = readString(parsed.type)
  const timestamp = readNumber(parsed.timestamp)
  const data = parsed.data

  if (type === null || timestamp === null || !isRecord(data)) {
    if (debugEnabled) {
      console.debug('[ws] Message missing required fields', parsed)
    }
    telemetryHook?.({
      outcome: 'ignored',
      reason: 'missing_fields',
      messageType: type,
      timestamp,
    })
    return null
  }

  if (!isKnownType(type)) {
    if (debugEnabled) {
      console.debug('[ws] Unknown message type', type)
    }
    telemetryHook?.({
      outcome: 'ignored',
      reason: 'unknown_type',
      messageType: type,
      timestamp,
    })
    return null
  }

  const rejectPayload = () => {
    if (debugEnabled) {
      console.debug('[ws] Invalid payload for message type', type, data)
    }
    telemetryHook?.({
      outcome: 'ignored',
      reason: 'invalid_payload',
      messageType: type,
      timestamp,
    })
    return null
  }

  const accept = (message: BroadcastMessage) => {
    telemetryHook?.({
      outcome: 'parsed',
      messageType: message.type,
      timestamp: message.timestamp,
    })
    return message
  }

  switch (type) {
    case 'backgroundvideoUpdate': {
      const videoSrc = readNonEmptyString(data.videoSrc)
      if (!videoSrc) return rejectPayload()
      const message: BackgroundVideoUpdateMessage = {
        type,
        timestamp,
        data: { videoSrc },
      }
      return accept(message)
    }
    case 'backgroundaudioUpdate': {
      if (!('audioSrc' in data)) return rejectPayload()

      const audioSrc =
        data.audioSrc === null ? null : readNonEmptyString(data.audioSrc)
      if (audioSrc === null && data.audioSrc !== null) return rejectPayload()
      const message: BackgroundAudioUpdateMessage = {
        type,
        timestamp,
        data: { audioSrc },
      }
      return accept(message)
    }
    case 'mainaudioUpdate': {
      const command = readString(data.command)
      if (!command || !isMainAudioCommand(command)) return rejectPayload()

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
      return accept(message)
    }
    case 'headlineUpdate': {
      const headline = readString(data.headline)
      if (headline === null) return rejectPayload()
      const message: HeadlineUpdateMessage = {
        type,
        timestamp,
        data: { headline },
      }
      return accept(message)
    }
    case 'subtextUpdate': {
      const subtext = readString(data.subtext)
      if (subtext === null) return rejectPayload()
      const message: SubtextUpdateMessage = {
        type,
        timestamp,
        data: { subtext },
      }
      return accept(message)
    }
    case 'mainContentUpdate': {
      const mediatype = parseMediaType(data.mediatype)
      const materials = readString(data.materials)
      if (!mediatype || materials === null) return rejectPayload()
      const message: MainContentUpdateMessage = {
        type,
        timestamp,
        data: { mediatype, materials },
      }
      return accept(message)
    }
    case 'fullStoryUpdate': {
      const headline = readString(data.headline)
      const subtext = readString(data.subtext)
      const mediatype = parseMediaType(data.mediatype)
      const materials = readString(data.materials)
      if (headline === null || subtext === null || !mediatype || materials === null) {
        return rejectPayload()
      }
      const message: FullStoryUpdateMessage = {
        type,
        timestamp,
        data: { headline, subtext, mediatype, materials },
      }
      return accept(message)
    }
    case 'weatherUpdate': {
      const temperature = readNumber(data.temperature)
      if (temperature === null) return rejectPayload()
      const message: WeatherUpdateMessage = {
        type,
        timestamp,
        data: { temperature },
      }
      return accept(message)
    }
    case 'marqueeUpdate': {
      const marqueefile = readString(data.marqueefile)
      if (marqueefile === null) return rejectPayload()
      const message: MarqueeUpdateMessage = {
        type,
        timestamp,
        data: { marqueefile },
      }
      return accept(message)
    }
    case 'fullscreenVideo': {
      const videoSrc = readNonEmptyString(data.videoSrc)
      if (!videoSrc) return rejectPayload()
      const message: FullscreenVideoMessage = {
        type,
        timestamp,
        data: { videoSrc },
      }
      return accept(message)
    }
    case 'hideLayer5': {
      const stalltime = readNumber(data.stalltime)
      if (stalltime === null) return rejectPayload()
      const message: HideLayer5Message = {
        type,
        timestamp,
        data: { stalltime },
      }
      return accept(message)
    }
    case 'emergencyAlert': {
      const alertcontent = readString(data.alertcontent)
      if (alertcontent === null) return rejectPayload()
      const message: EmergencyAlertMessage = {
        type,
        timestamp,
        data: { alertcontent },
      }
      return accept(message)
    }
    case 'stateSync': {
      const payload = parseStateSync(data)
      const message: StateSyncMessage = {
        type,
        timestamp,
        data: payload,
      }
      return accept(message)
    }
    default:
      return null
  }
}
