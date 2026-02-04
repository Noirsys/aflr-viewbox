import './App.css'
import { useBroadcast } from './broadcast/useBroadcast'

const DEBUG_QUERY = 'debug'
const GUIDES_QUERY = 'guides'

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

function DebugPanel() {
  const { state } = useBroadcast()
  const stateDump = JSON.stringify(state, null, 2)

  return (
    <aside className="debug-panel">
      <h2>Debug Panel</h2>
      <div className="debug-section">
        <h3>Connection</h3>
        <p>Status: {state.connection.status}</p>
        <p>Reconnect Attempt: {state.connection.reconnectAttempt}</p>
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
        <p>Headline: {state.layer4.headline || '—'}</p>
        <p>Subtext: {state.layer4.subtext || '—'}</p>
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

  return (
    <video
      className="layer2__video"
      src={resolvedSrc}
      autoPlay
      loop
      muted
      playsInline
    />
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

  return (
    <div className={`layer4 ${guidesEnabled ? 'layer4--guides' : ''}`}>
      <section className="layer4__box layer4__title">
        <div className="layer4__text layer4__text--title">
          {withPlaceholder(null, 'Newscast Title')}
        </div>
      </section>
      <section className="layer4__box layer4__main-content">
        <div className="layer4__text layer4__text--body">
          {withPlaceholder(null, 'Main Content')}
        </div>
      </section>
      <section className="layer4__box layer4__live-feed">
        <div className="layer4__text layer4__text--body">
          {withPlaceholder(null, 'Live Feed / Stream')}
        </div>
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
      <section className="layer4__box layer4__weather">
        <div className="layer4__text layer4__text--body">
          {withPlaceholder(null, 'Weather')}
        </div>
      </section>
      <section className="layer4__box layer4__clock">
        <div className="layer4__text layer4__text--body">
          {withPlaceholder(null, 'Time / Clock')}
        </div>
      </section>
      <section className="layer4__box layer4__marquee">
        <div className="layer4__text layer4__text--marquee">
          {withPlaceholder(state.layer4.marqueeFile, 'Marquee / Ticker')}
        </div>
      </section>
    </div>
  )
}

function App() {
  const debugEnabled = useDebugEnabled()
  const guidesEnabled = useGuidesEnabled()

  return (
    <div className="app">
      <div className="viewbox-stage">
        <div className="viewbox-layer viewbox-layer--1" aria-hidden="true" />
        <div className="viewbox-layer viewbox-layer--2" aria-hidden="true">
          <Layer2BackgroundVideo />
        </div>
        <div className="viewbox-layer viewbox-layer--3" aria-hidden="true" />
        <div className="viewbox-layer viewbox-layer--4">
          <Layer4Layout debugEnabled={debugEnabled} guidesEnabled={guidesEnabled} />
        </div>
        <div className="viewbox-layer viewbox-layer--5" aria-hidden="true" />
        {debugEnabled ? <DebugOverlay /> : null}
      </div>
      {debugEnabled ? <DebugPanel /> : null}
    </div>
  )
}

export default App
