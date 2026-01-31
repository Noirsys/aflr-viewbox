import type {
  BroadcastAction,
  BroadcastMessage,
  BroadcastState,
  MainContentMediaType,
  StateSyncPayload,
} from './types'

export const initialState: BroadcastState = {
  connection: {
    status: 'disconnected',
    reconnectAttempt: 0,
    lastError: null,
  },
  layer1: {
    backgroundAudioSrc: null,
    mainAudio: {
      command: null,
      filename: null,
      seqlength: null,
    },
  },
  layer2: {
    backgroundVideoSrc: null,
  },
  layer4: {
    headline: '',
    subtext: '',
    mainContent: {
      mediaType: null,
      materials: null,
    },
    weather: null,
    marqueeFile: null,
  },
  layer5: {
    fullscreenVideoSrc: null,
    emergencyAlert: null,
    visible: false,
    hideAfterMs: null,
  },
  meta: {
    lastMessageType: null,
    lastMessageTimestamp: null,
  },
}

const withMeta = (state: BroadcastState, message: BroadcastMessage): BroadcastState => ({
  ...state,
  meta: {
    lastMessageType: message.type,
    lastMessageTimestamp: message.timestamp,
  },
})

const coerceWeather = (value: number | string | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

const applyStateSync = (state: BroadcastState, payload: StateSyncPayload): BroadcastState => {
  const nextState: BroadcastState = { ...state }

  if (payload.layer1?.activeAudio !== undefined) {
    nextState.layer1 = {
      ...nextState.layer1,
      backgroundAudioSrc: payload.layer1.activeAudio ?? null,
    }
  }

  if (payload.layer2?.activeVideo !== undefined) {
    nextState.layer2 = {
      ...nextState.layer2,
      backgroundVideoSrc: payload.layer2.activeVideo ?? null,
    }
  }

  if (payload.layer4) {
    nextState.layer4 = {
      ...nextState.layer4,
      headline: payload.layer4.headline ?? nextState.layer4.headline,
      subtext: payload.layer4.subtext ?? nextState.layer4.subtext,
      marqueeFile: payload.layer4.marquee ?? nextState.layer4.marqueeFile,
      weather: coerceWeather(payload.layer4.weather) ?? nextState.layer4.weather,
      mainContent: payload.layer4.mainContent
        ? {
            mediaType: nextState.layer4.mainContent.mediaType as MainContentMediaType | null,
            materials: payload.layer4.mainContent,
          }
        : nextState.layer4.mainContent,
    }
  }

  if (payload.layer5) {
    nextState.layer5 = {
      ...nextState.layer5,
      fullscreenVideoSrc: payload.layer5.activeVideo ?? nextState.layer5.fullscreenVideoSrc,
      visible: payload.layer5.visible ?? nextState.layer5.visible,
      emergencyAlert: payload.layer5.alertcontent ?? nextState.layer5.emergencyAlert,
    }
  }

  return nextState
}

export const broadcastReducer = (state: BroadcastState, action: BroadcastAction): BroadcastState => {
  switch (action.type) {
    case 'connectionStatus':
      return {
        ...state,
        connection: {
          status: action.status,
          reconnectAttempt: action.reconnectAttempt ?? state.connection.reconnectAttempt,
          lastError: action.error ?? null,
        },
      }
    case 'message': {
      const message = action.message
      const stateWithMeta = withMeta(state, message)

      switch (message.type) {
        case 'backgroundvideoUpdate':
          return {
            ...stateWithMeta,
            layer2: {
              ...stateWithMeta.layer2,
              backgroundVideoSrc: message.data.videoSrc,
            },
          }
        case 'backgroundaudioUpdate':
          return {
            ...stateWithMeta,
            layer1: {
              ...stateWithMeta.layer1,
              backgroundAudioSrc: message.data.audioSrc,
            },
          }
        case 'mainaudioUpdate':
          return {
            ...stateWithMeta,
            layer1: {
              ...stateWithMeta.layer1,
              mainAudio: {
                command: message.data.command,
                filename: message.data.filename,
                seqlength: message.data.seqlength,
              },
            },
          }
        case 'headlineUpdate':
          return {
            ...stateWithMeta,
            layer4: {
              ...stateWithMeta.layer4,
              headline: message.data.headline,
            },
          }
        case 'subtextUpdate':
          return {
            ...stateWithMeta,
            layer4: {
              ...stateWithMeta.layer4,
              subtext: message.data.subtext,
            },
          }
        case 'mainContentUpdate':
          return {
            ...stateWithMeta,
            layer4: {
              ...stateWithMeta.layer4,
              mainContent: {
                mediaType: message.data.mediatype,
                materials: message.data.materials,
              },
            },
          }
        case 'fullStoryUpdate':
          return {
            ...stateWithMeta,
            layer4: {
              ...stateWithMeta.layer4,
              headline: message.data.headline,
              subtext: message.data.subtext,
              mainContent: {
                mediaType: message.data.mediatype,
                materials: message.data.materials,
              },
            },
          }
        case 'weatherUpdate':
          return {
            ...stateWithMeta,
            layer4: {
              ...stateWithMeta.layer4,
              weather: message.data.temperature,
            },
          }
        case 'marqueeUpdate':
          return {
            ...stateWithMeta,
            layer4: {
              ...stateWithMeta.layer4,
              marqueeFile: message.data.marqueefile,
            },
          }
        case 'fullscreenVideo':
          return {
            ...stateWithMeta,
            layer5: {
              ...stateWithMeta.layer5,
              fullscreenVideoSrc: message.data.videoSrc,
              visible: true,
              hideAfterMs: null,
            },
          }
        case 'hideLayer5':
          return {
            ...stateWithMeta,
            layer5: {
              ...stateWithMeta.layer5,
              hideAfterMs: stalltime,
              hideAt = now + stalltime,
              visible: true,
            },
          }
        case 'emergencyAlert':
          return {
            ...stateWithMeta,
            layer5: {
              ...stateWithMeta.layer5,
              emergencyAlert: message.data.alertcontent,
              visible: true,
            },
          }
        case 'stateSync':
          return withMeta(applyStateSync(stateWithMeta, message.data), message)
        default:
          return stateWithMeta
      }
    }
    default:
      return state
  }
}
