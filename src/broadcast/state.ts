export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export type MainAudioCommand =
  | 'play_clip'
  | 'play_clip_sequence'
  | 'pause'
  | 'stop'

export type MediaType = 1 | 2

export type BroadcastState = {
  connection: {
    status: ConnectionStatus
    retryCount: number
    lastConnectedAt: number | null
    lastMessageAt: number | null
    lastError: string | null
  }
  layer1: {
    backgroundAudio: string | null
    mainAudio: {
      command: MainAudioCommand | null
      filename: string | null
      seqlength: number | null
    }
  }
  layer2: {
    backgroundVideo: string | null
  }
  layer4: {
    headline: string
    subtext: string
    mainContent: {
      mediatype: MediaType | null
      materials: string | null
    }
    weather: number | null
    marqueeFile: string | null
  }
  layer5: {
    fullscreenVideo: string | null
    hideLayer5AfterMs: number | null
    emergencyAlert: string | null
  }
  lastTimestamp: number | null
}

export const initialState: BroadcastState = {
  connection: {
    status: 'disconnected',
    retryCount: 0,
    lastConnectedAt: null,
    lastMessageAt: null,
    lastError: null,
  },
  layer1: {
    backgroundAudio: null,
    mainAudio: {
      command: null,
      filename: null,
      seqlength: null,
    },
  },
  layer2: {
    backgroundVideo: null,
  },
  layer4: {
    headline: '',
    subtext: '',
    mainContent: {
      mediatype: null,
      materials: null,
    },
    weather: null,
    marqueeFile: null,
  },
  layer5: {
    fullscreenVideo: null,
    hideLayer5AfterMs: null,
    emergencyAlert: null,
  },
  lastTimestamp: null,
}

type ConnectionStatusAction = {
  type: 'connectionStatus'
  status: ConnectionStatus
  at: number
}

type ConnectionRetryAction = {
  type: 'connectionRetry'
  retryCount: number
}

type ConnectionErrorAction = {
  type: 'connectionError'
  message: string | null
}

type MessageBase = {
  timestamp: number
}

type BackgroundVideoAction = MessageBase & {
  type: 'backgroundvideoUpdate'
  data: { videoSrc: string }
}

type BackgroundAudioAction = MessageBase & {
  type: 'backgroundaudioUpdate'
  data: { audioSrc: string | null }
}

type MainAudioAction = MessageBase & {
  type: 'mainaudioUpdate'
  data: {
    command: MainAudioCommand
    filename: string | null
    seqlength: number | null
  }
}

type HeadlineAction = MessageBase & {
  type: 'headlineUpdate'
  data: { headline: string }
}

type SubtextAction = MessageBase & {
  type: 'subtextUpdate'
  data: { subtext: string }
}

type MainContentAction = MessageBase & {
  type: 'mainContentUpdate'
  data: { mediatype: MediaType; materials: string }
}

type FullStoryAction = MessageBase & {
  type: 'fullStoryUpdate'
  data: {
    headline: string
    subtext: string
    mediatype: MediaType
    materials: string
  }
}

type WeatherAction = MessageBase & {
  type: 'weatherUpdate'
  data: { temperature: number }
}

type MarqueeAction = MessageBase & {
  type: 'marqueeUpdate'
  data: { marqueefile: string }
}

type FullscreenVideoAction = MessageBase & {
  type: 'fullscreenVideo'
  data: { videoSrc: string }
}

type HideLayer5Action = MessageBase & {
  type: 'hideLayer5'
  data: { stalltime: number }
}

type EmergencyAlertAction = MessageBase & {
  type: 'emergencyAlert'
  data: { alertcontent: string }
}

type StateSyncAction = MessageBase & {
  type: 'stateSync'
  data: Record<string, unknown>
}

export type BroadcastAction =
  | ConnectionStatusAction
  | ConnectionRetryAction
  | ConnectionErrorAction
  | BackgroundVideoAction
  | BackgroundAudioAction
  | MainAudioAction
  | HeadlineAction
  | SubtextAction
  | MainContentAction
  | FullStoryAction
  | WeatherAction
  | MarqueeAction
  | FullscreenVideoAction
  | HideLayer5Action
  | EmergencyAlertAction
  | StateSyncAction

const applyMessageMeta = (
  state: BroadcastState,
  timestamp: number,
): BroadcastState => ({
  ...state,
  lastTimestamp: timestamp,
  connection: {
    ...state.connection,
    lastMessageAt: timestamp,
  },
})

const isOutdated = (state: BroadcastState, timestamp: number) =>
  state.lastTimestamp !== null && timestamp < state.lastTimestamp

