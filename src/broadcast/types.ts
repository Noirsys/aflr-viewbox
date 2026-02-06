import type { Dispatch } from 'react'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export type BroadcastMessageType =
  | 'backgroundvideoUpdate'
  | 'backgroundaudioUpdate'
  | 'mainaudioUpdate'
  | 'headlineUpdate'
  | 'subtextUpdate'
  | 'mainContentUpdate'
  | 'fullStoryUpdate'
  | 'weatherUpdate'
  | 'marqueeUpdate'
  | 'fullscreenVideo'
  | 'hideLayer5'
  | 'emergencyAlert'
  | 'stateSync'

export type MainAudioCommand =
  | 'play_clip'
  | 'play_clip_sequence'
  | 'pause'
  | 'stop'

export interface EnvelopeBase {
  type: BroadcastMessageType
  timestamp: number
}

export interface BackgroundVideoUpdateMessage extends EnvelopeBase {
  type: 'backgroundvideoUpdate'
  data: { videoSrc: string }
}

export interface BackgroundAudioUpdateMessage extends EnvelopeBase {
  type: 'backgroundaudioUpdate'
  data: { audioSrc: string | null }
}

export interface MainAudioUpdateMessage extends EnvelopeBase {
  type: 'mainaudioUpdate'
  data: {
    command: MainAudioCommand
    filename: string | null
    seqlength: number | null
  }
}

export interface HeadlineUpdateMessage extends EnvelopeBase {
  type: 'headlineUpdate'
  data: { headline: string }
}

export interface SubtextUpdateMessage extends EnvelopeBase {
  type: 'subtextUpdate'
  data: { subtext: string }
}

export type MainContentMediaType = 'image' | 'video'

export interface MainContentUpdateMessage extends EnvelopeBase {
  type: 'mainContentUpdate'
  data: { mediatype: MainContentMediaType; materials: string }
}

export interface FullStoryUpdateMessage extends EnvelopeBase {
  type: 'fullStoryUpdate'
  data: { headline: string; subtext: string; mediatype: MainContentMediaType; materials: string }
}

export interface WeatherUpdateMessage extends EnvelopeBase {
  type: 'weatherUpdate'
  data: { temperature: number }
}

export interface MarqueeUpdateMessage extends EnvelopeBase {
  type: 'marqueeUpdate'
  data: { marqueefile: string }
}

export interface FullscreenVideoMessage extends EnvelopeBase {
  type: 'fullscreenVideo'
  data: { videoSrc: string }
}

export interface HideLayer5Message extends EnvelopeBase {
  type: 'hideLayer5'
  data: { stalltime: number }
}

export interface EmergencyAlertMessage extends EnvelopeBase {
  type: 'emergencyAlert'
  data: { alertcontent: string }
}

export interface StateSyncMessage extends EnvelopeBase {
  type: 'stateSync'
  data: StateSyncPayload
}

export interface StateSyncPayload {
  layer1?: { activeAudio?: string | null; volume?: number }
  layer2?: { activeVideo?: string | null }
  layer4?: {
    headline?: string
    subtext?: string
    marquee?: string
    weather?: number | string
    mainContent?: string
  }
  layer5?: { activeVideo?: string | null; visible?: boolean; alertcontent?: string }
}

export type BroadcastMessage =
  | BackgroundVideoUpdateMessage
  | BackgroundAudioUpdateMessage
  | MainAudioUpdateMessage
  | HeadlineUpdateMessage
  | SubtextUpdateMessage
  | MainContentUpdateMessage
  | FullStoryUpdateMessage
  | WeatherUpdateMessage
  | MarqueeUpdateMessage
  | FullscreenVideoMessage
  | HideLayer5Message
  | EmergencyAlertMessage
  | StateSyncMessage

export interface BroadcastState {
  connection: {
    status: ConnectionStatus
    reconnectAttempt: number
    lastError: string | null
  }
  layer1: {
    backgroundAudioSrc: string | null
    volume: number
    mainAudio: {
      command: MainAudioCommand | null
      filename: string | null
      seqlength: number | null
    }
  }
  layer2: {
    backgroundVideoSrc: string | null
  }
  layer4: {
    headline: string
    subtext: string
    mainContent: {
      mediaType: MainContentMediaType | null
      materials: string | null
      revision: number
    }
    weather: number | null
    marqueeFile: string | null
    marqueeRevision: number
  }
  layer5: {
    fullscreenVideoSrc: string | null
    emergencyAlert: string | null
    visible: boolean
    hideAfterMs: number | null
  }
  meta: {
    lastMessageType: BroadcastMessageType | null
    lastMessageTimestamp: number | null
  }
}

export type BroadcastAction =
  | {
      type: 'connectionStatus'
      status: ConnectionStatus
      reconnectAttempt?: number
      error?: string | null
    }
  | {
      type: 'message'
      message: BroadcastMessage
    }
  | {
      type: 'messageBatch'
      messages: BroadcastMessage[]
    }

export interface BroadcastContextValue {
  state: BroadcastState
  dispatch: Dispatch<BroadcastAction>
}
