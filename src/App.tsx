import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, SyntheticEvent } from 'react'
import './App.css'
import type { MainContentMediaType } from './broadcast/types'
import { useBroadcast } from './broadcast/useBroadcast'
import { ManualController } from './controller/ManualController'

const DEBUG_QUERY = 'debug'
const GUIDES_QUERY = 'guides'
const UI_MODE_QUERY = 'ui'
const MARQUEE_SCROLL_PX_PER_SECOND = 110
const MARQUEE_DEFAULT_BACKGROUND = 'rgba(15, 23, 42, 0.72)'
const MARQUEE_SEPARATOR = ' • '
const WEATHER_ICON_PLACEHOLDER = 'WX'
const MAIN_CONTENT_PRELOAD_TIMEOUT_MS = 10000

const MAIN_CONTENT_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'])
const MAIN_CONTENT_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v'])
const MAIN_CONTENT_AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac'])
const LOOPING_LAYER1_AUDIO_PATTERN = /(bed|loop|ambient)/iu

type MediaWarningDetails = {
  filename?: string | null
  src?: string | null
  layer: string
  message: string
  error?: unknown
}

const warnMediaIssue = (details: MediaWarningDetails) => {
  console.warn('[media] Failed to load media', details)
}

const isSafeMarqueeFilename = (filename: string) =>
  /^[A-Za-z0-9._-]+\.txt$/i.test(filename) && !filename.includes('..')

const isSafeMainContentFilename = (filename: string) =>
  /^[A-Za-z0-9._-]+$/i.test(filename) && !filename.includes('..')

const parseMarqueeItems = (raw: string) =>
  raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const parseMarqueeBackgroundColor = (filename: string | null) => {
  if (!filename) {
    return null
  }

  const colorMatch = filename.match(/([0-9A-Fa-f]{6})\.txt$/u)
  if (!colorMatch) {
    return null
  }

  return `#${colorMatch[1].toUpperCase()}`
}

const formatWeatherTemperature = (temperature: number | null): string | null => {
  if (temperature === null || !Number.isFinite(temperature)) {
    return null
  }

  const rounded = Math.round(temperature * 10) / 10
  const display = Number.isInteger(rounded) ? String(Math.trunc(rounded)) : rounded.toFixed(1)
  return `${display}\u00B0F`
}

const formatLocalClockTime = (value: Date): string => {
  const hours24 = value.getHours()
  const hours12 = hours24 % 12 || 12
  const hours = String(hours12).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const period = hours24 >= 12 ? 'PM' : 'AM'
  return `${hours}:${minutes} ${period}`
}

type MainContentKind = 'image' | 'video' | 'audio'

type MainContentSource = {
  key: string
  filename: string
  kind: MainContentKind
  src: string
}

type MainContentSelectionReason = 'empty' | 'unsafe' | 'unsupported'

type MainContentSelection = {
  source: MainContentSource | null
  reason: MainContentSelectionReason | null
}

const getFileExtension = (filename: string): string | null => {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return null
  }

  return filename.slice(dotIndex + 1).toLowerCase()
}

const inferMainContentKind = (filename: string): MainContentKind | null => {
  const extension = getFileExtension(filename)
  if (!extension) {
    return null
  }

  if (MAIN_CONTENT_IMAGE_EXTENSIONS.has(extension)) {
    return 'image'
  }

  if (MAIN_CONTENT_VIDEO_EXTENSIONS.has(extension)) {
    return 'video'
  }

  if (MAIN_CONTENT_AUDIO_EXTENSIONS.has(extension)) {
    return 'audio'
  }

  return null
}

