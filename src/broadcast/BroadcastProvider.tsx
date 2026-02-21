import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { broadcastReducer, initialState } from './reducer'
import type {
  BroadcastMessage,
  BroadcastState,
  OutboundEnvelope,
  SendEnvelopeResult,
} from './types'
import { parseIncomingMessage } from './protocol'
import type { MessageParseTelemetryEvent } from './protocol'
import { createTelemetryReporter, normalizeTelemetryEndpoint } from './telemetry'
import { BroadcastContext } from './context'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8088'
const MESSAGE_BATCH_WINDOW_MS = 16
const OUTBOUND_QUEUE_LIMIT = 256

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(broadcastReducer, initialState)
  const [outboundQueueSize, setOutboundQueueSize] = useState(0)

  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const flushTimeoutRef = useRef<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const messageQueueRef = useRef<BroadcastMessage[]>([])
  const outboundQueueRef = useRef<OutboundEnvelope[]>([])

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

  const telemetryRef = useRef(telemetry)
  const debugEnabledRef = useRef(debugEnabled)

  useEffect(() => {
    telemetryRef.current = telemetry
  }, [telemetry])

  useEffect(() => {
    debugEnabledRef.current = debugEnabled
  }, [debugEnabled])

  const queueOutboundMessage = useCallback((envelope: OutboundEnvelope) => {
    if (outboundQueueRef.current.length >= OUTBOUND_QUEUE_LIMIT) {
      const dropped = outboundQueueRef.current.shift()
      telemetryRef.current(
        'ws_outbound_queue_dropped',
        {
          queueLimit: OUTBOUND_QUEUE_LIMIT,
          droppedMessageType: dropped?.type ?? null,
        },
        'warn',
      )
    }

    outboundQueueRef.current.push(envelope)
    const nextQueueSize = outboundQueueRef.current.length
    setOutboundQueueSize(nextQueueSize)

    telemetryRef.current(
      'ws_outbound_queued',
      {
        messageType: envelope.type,
        queueSize: nextQueueSize,
      },
      'warn',
    )

    if (debugEnabledRef.current) {
      console.debug('[ws] Queued outbound message', envelope.type, {
        queueSize: nextQueueSize,
      })
    }

    return nextQueueSize
  }, [])

  const sendEnvelope = useCallback(
    (envelope: OutboundEnvelope): SendEnvelopeResult => {
      const socket = socketRef.current
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(envelope))
          telemetryRef.current('ws_outbound_sent', {
            messageType: envelope.type,
            queued: false,
          })
          return { status: 'sent' }
        } catch (error) {
          telemetryRef.current(
            'ws_outbound_send_failed',
            {
              messageType: envelope.type,
              error: describeError(error),
            },
            'warn',
          )
        }
      }

      const queueSize = queueOutboundMessage(envelope)
      return { status: 'queued', queueSize }
    },
    [queueOutboundMessage],
  )

  const requestState = useCallback(
    (): SendEnvelopeResult =>
      sendEnvelope({
        type: 'requestState',
        timestamp: Date.now(),
        data: {},
      }),
    [sendEnvelope],
  )

  const flushOutboundQueue = useCallback(() => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || outboundQueueRef.current.length === 0) {
      return 0
    }

    const pending = [...outboundQueueRef.current]
    outboundQueueRef.current = []
    setOutboundQueueSize(0)

    let sentCount = 0

    for (let index = 0; index < pending.length; index += 1) {
      const message = pending[index]

      try {
        socket.send(JSON.stringify(message))
        sentCount += 1
      } catch (error) {
        const unsent = pending.slice(index)
        outboundQueueRef.current = unsent
        setOutboundQueueSize(unsent.length)
        telemetryRef.current(
          'ws_outbound_flush_failed',
          {
            messageType: message.type,
            unsentCount: unsent.length,
            error: describeError(error),
          },
          'warn',
        )
        break
      }
    }

    if (sentCount > 0) {
      telemetryRef.current('ws_outbound_flushed', {
        count: sentCount,
      })
    }

    return sentCount
  }, [])

  useEffect(() => {
    let isActive = true

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

      socket.addEventListener('open', () => {
        reconnectAttemptRef.current = 0
        updateStatus('connected')
        telemetry('ws_connected')
        if (debugEnabled) {
          console.debug('[ws] Connected')
        }

        const flushedCount = flushOutboundQueue()
        if (flushedCount === 0) {
          const requestStateResult = requestState()
          if (requestStateResult.status === 'queued' || requestStateResult.status === 'failed') {
            telemetry(
              'ws_request_state_failed',
              {
                status: requestStateResult.status,
                queueSize:
                  requestStateResult.status === 'queued' ? requestStateResult.queueSize : undefined,
              },
              'warn',
            )
          } else {
            telemetry('ws_request_state_sent')
          }
        }
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
      outboundQueueRef.current = []
      socketRef.current?.close()
      socketRef.current = null
      telemetry('ws_provider_stopped')
    }
  }, [debugEnabled, flushOutboundQueue, requestState, telemetry, telemetryEndpoint])

  const contextValue = useMemo(
    () => ({
      state,
      dispatch,
      sendEnvelope,
      requestState,
      outboundQueueSize,
    }),
    [outboundQueueSize, requestState, sendEnvelope, state],
  )

  return <BroadcastContext.Provider value={contextValue}>{children}</BroadcastContext.Provider>
}
