import type {
  BroadcastAction,
  BroadcastMessage,
  BroadcastState,
  MediaType,
  StateSyncPayload,
} from './types'

const resolveMediaType = (value: number | null): MediaType | null => {
  if (value === 1) {
    return 'image'
  }
  if (value === 2) {
    return 'video'
  }
  return null
}

const parseMarqueeColor = (filename: string | null): string | null => {
  if (!filename) {
    return null
  }
  const match = filename.match(/_([0-9a-fA-F]{6})\.txt$/)
  if (!match) {
    return null
  }
  return `#${match[1].toUpperCase()}`
}

const applyStateSync = (
  state: BroadcastState,
  payload: StateSyncPayload,
): BroadcastState => {
  const next = { ...state }

  if (payload.layer1) {
    next.layer1 = {
      ...next.layer1,
      backgroundAudio:
        typeof payload.layer1.activeAudio === 'string' ||
        payload.layer1.activeAudio === null
          ? payload.layer1.activeAudio
          : next.layer1.backgroundAudio,
    }
  }

  if (payload.layer2) {
    next.layer2 = {
      ...next.layer2,
      backgroundVideo:
        typeof payload.layer2.activeVideo === 'string' ||
        payload.layer2.activeVideo === null
          ? payload.layer2.activeVideo
          : next.layer2.backgroundVideo,
    }
  }

  if (payload.layer3) {
    next.layer3 = {
      ...next.layer3,
      activeImage:
        typeof payload.layer3.activeImage === 'string' ||
        payload.layer3.activeImage === null
          ? payload.layer3.activeImage
          : next.layer3.activeImage,
      visible:
        typeof payload.layer3.visible === 'boolean'
          ? payload.layer3.visible
          : next.layer3.visible,
    }
  }

  if (payload.layer4) {
    next.layer4 = {
      ...next.layer4,
      headline:
        typeof payload.layer4.headline === 'string'
          ? payload.layer4.headline
          : next.layer4.headline,
      subtext:
        typeof payload.layer4.subtext === 'string'
          ? payload.layer4.subtext
          : next.layer4.subtext,
      marqueeText:
        typeof payload.layer4.marquee === 'string'
          ? payload.layer4.marquee
          : next.layer4.marqueeText,
      time:
        typeof payload.layer4.time === 'string'
          ? payload.layer4.time
          : next.layer4.time,
      newscastTitle:
        typeof payload.layer4.newscastTitle === 'string'
          ? payload.layer4.newscastTitle
          : next.layer4.newscastTitle,
      liveFeed:
        typeof payload.layer4.liveFeed === 'string'
          ? payload.layer4.liveFeed
          : next.layer4.liveFeed,
      temperature:
        typeof payload.layer4.weather === 'number'
          ? payload.layer4.weather
          : next.layer4.temperature,
      mainContent: {
        ...next.layer4.mainContent,
        materials:
          typeof payload.layer4.mainContent === 'string'
            ? payload.layer4.mainContent
            : next.layer4.mainContent.materials,
      },
    }
  }

  if (payload.layer5) {
    next.layer5 = {
      ...next.layer5,
      fullscreenVideo:
        typeof payload.layer5.activeVideo === 'string' ||
        payload.layer5.activeVideo === null
          ? payload.layer5.activeVideo
          : next.layer5.fullscreenVideo,
      visible:
        typeof payload.layer5.visible === 'boolean'
          ? payload.layer5.visible
          : next.layer5.visible,
    }
  }

  return next
}

export const initialState = (wsUrl: string): BroadcastState => ({
  connection: {
    status: 'connecting',
    attempts: 0,
    lastError: null,
    wsUrl,
    lastMessageAt: null,
  },
  lastMessageTimestamp: null,
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
  layer3: {
    activeImage: null,
    visible: true,
  },
  layer4: {
    headline: '',
    subtext: '',
    marqueeFile: null,
    marqueeColor: null,
    marqueeText: '',
    temperature: null,
    time: '',
    newscastTitle: '',
    mainContent: {
      mediaType: null,
      materials: null,
    },
    liveFeed: '',
  },
  layer5: {
    fullscreenVideo: null,
    emergencyAlert: null,
    visible: false,
    hideAfterMs: null,
  },
})

const applyMessage = (
  state: BroadcastState,
  message: BroadcastMessage,
): BroadcastState => {
  const next: BroadcastState = {
    ...state,
    lastMessageTimestamp: message.timestamp,
    connection: {
      ...state.connection,
      lastMessageAt: message.timestamp,
    },
  }

  switch (message.type) {
    case 'backgroundvideoUpdate':
      return {
        ...next,
        layer2: {
          ...next.layer2,
          backgroundVideo: message.data.videoSrc,
        },
      }
    case 'backgroundaudioUpdate':
      return {
        ...next,
        layer1: {
          ...next.layer1,
          backgroundAudio: message.data.audioSrc,
        },
      }
    case 'mainaudioUpdate':
      return {
        ...next,
        layer1: {
          ...next.layer1,
          mainAudio: {
            command: message.data.command,
            filename: message.data.filename,
            seqlength: message.data.seqlength,
          },
        },
      }
    case 'headlineUpdate':
      return {
        ...next,
        layer4: {
          ...next.layer4,
          headline: message.data.headline,
        },
      }
    case 'subtextUpdate':
      return {
        ...next,
        layer4: {
          ...next.layer4,
          subtext: message.data.subtext,
        },
      }
    case 'mainContentUpdate':
      return {
        ...next,
        layer4: {
          ...next.layer4,
          mainContent: {
            mediaType: resolveMediaType(message.data.mediatype),
            materials: message.data.materials,
          },
        },
      }
    case 'fullStoryUpdate':
      return {
        ...next,
        layer4: {
          ...next.layer4,
          headline: message.data.headline,
          subtext: message.data.subtext,
          mainContent: {
            mediaType: resolveMediaType(message.data.mediatype),
            materials: message.data.materials,
          },
        },
      }
    case 'weatherUpdate':
      return {
        ...next,
        layer4: {
          ...next.layer4,
          temperature: message.data.temperature,
        },
      }
    case 'marqueeUpdate':
      return {
        ...next,
        layer4: {
          ...next.layer4,
          marqueeFile: message.data.marqueefile,
          marqueeColor: parseMarqueeColor(message.data.marqueefile),
        },
      }
    case 'fullscreenVideo':
      return {
        ...next,
        layer5: {
          ...next.layer5,
          fullscreenVideo: message.data.videoSrc,
          visible: true,
        },
      }
    case 'hideLayer5':
      return {
        ...next,
        layer5: {
          ...next.layer5,
          hideAfterMs: message.data.stalltime,
        },
      }
    case 'emergencyAlert':
      return {
        ...next,
        layer5: {
          ...next.layer5,
          emergencyAlert: message.data.alertcontent,
          visible: true,
        },
      }
    case 'stateSync':
      return applyStateSync(next, message.data)
    default:
      return next
  }
}

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
          attempts: action.attempts,
          wsUrl: action.wsUrl,
          lastError: action.error ?? null,
        },
      }
    case 'message': {
      if (
        state.lastMessageTimestamp !== null &&
        action.message.timestamp < state.lastMessageTimestamp
      ) {
        return state
      }
      return applyMessage(state, action.message)
    }
    default:
      return state
  }
}
