import './App.css'
import { useBroadcast } from './broadcast/context'

const DebugPanel = () => {
  const { state } = useBroadcast()

  return (
    <aside className="debug-panel">
      <h2>Debug Status</h2>
      <div className="debug-grid">
        <div>
          <h3>Connection</h3>
          <p>Status: {state.connection.status}</p>
          <p>WS URL: {state.connection.wsUrl}</p>
          <p>Attempts: {state.connection.attempts}</p>
          <p>
            Last Message:{' '}
            {state.connection.lastMessageAt
              ? new Date(state.connection.lastMessageAt).toLocaleTimeString()
              : '—'}
          </p>
        </div>
        <div>
          <h3>Layer 1</h3>
          <p>Background Audio: {state.layer1.backgroundAudio ?? '—'}</p>
          <p>Main Audio: {state.layer1.mainAudio.command ?? '—'}</p>
          <p>Filename: {state.layer1.mainAudio.filename ?? '—'}</p>
        </div>
        <div>
          <h3>Layer 2</h3>
          <p>Background Video: {state.layer2.backgroundVideo ?? '—'}</p>
        </div>
        <div>
          <h3>Layer 4</h3>
          <p>Headline: {state.layer4.headline || '—'}</p>
          <p>Subtext: {state.layer4.subtext || '—'}</p>
          <p>Weather: {state.layer4.temperature ?? '—'}</p>
          <p>Marquee File: {state.layer4.marqueeFile ?? '—'}</p>
          <p>Marquee Color: {state.layer4.marqueeColor ?? '—'}</p>
          <p>Main Content: {state.layer4.mainContent.materials ?? '—'}</p>
        </div>
        <div>
          <h3>Layer 5</h3>
          <p>Fullscreen Video: {state.layer5.fullscreenVideo ?? '—'}</p>
          <p>Emergency Alert: {state.layer5.emergencyAlert ?? '—'}</p>
          <p>Visible: {state.layer5.visible ? 'yes' : 'no'}</p>
        </div>
      </div>
    </aside>
  )
}

function App() {
  const { debug } = useBroadcast()

  return (
    <div className="viewbox-root">
      <div className="viewbox-stage">
        <div className="viewbox-placeholder">
          <h1>aFLR Viewbox</h1>
          <p>WebSocket protocol engine ready.</p>
        </div>
        {debug ? <DebugPanel /> : null}
      </div>
    </div>
  )
}

export default App
