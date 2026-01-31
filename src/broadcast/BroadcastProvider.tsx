import { useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { broadcastReducer, initialState } from './reducer'
import type { BroadcastState } from './types'
import { parseIncomingMessage } from './protocol'
import { BroadcastContext } from './context'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8088'

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(broadcastReducer, initialState)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  const debugEnabled = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return new URLSearchParams(window.location.search).get('debug') === '1'
  }, [])

  useEffect(() => {
    let isActive = true

    const updateStatus = (status: BroadcastState['connection']['status'], error?: string | null) => {
      dispatch({
        type: 'connectionStatus',
        status,
        error: error ?? null,
        reconnectAttempt: reconnectAttemptRef.current,
      })
    }

    const clearReconnectTimer = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    const scheduleReconnect = () => {
      if (!isActive) return

      reconnectAttemptRef.current += 1
      const delay = Math.min(30000, 1000 * 2 ** (reconnectAttemptRef.current - 1))
      updateStatus('disconnected')

      clearReconnectTimer()
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect()
      }, delay)

      if (debugEnabled) {
        console.debug(`[ws] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`)
      }
    }

    const connect = () => {
      if (!isActive) return

      updateStatus('connecting')
      const socket = new WebSocket(WS_URL)
      socketRef.current = socket

      socket.addEventListener('open', () => {
        reconnectAttemptRef.current = 0
        updateStatus('connected')
        if (debugEnabled) {
          console.debug('[ws] Connected')
        }
      })

      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          return
        }
        const message = parseIncomingMessage(event.data, debugEnabled)
        if (message) {
          dispatch({ type: 'message', message })
        }
      })

      socket.addEventListener('error', () => {
        updateStatus('disconnected', 'WebSocket error')
      })

      socket.addEventListener('close', () => {
        if (debugEnabled) {
          console.debug('[ws] Disconnected')
        }
        scheduleReconnect()
      })
    }

    connect()

    return () => {
      isActive = false
      clearReconnectTimer()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [debugEnabled])

  return (
    <BroadcastContext.Provider value={{ state, dispatch }}>
      {children}
    </BroadcastContext.Provider>
  )
}
