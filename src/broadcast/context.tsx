import { createContext, useContext } from 'react'
import type { BroadcastAction, BroadcastState } from './state'

type BroadcastContextValue = {
  state: BroadcastState
  dispatch: React.Dispatch<BroadcastAction>
  sendMessage: (payload: Record<string, unknown>) => void
}

export const BroadcastContext =
  createContext<BroadcastContextValue | null>(null)

export const useBroadcast = () => {
  const context = useContext(BroadcastContext)
  if (!context) {
    throw new Error('useBroadcast must be used within BroadcastProvider')
  }
  return context
}