export const broadcastReducer = (
  state: BroadcastState,
  action: BroadcastAction,
): BroadcastState => {
  switch (action.type) {
    case 'connectionStatus':
      return {
        ...state,
        connection: {
          ...state.connection,
          status: action.status,
          lastConnectedAt:
            action.status === 'connected'
              ? action.at
              : state.connection.lastConnectedAt,
        },
      }
    case 'connectionRetry':
      return {
        ...state,
        connection: {
          ...state.connection,
          retryCount: action.retryCount,
        },
      }
    case 'connectionError':
      return {
        ...state,
        connection: {
          ...state.connection,
          lastError: action.message,
        },
      }
    case 'backgroundvideoUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer2: {
            ...state.layer2,
            backgroundVideo: action.data.videoSrc,
          },
        },
        action.timestamp,
      )
    case 'backgroundaudioUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer1: {
            ...state.layer1,
            backgroundAudio: action.data.audioSrc,
          },
        },
        action.timestamp,
      )
    case 'mainaudioUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer1: {
            ...state.layer1,
            mainAudio: {
              command: action.data.command,
              filename: action.data.filename,
              seqlength: action.data.seqlength,
            },
          },
        },
        action.timestamp,
      )
    case 'headlineUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer4: {
            ...state.layer4,
            headline: action.data.headline,
          },
        },
        action.timestamp,
      )
    case 'subtextUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer4: {
            ...state.layer4,
            subtext: action.data.subtext,
          },
        },
        action.timestamp,
      )
    case 'mainContentUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer4: {
            ...state.layer4,
            mainContent: {
              mediatype: action.data.mediatype,
              materials: action.data.materials,
            },
          },
        },
        action.timestamp,
      )
    case 'fullStoryUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer4: {
            ...state.layer4,
            headline: action.data.headline,
            subtext: action.data.subtext,
            mainContent: {
              mediatype: action.data.mediatype,
              materials: action.data.materials,
            },
          },
        },
        action.timestamp,
      )
    case 'weatherUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer4: {
            ...state.layer4,
            weather: action.data.temperature,
          },
        },
        action.timestamp,
      )
    case 'marqueeUpdate':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer4: {
            ...state.layer4,
            marqueeFile: action.data.marqueefile,
          },
        },
        action.timestamp,
      )
    case 'fullscreenVideo':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer5: {
            ...state.layer5,
            fullscreenVideo: action.data.videoSrc,
          },
        },
        action.timestamp,
      )
    case 'hideLayer5':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer5: {
            ...state.layer5,
            hideLayer5AfterMs: action.data.stalltime,
          },
        },
        action.timestamp,
      )
    case 'emergencyAlert':
      if (isOutdated(state, action.timestamp)) return state
      return applyMessageMeta(
        {
          ...state,
          layer5: {
            ...state.layer5,
            emergencyAlert: action.data.alertcontent,
          },
        },
        action.timestamp,
      )
    case 'stateSync': {
      if (isOutdated(state, action.timestamp)) return state
      const next = applyStateSync(state, action.data)
      return applyMessageMeta(next, action.timestamp)
    }
    default:
      return state
  }
}

