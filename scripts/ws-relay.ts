/**
 * scripts/ws-relay.ts
 *
 * Lightweight local WebSocket relay for development.
 *
 * Usage:
 *   npm run ws:relay
 *   npm run ws:relay -- --port 8090 --host 127.0.0.1 --debug
 *
 * Environment overrides:
 *   WS_RELAY_PORT=8088
 *   WS_RELAY_HOST=127.0.0.1
 *   DEBUG=1
 */

import type { RawData } from 'ws'
import { WebSocket, WebSocketServer } from 'ws'

type ProtocolEnvelope = {
  type: string
  timestamp: number
  data: Record<string, unknown>
}

const knownMessageTypes = new Set([
  'backgroundvideoUpdate',
  'backgroundaudioUpdate',
  'mainaudioUpdate',
  'headlineUpdate',
  'subtextUpdate',
  'mainContentUpdate',
  'fullStoryUpdate',
  'weatherUpdate',
  'marqueeUpdate',
  'fullscreenVideo',
  'hideLayer5',
  'emergencyAlert',
  'stateSync',
  'requestState',
])

const argv = process.argv.slice(2)

const readArg = (name: string): string | undefined => {
  const index = argv.indexOf(name)
  if (index === -1) {
    return undefined
  }

  const nextValue = argv[index + 1]
  if (!nextValue || nextValue.startsWith('--')) {
    return undefined
  }

  return nextValue
}

const host = readArg('--host') ?? process.env.WS_RELAY_HOST ?? '127.0.0.1'
const portInput = readArg('--port') ?? process.env.WS_RELAY_PORT ?? '8088'
const debugEnabled = argv.includes('--debug') || process.env.DEBUG === '1'
const port = Number(portInput)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid relay port: ${portInput}`)
}

let lastStateSync: string | null = null

const logDebug = (...args: unknown[]) => {
  if (debugEnabled) {
    console.debug('[ws-relay]', ...args)
  }
}

const toText = (rawData: RawData): string => {
  if (typeof rawData === 'string') {
    return rawData
  }
  if (rawData instanceof ArrayBuffer) {
    return Buffer.from(rawData).toString('utf8')
  }
  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData).toString('utf8')
  }
  return rawData.toString('utf8')
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseEnvelope = (raw: string): ProtocolEnvelope | null => {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    logDebug('Ignoring invalid JSON message', error)
    return null
  }

  if (!isObject(parsed)) {
    logDebug('Ignoring message that is not an object')
    return null
  }

  const { type, timestamp, data } = parsed
  if (typeof type !== 'string' || typeof timestamp !== 'number' || !Number.isFinite(timestamp) || !isObject(data)) {
    logDebug('Ignoring message with invalid envelope shape', parsed)
    return null
  }

  if (!knownMessageTypes.has(type)) {
    logDebug('Ignoring unknown message type', type)
    return null
  }

  return parsed as ProtocolEnvelope
}

const server = new WebSocketServer({ host, port })

const broadcast = (raw: string) => {
  for (const client of server.clients) {
    if (client.readyState !== WebSocket.OPEN) {
      continue
    }
    try {
      client.send(raw)
    } catch (error) {
      logDebug('Failed to broadcast to client', error)
    }
  }
}

server.on('connection', (socket, request) => {
  logDebug('Client connected', request.socket.remoteAddress)

  socket.on('message', (rawData, isBinary) => {
    if (isBinary) {
      logDebug('Ignoring binary message')
      return
    }

    const raw = toText(rawData)
    const envelope = parseEnvelope(raw)
    if (!envelope) {
      return
    }

    if (envelope.type === 'requestState') {
      if (lastStateSync !== null && socket.readyState === WebSocket.OPEN) {
        socket.send(lastStateSync)
        logDebug('Sent cached stateSync in response to requestState')
      } else {
        logDebug('Forwarding requestState (no cached stateSync available)')
        broadcast(raw)
      }
      return
    }

    if (envelope.type === 'stateSync') {
      lastStateSync = raw
    }

    broadcast(raw)
  })

  socket.on('close', () => {
    logDebug('Client disconnected')
  })

  socket.on('error', (error) => {
    logDebug('Client socket error', error)
  })
})

server.on('listening', () => {
  console.log(`ws-relay listening at ws://${host}:${port}`)
})

server.on('error', (error) => {
  console.error('ws-relay server error:', error)
})

const shutdown = () => {
  console.log('ws-relay shutting down')
  server.close()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
