export type TelemetryLevel = 'debug' | 'info' | 'warn' | 'error'

export interface TelemetryEvent {
  source: 'broadcast-provider'
  event: string
  level: TelemetryLevel
  timestamp: number
  details?: Record<string, unknown>
}

export interface TelemetryReporterOptions {
  consoleEnabled: boolean
  endpoint: string | null
}

type TelemetryReporter = (
  event: string,
  details?: Record<string, unknown>,
  level?: TelemetryLevel,
) => void

const toConsoleMethod = (level: TelemetryLevel): 'debug' | 'info' | 'warn' | 'error' => {
  switch (level) {
    case 'info':
      return 'info'
    case 'warn':
      return 'warn'
    case 'error':
      return 'error'
    case 'debug':
    default:
      return 'debug'
  }
}

const jsonReplacer = (_key: string, value: unknown) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  return value
}

export const normalizeTelemetryEndpoint = (value: string | null | undefined): string | null => {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.startsWith('/')) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed
    }
  } catch {
    return null
  }

  return null
}

export const createTelemetryReporter = ({
  consoleEnabled,
  endpoint,
}: TelemetryReporterOptions): TelemetryReporter => {
  const normalizedEndpoint = normalizeTelemetryEndpoint(endpoint)

  if (!consoleEnabled && !normalizedEndpoint) {
    return () => undefined
  }

  const emitToEndpoint = (payload: TelemetryEvent) => {
    if (!normalizedEndpoint || typeof fetch !== 'function') {
      return
    }

    void fetch(normalizedEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload, jsonReplacer),
      keepalive: true,
    }).catch((error) => {
      if (consoleEnabled) {
        console.debug('[telemetry] Failed to send event', error)
      }
    })
  }

  return (event, details, level = 'debug') => {
    const payload: TelemetryEvent = {
      source: 'broadcast-provider',
      event,
      level,
      timestamp: Date.now(),
      details: details && Object.keys(details).length > 0 ? details : undefined,
    }

    if (consoleEnabled) {
      const method = toConsoleMethod(level)
      if (payload.details) {
        console[method](`[telemetry] ${event}`, payload.details)
      } else {
        console[method](`[telemetry] ${event}`)
      }
    }

    emitToEndpoint(payload)
  }
}
