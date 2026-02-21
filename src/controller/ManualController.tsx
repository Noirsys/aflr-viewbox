import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  BroadcastMessageType,
  MainAudioCommand,
  MainContentMediaType,
  OutboundEnvelope,
  SendEnvelopeResult,
} from '../broadcast/types'
import { useBroadcast } from '../broadcast/useBroadcast'

const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/u
const MAX_HISTORY_ENTRIES = 80

const MAIN_CONTENT_MEDIA_OPTIONS: Array<{ label: string; value: MainContentMediaType }> = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
]

const MAIN_AUDIO_COMMAND_OPTIONS: Array<{ label: string; value: MainAudioCommand }> = [
  { label: 'Play Clip', value: 'play_clip' },
  { label: 'Play Sequence', value: 'play_clip_sequence' },
  { label: 'Pause', value: 'pause' },
  { label: 'Stop', value: 'stop' },
]

type NoticeTone = 'success' | 'warn' | 'error'

type ControllerNotice = {
  tone: NoticeTone
  text: string
}

type HistoryStatus = 'sent' | 'queued' | 'failed'

type HistoryEntry = {
  id: number
  timestamp: number
  type: string
  status: HistoryStatus
  summary: string
}

type PendingEnvelope = {
  type: BroadcastMessageType
  data: Record<string, unknown>
  summary: string
}

type FilenameValidationResult =
  | {
      ok: true
      value: string
    }
  | {
      ok: false
      error: string
    }

const KNOWN_ENVELOPE_TYPES = new Set<string>([
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
  'requestState',
])

const buildDefaultRawEnvelope = () =>
  JSON.stringify(
    {
      type: 'headlineUpdate',
      timestamp: Date.now(),
      data: {
        headline: 'Manual controller raw message test',
      },
    },
    null,
    2,
  )

const validateFilename = (
  rawValue: string,
  label: string,
  requiredExtension?: string,
): FilenameValidationResult => {
  const value = rawValue.trim()
  if (value.length === 0) {
    return { ok: false, error: `${label} is required.` }
  }

  if (!SAFE_FILENAME_PATTERN.test(value) || value.includes('..')) {
    return {
      ok: false,
      error: `${label} must only contain letters, numbers, dots, underscores, or dashes.`,
    }
  }

  if (requiredExtension && !value.toLowerCase().endsWith(requiredExtension.toLowerCase())) {
    return {
      ok: false,
      error: `${label} must end with ${requiredExtension}.`,
    }
  }

  return { ok: true, value }
}

const parseFiniteNumber = (rawValue: string): number | null => {
  const value = Number.parseFloat(rawValue.trim())
  if (!Number.isFinite(value)) {
    return null
  }

  return value
}

const parsePositiveInteger = (rawValue: string): number | null => {
  const value = Number.parseInt(rawValue.trim(), 10)
  if (!Number.isInteger(value) || value < 1) {
    return null
  }

  return value
}

const formatHistoryTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], {
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const describeSendResult = (result: SendEnvelopeResult) => {
  if (result.status === 'sent') {
    return { status: 'sent' as const, tone: 'success' as const }
  }

  if (result.status === 'queued') {
    return {
      status: 'queued' as const,
      tone: 'warn' as const,
      queueSize: result.queueSize,
    }
  }

  return {
    status: 'failed' as const,
    tone: 'error' as const,
    error: result.error,
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="controller-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (nextValue: string) => void
  placeholder?: string
}) {
  return (
    <label className="controller-field">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string
  value: string
  onChange: (nextValue: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <label className="controller-field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function ManualController() {
  const { state, sendEnvelope, requestState, outboundQueueSize } = useBroadcast()
  const [notice, setNotice] = useState<ControllerNotice | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const historyIdRef = useRef(0)

  const [newscastTitle, setNewscastTitle] = useState('ASHTABULA.FRONTLINE.REPORT')
  const [headline, setHeadline] = useState('BREAKING: Scanner Activity')
  const [subtext, setSubtext] = useState('Multiple units dispatched • Stand by')
  const [liveFeed, setLiveFeed] = useState(
    [
      '00:00 Unit: We have a 15-36, copy.',
      '08:32 Dispatch: Copy, SO-4, 10-39?',
      'USER1: I completely disagree; rubbish',
      'USER2: Who are you to judge?',
    ].join('\n'),
  )
  const [mainContentType, setMainContentType] = useState<MainContentMediaType>('image')
  const [mainContentFile, setMainContentFile] = useState('demo_story1.svg')

  const [backgroundVideoFile, setBackgroundVideoFile] = useState('aFLR_LOOP_ScCo.mp4')
  const [backgroundAudioFile, setBackgroundAudioFile] = useState('demo_bed.wav')
  const [mainAudioCommand, setMainAudioCommand] = useState<MainAudioCommand>('play_clip')
  const [mainAudioFile, setMainAudioFile] = useState('demo_story1.wav')
  const [mainAudioSequenceLength, setMainAudioSequenceLength] = useState('1')

  const [weatherTemperature, setWeatherTemperature] = useState('34')
  const [marqueeFile, setMarqueeFile] = useState('DEMO_TOP_3366FF.txt')

  const [fullscreenVideoFile, setFullscreenVideoFile] = useState('aFLR_X_Opening.mp4')
  const [layer5HideDelayMs, setLayer5HideDelayMs] = useState('1200')
  const [alertContent, setAlertContent] = useState(
    'SEVERE WEATHER WARNING: Seek shelter immediately if instructed by authorities.',
  )

  const [rawEnvelope, setRawEnvelope] = useState(buildDefaultRawEnvelope)

  const applySendOutcome = useCallback(
    (type: string, summary: string, result: SendEnvelopeResult) => {
      const descriptor = describeSendResult(result)
      historyIdRef.current += 1

      setHistory((previous) => {
        const next: HistoryEntry = {
          id: historyIdRef.current,
          timestamp: Date.now(),
          type,
          status: descriptor.status,
          summary,
        }
        return [next, ...previous].slice(0, MAX_HISTORY_ENTRIES)
      })

      if (descriptor.status === 'sent') {
        setNotice({
          tone: descriptor.tone,
          text: `Sent ${type}: ${summary}`,
        })
        return
      }

      if (descriptor.status === 'queued') {
        setNotice({
          tone: descriptor.tone,
          text: `Queued ${type} (queue size: ${descriptor.queueSize})`,
        })
        return
      }

      setNotice({
        tone: descriptor.tone,
        text: `Failed to send ${type}: ${descriptor.error}`,
      })
    },
    [],
  )

  const sendMessage = useCallback(
    (type: BroadcastMessageType, data: Record<string, unknown>, summary: string) => {
      const result = sendEnvelope({
        type,
        timestamp: Date.now(),
        data,
      })

      applySendOutcome(type, summary, result)
      return result
    },
    [applySendOutcome, sendEnvelope],
  )

  const sendBatch = useCallback(
    (messages: PendingEnvelope[]) => {
      let sentCount = 0
      let queuedCount = 0
      let failedCount = 0

      for (const message of messages) {
        const result = sendMessage(message.type, message.data, message.summary)
        if (result.status === 'sent') {
          sentCount += 1
        } else if (result.status === 'queued') {
          queuedCount += 1
        } else {
          failedCount += 1
        }
      }

      if (failedCount === 0) {
        setNotice({
          tone: queuedCount > 0 ? 'warn' : 'success',
          text: `Preset applied (${sentCount} sent, ${queuedCount} queued).`,
        })
      }
    },
    [sendMessage],
  )

  const sendLayoutStateSync = useCallback(() => {
    const weather = parseFiniteNumber(weatherTemperature)
    const payload: Record<string, unknown> = {
      layer4: {
        newscastTitle,
        headline,
        subtext,
        liveFeed,
        mainContent: mainContentFile.trim() || null,
        marquee: marqueeFile.trim() || null,
        weather: weather ?? state.layer4.weather,
      },
    }

    sendMessage('stateSync', payload, 'Sync layout fields via stateSync')
  }, [
    headline,
    liveFeed,
    mainContentFile,
    marqueeFile,
    newscastTitle,
    sendMessage,
    state.layer4.weather,
    subtext,
    weatherTemperature,
  ])

  const handleSendHeadline = useCallback(() => {
    if (headline.trim().length === 0) {
      setNotice({ tone: 'error', text: 'Headline cannot be empty.' })
      return
    }

    sendMessage('headlineUpdate', { headline }, 'Update headline')
  }, [headline, sendMessage])

  const handleSendSubtext = useCallback(() => {
    if (subtext.trim().length === 0) {
      setNotice({ tone: 'error', text: 'Subtext cannot be empty.' })
      return
    }

    sendMessage('subtextUpdate', { subtext }, 'Update subtext')
  }, [sendMessage, subtext])

  const handleSendMainContent = useCallback(() => {
    const filenameResult = validateFilename(mainContentFile, 'Main content file')
    if (!filenameResult.ok) {
      setNotice({ tone: 'error', text: filenameResult.error })
      return
    }

    sendMessage(
      'mainContentUpdate',
      {
        mediatype: mainContentType === 'image' ? 1 : 2,
        materials: filenameResult.value,
      },
      `Set main content to ${filenameResult.value}`,
    )
  }, [mainContentFile, mainContentType, sendMessage])

  const handleSendFullStory = useCallback(() => {
    if (headline.trim().length === 0 || subtext.trim().length === 0) {
      setNotice({ tone: 'error', text: 'Headline and subtext are required for fullStoryUpdate.' })
      return
    }

    const filenameResult = validateFilename(mainContentFile, 'Main content file')
    if (!filenameResult.ok) {
      setNotice({ tone: 'error', text: filenameResult.error })
      return
    }

    sendMessage(
      'fullStoryUpdate',
      {
        headline,
        subtext,
        mediatype: mainContentType === 'image' ? 1 : 2,
        materials: filenameResult.value,
      },
      'Update full story package',
    )
  }, [headline, mainContentFile, mainContentType, sendMessage, subtext])

  const handleSendBackgroundVideo = useCallback(() => {
    const filenameResult = validateFilename(backgroundVideoFile, 'Background video file')
    if (!filenameResult.ok) {
      setNotice({ tone: 'error', text: filenameResult.error })
      return
    }

    sendMessage(
      'backgroundvideoUpdate',
      {
        videoSrc: filenameResult.value,
      },
      `Set layer2 background video to ${filenameResult.value}`,
    )
  }, [backgroundVideoFile, sendMessage])

  const handleStartBackgroundAudio = useCallback(() => {
    const filenameResult = validateFilename(backgroundAudioFile, 'Background audio file')
    if (!filenameResult.ok) {
      setNotice({ tone: 'error', text: filenameResult.error })
      return
    }

    sendMessage(
      'backgroundaudioUpdate',
      {
        audioSrc: filenameResult.value,
      },
      `Start layer1 bed audio ${filenameResult.value}`,
    )
  }, [backgroundAudioFile, sendMessage])

  const handleStopBackgroundAudio = useCallback(() => {
    sendMessage('backgroundaudioUpdate', { audioSrc: null }, 'Stop layer1 bed audio')
  }, [sendMessage])

  const handleSendMainAudioCommand = useCallback(() => {
    if (mainAudioCommand === 'pause' || mainAudioCommand === 'stop') {
      sendMessage(
        'mainaudioUpdate',
        {
          command: mainAudioCommand,
          filename: null,
          seqlength: null,
        },
        `Main audio command ${mainAudioCommand}`,
      )
      return
    }

    const filenameResult = validateFilename(mainAudioFile, 'Main audio filename')
    if (!filenameResult.ok) {
      setNotice({ tone: 'error', text: filenameResult.error })
      return
    }

    if (mainAudioCommand === 'play_clip_sequence') {
      const sequenceLength = parsePositiveInteger(mainAudioSequenceLength)
      if (sequenceLength === null) {
        setNotice({
          tone: 'error',
          text: 'Sequence length must be a positive integer for play_clip_sequence.',
        })
        return
      }

      sendMessage(
        'mainaudioUpdate',
        {
          command: 'play_clip_sequence',
          filename: filenameResult.value,
          seqlength: sequenceLength,
        },
        `Play sequence ${filenameResult.value} (length: ${sequenceLength})`,
      )
      return
    }

    sendMessage(
      'mainaudioUpdate',
      {
        command: 'play_clip',
        filename: filenameResult.value,
        seqlength: 1,
      },
      `Play clip ${filenameResult.value}`,
    )
  }, [mainAudioCommand, mainAudioFile, mainAudioSequenceLength, sendMessage])

  const handleSendWeather = useCallback(() => {
    const temperature = parseFiniteNumber(weatherTemperature)
    if (temperature === null) {
      setNotice({ tone: 'error', text: 'Temperature must be a valid number.' })
      return
    }

    sendMessage('weatherUpdate', { temperature }, `Set weather to ${temperature}`)
  }, [sendMessage, weatherTemperature])

  const handleSendMarquee = useCallback(() => {
    const filenameResult = validateFilename(marqueeFile, 'Marquee filename', '.txt')
    if (!filenameResult.ok) {
      setNotice({ tone: 'error', text: filenameResult.error })
      return
    }

    sendMessage(
      'marqueeUpdate',
      { marqueefile: filenameResult.value },
      `Load marquee ${filenameResult.value}`,
    )
  }, [marqueeFile, sendMessage])

  const handleSendFullscreenVideo = useCallback(() => {
    const filenameResult = validateFilename(fullscreenVideoFile, 'Fullscreen video filename')
    if (!filenameResult.ok) {
      setNotice({ tone: 'error', text: filenameResult.error })
      return
    }

    sendMessage(
      'fullscreenVideo',
      { videoSrc: filenameResult.value },
      `Play layer5 fullscreen video ${filenameResult.value}`,
    )
  }, [fullscreenVideoFile, sendMessage])

  const handleHideLayer5 = useCallback(() => {
    const stalltime = parsePositiveInteger(layer5HideDelayMs)
    if (stalltime === null) {
      setNotice({ tone: 'error', text: 'Layer5 hide delay must be a positive integer (ms).' })
      return
    }

    sendMessage('hideLayer5', { stalltime }, `Hide layer5 after ${stalltime}ms`)
  }, [layer5HideDelayMs, sendMessage])

  const handleSendAlert = useCallback(() => {
    if (alertContent.trim().length === 0) {
      setNotice({ tone: 'error', text: 'Alert content cannot be empty.' })
      return
    }

    sendMessage('emergencyAlert', { alertcontent: alertContent }, 'Show emergency alert')
  }, [alertContent, sendMessage])

  const handleClearAlert = useCallback(() => {
    sendBatch([
      {
        type: 'emergencyAlert',
        data: { alertcontent: '' },
        summary: 'Clear emergency alert text',
      },
      {
        type: 'hideLayer5',
        data: { stalltime: 0 },
        summary: 'Hide layer5 immediately',
      },
    ])
  }, [sendBatch])

  const handleRequestState = useCallback(() => {
    const result = requestState()
    applySendOutcome('requestState', 'Request state snapshot', result)
  }, [applySendOutcome, requestState])

  const handleSendRawEnvelope = useCallback(() => {
    let parsed: unknown

    try {
      parsed = JSON.parse(rawEnvelope)
    } catch (error) {
      setNotice({
        tone: 'error',
        text: `Raw JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
      })
      return
    }

    if (typeof parsed !== 'object' || parsed === null) {
      setNotice({ tone: 'error', text: 'Raw envelope must be a JSON object.' })
      return
    }

    const candidate = parsed as Partial<OutboundEnvelope>
    if (typeof candidate.type !== 'string' || !KNOWN_ENVELOPE_TYPES.has(candidate.type)) {
      setNotice({ tone: 'error', text: 'Raw envelope must include a known `type` string.' })
      return
    }

    if (typeof candidate.data !== 'object' || candidate.data === null) {
      setNotice({ tone: 'error', text: 'Raw envelope must include an object `data` field.' })
      return
    }

    const envelope: OutboundEnvelope = {
      type: candidate.type as OutboundEnvelope['type'],
      timestamp: typeof candidate.timestamp === 'number' ? candidate.timestamp : Date.now(),
      data: candidate.data as Record<string, unknown>,
    }

    const result = sendEnvelope(envelope)
    applySendOutcome(envelope.type, 'Sent raw envelope', result)
  }, [applySendOutcome, rawEnvelope, sendEnvelope])

  const handlePresetOpen = useCallback(() => {
    sendBatch([
      {
        type: 'backgroundvideoUpdate',
        data: { videoSrc: 'aFLR_LOOP_ScCo.mp4' },
        summary: 'Preset open: start background loop',
      },
      {
        type: 'weatherUpdate',
        data: { temperature: 34 },
        summary: 'Preset open: weather 34F',
      },
      {
        type: 'marqueeUpdate',
        data: { marqueefile: 'DEMO_TOP_3366FF.txt' },
        summary: 'Preset open: default marquee',
      },
      {
        type: 'headlineUpdate',
        data: { headline: 'ASHTABULA FRONTLINE REPORT' },
        summary: 'Preset open: station headline',
      },
      {
        type: 'subtextUpdate',
        data: { subtext: 'AUTONOMOUS LOCAL NEWS • LIVE PROTOCOL CONTROL' },
        summary: 'Preset open: station subtext',
      },
      {
        type: 'mainContentUpdate',
        data: { mediatype: 1, materials: 'demo_story1.svg' },
        summary: 'Preset open: main content story card',
      },
      {
        type: 'backgroundaudioUpdate',
        data: { audioSrc: 'demo_bed.wav' },
        summary: 'Preset open: start bed audio',
      },
      {
        type: 'stateSync',
        data: {
          layer4: {
            newscastTitle: 'ASHTABULA.FRONTLINE.REPORT',
            liveFeed: [
              '00:00 Unit: We have a 15-36, copy.',
              '08:32 Dispatch: Copy, SO-4, 10-39?',
              'USER1: I completely disagree; rubbish',
              'USER2: Who are you to judge?',
            ].join('\n'),
          },
        },
        summary: 'Preset open: sync title and live feed',
      },
    ])
  }, [sendBatch])

  const handlePresetStory = useCallback(() => {
    sendBatch([
      {
        type: 'fullStoryUpdate',
        data: {
          headline: 'BREAKING: Scanner Activity',
          subtext: 'Multiple units dispatched • Stand by',
          mediatype: 1,
          materials: 'demo_story2.svg',
        },
        summary: 'Preset story: update full story card',
      },
      {
        type: 'mainaudioUpdate',
        data: {
          command: 'play_clip',
          filename: 'demo_story2.wav',
          seqlength: 1,
        },
        summary: 'Preset story: play narration clip',
      },
    ])
  }, [sendBatch])

  const handlePresetEmergency = useCallback(() => {
    sendBatch([
      {
        type: 'marqueeUpdate',
        data: { marqueefile: 'DEMO_ALERT_FF0000.txt' },
        summary: 'Preset emergency: alert marquee',
      },
      {
        type: 'emergencyAlert',
        data: {
          alertcontent:
            'SEVERE WEATHER WARNING: Seek shelter immediately if instructed by authorities.',
        },
        summary: 'Preset emergency: show emergency alert',
      },
    ])
  }, [sendBatch])

  const noticeClassName = useMemo(() => {
    if (!notice) {
      return 'controller-notice'
    }

    if (notice.tone === 'error') {
      return 'controller-notice controller-notice--error'
    }

    if (notice.tone === 'warn') {
      return 'controller-notice controller-notice--warn'
    }

    return 'controller-notice controller-notice--success'
  }, [notice])

  return (
    <aside className="controller-board" aria-label="Broadcast Controller">
      <header className="controller-board__header">
        <div>
          <h2>Control Board</h2>
          <p>Manual broadcast controls that send protocol-valid WebSocket envelopes.</p>
        </div>
        <div className="controller-connection-card">
          <span className={`controller-status controller-status--${state.connection.status}`}>
            {state.connection.status}
          </span>
          <span>Reconnect Attempt: {state.connection.reconnectAttempt}</span>
          <span>Outbound Queue: {outboundQueueSize}</span>
          {state.connection.lastError ? (
            <span className="controller-status-error">Last Error: {state.connection.lastError}</span>
          ) : null}
        </div>
      </header>

      {notice ? <p className={noticeClassName}>{notice.text}</p> : null}

      <Section title="Presets">
        <div className="controller-button-row">
          <button type="button" onClick={handlePresetOpen}>
            Run Open Preset
          </button>
          <button type="button" onClick={handlePresetStory}>
            Run Story Preset
          </button>
          <button type="button" onClick={handlePresetEmergency}>
            Run Emergency Preset
          </button>
          <button type="button" onClick={handleRequestState}>
            Request State
          </button>
        </div>
      </Section>

      <Section title="Layer4 Content">
        <div className="controller-grid controller-grid--2">
          <InputField label="Newscast Title" value={newscastTitle} onChange={setNewscastTitle} />
          <InputField
            label="Main Content File"
            value={mainContentFile}
            onChange={setMainContentFile}
            placeholder="story1.svg"
          />
          <TextAreaField label="Headline" value={headline} onChange={setHeadline} rows={2} />
          <TextAreaField label="Subtext" value={subtext} onChange={setSubtext} rows={2} />
          <TextAreaField
            label="Live Feed"
            value={liveFeed}
            onChange={setLiveFeed}
            rows={5}
            placeholder="One item per line"
          />
          <label className="controller-field">
            <span>Main Content Type</span>
            <select
              value={mainContentType}
              onChange={(event) => setMainContentType(event.target.value as MainContentMediaType)}
            >
              {MAIN_CONTENT_MEDIA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="controller-button-row">
          <button type="button" onClick={handleSendHeadline}>
            Send Headline
          </button>
          <button type="button" onClick={handleSendSubtext}>
            Send Subtext
          </button>
          <button type="button" onClick={handleSendMainContent}>
            Send Main Content
          </button>
          <button type="button" onClick={handleSendFullStory}>
            Send Full Story
          </button>
          <button type="button" onClick={sendLayoutStateSync}>
            Sync Layout (stateSync)
          </button>
        </div>
      </Section>

      <Section title="Layer1 and Layer2 Media">
        <div className="controller-grid controller-grid--3">
          <InputField
            label="Background Video (layer2)"
            value={backgroundVideoFile}
            onChange={setBackgroundVideoFile}
            placeholder="aFLR_LOOP_ScCo.mp4"
          />
          <InputField
            label="Background Audio (layer1)"
            value={backgroundAudioFile}
            onChange={setBackgroundAudioFile}
            placeholder="bed.wav"
          />
          <InputField
            label="Main Audio Filename"
            value={mainAudioFile}
            onChange={setMainAudioFile}
            placeholder="story_1.wav"
          />
          <label className="controller-field">
            <span>Main Audio Command</span>
            <select
              value={mainAudioCommand}
              onChange={(event) => setMainAudioCommand(event.target.value as MainAudioCommand)}
            >
              {MAIN_AUDIO_COMMAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <InputField
            label="Sequence Length"
            value={mainAudioSequenceLength}
            onChange={setMainAudioSequenceLength}
            placeholder="3"
          />
        </div>
        <div className="controller-button-row">
          <button type="button" onClick={handleSendBackgroundVideo}>
            Set Background Video
          </button>
          <button type="button" onClick={handleStartBackgroundAudio}>
            Start Bed Audio
          </button>
          <button type="button" onClick={handleStopBackgroundAudio}>
            Stop Bed Audio
          </button>
          <button type="button" onClick={handleSendMainAudioCommand}>
            Send Main Audio Command
          </button>
        </div>
      </Section>

      <Section title="Weather and Marquee">
        <div className="controller-grid controller-grid--2">
          <InputField
            label="Temperature (F)"
            value={weatherTemperature}
            onChange={setWeatherTemperature}
            placeholder="34"
          />
          <InputField
            label="Marquee File (.txt)"
            value={marqueeFile}
            onChange={setMarqueeFile}
            placeholder="TOP_3366FF.txt"
          />
        </div>
        <div className="controller-button-row">
          <button type="button" onClick={handleSendWeather}>
            Send Weather
          </button>
          <button type="button" onClick={handleSendMarquee}>
            Send Marquee
          </button>
        </div>
      </Section>

      <Section title="Layer5 Overlay">
        <div className="controller-grid controller-grid--2">
          <InputField
            label="Fullscreen Video (layer5)"
            value={fullscreenVideoFile}
            onChange={setFullscreenVideoFile}
            placeholder="aFLR_X_Opening.mp4"
          />
          <InputField
            label="Hide Delay (ms)"
            value={layer5HideDelayMs}
            onChange={setLayer5HideDelayMs}
            placeholder="1200"
          />
          <TextAreaField
            label="Emergency Alert Content"
            value={alertContent}
            onChange={setAlertContent}
            rows={3}
          />
        </div>
        <div className="controller-button-row">
          <button type="button" onClick={handleSendFullscreenVideo}>
            Play Fullscreen Video
          </button>
          <button type="button" onClick={handleHideLayer5}>
            Hide Layer5
          </button>
          <button type="button" onClick={handleSendAlert}>
            Trigger Emergency Alert
          </button>
          <button type="button" onClick={handleClearAlert}>
            Clear Alert / Hide Now
          </button>
        </div>
      </Section>

      <Section title="Raw Envelope">
        <TextAreaField
          label="Raw JSON Envelope"
          value={rawEnvelope}
          onChange={setRawEnvelope}
          rows={8}
        />
        <div className="controller-button-row">
          <button type="button" onClick={handleSendRawEnvelope}>
            Send Raw Envelope
          </button>
          <button type="button" onClick={() => setRawEnvelope(buildDefaultRawEnvelope())}>
            Reset Example
          </button>
        </div>
      </Section>

      <Section title="Send History">
        {history.length === 0 ? (
          <p className="controller-history-empty">No messages sent yet.</p>
        ) : (
          <ul className="controller-history-list">
            {history.map((entry) => (
              <li key={entry.id} className={`controller-history-item controller-history-item--${entry.status}`}>
                <span className="controller-history-meta">
                  {formatHistoryTime(entry.timestamp)} • {entry.type}
                </span>
                <span>{entry.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </aside>
  )
}