const selectMainContentSource = (
  mediaType: MainContentMediaType | null,
  materials: string | null,
): MainContentSelection => {
  const filename = materials?.trim() ?? ''
  if (filename.length === 0) {
    return { source: null, reason: 'empty' }
  }

  if (!isSafeMainContentFilename(filename)) {
    return { source: null, reason: 'unsafe' }
  }

  const inferredKind = inferMainContentKind(filename)

  let kind: MainContentKind | null = null
  if (inferredKind === 'audio') {
    kind = 'audio'
  } else if (mediaType === 'image' || mediaType === 'video') {
    kind = mediaType
  } else {
    kind = inferredKind
  }

  if (!kind) {
    return { source: null, reason: 'unsupported' }
  }

  return {
    source: {
      key: `${kind}:${filename}`,
      filename,
      kind,
      src: `/media/content/${encodeURIComponent(filename)}`,
    },
    reason: null,
  }
}

function useDebugEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get(DEBUG_QUERY) === '1'
}

function useGuidesEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get(GUIDES_QUERY) === '1'
}

type AppMode = 'viewbox' | 'controller' | 'studio'

function useAppMode(): AppMode {
  if (typeof window === 'undefined') {
    return 'studio'
  }

  const mode = new URLSearchParams(window.location.search).get(UI_MODE_QUERY)
  if (mode === 'viewbox' || mode === 'controller' || mode === 'studio') {
    return mode
  }

  return 'studio'
}

function DebugPanel() {
  const { state, outboundQueueSize } = useBroadcast()
  const stateDump = JSON.stringify(state, null, 2)

  return (
    <aside className="debug-panel">
      <h2>Debug Panel</h2>
      <div className="debug-section">
        <h3>Connection</h3>
        <p>Status: {state.connection.status}</p>
        <p>Reconnect Attempt: {state.connection.reconnectAttempt}</p>
        <p>Outbound Queue: {outboundQueueSize}</p>
        {state.connection.lastError ? (
          <p className="debug-error">Error: {state.connection.lastError}</p>
        ) : null}
      </div>
      <div className="debug-section">
        <h3>Layer 1</h3>
        <p>Background Audio: {state.layer1.backgroundAudioSrc ?? '—'}</p>
        <p>
          Main Audio: {state.layer1.mainAudio.command ?? '—'}
          {state.layer1.mainAudio.filename ? ` (${state.layer1.mainAudio.filename})` : ''}
        </p>
      </div>
      <div className="debug-section">
        <h3>Layer 2</h3>
        <p>Background Video: {state.layer2.backgroundVideoSrc ?? '—'}</p>
      </div>
      <div className="debug-section">
        <h3>Layer 4</h3>
        <p>Title: {state.layer4.newscastTitle || '—'}</p>
        <p>Headline: {state.layer4.headline || '—'}</p>
        <p>Subtext: {state.layer4.subtext || '—'}</p>
        <p>Live Feed: {state.layer4.liveFeed || '—'}</p>
        <p>
          Main Content: {state.layer4.mainContent.mediaType ?? '—'}
          {state.layer4.mainContent.materials
            ? ` (${state.layer4.mainContent.materials})`
            : ''}
        </p>
        <p>Weather: {state.layer4.weather ?? '—'}</p>
        <p>Marquee File: {state.layer4.marqueeFile ?? '—'}</p>
      </div>
      <div className="debug-section">
        <h3>Layer 5</h3>
        <p>Fullscreen Video: {state.layer5.fullscreenVideoSrc ?? '—'}</p>
        <p>Emergency Alert: {state.layer5.emergencyAlert ?? '—'}</p>
        <p>Visible: {state.layer5.visible ? 'yes' : 'no'}</p>
        <p>Hide After: {state.layer5.hideAfterMs ?? '—'}</p>
      </div>
      <div className="debug-section">
        <h3>Last Message</h3>
        <p>Type: {state.meta.lastMessageType ?? '—'}</p>
        <p>Timestamp: {state.meta.lastMessageTimestamp ?? '—'}</p>
      </div>
      <div className="debug-section debug-section--full">
        <h3>State Dump</h3>
        <pre className="debug-dump">{stateDump}</pre>
      </div>
    </aside>
  )
}

function DebugOverlay() {
  const { state } = useBroadcast()

  return (
    <div className="debug-overlay">
      <span className="debug-overlay__label">Debug</span>
      <span>WS: {state.connection.status}</span>
      <span>Last: {state.meta.lastMessageType ?? '—'}</span>
    </div>
  )
}

