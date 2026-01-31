import { useContext } from 'react'
import { BroadcastContext } from './context'

export function useBroadcast() {
  const context = useContext(BroadcastContext)
  if (!context) {
    throw new Error('useBroadcast must be used within BroadcastProvider')
  }
  return context
}
