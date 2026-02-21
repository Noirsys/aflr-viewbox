import { describe, expect, it } from 'vitest'
import { parseIncomingMessage } from './protocol'
import { broadcastReducer, initialState } from './reducer'
import type { BroadcastMessageType, BroadcastState } from './types'

interface Envelope {
  type: BroadcastMessageType
  timestamp: number
  data: Record<string, unknown>
}

interface SnapshotScenario {
  name: string
  envelope: Envelope
  baseState?: () => BroadcastState
}

const parseEnvelope = (envelope: Envelope) => {
  const parsed = parseIncomingMessage(JSON.stringify(envelope), false)
  if (!parsed) {
    throw new Error(`Expected envelope to parse: ${envelope.type}`)
  }

  return parsed
}

const reduceEnvelope = (state: BroadcastState, envelope: Envelope): BroadcastState =>
  broadcastReducer(state, {
    type: 'message',
    message: parseEnvelope(envelope),
  })

const reduceEnvelopeBatch = (state: BroadcastState, envelopes: Envelope[]): BroadcastState =>
  broadcastReducer(state, {
    type: 'messageBatch',
    messages: envelopes.map(parseEnvelope),
  })

const withMessage = (envelope: Envelope) => reduceEnvelope(initialState, envelope)

describe('broadcastReducer snapshots (message -> state)', () => {
  const snapshotScenarios: SnapshotScenario[] = [
    {
      name: 'backgroundvideoUpdate stores layer2 video source',
      envelope: {
        type: 'backgroundvideoUpdate',
        timestamp: 1700000000001,
        data: { videoSrc: 'aFLR_LOOP_ScCo.mp4' },
      },
    },
    {
      name: 'backgroundaudioUpdate explicit null stops layer1 background audio',
      baseState: () =>
        withMessage({
          type: 'backgroundaudioUpdate',
          timestamp: 1700000000010,
          data: { audioSrc: 'bed.wav' },
        }),
      envelope: {
        type: 'backgroundaudioUpdate',
        timestamp: 1700000000011,
        data: { audioSrc: null },
      },
    },
    {
      name: 'mainaudioUpdate stores command, filename, and sequence length',
      envelope: {
        type: 'mainaudioUpdate',
        timestamp: 1700000000002,
        data: {
          command: 'play_clip_sequence',
          filename: 'story_7.wav',
          seqlength: 3,
        },
      },
    },
    {
      name: 'headlineUpdate stores layer4 headline',
      envelope: {
        type: 'headlineUpdate',
        timestamp: 1700000000003,
        data: { headline: 'Breaking: Structure Fire Reported' },
      },
    },
    {
      name: 'subtextUpdate stores layer4 subtext',
      envelope: {
        type: 'subtextUpdate',
        timestamp: 1700000000004,
        data: { subtext: 'Units responding near downtown\nUpdates pending' },
      },
    },
    {
      name: 'mainContentUpdate increments revision and parses legacy string mediatype',
      envelope: {
        type: 'mainContentUpdate',
        timestamp: 1700000000005,
        data: { mediatype: '2', materials: 'clip456.mp4' },
      },
    },
    {
      name: 'fullStoryUpdate updates headline, subtext, and main content together',
      envelope: {
        type: 'fullStoryUpdate',
        timestamp: 1700000000006,
        data: {
          headline: 'Breaking: Scanner Activity',
          subtext: 'Multiple units dispatched - Stand by',
          mediatype: 1,
          materials: 'story1.svg',
        },
      },
    },
    {
      name: 'weatherUpdate stores numeric temperature',
      envelope: {
        type: 'weatherUpdate',
        timestamp: 1700000000007,
        data: { temperature: 34 },
      },
    },
    {
      name: 'marqueeUpdate stores marqueefile and increments revision',
      envelope: {
        type: 'marqueeUpdate',
        timestamp: 1700000000008,
        data: { marqueefile: 'TOP_3366FF.txt' },
      },
    },
    {
      name: 'fullscreenVideo shows layer5 and resets hide timer',
      envelope: {
        type: 'fullscreenVideo',
        timestamp: 1700000000009,
        data: { videoSrc: 'aFLR_X_Opening.mp4' },
      },
    },
    {
      name: 'hideLayer5 keeps visibility and sets delay',
      baseState: () =>
        withMessage({
          type: 'fullscreenVideo',
          timestamp: 1700000000012,
          data: { videoSrc: 'aFLR_X_Opening.mp4' },
        }),
      envelope: {
        type: 'hideLayer5',
        timestamp: 1700000000013,
        data: { stalltime: 1500 },
      },
    },
    {
      name: 'emergencyAlert sets content and shows layer5',
      envelope: {
        type: 'emergencyAlert',
        timestamp: 1700000000014,
        data: { alertcontent: 'SEVERE WEATHER WARNING: Seek shelter immediately.' },
      },
    },
    {
      name: 'stateSync merges payload into active state',
      baseState: () => {
        const withMainContent = withMessage({
          type: 'mainContentUpdate',
          timestamp: 1700000000015,
          data: { mediatype: 1, materials: 'story123.png' },
        })

        return reduceEnvelope(withMainContent, {
          type: 'marqueeUpdate',
          timestamp: 1700000000016,
          data: { marqueefile: 'TOP_112233.txt' },
        })
      },
      envelope: {
        type: 'stateSync',
        timestamp: 1700000000017,
        data: {
          layer1: { activeAudio: 'bed.wav', volume: 0.4 },
          layer2: { activeVideo: 'aFLR_LOOP_ScCo.mp4' },
          layer4: {
            newscastTitle: 'ASHTABULA.FRONTLINE.REPORT',
            headline: 'State sync headline',
            subtext: 'State sync subtext',
            marquee: 'TOP_3366FF.txt',
            weather: '32',
            mainContent: 'story999.svg',
            liveFeed: '00:00 Unit: Copy',
          },
          layer5: {
            activeVideo: 'aFLR_X_Opening.mp4',
            visible: true,
            alertcontent: 'SEVERE WEATHER WARNING: Seek shelter immediately.',
          },
        },
      },
    },
  ]

  for (const scenario of snapshotScenarios) {
    it(scenario.name, () => {
      const baseState = scenario.baseState?.() ?? initialState
      const nextState = reduceEnvelope(baseState, scenario.envelope)
      expect(nextState).toMatchSnapshot()
    })
  }
})

describe('broadcastReducer messageBatch', () => {
  it('applies queued messages in order with one reducer action', () => {
    const envelopes: Envelope[] = [
      {
        type: 'headlineUpdate',
        timestamp: 1700000001001,
        data: { headline: 'Batch headline' },
      },
      {
        type: 'subtextUpdate',
        timestamp: 1700000001002,
        data: { subtext: 'Batch subtext' },
      },
      {
        type: 'weatherUpdate',
        timestamp: 1700000001003,
        data: { temperature: 41 },
      },
    ]

    const sequential = envelopes.reduce(reduceEnvelope, initialState)
    const batched = reduceEnvelopeBatch(initialState, envelopes)

    expect(batched).toEqual(sequential)
    expect(batched.meta.lastMessageType).toBe('weatherUpdate')
    expect(batched.meta.lastMessageTimestamp).toBe(1700000001003)
  })

  it('treats empty batches as a no-op', () => {
    const unchanged = broadcastReducer(initialState, {
      type: 'messageBatch',
      messages: [],
    })

    expect(unchanged).toBe(initialState)
  })
})