function Layer2BackgroundVideo() {
  const { state } = useBroadcast()
  const videoSrc = state.layer2.backgroundVideoSrc
  const resolvedSrc = videoSrc ? `/media/layer2/${videoSrc}` : null

  if (!resolvedSrc) {
    return null
  }

  return <Layer2BackgroundVideoSource key={resolvedSrc} resolvedSrc={resolvedSrc} videoSrc={videoSrc!} />
}

type Layer2BackgroundVideoSourceProps = {
  resolvedSrc: string
  videoSrc: string
}

function Layer2BackgroundVideoSource({ resolvedSrc, videoSrc }: Layer2BackgroundVideoSourceProps) {
  const [hasLoadError, setHasLoadError] = useState(false)

  useEffect(() => {
    if (!hasLoadError) {
      return
    }

    warnMediaIssue({
      filename: videoSrc,
      src: resolvedSrc,
      layer: 'layer2',
      message: 'Background video unavailable',
    })
  }, [hasLoadError, resolvedSrc, videoSrc])

  return (
    <>
      {!hasLoadError ? (
        <video
          className="layer2__video"
          src={resolvedSrc}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setHasLoadError(true)}
        />
      ) : (
        <div className="layer2__fallback" role="status" aria-live="polite">
          Background video unavailable
        </div>
      )}
    </>
  )
}

function Layer1MainAudio() {
  const { state } = useBroadcast()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingPlayRef = useRef<(() => void) | null>(null)
  const queueRef = useRef<string[]>([])
  const queueIndexRef = useRef(0)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const volume = state.layer1.volume
  const command = state.layer1.mainAudio.command
  const filename = state.layer1.mainAudio.filename
  const seqlength = state.layer1.mainAudio.seqlength

  const playFromQueue = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    const queue = queueRef.current
    const index = queueIndexRef.current

    if (queue.length === 0) {
      audio.removeAttribute('src')
      audio.load()
      return
    }

    if (index >= queue.length) {
      return
    }

    const resolvedSrc = `/media/audio/${queue[index]}`
    if (audio.getAttribute('src') !== resolvedSrc) {
      audio.src = resolvedSrc
    }

    const playPromise = audio.play()
    if (playPromise) {
      playPromise
        .then(() => {
          setAutoplayBlocked(false)
          pendingPlayRef.current = null
        })
        .catch(() => {
          setAutoplayBlocked(true)
          pendingPlayRef.current = () => {
            audio.play().catch(() => null)
          }
        })
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!command) return

    if (command === 'pause') {
      audio.pause()
      return
    }

    if (command === 'stop') {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      queueRef.current = []
      queueIndexRef.current = 0
      return
    }

    if (!filename) return

    if (command === 'play_clip') {
      queueRef.current = [filename]
      queueIndexRef.current = 0
      playFromQueue()
      return
    }

    if (command === 'play_clip_sequence') {
      if (!seqlength || seqlength < 1) return
      const sequence = Array.from({ length: seqlength }, (_, index) => `${filename}_${index + 1}`)
      queueRef.current = sequence
      queueIndexRef.current = 0
      playFromQueue()
    }
  }, [command, filename, seqlength, playFromQueue])

  useEffect(() => {
    if (!autoplayBlocked || !pendingPlayRef.current) return

    const resume = () => {
      pendingPlayRef.current?.()
    }

    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [autoplayBlocked])

  const handleEnded = () => {
    const queue = queueRef.current
    if (queueIndexRef.current + 1 < queue.length) {
      queueIndexRef.current += 1
      playFromQueue()
    }
  }

  const handleAudioError = useCallback((errorEvent: SyntheticEvent<HTMLAudioElement>) => {
    const queue = queueRef.current
    const failedIndex = queueIndexRef.current
    const failedFile = queue[failedIndex] ?? filename
    const resolvedSrc = failedFile ? `/media/audio/${failedFile}` : null

    warnMediaIssue({
      filename: failedFile ?? null,
      src: resolvedSrc,
      layer: 'layer1-main-audio',
      message: 'Primary audio unavailable',
      error: errorEvent.nativeEvent,
    })

    if (failedIndex + 1 < queue.length) {
      queueIndexRef.current = failedIndex + 1
      playFromQueue()
      return
    }

    queueRef.current = []
    queueIndexRef.current = 0
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }, [filename, playFromQueue])

  return <audio ref={audioRef} onEnded={handleEnded} onError={handleAudioError} />
}