const applyStateSync = (
  state: BroadcastState,
  data: Record<string, unknown>,
): BroadcastState => {
  const layer1 = isRecord(data.layer1) ? data.layer1 : null
  const layer2 = isRecord(data.layer2) ? data.layer2 : null
  const layer4 = isRecord(data.layer4) ? data.layer4 : null
  const layer5 = isRecord(data.layer5) ? data.layer5 : null

  const nextBackgroundAudio =
    layer1 && typeof layer1.activeAudio === 'string'
      ? layer1.activeAudio
      : state.layer1.backgroundAudio
  const nextBackgroundVideo =
    layer2 && typeof layer2.activeVideo === 'string'
      ? layer2.activeVideo
      : state.layer2.backgroundVideo
  const nextHeadline =
    layer4 && typeof layer4.headline === 'string'
      ? layer4.headline
      : state.layer4.headline
  const nextSubtext =
    layer4 && typeof layer4.subtext === 'string'
      ? layer4.subtext
      : state.layer4.subtext
  const nextWeatherRaw = layer4?.weather
  const nextWeather =
    typeof nextWeatherRaw === 'number'
      ? nextWeatherRaw
      : state.layer4.weather
  const nextMarquee =
    layer4 && typeof layer4.marquee === 'string'
      ? layer4.marquee
      : state.layer4.marqueeFile
  const nextMainContent =
    layer4 && typeof layer4.mainContent === 'string'
      ? layer4.mainContent
      : state.layer4.mainContent.materials
  const nextFullscreenVideo =
    layer5 && typeof layer5.activeVideo === 'string'
      ? layer5.activeVideo
      : state.layer5.fullscreenVideo

  return {
    ...state,
    layer1: {
      ...state.layer1,
      backgroundAudio: nextBackgroundAudio,
    },
    layer2: {
      ...state.layer2,
      backgroundVideo: nextBackgroundVideo,
    },
    layer4: {
      ...state.layer4,
      headline: nextHeadline,
      subtext: nextSubtext,
      marqueeFile: nextMarquee,
      mainContent: {
        ...state.layer4.mainContent,
        materials: nextMainContent,
      },
      weather: nextWeather,
    },
    layer5: {
      ...state.layer5,
      fullscreenVideo: nextFullscreenVideo,
    },
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const normalizeMediaType = (value: unknown): MediaType | null => {
  if (value === 1 || value === '1') return 1
  if (value === 2 || value === '2') return 2
  return null
}

const normalizeString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null

export const parseBroadcastMessage = (
  raw: string,
  debug: boolean,
): BroadcastAction | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    if (debug) console.debug('WS: invalid JSON message', error)
    return null
  }

  if (!isRecord(parsed)) {
    if (debug) console.debug('WS: non-object message ignored')
    return null
  }

  const { type, timestamp, data } = parsed

  if (typeof type !== 'string') {
    if (debug) console.debug('WS: missing type/timestamp', parsed)
    return null
  }

  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    if (debug) console.debug('WS: missing type/timestamp', parsed)
    return null
  }

  if (!isRecord(data)) {
    if (debug) console.debug('WS: missing data payload', parsed)
    return null
  }

  switch (type) {
    case 'backgroundvideoUpdate': {
      const videoSrc = normalizeString(data.videoSrc)
      if (!videoSrc) return null
      return { type, timestamp, data: { videoSrc } }
    }
    case 'backgroundaudioUpdate': {
      if (!('audioSrc' in data)) return null
      const audioSrc = normalizeString(data.audioSrc)
      return { type, timestamp, data: { audioSrc } }
    }
    case 'mainaudioUpdate': {
      const command = normalizeMainAudioCommand(data.command)
      if (!command) return null
      const filename = normalizeString(data.filename)
      const seqlength = toNumber(data.seqlength)
      if (command === 'play_clip' && !filename) return null
      if (command === 'play_clip_sequence') {
        if (!filename) return null
        if (!seqlength || seqlength < 1) return null
      }
      return {
        type,
        timestamp,
        data: {
          command,
          filename,
          seqlength,
        },
      }
    }
    case 'headlineUpdate': {
      if (typeof data.headline !== 'string') return null
      return { type, timestamp, data: { headline: data.headline } }
    }
    case 'subtextUpdate': {
      if (typeof data.subtext !== 'string') return null
      return { type, timestamp, data: { subtext: data.subtext } }
    }
    case 'mainContentUpdate': {
      const mediatype = normalizeMediaType(data.mediatype)
      const materials = normalizeString(data.materials)
      if (!mediatype || !materials) return null
      return { type, timestamp, data: { mediatype, materials } }
    }
    case 'fullStoryUpdate': {
      if (typeof data.headline !== 'string') return null
      if (typeof data.subtext !== 'string') return null
      const mediatype = normalizeMediaType(data.mediatype)
      const materials = normalizeString(data.materials)
      if (!mediatype || !materials) return null
      return {
        type,
        timestamp,
        data: {
          headline: data.headline,
          subtext: data.subtext,
          mediatype,
          materials,
        },
      }
    }
    case 'weatherUpdate': {
      const temperature = toNumber(data.temperature)
      if (temperature === null) return null
      return { type, timestamp, data: { temperature } }
    }
    case 'marqueeUpdate': {
      const marqueefile = normalizeString(data.marqueefile)
      if (!marqueefile) return null
      return { type, timestamp, data: { marqueefile } }
    }
    case 'fullscreenVideo': {
      const videoSrc = normalizeString(data.videoSrc)
      if (!videoSrc) return null
      return { type, timestamp, data: { videoSrc } }
    }
    case 'hideLayer5': {
      const stalltime = toNumber(data.stalltime)
      if (stalltime === null) return null
      return { type, timestamp, data: { stalltime } }
    }
    case 'emergencyAlert': {
      if (typeof data.alertcontent !== 'string') return null
      return { type, timestamp, data: { alertcontent: data.alertcontent } }
    }
    case 'stateSync': {
      return { type, timestamp, data }
    }
    default:
      if (debug) console.debug('WS: unknown message type', type)
      return null
  }
}

const normalizeMainAudioCommand = (
  value: unknown,
): MainAudioCommand | null => {
  if (
    value === 'play_clip' ||
    value === 'play_clip_sequence' ||
    value === 'pause' ||
    value === 'stop'
  ) {
    return value
  }
  return null
}
