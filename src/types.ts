export type ClipReason = 'scene' | 'silence' | 'fixed'

export interface ClipSegment {
  id: string
  index: number
  start: number
  end: number
  reason: ClipReason
  /** 0-1 composite score from the candidate-ranking algorithm, when scoring ran. */
  score?: number
}

export interface GeneratedClip extends ClipSegment {
  url: string
  size: number
  hasSubtitles: boolean
}

export interface SubtitleCue {
  text: string
  start: number
  end: number
}

/**
 * Tunable weights for the candidate-scoring algorithm (see lib/scoring.ts).
 * Not fixed — configurable from the UI, defaults are a reasonable starting point.
 */
export interface ScoringWeights {
  hook: number
  sceneDensity: number
  audioEnergy: number
  selfContained: number
  deadAir: number
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  hook: 0.35,
  sceneDensity: 0.15,
  audioEnergy: 0.2,
  selfContained: 0.2,
  deadAir: 0.1,
}

export type Stage =
  | 'idle'
  | 'loading-engine'
  | 'probing'
  | 'detecting'
  | 'transcribing'
  | 'cutting'
  | 'done'
  | 'error'

export interface StageProgress {
  stage: Stage
  label: string
  /** 0-1 overall progress across the whole pipeline */
  overall: number
  /** clip currently being cut, when stage === 'cutting' */
  currentClip?: number
  totalClips?: number
  /** live time-based progress within the current ffmpeg command, e.g. "2:15 / 18:40" */
  elapsedSeconds?: number
  totalSeconds?: number
  error?: string
}

export interface SplitSettings {
  targetDuration: number
  minDuration: number
  maxDuration: number
  verticalCrop: boolean
  generateSubtitles: boolean
  scoringWeights: ScoringWeights
  /** Exact number of clips to produce. Undefined = let the system decide (auto). */
  clipCount?: number
}

export const REASON_LABEL: Record<ClipReason, string> = {
  scene: 'Chuyển cảnh rõ',
  silence: 'Ngắt giọng tự nhiên',
  fixed: 'Cắt theo độ dài chuẩn',
}
