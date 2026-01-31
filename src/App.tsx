import './App.css'
import { useBroadcast } from './broadcast/context'

const isDebugEnabled = () => {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

const DebugPanel = () => {
  const { state } = useBroadcast()

  return (
    <section className="debug-panel">
      <h2>Debug Panel</h2>
      <dl>
        <dt>Connection</dt>
        <dd>{state.connection.status}</dd>
        <dt>Retry Count</dt>
        <dd>{state.connection.retryCount}</dd>
        <dt>Last Message</dt>
        <dd>{state.connection.lastMessageAt ?? '—'}</dd>
        <dt>Headline</dt>
        <dd>{state.layer4.headline || '—'}</dd>
        <dt>Subtext</dt>
        <dd>{state.layer4.subtext || '—'}</dd>
        <dt>Background Video</dt>
        <dd>{state.layer2.backgroundVideo || '—'}</dd>
        <dt>Background Audio</dt>
        <dd>{state.layer1.backgroundAudio || '—'}</dd>
        <dt>Main Audio</dt>
        <dd>
          {state.layer1.mainAudio.command
            ? `${state.layer1.mainAudio.command} (${state.layer1.mainAudio.filename ?? '—'})`
            : '—'}
        </dd>
        <dt>Main Content</dt>
        <dd>{state.layer4.mainContent.materials || '—'}</dd>
        <dt>Weather</dt>
        <dd>
          {state.layer4.weather !== null ? `${state.layer4.weather}°F` : '—'}
        </dd>
        <dt>Marquee File</dt>
        <dd>{state.layer4.marqueeFile || '—'}</dd>
        <dt>Layer5 Video</dt>
        <dd>{state.layer5.fullscreenVideo || '—'}</dd>
        <dt>Emergency Alert</dt>
        <dd>{state.layer5.emergencyAlert || '—'}</dd>
      </dl>
    </section>
  )
}

function App() {
  const showDebug = isDebugEnabled()

  return (
    <div className="app-root">
      <div className="viewbox-placeholder">
        <span>aFLR Viewbox</span>
        <span className="status-pill">{showDebug ? 'Debug On' : 'Idle'}</span>
      </div>
      {showDebug ? <DebugPanel /> : null}
    </div>
  )
}

export default App
