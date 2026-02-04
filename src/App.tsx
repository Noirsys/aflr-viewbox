import './App.css'
import { useBroadcast } from './broadcast/useBroadcast'

const DEBUG_QUERY = 'debug'

function useDebugEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get(DEBUG_QUERY) === '1'
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

function App() {
  const debugEnabled = useDebugEnabled()

  return (
    <div className="app">
      <div className="viewbox-stage">
        <div className="viewbox-layer viewbox-layer--1" aria-hidden="true" />
        <div className="viewbox-layer viewbox-layer--2" aria-hidden="true" />
        <div className="viewbox-layer viewbox-layer--3" aria-hidden="true" />
        <div className="viewbox-layer viewbox-layer--4">
          <div className="viewbox-placeholder">
            <h1>aFLR Viewbox</h1>
            <p>Waiting for WebSocket updates...</p>
          </div>
        </div>
        <div className="viewbox-layer viewbox-layer--5" aria-hidden="true" />
        {debugEnabled ? <DebugOverlay /> : null}
      </div>
      {debugEnabled ? <DebugPanel /> : null}
    </div>
  )
}

export default App
