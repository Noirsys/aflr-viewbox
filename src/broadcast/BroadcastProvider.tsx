import { useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { broadcastReducer, initialState } from './reducer'
import type { BroadcastMessage, BroadcastState } from './types'
import { parseIncomingMessage } from './protocol'
import type { MessageParseTelemetryEvent } from './protocol'
import { createTelemetryReporter, normalizeTelemetryEndpoint } from './telemetry'
import { BroadcastContext } from './context'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8088'
const MESSAGE_BATCH_WINDOW_MS = 16

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(broadcastReducer, initialState)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const flushTimeoutRef = useRef<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const messageQueueRef = useRef<BroadcastMessage[]>([])

  const debugEnabled = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return new URLSearchParams(window.location.search).get('debug') === '1'
  }, [])

  const telemetryEndpoint = useMemo(() => {
    const configuredEndpoint =
      typeof window === 'undefined'
        ? import.meta.env.VITE_TELEMETRY_ENDPOINT
        : new URLSearchParams(window.location.search).get('telemetryEndpoint') ??
          import.meta.env.VITE_TELEMETRY_ENDPOINT

    return normalizeTelemetryEndpoint(configuredEndpoint)
  }, [])

  const telemetry = useMemo(
    () =>
      createTelemetryReporter({
        consoleEnabled: debugEnabled,
        endpoint: telemetryEndpoint,
      }),
    [debugEnabled, telemetryEndpoint],
  )

  useEffect(() => {
    let isActive = true
    const describeError = (error: unknown) =>
      error instanceof Error ? error.message : String(error)

    const handleParseTelemetry = (event: MessageParseTelemetryEvent) => {
      if (event.outcome === 'parsed') {
        telemetry('ws_message_parsed', {
          messageType: event.messageType,
          messageTimestamp: event.timestamp,
        })
        return
      }

      telemetry(
        'ws_message_ignored',
        {
          reason: event.reason,
          messageType: event.messageType,
          messageTimestamp: event.timestamp,
        },
        event.reason === 'unknown_type' || event.reason === 'invalid_payload'
          ? 'warn'
          : 'debug',
      )
    }

    telemetry('ws_provider_started', {
      wsUrl: WS_URL,
      endpoint: telemetryEndpoint,
    })

    const updateStatus = (status: BroadcastState['connection']['status'], error?: string | null) => {
      dispatch({
        type: 'connectionStatus',
        status,
        error: error ?? null,
        reconnectAttempt: reconnectAttemptRef.current,
      })
      telemetry(
        'ws_connection_status',
        {
          status,
          reconnectAttempt: reconnectAttemptRef.current,
          error: error ?? null,
        },
        error ? 'warn' : 'debug',
      )
    }

    const clearReconnectTimer = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    const clearFlushTimer = () => {
      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
    }

    const flushQueuedMessages = () => {
      clearFlushTimer()

      if (!isActive || messageQueueRef.current.length === 0) {
        return
      }

      const messages = messageQueueRef.current
      messageQueueRef.current = []
      telemetry('ws_message_batch_flushed', {
        count: messages.length,
        messageTypes: messages.map((message) => message.type),
      })
      dispatch({ type: 'messageBatch', messages })
    }

    const queueMessage = (message: BroadcastMessage) => {
      messageQueueRef.current.push(message)
      telemetry('ws_message_queued', {
        messageType: message.type,
        queueSize: messageQueueRef.current.length,
      })
      if (flushTimeoutRef.current !== null) {
        return
      }

      flushTimeoutRef.current = window.setTimeout(flushQueuedMessages, MESSAGE_BATCH_WINDOW_MS)
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

      telemetry(
        'ws_reconnect_scheduled',
        {
          delayMs: delay,
          reconnectAttempt: reconnectAttemptRef.current,
        },
        'warn',
      )

      if (debugEnabled) {
        console.debug(`[ws] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`)
      }
    }

    const connect = () => {
      if (!isActive) return

      updateStatus('connecting')
      telemetry('ws_connecting', {
        wsUrl: WS_URL,
        reconnectAttempt: reconnectAttemptRef.current,
      })
      const socket = new WebSocket(WS_URL)
      socketRef.current = socket

      const sendRequestState = () => {
        if (socket.readyState !== WebSocket.OPEN) {
          return
        }

        const payload = {
          type: 'requestState',
          timestamp: Date.now(),
          data: {},
        }

        try {
          socket.send(JSON.stringify(payload))
          telemetry('ws_request_state_sent')
          if (debugEnabled) {
            console.debug('[ws] Sent requestState')
          }
        } catch (error) {
          telemetry(
            'ws_request_state_failed',
            {
              error: describeError(error),
            },
            'warn',
          )
          if (debugEnabled) {
            console.debug('[ws] Failed to send requestState', error)
          }
        }
      }

      socket.addEventListener('open', () => {
        reconnectAttemptRef.current = 0
        updateStatus('connected')
        telemetry('ws_connected')
        if (debugEnabled) {
          console.debug('[ws] Connected')
        }
        sendRequestState()
      })

      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          telemetry(
            'ws_message_ignored',
            {
              reason: 'non_string_socket_message',
              dataType: typeof event.data,
            },
            'debug',
          )
          return
        }
        telemetry('ws_message_received', {
          bytes: event.data.length,
        })
        const message = parseIncomingMessage(event.data, debugEnabled, handleParseTelemetry)
        if (message) {
          queueMessage(message)
        }
      })

      socket.addEventListener('error', () => {
        telemetry('ws_error', undefined, 'warn')
        updateStatus('disconnected', 'WebSocket error')
      })

      socket.addEventListener('close', (event) => {
        telemetry(
          'ws_disconnected',
          {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          },
          'warn',
        )
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
      clearFlushTimer()
      messageQueueRef.current = []
      socketRef.current?.close()
      socketRef.current = null
      telemetry('ws_provider_stopped')
    }
  }, [debugEnabled, telemetry, telemetryEndpoint])

  return (
    <BroadcastContext.Provider value={{ state, dispatch }}>
      {children}
    </BroadcastContext.Provider>
  )
}
