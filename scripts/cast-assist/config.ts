export type CastAssistConfig = {
  opening: {
    minLockMs: number
    fullscreenHoldMs: number
    postJingleBufferMs: number
  }
  narration: {
    defaultStoryHoldMs: number
    fallbackUnknownAudioMs: number
    postNarrationBufferMs: number
  }
  layer1Transient: {
    restoreBufferMs: number
    fallbackDurationMs: number
  }
  assets: {
    openingJingleCandidates: string[]
    breakingStingerCandidates: string[]
    backgroundBedCandidates: string[]
    openingVideoCandidates: string[]
    breakingVideoCandidates: string[]
    loopVideoCandidates: string[]
    transitionVideoCandidates: string[]
    marqueeCandidates: string[]
  }
}

export const DEFAULT_CAST_ASSIST_CONFIG: CastAssistConfig = {
  opening: {
    minLockMs: 1200,
    fullscreenHoldMs: 3500,
    postJingleBufferMs: 200,
  },
  narration: {
    defaultStoryHoldMs: 5200,
    fallbackUnknownAudioMs: 4500,
    postNarrationBufferMs: 450,
  },
  layer1Transient: {
    restoreBufferMs: 120,
    fallbackDurationMs: 2500,
  },
  assets: {
    openingJingleCandidates: [
      "8s_beating_intro.mp3",
      "10s_suspense_intro.mp3",
      "10s_folk_intro.mp3",
      "6s_joyous_intro.mp3",
    ],
    breakingStingerCandidates: [
      "6s_suspense_trans.mp3",
      "5s_brass_hit.mp3",
      "5s_thud_hit.mp3",
      "5s_glass_hit.mp3",
    ],
    backgroundBedCandidates: ["demo_bed.wav"],
    openingVideoCandidates: ["aFLR_X_Opening.mp4", "aFLR_TTG_Opening.mp4"],
    breakingVideoCandidates: ["aFLR_X_Breaking.mp4", "aFLR_X_Opening.mp4"],
    loopVideoCandidates: ["aFLR_LOOP_ScCo.mp4", "aFLR_LOOP_Clear.mp4", "aFLR_LOOP_Scan.mp4"],
    transitionVideoCandidates: ["aFLR_TRANS_ScCo.mp4", "aFLR_TRANS_Sc.mp4", "aFLR_TRANS_Co.mp4"],
    marqueeCandidates: [
      "LOCAL_XYZ_772222.txt",
      "POLITICS_XYZ_444455.txt",
      "FINANCE_XYZ_22AA22.txt",
      "SPORTS_XYZ_111188.txt",
    ],
  },
}

