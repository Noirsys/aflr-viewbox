import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BroadcastProvider } from './broadcast/BroadcastProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BroadcastProvider>
      <App />
    </BroadcastProvider>
  </StrictMode>,
)
