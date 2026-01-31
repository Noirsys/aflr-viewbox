import { useEffect, useMemo, useReducer, useRef } from 'react'
import { BroadcastContext } from './context'
import { parseIncomingMessage } from './parser'
import { broadcastReducer, initialState } from './reducer'

interface BroadcastProviderProps {
  debug?: boolean
  children: React.ReactNode
}

const DEFAULT_WS_URL = 'ws://localhost:8088'

export const BroadcastProvider = ({
  debug = false,
  children,
}: BroadcastProviderProps) => {
  const wsUrl = import.meta.env.VITE_WS_URL || DEFAULT_WS_URL
  const [state, dispatch] = useReducer(broadcastReducer, wsUrl, initialState)
  const reconnectTimeout = useRef<number | null>(null)
  const reconnectAttempts = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)
  const shouldReconnect = useRef(true)

  useEffect(() => {
    shouldReconnect.current = true

    const cleanupSocket = () => {
      if (wsRef.current) {
        wsRef.current.onopen = null
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.onmessage = null
        wsRef.current.close()
        wsRef.current = null
      }
    }

    const scheduleReconnect = (attempts: number) => {
      if (!shouldReconnect.current) {
        return
      }
      const delay = Math.min(1000 * 2 ** (attempts - 1), 30000)
      if (debug) {
        console.debug('[ws] scheduling reconnect', { delay })
      }
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current)
      }
      reconnectTimeout.current = window.setTimeout(() => {
        connect()
      }, delay)
    }

    const handleMessage = (raw: string) => {
      const parsed = parseIncomingMessage(raw, debug)
      if (parsed) {
        dispatch({ type: 'message', message: parsed })
      }
    }

    const connect = () => {
      dispatch({
        type: 'connectionStatus',
        status: 'connecting',
        attempts: reconnectAttempts.current,
        wsUrl,
        error: null,
      })

      cleanupSocket()
      const socket = new WebSocket(wsUrl)
      wsRef.current = socket

      socket.onopen = () => {
        reconnectAttempts.current = 0
        dispatch({
          type: 'connectionStatus',
          status: 'connected',
          attempts: 0,
          wsUrl,
          error: null,
        })
        socket.send(
          JSON.stringify({
            type: 'requestState',
            timestamp: Date.now(),
            data: {},
          }),
        )
      }

      socket.onclose = () => {
        reconnectAttempts.current += 1
        const attempts = reconnectAttempts.current
        dispatch({
          type: 'connectionStatus',
          status: 'disconnected',
          attempts,
          wsUrl,
          error: null,
        })
        scheduleReconnect(attempts)
      }

      socket.onerror = (event) => {
        if (debug) {
          console.debug('[ws] socket error', event)
        }
      }

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          handleMessage(event.data)
        } else if (event.data instanceof Blob) {
          void event.data.text().then((text) => {
            handleMessage(text)
          })
        } else {
          if (debug) {
            console.debug('[ws] Unsupported message payload', event.data)
          }
        }
      }
    }

    connect()

    return () => {
      shouldReconnect.current = false
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current)
      }
      cleanupSocket()
    }
  }, [debug, wsUrl])

  const value = useMemo(
    () => ({
      state,
      debug,
    }),
    [state, debug],
  )

  return (
    <BroadcastContext.Provider value={value}>
      {children}
    </BroadcastContext.Provider>
  )
}
