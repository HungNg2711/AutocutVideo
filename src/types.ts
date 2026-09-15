export type ClipReason = 'scene' | 'silence' | 'fixed'

export interface ClipSegment {
  id: string
  index: number
  start: number
  end: number
  reason: ClipReason
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
}

export const REASON_LABEL: Record<ClipReason, string> = {
  scene: 'Chuyển cảnh rõ',
  silence: 'Ngắt giọng tự nhiên',
  fixed: 'Cắt theo độ dài chuẩn',
}