const shouldLoopLayer1Audio = (filename: string) =>
  LOOPING_LAYER1_AUDIO_PATTERN.test(filename)

function Layer1BackgroundAudio() {
  const { state } = useBroadcast()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingPlayRef = useRef<(() => void) | null>(null)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const filename = state.layer1.backgroundAudioSrc?.trim() ?? null

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!filename) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      pendingPlayRef.current = null
      return
    }

    const resolvedSrc = `/media/layer1/${filename}`
    audio.loop = shouldLoopLayer1Audio(filename)
    if (audio.getAttribute('src') !== resolvedSrc) {
      audio.src = resolvedSrc
    }

    const playPromise = audio.play()
    if (!playPromise) {
      return
    }

    playPromise
      .then(() => {
        setAutoplayBlocked(false)
        pendingPlayRef.current = null
      })
      .catch(() => {
        setAutoplayBlocked(true)
        pendingPlayRef.current = () => {
          audio.play().catch(() => null)
        }
      })
  }, [filename])

  useEffect(() => {
    if (!autoplayBlocked || !pendingPlayRef.current) {
      return
    }

    const resume = () => {
      pendingPlayRef.current?.()
    }

    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [autoplayBlocked])

  const handleAudioError = useCallback((errorEvent: SyntheticEvent<HTMLAudioElement>) => {
    warnMediaIssue({
      filename,
      src: filename ? `/media/layer1/${filename}` : null,
      layer: 'layer1-background-audio',
      message: 'Background layer1 audio unavailable',
      error: errorEvent.nativeEvent,
    })
  }, [filename])

  return <audio ref={audioRef} onError={handleAudioError} />
}

type Layer5OverlayActiveProps = {
  visible: boolean
  videoSrc: string | null
  alertText: string | null
  hideAfterMs: number | null
}

