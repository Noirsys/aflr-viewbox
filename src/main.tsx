import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BroadcastProvider } from './broadcast/BroadcastProvider'

const debugParam = new URLSearchParams(window.location.search).get('debug')
const debug = debugParam === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BroadcastProvider debug={debug}>
      <App />
    </BroadcastProvider>
  </StrictMode>,
)
