import { createContext } from 'react'
import type { BroadcastContextValue } from './types'

export const BroadcastContext = createContext<BroadcastContextValue | null>(null)
