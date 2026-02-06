import { describe, expect, it } from 'vitest'
import { parseIncomingMessage } from './protocol'
import type { MessageParseTelemetryEvent } from './protocol'

describe('parseIncomingMessage telemetry', () => {
  it('emits ignored telemetry for unknown message types', () => {
    const events: MessageParseTelemetryEvent[] = []

    const parsed = parseIncomingMessage(
      JSON.stringify({
        type: 'unknownUpdate',
        timestamp: 1700000002001,
        data: {},
      }),
      false,
      (event) => events.push(event),
    )

    expect(parsed).toBeNull()
    expect(events).toEqual([
      {
        outcome: 'ignored',
        reason: 'unknown_type',
        messageType: 'unknownUpdate',
        timestamp: 1700000002001,
      },
    ])
  })

  it('emits ignored telemetry for invalid payloads on known types', () => {
    const events: MessageParseTelemetryEvent[] = []

    const parsed = parseIncomingMessage(
      JSON.stringify({
        type: 'headlineUpdate',
        timestamp: 1700000002002,
        data: { headline: 101 },
      }),
      false,
      (event) => events.push(event),
    )

    expect(parsed).toBeNull()
    expect(events).toEqual([
      {
        outcome: 'ignored',
        reason: 'invalid_payload',
        messageType: 'headlineUpdate',
        timestamp: 1700000002002,
      },
    ])
  })

  it('emits parsed telemetry when envelopes are accepted', () => {
    const events: MessageParseTelemetryEvent[] = []

    const parsed = parseIncomingMessage(
      JSON.stringify({
        type: 'weatherUpdate',
        timestamp: 1700000002003,
        data: { temperature: 33 },
      }),
      false,
      (event) => events.push(event),
    )

    expect(parsed).toEqual({
      type: 'weatherUpdate',
      timestamp: 1700000002003,
      data: { temperature: 33 },
    })
    expect(events).toEqual([
      {
        outcome: 'parsed',
        messageType: 'weatherUpdate',
        timestamp: 1700000002003,
      },
    ])
  })
})