function Layer5OverlayActive({ visible, videoSrc, alertText, hideAfterMs }: Layer5OverlayActiveProps) {
  const hideTimerRef = useRef<number | null>(null)
  const [hiddenByClient, setHiddenByClient] = useState(false)
  const [videoCompleted, setVideoCompleted] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => {
    if (!videoFailed || !videoSrc) {
      return
    }

    warnMediaIssue({
      filename: videoSrc.split('/').pop() ?? null,
      src: videoSrc,
      layer: 'layer5',
      message: 'Fullscreen video unavailable',
    })
  }, [videoFailed, videoSrc])

  useEffect(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }

    if (!visible || hideAfterMs === null) {
      return
    }

    const safeDelay = Math.max(0, hideAfterMs)
    hideTimerRef.current = window.setTimeout(() => {
      setHiddenByClient(true)
    }, safeDelay)

    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [hideAfterMs, visible])

  const showVideo = Boolean(videoSrc) && !videoCompleted && !videoFailed
  const showVideoFallback = Boolean(videoSrc) && videoFailed
  const showAlert = Boolean(alertText)
  const shouldRender = visible && !hiddenByClient && (showVideo || showAlert || showVideoFallback)

  if (!shouldRender) {
    return null
  }

  return (
    <div className="layer5" role="presentation">
      {showVideo ? (
        <video
          className="layer5__video"
          src={videoSrc ?? undefined}
          autoPlay
          playsInline
          muted
          onEnded={() => setVideoCompleted(true)}
          onError={() => setVideoFailed(true)}
        />
      ) : null}
      {showVideoFallback ? (
        <div className="layer5__video-fallback" role="status" aria-live="polite">
          Fullscreen video unavailable
        </div>
      ) : null}
      {showAlert ? (
        <div className="layer5__alert" role="alert" aria-live="assertive">
          <div className="layer5__alert-frame">
            <h2 className="layer5__alert-title">EMERGENCY ALERT</h2>
            <p className="layer5__alert-copy">{alertText}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Layer5Overlay() {
  const { state } = useBroadcast()
  const alertText = state.layer5.emergencyAlert?.trim() || null
  const videoSrc = state.layer5.fullscreenVideoSrc
    ? `/media/layer5/${state.layer5.fullscreenVideoSrc}`
    : null
  const resetKey = `${state.layer5.visible ? '1' : '0'}:${videoSrc ?? ''}:${alertText ?? ''}`

  return (
    <Layer5OverlayActive
      key={resetKey}
      visible={state.layer5.visible}
      videoSrc={videoSrc}
      alertText={alertText}
      hideAfterMs={state.layer5.hideAfterMs}
    />
  )
}

type Layer4MarqueeProps = {
  marqueeFile: string | null
  marqueeRevision: number
  debugEnabled: boolean
}

function Layer4Marquee({ marqueeFile, marqueeRevision, debugEnabled }: Layer4MarqueeProps) {
  const [items, setItems] = useState<string[]>([])
  const [loadError, setLoadError] = useState(false)
  const [offsetPx, setOffsetPx] = useState(0)
  const firstCopyRef = useRef<HTMLSpanElement | null>(null)
  const loopWidthRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const normalizedMarqueeFile = marqueeFile?.trim() || null

  const hasItems = items.length > 0
  const tickerText = items.join(MARQUEE_SEPARATOR)
  const loopText = hasItems ? `${tickerText}${MARQUEE_SEPARATOR}` : ''
  const marqueeBackgroundColor =
    parseMarqueeBackgroundColor(normalizedMarqueeFile) ?? MARQUEE_DEFAULT_BACKGROUND
  const marqueeStyle = {
    '--marquee-background-color': marqueeBackgroundColor,
  } as CSSProperties

  useEffect(() => {
    const nextFile = normalizedMarqueeFile ?? ''
    setOffsetPx(0)

    if (!nextFile) {
      setItems([])
      setLoadError(false)
      return
    }

    if (!isSafeMarqueeFilename(nextFile)) {
      if (debugEnabled) {
        console.debug('[marquee] Ignored unsafe filename', nextFile)
      }
      setItems([])
      setLoadError(false)
      return
    }

    const controller = new AbortController()

    const loadMarquee = async () => {
      try {
        const response = await fetch(`/media/marquee/${encodeURIComponent(nextFile)}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const text = await response.text()
        if (controller.signal.aborted) {
          return
        }

        setItems(parseMarqueeItems(text))
        setLoadError(false)
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setItems([])
        setLoadError(true)
        warnMediaIssue({
          filename: nextFile,
          src: `/media/marquee/${encodeURIComponent(nextFile)}`,
          layer: 'layer4-marquee',
          message: 'Ticker file unavailable',
          error,
        })
      }
    }

    void loadMarquee()

    return () => {
      controller.abort()
    }
  }, [debugEnabled, normalizedMarqueeFile, marqueeRevision])

  useEffect(() => {
    if (!hasItems) {
      loopWidthRef.current = 0
      setOffsetPx(0)
      return
    }

    const firstCopy = firstCopyRef.current
    if (!firstCopy) {
      return
    }

    const updateLoopWidth = () => {
      loopWidthRef.current = firstCopy.offsetWidth
    }

    updateLoopWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLoopWidth)
      return () => {
        window.removeEventListener('resize', updateLoopWidth)
      }
    }

    const observer = new ResizeObserver(() => {
      updateLoopWidth()
    })
    observer.observe(firstCopy)

    return () => {
      observer.disconnect()
    }
  }, [hasItems, loopText])

  useEffect(() => {
    if (!hasItems) {
      return
    }

    const tick = (timestamp: number) => {
      const lastFrame = lastFrameRef.current ?? timestamp
      lastFrameRef.current = timestamp
      const deltaSeconds = (timestamp - lastFrame) / 1000
      const loopWidth = loopWidthRef.current

      setOffsetPx((currentOffset) => {
        if (loopWidth <= 0) {
          return 0
        }

        let nextOffset = currentOffset - deltaSeconds * MARQUEE_SCROLL_PX_PER_SECOND
        while (nextOffset <= -loopWidth) {
          nextOffset += loopWidth
        }

        return nextOffset
      })

      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    animationFrameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      lastFrameRef.current = null
    }
  }, [hasItems])

  if (!hasItems) {
    const fallbackText = loadError ? 'Ticker unavailable' : debugEnabled ? 'Marquee / Ticker' : ''

    return (
      <section className="layer4__box layer4__marquee" style={marqueeStyle}>
        <div
          className={`layer4__text layer4__text--marquee ${loadError ? 'layer4__text--warning' : ''}`}
        >
          {fallbackText}
        </div>
      </section>
    )
  }

  return (
    <section className="layer4__box layer4__marquee" style={marqueeStyle}>
      <div className="layer4__marquee-viewport" aria-label="Ticker">
        <div
          className="layer4__marquee-track"
          style={{ transform: `translate3d(${offsetPx}px, 0, 0)` }}
        >
          <span ref={firstCopyRef} className="layer4__marquee-copy">
            {loopText}
          </span>
          <span className="layer4__marquee-copy" aria-hidden="true">
            {loopText}
          </span>
        </div>
      </div>
    </section>
  )
}

type Layer4WeatherProps = {
  temperature: number | null
  debugEnabled: boolean
}

function Layer4Weather({ temperature, debugEnabled }: Layer4WeatherProps) {
  const formattedTemperature = formatWeatherTemperature(temperature)
  const displayValue = formattedTemperature ?? (debugEnabled ? 'Weather' : '')
  const readingClassName = formattedTemperature
    ? 'layer4__weather-reading'
    : 'layer4__weather-reading layer4__weather-reading--placeholder'

  return (
    <section className="layer4__box layer4__weather" aria-label="Weather">
      <div className="layer4__weather-content">
        <div className="layer4__weather-icon" aria-hidden="true">
          {WEATHER_ICON_PLACEHOLDER}
        </div>
        <div className={readingClassName}>{displayValue}</div>
      </div>
    </section>
  )
}

type Layer4MainContentProps = {
  mediaType: MainContentMediaType | null
  materials: string | null
  revision: number
  debugEnabled: boolean
}

function Layer4MainContent({ mediaType, materials, revision, debugEnabled }: Layer4MainContentProps) {
  const selection = useMemo(
    () => selectMainContentSource(mediaType, materials),
    [mediaType, materials],
  )
  const [displayedSource, setDisplayedSource] = useState<MainContentSource | null>(null)
  const [preloadError, setPreloadError] = useState<{ key: string; message: string } | null>(null)

  useEffect(() => {
    if (selection.reason === 'unsafe' && materials) {
      warnMediaIssue({
        filename: materials,
        src: null,
        layer: 'layer4-main-content',
        message: 'Ignored unsafe main content filename',
      })
    }

    if (selection.reason === 'unsupported' && materials) {
      warnMediaIssue({
        filename: materials,
        src: null,
        layer: 'layer4-main-content',
        message: 'Unsupported main content media type',
      })
    }
  }, [materials, selection.reason])

  useEffect(() => {
    const source = selection.source

    if (!source) {
      return
    }

    let cancelled = false
    let timeoutId: number | null = null

    const onReady = () => {
      if (cancelled) {
        return
      }

      setDisplayedSource(source)
      setPreloadError(null)
    }

    const onFailure = (errorMessage: string, error?: unknown) => {
      if (cancelled) {
        return
      }

      setDisplayedSource(null)
      setPreloadError({
        key: source.key,
        message: errorMessage,
      })
      warnMediaIssue({
        filename: source.filename,
        src: source.src,
        layer: 'layer4-main-content',
        message: errorMessage,
        error,
      })
    }

    timeoutId = window.setTimeout(() => {
      onFailure('Main content unavailable (load timeout)')
    }, MAIN_CONTENT_PRELOAD_TIMEOUT_MS)

    if (source.kind === 'image') {
      const image = new Image()

      image.onload = () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
        image.onload = null
        image.onerror = null
        onReady()
      }

      image.onerror = (error) => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
        image.onload = null
        image.onerror = null
        onFailure('Main content unavailable (image failed to load)', error)
      }

      image.src = source.src

      return () => {
        cancelled = true
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
        image.onload = null
        image.onerror = null
      }
    }

    const preloadMedia = document.createElement(source.kind === 'audio' ? 'audio' : 'video')
    preloadMedia.preload = 'auto'
    if (source.kind === 'video') {
      preloadMedia.muted = true
      ;(preloadMedia as HTMLVideoElement).playsInline = true
    }

    const handleLoadedData = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      cleanup()
      onReady()
    }

    const handleMediaError = (error: Event) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      cleanup()
      onFailure('Main content unavailable (media failed to load)', error)
    }

    const cleanup = () => {
      preloadMedia.removeEventListener('loadeddata', handleLoadedData)
      preloadMedia.removeEventListener('error', handleMediaError)
      preloadMedia.removeAttribute('src')
      preloadMedia.load()
    }

    preloadMedia.addEventListener('loadeddata', handleLoadedData)
    preloadMedia.addEventListener('error', handleMediaError)
    preloadMedia.src = source.src
    preloadMedia.load()

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      cleanup()
    }
  }, [revision, selection.source])

  const handleRuntimeError = useCallback((source: MainContentSource) => {
    warnMediaIssue({
      filename: source.filename,
      src: source.src,
      layer: 'layer4-main-content',
      message: 'Main content unavailable (playback error)',
    })
    setDisplayedSource(null)
    setPreloadError({
      key: source.key,
      message: 'Main content unavailable (playback error)',
    })
  }, [])

  const activeSource =
    selection.source !== null
      ? displayedSource
      : selection.reason === 'unsafe'
        ? displayedSource
        : null
  const activeLoadError = selection.source
    ? preloadError?.key === selection.source.key
      ? preloadError.message
      : null
    : selection.reason === 'empty' || selection.reason === 'unsafe'
      ? null
      : 'Main content unavailable'
  const isLoading =
    Boolean(selection.source) &&
    activeSource?.key !== selection.source?.key &&
    !activeLoadError
  const fallbackText = activeLoadError
    ? activeLoadError
    : isLoading
      ? debugEnabled
        ? 'Loading main content...'
        : ''
      : debugEnabled
        ? 'Main Content'
        : ''

  return (
    <section className="layer4__box layer4__main-content">
      {activeSource?.kind === 'image' ? (
        <img
          key={activeSource.key}
          className="layer4__main-content-media layer4__main-content-media--image"
          src={activeSource.src}
          alt=""
          onError={() => handleRuntimeError(activeSource)}
        />
      ) : null}
      {activeSource?.kind === 'video' ? (
        <video
          key={activeSource.key}
          className="layer4__main-content-media layer4__main-content-media--video"
          src={activeSource.src}
          autoPlay
          loop
          muted
          playsInline
          onError={() => handleRuntimeError(activeSource)}
        />
      ) : null}
      {activeSource?.kind === 'audio' ? (
        <div className="layer4__main-content-audio">
          <div className="layer4__main-content-audio-label">Audio Story</div>
          <div className="layer4__main-content-audio-file">{activeSource.filename}</div>
          <audio
            key={activeSource.key}
            className="layer4__main-content-audio-player"
            src={activeSource.src}
            controls
            autoPlay
            preload="auto"
            onError={() => handleRuntimeError(activeSource)}
          />
        </div>
      ) : null}
      {!activeSource && fallbackText ? (
        <div
          className={`layer4__main-content-fallback ${
            activeLoadError ? 'layer4__main-content-fallback--error' : ''
          }`}
        >
          {fallbackText}
        </div>
      ) : null}
    </section>
  )
}

function Layer4Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <section className="layer4__box layer4__clock" aria-label="Time / Clock">
      <time className="layer4__clock-time" dateTime={now.toISOString()}>
        {formatLocalClockTime(now)}
      </time>
    </section>
  )
}

type Layer4LayoutProps = {
  debugEnabled: boolean
  guidesEnabled: boolean
}

function Layer4Layout({ debugEnabled, guidesEnabled }: Layer4LayoutProps) {
  const { state } = useBroadcast()

  const withPlaceholder = (value: string | null | undefined, placeholder: string) =>
    value && value.length > 0 ? value : debugEnabled ? placeholder : ''
  const liveFeedRows = state.layer4.liveFeed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return (
    <div className={`layer4 ${guidesEnabled ? 'layer4--guides' : ''}`}>
      <section className="layer4__box layer4__title">
        <div className="layer4__text layer4__text--title">
          {withPlaceholder(state.layer4.newscastTitle, 'Newscast Title')}
        </div>
      </section>
      <Layer4MainContent
        mediaType={state.layer4.mainContent.mediaType}
        materials={state.layer4.mainContent.materials}
        revision={state.layer4.mainContent.revision}
        debugEnabled={debugEnabled}
      />
      <section className="layer4__box layer4__live-feed">
        {liveFeedRows.length > 0 ? (
          <ul className="layer4__live-feed-list" aria-label="Live feed stream">
            {liveFeedRows.map((row, index) => (
              <li key={`${index}-${row.slice(0, 32)}`} className="layer4__live-feed-row">
                {row}
              </li>
            ))}
          </ul>
        ) : (
          <div className="layer4__text layer4__text--body">
            {withPlaceholder(null, 'Live Feed / Stream')}
          </div>
        )}
      </section>
      <section className="layer4__box layer4__headline">
        <div className="layer4__text layer4__text--headline">
          {withPlaceholder(state.layer4.headline, 'Story Headline')}
        </div>
      </section>
      <section className="layer4__box layer4__logo">
        <div className="layer4__text layer4__text--body">
          {withPlaceholder(null, 'Icon / Logo')}
        </div>
      </section>
      <section className="layer4__box layer4__subtext">
        <div className="layer4__text layer4__text--subtext">
          {withPlaceholder(state.layer4.subtext, 'Story Subtext')}
        </div>
      </section>
      <Layer4Weather temperature={state.layer4.weather} debugEnabled={debugEnabled} />
      <Layer4Clock />
      <Layer4Marquee
        marqueeFile={state.layer4.marqueeFile}
        marqueeRevision={state.layer4.marqueeRevision}
        debugEnabled={debugEnabled}
      />
    </div>
  )
}

function App() {
  const debugEnabled = useDebugEnabled()
  const guidesEnabled = useGuidesEnabled()
  const appMode = useAppMode()
  const showViewbox = appMode !== 'controller'
  const showController = appMode !== 'viewbox'
  const appClassName =
    showViewbox && showController ? 'app app--studio' : 'app'

  return (
    <div className={appClassName}>
      {showViewbox ? (
        <section className="app__viewbox-pane">
          <div className="viewbox-stage">
            <div className="viewbox-layer viewbox-layer--1" aria-hidden="true">
              <Layer1BackgroundAudio />
              <Layer1MainAudio />
            </div>
            <div className="viewbox-layer viewbox-layer--2" aria-hidden="true">
              <Layer2BackgroundVideo />
            </div>
            <div className="viewbox-layer viewbox-layer--3" aria-hidden="true" />
            <div className="viewbox-layer viewbox-layer--4">
              <Layer4Layout debugEnabled={debugEnabled} guidesEnabled={guidesEnabled} />
            </div>
            <div className="viewbox-layer viewbox-layer--5">
              <Layer5Overlay />
            </div>
            {debugEnabled ? <DebugOverlay /> : null}
          </div>
        </section>
      ) : null}
      {showController ? <ManualController /> : null}
      {debugEnabled ? <DebugPanel /> : null}
    </div>
  )
}

export default App
