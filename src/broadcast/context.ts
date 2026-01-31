import { createContext, useContext } from 'react'
import type { BroadcastState } from './types'

export interface BroadcastContextValue {
  state: BroadcastState
  debug: boolean
}

export const BroadcastContext = createContext<BroadcastContextValue | null>(null)

export const useBroadcast = () => {
  const context = useContext(BroadcastContext)
  if (!context) {
    throw new Error('useBroadcast must be used within BroadcastProvider')
  }
  return context
}
