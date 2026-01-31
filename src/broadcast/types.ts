export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export type MainAudioCommand =
  | 'play_clip'
  | 'play_clip_sequence'
  | 'pause'
  | 'stop'

export type MediaType = 'image' | 'video'

export interface BroadcastState {
  connection: {
    status: ConnectionStatus
    attempts: number
    lastError: string | null
    wsUrl: string
    lastMessageAt: number | null
  }
  lastMessageTimestamp: number | null
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
  layer3: {
    activeImage: string | null
    visible: boolean
  }
  layer4: {
    headline: string
    subtext: string
    marqueeFile: string | null
    marqueeColor: string | null
    marqueeText: string
    temperature: number | null
    time: string
    newscastTitle: string
    mainContent: {
      mediaType: MediaType | null
      materials: string | null
    }
    liveFeed: string
  }
  layer5: {
    fullscreenVideo: string | null
    emergencyAlert: string | null
    visible: boolean
    hideAfterMs: number | null
  }
}

export interface StateSyncPayload {
  layer1?: {
    activeAudio?: string | null
    volume?: number
  }
  layer2?: {
    activeVideo?: string | null
    transition?: string
    opacity?: number
  }
  layer3?: {
    activeImage?: string | null
    visible?: boolean
  }
  layer4?: {
    headline?: string
    subtext?: string
    marquee?: string
    time?: string
    weather?: string | number
    newscastTitle?: string
    mainContent?: string
    liveFeed?: string
  }
  layer5?: {
    activeVideo?: string | null
    visible?: boolean
    transition?: string
  }
}

export type BroadcastMessage =
  | {
      type: 'backgroundvideoUpdate'
      timestamp: number
      data: { videoSrc: string }
    }
  | {
      type: 'backgroundaudioUpdate'
      timestamp: number
      data: { audioSrc: string | null }
    }
  | {
      type: 'mainaudioUpdate'
      timestamp: number
      data: {
        command: MainAudioCommand
        filename: string | null
        seqlength: number | null
      }
    }
  | {
      type: 'headlineUpdate'
      timestamp: number
      data: { headline: string }
    }
  | {
      type: 'subtextUpdate'
      timestamp: number
      data: { subtext: string }
    }
  | {
      type: 'mainContentUpdate'
      timestamp: number
      data: { mediatype: number; materials: string }
    }
  | {
      type: 'fullStoryUpdate'
      timestamp: number
      data: {
        headline: string
        subtext: string
        mediatype: number
        materials: string
      }
    }
  | {
      type: 'weatherUpdate'
      timestamp: number
      data: { temperature: number }
    }
  | {
      type: 'marqueeUpdate'
      timestamp: number
      data: { marqueefile: string }
    }
  | {
      type: 'fullscreenVideo'
      timestamp: number
      data: { videoSrc: string }
    }
  | {
      type: 'hideLayer5'
      timestamp: number
      data: { stalltime: number }
    }
  | {
      type: 'emergencyAlert'
      timestamp: number
      data: { alertcontent: string }
    }
  | {
      type: 'stateSync'
      timestamp: number
      data: StateSyncPayload
    }

export type BroadcastAction =
  | {
      type: 'connectionStatus'
      status: ConnectionStatus
      attempts: number
      wsUrl: string
      error?: string | null
    }
  | {
      type: 'message'
      message: BroadcastMessage
    }
