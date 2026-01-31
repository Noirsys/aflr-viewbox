import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  broadcastReducer,
  initialState,
  parseBroadcastMessage,
  type BroadcastAction,
  type BroadcastState,
} from './state'
import { BroadcastContext } from './context'

type BroadcastProviderProps = {
  children: React.ReactNode
}

const getDebugEnabled = () => {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

export const BroadcastProvider = ({ children }: BroadcastProviderProps) => {
  const [state, dispatch] = useReducer(broadcastReducer, initialState)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const debugEnabled = useMemo(() => getDebugEnabled(), [])

  const sendMessage = useCallback(
    (payload: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload))
      }
    },
    [],
  )

  useEffect(() => {
    let isActive = true
    const wsUrl =
      import.meta.env.VITE_WS_URL?.toString() || 'ws://localhost:8088'

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const scheduleReconnect = (attempt: number) => {
      const delay = Math.min(1000 * 2 ** attempt, 15000)
      clearReconnectTimer()
      reconnectTimerRef.current = window.setTimeout(() => {
        if (!isActive) return
        connect(attempt + 1)
      }, delay)
      dispatch({ type: 'connectionRetry', retryCount: attempt })
    }

    const connect = (attempt = 0) => {
      if (!isActive) return
      dispatch({
        type: 'connectionStatus',
        status: 'connecting',
        at: Date.now(),
      })

      try {
        const socket = new WebSocket(wsUrl)
        wsRef.current = socket

        socket.addEventListener('open', () => {
          if (!isActive) return
          dispatch({
            type: 'connectionStatus',
            status: 'connected',
            at: Date.now(),
          })
          dispatch({ type: 'connectionRetry', retryCount: 0 })
          dispatch({ type: 'connectionError', message: null })
          clearReconnectTimer()
        })

        socket.addEventListener('message', (event) => {
          if (!isActive || typeof event.data !== 'string') return
          const action = parseBroadcastMessage(event.data, debugEnabled)
          if (action) {
            dispatch(action)
          }
        })

        socket.addEventListener('close', () => {
          if (!isActive) return
          dispatch({
            type: 'connectionStatus',
            status: 'disconnected',
            at: Date.now(),
          })
          scheduleReconnect(attempt)
        })

        socket.addEventListener('error', () => {
          if (!isActive) return
          dispatch({ type: 'connectionError', message: 'WebSocket error' })
        })
      } catch (error) {
        if (!isActive) return
        dispatch({
          type: 'connectionError',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to connect',
        })
        dispatch({
          type: 'connectionStatus',
          status: 'disconnected',
          at: Date.now(),
        })
        scheduleReconnect(attempt)
      }
    }

    connect()

    return () => {
      isActive = false
      clearReconnectTimer()
      wsRef.current?.close()
    }
  }, [debugEnabled])

  const value = useMemo(
    () => ({
      state,
      dispatch,
      sendMessage,
    }),
    [state, dispatch, sendMessage],
  )

  return (
    <BroadcastContext.Provider value={value}>
      {children}
    </BroadcastContext.Provider>
  )
}

export type { BroadcastAction, BroadcastState }
